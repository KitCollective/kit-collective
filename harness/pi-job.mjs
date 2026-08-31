/**
 * Serial Pi job runner and package boot check (KIT-53).
 * KIT-54: implement checks out a worktree, then runs a coding Pi session there.
 */
import { execFile as execFileCb, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { completeAutoMerge } from "./auto-merge.mjs";
import {
  DEFAULT_CAPACITY_POLL_MS,
  evaluateChromiumCapacity,
  floorsFromEnv,
  waitForCapacity,
} from "./capacity.mjs";
import { captureCheckerReviewDiff, formatCheckerReviewBundle } from "./checker-diff.mjs";
import { completeChecker, createCheckerGh } from "./checker-exit.mjs";
import { applySlopAgentSpawnEnv, factoryCheckerPiArgs } from "./checker-spawn.mjs";
import { createDelegateGateConfig } from "./delegate-gate.mjs";
import {
  loadFirstPassRegistry,
  reviewFeedbackIsFirstPassOnly,
  reviewFeedbackIsSpecOnly,
} from "./first-pass.mjs";
import { harnessLog } from "./harness-log.mjs";
import {
  buildImplementAppendPath,
  resolveImplementSkillPaths,
  selectImplementContext,
  UI_SURFACE_LABELS,
  UI_WRITE_SCOPE_PREFIXES,
} from "./implement-context.mjs";
import {
  completeImplementAdw,
  createFormatApply,
  createTypecheckTouched,
  extractReviewFeedback,
  requiredChecksGreen,
  reviewFeedbackIsActionable,
  reviewFeedbackIsLandFail,
} from "./implement-exit.mjs";
import { runIntake } from "./intake.mjs";
import { isCheapImplementRetry } from "./job-queue.mjs";
import { completeLand, createLandGh, resolveLinkedPullRequest } from "./land.mjs";
import { createAgentSessionBridge } from "./linear-agent-session.mjs";
import { createLinearCliClient, WORKPAD_HEADING } from "./linear-cli.mjs";
import { applyEconomyAgentPins } from "./economy-agents.mjs";
import {
  labelForModelId,
  parseModelProfile,
  resolveFastRoleModel,
  resolveImplementParentModel,
} from "./model-router.mjs";
import { isPiAgentEndLine, pipeReadableJsonLines, STREAMING_ROLES } from "./pi-event-stream.mjs";
import { createSessionLogCollector } from "./pi-session-log.mjs";
import { runPlanner } from "./planner.mjs";
import {
  estimateLineCostUsd,
  formatCostUsd,
  readReportedCostUsd,
  sumCostUsd,
} from "./token-cost.mjs";
import { getDefaultTokenStore } from "./token-store.mjs";
import { createWorktreeAdapter } from "./worktree.mjs";

const execFile = promisify(execFileCb);

export const REQUIRED_PI_PACKAGES = [
  "npm:pi-subagents",
  "npm:@ghoseb/pi-damage-control",
  "npm:pi-cursor-sdk",
  "npm:pi-hermes-memory",
];

/** Worker memory store on the kit_pi volume — outside Issue worktrees (KIT-111). */
export const WORKER_MEMORY_DIR = "/var/lib/kit-pi/hermes";

/** Relative to PI_WORKSPACE; holds committed hermes-memory-config.json. */
export const HERMES_AGENT_DIR_REL = ".pi/agent";

/** Factory-checker Memory writer Hermes config (KIT-112). */
export const HERMES_CHECKER_AGENT_DIR_REL = ".pi/agent-checker";

/** Implement parent and subagents are Memory readers — no writes or skill_manage (KIT-111). */
export const IMPLEMENT_MEMORY_EXCLUDED_TOOLS = [
  "memory_add",
  "memory_replace",
  "memory_remove",
  "skill_manage",
];

/** In-repo Pi package. Loaded via `--skill` on UI implement only — not `.pi/settings.json`. */
export const IMPLEMENT_BROWSER_PACKAGE = "kit-implement-browser";
export const IMPLEMENT_BROWSER_SKILL = "playwright-chromium";
export const IMPLEMENT_BROWSER_SKILL_PATH =
  ".pi/packages/implement-browser/skills/playwright-chromium";
export { UI_SURFACE_LABELS, UI_WRITE_SCOPE_PREFIXES };

const PERSONAL_BROWSER_PROFILE_MARKERS = [
  "Application Support/Google",
  "google-chrome",
  "Google/Chrome",
  "AppData/Local/Google/Chrome",
  "AppData\\Local\\Google\\Chrome",
];

const ROLE_FILES = {
  planner: ".pi/roles/planner.md",
  implement: ".pi/roles/implement.md",
  "factory-checker": ".pi/roles/factory-checker.md",
  land: ".pi/roles/land.md",
};

const FAST_ROLES = new Set(["planner", "factory-checker", "land"]);
const CAPACITY_GATED_ROLES = new Set(["implement", "factory-checker"]);

export const DEFAULT_JOB_IDLE_MS = 45 * 60 * 1000;
export const DEFAULT_AGENT_END_GRACE_MS = 8_000;
export const TIMEOUT_PARK_STATUS = "Parked";
export const TOKEN_USE_HEADING = "### Token use";
export const UNKNOWN_TOKEN_COUNT = "unknown";
/** Keep the last N token runs on the workpad (ring). */
export const MAX_TOKEN_USE_RUNS_ON_WORKPAD = 5;
/** Keep the last N coding-job token runs on `/health`. */
export const MAX_HEALTH_TOKEN_RUNS = 20;

const TOKEN_ROLE_MODELS = {
  implement: "Composer",
  "factory-checker": "Grok",
  scout: "Hy3",
  draft: "Draft",
  gate: "MiMo",
};

const TOKEN_ROLE_MODEL_IDS = {
  implement: "cursor/composer-2.5",
  "factory-checker": "cursor/grok-4.6",
  scout: "openrouter/tencent/hy3",
  draft: "openrouter/poolside/laguna-s-2.1",
  gate: "openrouter/xiaomi/mimo-v2.5-pro",
};

const TOKEN_ROLE_LABELS = {
  implement: "Implement",
  "factory-checker": "Factory-checker",
  scout: "Scout",
  draft: "Draft",
  gate: "Gate",
};

const TOKEN_HELPER_MODEL = "Composer";
const TOKEN_HELPER_MODEL_ID = "cursor/composer-2.5";
const TOKEN_NAMED_SUBAGENTS = new Set(["scout", "draft", "gate"]);

/**
 * @param {string | undefined} description
 * @returns {string}
 */
export function parseWriteScopeLine(description = "") {
  const match = String(description).match(/^write-scope:\s*(.+)$/m);
  return match ? match[1] : "";
}

/**
 * UI slice: Surface label mobile/web/admin, or write-scope touching those apps.
 *
 * @param {{ labels?: string[], description?: string }} [slice]
 */
export function isUiImplementSlice({ labels = [], description = "" } = {}) {
  const names = Array.isArray(labels) ? labels : [];
  if (names.some((label) => UI_SURFACE_LABELS.includes(label))) {
    return true;
  }
  const scope = parseWriteScopeLine(description);
  return UI_WRITE_SCOPE_PREFIXES.some((prefix) => scope.includes(prefix));
}

/**
 * @param {unknown} userDataDir
 */
export function isPersonalBrowserProfile(userDataDir) {
  if (typeof userDataDir !== "string" || userDataDir.length === 0) {
    return false;
  }
  return PERSONAL_BROWSER_PROFILE_MARKERS.some((marker) => userDataDir.includes(marker));
}

export function workerChromiumLaunchOptions() {
  return {
    browser: "chromium",
    headless: true,
    channel: undefined,
    userDataDir: null,
  };
}

/**
 * Fake-able Chromium adapter. CI injects `launch`; production never uses Desktop Chrome.
 *
 * @param {{
 *   readCapacity?: () => Promise<{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }>,
 *   floors?: { ramFloorMb: number, diskFloorMb: number },
 *   launch?: (input: object) => Promise<{ bytes?: Buffer, filename?: string }>,
 * }} [deps]
 */
export function createBrowserAdapter({ readCapacity, floors, launch } = {}) {
  return {
    /**
     * @param {{ url?: string, userDataDir?: string, channel?: string }} [input]
     */
    async captureScreenshot(input = {}) {
      if (input.channel === "chrome" || isPersonalBrowserProfile(input.userDataDir)) {
        return { ok: false, reason: "personal-profile" };
      }
      const raw =
        typeof readCapacity === "function" ? await readCapacity() : { ramFreeMb: 0, diskFreeMb: 0 };
      const capacity = evaluateChromiumCapacity({
        ramFreeMb: raw.ramFreeMb,
        diskFreeMb: raw.diskFreeMb,
        ...floorsFromEnv({}),
        ...floors,
      });
      if (!capacity.ready) {
        return { ok: false, reason: "capacity" };
      }
      if (typeof launch !== "function") {
        return { ok: false, reason: "no-adapter" };
      }
      const screenshot = await launch({
        ...workerChromiumLaunchOptions(),
        url: input.url,
      });
      return { ok: true, screenshot };
    },
  };
}

/**
 * @param {string | undefined} current
 * @param {{ title: string, url: string }} evidence
 */
export function linkWorkpadScreenshot(current, { title, url }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const line = `- ${title}: ${url}`;
  if (base.includes(url)) {
    return `${base}\n`;
  }
  if (base.includes("### Evidence")) {
    if (base.includes("- (none)")) {
      return `${base.replace("### Evidence\n\n- (none)", `### Evidence\n\n${line}`)}\n`;
    }
    return `${base.replace("### Evidence", `### Evidence\n${line}`)}\n`;
  }
  return `${base}\n\n### Evidence\n\n${line}\n`;
}

/**
 * @param {{
 *   linear: {
 *     attachFile: (input: object) => Promise<{ url?: string, title?: string }>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     updateWorkpad?: (input: object) => Promise<unknown>,
 *   },
 *   issueId: string,
 *   screenshot: { bytes?: Buffer, filename?: string },
 *   title: string,
 * }} input
 */
export async function attachWorkpadScreenshot({ linear, issueId, screenshot, title }) {
  if (!linear || typeof linear.attachFile !== "function") {
    throw new Error("screenshot evidence requires linear.attachFile");
  }
  const uploaded = await linear.attachFile({
    issueId,
    title,
    filename: screenshot?.filename,
    bytes: screenshot?.bytes,
  });
  const url = uploaded?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("screenshot evidence upload missing url");
  }
  if (typeof linear.listComments === "function" && typeof linear.updateWorkpad === "function") {
    const comments = await linear.listComments(issueId);
    const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
    await linear.updateWorkpad({
      issueId,
      body: linkWorkpadScreenshot(existing?.body, { title, url }),
      commentId: existing?.id,
    });
  }
  return { url, title };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isTokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Fail closed for numbers: non-numeric usage becomes unknown. Do not invent 0.
 *
 * @param {unknown} usage
 * @returns {{ input: number | "unknown", output: number | "unknown" }}
 */
export function readUsageCounts(usage) {
  if (usage === null || typeof usage !== "object") {
    return {
      input: UNKNOWN_TOKEN_COUNT,
      output: UNKNOWN_TOKEN_COUNT,
      reportedCostUsd: null,
    };
  }
  const record = /** @type {Record<string, unknown>} */ (usage);
  return {
    input: isTokenCount(record.input) ? record.input : UNKNOWN_TOKEN_COUNT,
    output: isTokenCount(record.output) ? record.output : UNKNOWN_TOKEN_COUNT,
    reportedCostUsd: readReportedCostUsd(record),
  };
}

/**
 * @param {{
 *   role: string,
 *   model: string,
 *   modelId?: string,
 *   input: number | "unknown",
 *   output: number | "unknown",
 *   costUsd?: number | null,
 * }} line
 */
export function formatTokenUseLine(line) {
  const label = TOKEN_ROLE_LABELS[line.role] ?? line.role;
  const cost = typeof line.costUsd === "number" ? ` · ${formatCostUsd(line.costUsd)}` : "";
  return `- ${label} (${line.model}): input ${line.input}, output ${line.output}${cost}`;
}

/**
 * @param {{
 *   role: string,
 *   model: string,
 *   modelId?: string,
 *   input: number | "unknown",
 *   output: number | "unknown",
 * }} line
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function enrichTokenLineCost(line, env = process.env) {
  const modelKey = line.modelId ?? line.model;
  const { costUsd, estimate } = estimateLineCostUsd({
    model: modelKey,
    input: line.input,
    output: line.output,
    reportedCostUsd: line.reportedCostUsd ?? null,
    env,
  });
  return { ...line, costUsd, costEstimate: estimate };
}

/**
 * Public token snapshot for the workpad, `/health`, and harness logs.
 *
 * @param {{
 *   role: string,
 *   identifier: string,
 *   lines: Array<{
 *     role: string,
 *     model: string,
 *     modelId?: string,
 *     input: number | "unknown",
 *     output: number | "unknown",
 *     costUsd?: number | null,
 *     reportedCostUsd?: number | null,
 *     costEstimate?: boolean,
 *   }>,
 *   startedAt?: string,
 *   endedAt?: string,
 *   issueId?: string,
 *   sessionId?: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} input
 */
export function publicTokenSnapshot(input) {
  const env = input.env ?? process.env;
  const lines = input.lines.map((line) => {
    const enriched = enrichTokenLineCost(
      {
        role: line.role,
        model: line.model,
        modelId: line.modelId,
        input: isTokenCount(line.input) ? line.input : UNKNOWN_TOKEN_COUNT,
        output: isTokenCount(line.output) ? line.output : UNKNOWN_TOKEN_COUNT,
        reportedCostUsd: line.reportedCostUsd ?? null,
      },
      env,
    );
    return {
      role: enriched.role,
      model: enriched.model,
      modelId: enriched.modelId ?? TOKEN_ROLE_MODEL_IDS[enriched.role] ?? enriched.model,
      input: enriched.input,
      output: enriched.output,
      costUsd: enriched.costUsd,
      costEstimate: enriched.costEstimate !== false,
    };
  });
  const costUsd = sumCostUsd(lines);
  const costEstimate = !lines.some((line) => line.costEstimate === false);
  return {
    role: input.role,
    identifier: input.identifier,
    issueId: typeof input.issueId === "string" ? input.issueId : undefined,
    sessionId: typeof input.sessionId === "string" ? input.sessionId : undefined,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? new Date().toISOString(),
    lines,
    costUsd,
    costEstimate,
  };
}

/**
 * @param {string} jobRole
 * @param {{ parentUsage?: object | null, subagents?: Record<string, object> }} collected
 * @param {string} identifier
 * @param {{ startedAt?: string, endedAt?: string, env?: object }} [extras]
 */
export function tokenSnapshotFromCollected(jobRole, collected, identifier, extras = {}) {
  const parentModelId =
    typeof extras.parentModelId === "string" && extras.parentModelId.length > 0
      ? extras.parentModelId
      : TOKEN_ROLE_MODEL_IDS[jobRole];
  const parentModel =
    typeof extras.parentModel === "string" && extras.parentModel.length > 0
      ? extras.parentModel
      : jobRole === "implement" && parentModelId
        ? labelForModelId(parentModelId)
        : (TOKEN_ROLE_MODELS[jobRole] ?? UNKNOWN_TOKEN_COUNT);
  const lines = [
    {
      role: jobRole,
      model: parentModel,
      modelId: parentModelId,
      ...readUsageCounts(collected?.parentUsage),
    },
  ];
  const subagents = collected?.subagents ?? {};
  for (const role of Object.keys(subagents).sort()) {
    const usage = subagents[role];
    if (!usage || typeof usage !== "object") {
      continue;
    }
    if (TOKEN_NAMED_SUBAGENTS.has(role)) {
      lines.push({
        role,
        model: TOKEN_ROLE_MODELS[role],
        modelId: TOKEN_ROLE_MODEL_IDS[role],
        ...readUsageCounts(usage),
      });
      continue;
    }
    lines.push({
      role,
      model: TOKEN_HELPER_MODEL,
      modelId: TOKEN_HELPER_MODEL_ID,
      ...readUsageCounts(usage),
    });
  }
  return publicTokenSnapshot({
    role: jobRole,
    identifier,
    lines,
    startedAt: extras.startedAt,
    endedAt: extras.endedAt,
    issueId: extras.issueId,
    sessionId: extras.sessionId,
    env: extras.env,
  });
}

/**
 * Collect Pi JSON usage. Parent message_update.usage is cumulative.
 * Scout/Gate/helper counts come from subagent tool results — not invented.
 */
export function createTokenUseCollector() {
  /** @type {object | null} */
  let parentUsage = null;
  /** @type {Record<string, { input: number, output: number, costUsd?: number }>} */
  const subagents = {};

  /**
   * @param {string} agent
   * @param {object} usage
   */
  function addSubagentUsage(agent, usage) {
    const counts = readUsageCounts(usage);
    if (
      counts.input === UNKNOWN_TOKEN_COUNT &&
      counts.output === UNKNOWN_TOKEN_COUNT &&
      counts.reportedCostUsd == null
    ) {
      return;
    }
    const prev = subagents[agent];
    const nextIn =
      counts.input === UNKNOWN_TOKEN_COUNT
        ? (prev?.input ?? 0)
        : (prev?.input ?? 0) + /** @type {number} */ (counts.input);
    const nextOut =
      counts.output === UNKNOWN_TOKEN_COUNT
        ? (prev?.output ?? 0)
        : (prev?.output ?? 0) + /** @type {number} */ (counts.output);
    /** @type {{ input: number, output: number, costUsd?: number }} */
    const next = { input: nextIn, output: nextOut };
    if (typeof counts.reportedCostUsd === "number") {
      next.costUsd = (prev?.costUsd ?? 0) + counts.reportedCostUsd;
    } else if (typeof prev?.costUsd === "number") {
      next.costUsd = prev.costUsd;
    }
    subagents[agent] = next;
  }

  return {
    /**
     * @param {string} line
     */
    async consumeLine(line) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return;
      }
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (event === null || typeof event !== "object") {
        return;
      }
      if (event.type === "message_update" && event.usage && typeof event.usage === "object") {
        parentUsage = event.usage;
      }
      if (event.type === "tool_execution_end") {
        const toolName = typeof event.toolName === "string" ? event.toolName : "";
        if (toolName !== "subagent") {
          return;
        }
        const agent = event.result?.agent ?? event.args?.agent;
        const usage = event.result?.usage;
        if (typeof agent === "string" && agent.length > 0 && usage && typeof usage === "object") {
          addSubagentUsage(agent, usage);
        }
      }
    },
    snapshot() {
      return { parentUsage, subagents: { ...subagents } };
    },
  };
}

/**
 * @param {ReturnType<typeof publicTokenSnapshot>} tokens
 */
export function formatTokenUseRun(tokens) {
  const ended = tokens.endedAt ?? new Date().toISOString();
  const header = `#### Run ${ended} · ${tokens.identifier} · ${tokens.role}`;
  const lines = (tokens.lines ?? []).map((line) => formatTokenUseLine(line));
  const total =
    typeof tokens.costUsd === "number"
      ? `Total ${formatCostUsd(tokens.costUsd)} (list-rate estimate)`
      : "Total cost unknown";
  return [header, ...lines, total].join("\n");
}

/**
 * Emit one structured harness log line per coding-job token run (Grafana/Loki).
 *
 * @param {ReturnType<typeof publicTokenSnapshot>} tokens
 */
export function logTokenRun(tokens, options = {}) {
  if (!tokens || typeof tokens !== "object") {
    return;
  }
  const tokensIn = (tokens.lines ?? []).reduce(
    (sum, line) => sum + (isTokenCount(line.input) ? line.input : 0),
    0,
  );
  const tokensOut = (tokens.lines ?? []).reduce(
    (sum, line) => sum + (isTokenCount(line.output) ? line.output : 0),
    0,
  );
  harnessLog({
    role: tokens.role,
    identifier: tokens.identifier,
    event: "tokens",
    gate: "green",
    phase: "token-run",
    detail: `${tokens.role} ${tokens.identifier} ${formatCostUsd(tokens.costUsd)}`,
    tokensIn,
    tokensOut,
    costUsd: typeof tokens.costUsd === "number" ? tokens.costUsd : undefined,
    sessionId: typeof tokens.sessionId === "string" ? tokens.sessionId : undefined,
    issueId: typeof tokens.issueId === "string" ? tokens.issueId : undefined,
    models: (tokens.lines ?? []).map((line) => ({
      role: line.role,
      model: line.model,
      modelId: line.modelId,
      input: line.input,
      output: line.output,
      costUsd: line.costUsd ?? null,
      costEstimate: line.costEstimate !== false,
    })),
  });
  try {
    const store = options.store === undefined ? getDefaultTokenStore() : options.store;
    store?.recordTokenRun(tokens);
    const route = options.modelRoute ?? tokens.modelRoute;
    if (route && typeof route === "object" && store?.recordRouteRun) {
      store.recordRouteRun({
        identifier: tokens.identifier,
        role: tokens.role,
        issueId: tokens.issueId,
        sessionId: tokens.sessionId,
        endedAt: tokens.endedAt,
        complexity: route.complexity?.tier,
        skipDraft: route.skipDraft === true,
        scaffoldModel: route.gates?.scaffold?.primary,
        implementModel: route.gates?.implement?.primary,
        verifyModel: route.gates?.verify?.primary,
        success: options.routeSuccess ?? null,
        reviewLoops: options.reviewLoops ?? null,
        costUsd: typeof tokens.costUsd === "number" ? tokens.costUsd : null,
        reasons: route.complexity?.reasons ?? [],
      });
    }
  } catch {
    // fail open — token persistence must not fail the job
  }
}

/**
 * Durable token run history on the workpad (last N runs). Never secrets.
 *
 * @param {string | undefined} current
 * @param {ReturnType<typeof publicTokenSnapshot>} tokens
 */
export function applyTokenUseWorkpad(current, tokens) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const runBlock = formatTokenUseRun(tokens);
  const existingMatch = base.match(/### Token use\n([\s\S]*?)(?=\n### |\s*$)/);
  /** @type {string[]} */
  let runs = [runBlock];
  if (existingMatch) {
    const prior = existingMatch[1]
      .split(/\n(?=#### Run )/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith("#### Run "));
    runs = [runBlock, ...prior].slice(0, MAX_TOKEN_USE_RUNS_ON_WORKPAD);
  }
  const content = `${runs.join("\n\n")}\n`;
  if (base.includes(TOKEN_USE_HEADING)) {
    return `${base.replace(/### Token use\n[\s\S]*?(?=\n### |\s*$)/, `${TOKEN_USE_HEADING}\n\n${content}`)}\n`;
  }
  if (base.includes("### Review feedback")) {
    return `${base.replace("### Review feedback", `${TOKEN_USE_HEADING}\n\n${content}\n### Review feedback`)}\n`;
  }
  return `${base}\n\n${TOKEN_USE_HEADING}\n\n${content}\n`;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {number}
 */
export function jobIdleMs(env = {}) {
  const raw = env.PI_JOB_IDLE_MS;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_JOB_IDLE_MS;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {number}
 */
export function jobAgentEndGraceMs(env = {}) {
  const raw = env.PI_AGENT_END_GRACE_MS;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_AGENT_END_GRACE_MS;
}

/**
 * @param {string} body
 * @param {string} line
 */
function replaceReviewFeedback(body, line) {
  if (body.includes("### Review feedback")) {
    return body.replace(
      /### Review feedback\n[\s\S]*?(?=\n### |\s*$)/,
      `### Review feedback\n\n${line}\n`,
    );
  }
  return `${body}\n\n### Review feedback\n\n${line}\n`;
}

/**
 * @param {string | undefined} current
 * @param {{ role: string, identifier: string, idleMs: number }} input
 */
export function applyIdleTimeoutWorkpad(current, { role, identifier, idleMs }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const minutes = idleMs / 60_000;
  const line = `- Idle timeout: ${role} ${identifier} had no close and no stdout for ${minutes} minutes (PI_JOB_IDLE_MS).`;
  return `${replaceReviewFeedback(base, line)}\n`;
}

/**
 * Kill the Pi child process group. Prefer the negative pid so grandchildren die too.
 *
 * @param {{ pid?: number, kill?: (signal?: string) => void }} spawned
 * @param {string} [signal]
 */
export function killProcessGroupDefault(spawned, signal = "SIGTERM") {
  const pid = spawned?.pid;
  if (typeof pid === "number") {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Not a process-group leader, or already gone.
    }
  }
  if (typeof spawned?.kill === "function") {
    spawned.kill(signal);
  }
}

/**
 * @param {string} role
 * @param {string} identifier
 * @param {string | undefined} adwFile
 * @param {{
 *   cheapRetry?: boolean,
 *   mergeFailResume?: boolean,
 *   reviewFeedback?: string,
 *   writeScope?: string,
 *   implementContext?: { requiredHelpers: string[], skills: string[], rules: string[], appendOverlay: string },
 * }} [options]
 */
export function implementPrompt(role, identifier, adwFile, options = {}) {
  const codeEnglish =
    "Code identifiers, comments, and technical names are English. User-facing UI copy may stay Danish when the design lock says so.";
  if (role === "implement") {
    const adw = typeof adwFile === "string" ? ` ADW ${adwFile}.` : "";
    const writeScopeLine =
      typeof options.writeScope === "string" && options.writeScope.trim().length > 0
        ? options.writeScope.trim()
        : "";
    const writeScopeSuffix = writeScopeLine.length > 0 ? ` Write-scope: ${writeScopeLine}.` : "";
    const helpers =
      Array.isArray(options.implementContext?.requiredHelpers) &&
      options.implementContext.requiredHelpers.length > 0
        ? options.implementContext.requiredHelpers.join(", ")
        : "(none)";
    const loopTail = `Open a PR into development. Do not move Linear to In Review — the harness does that after required GitHub checks are green and MERGEABLE. Never merge. Never spawn factory-checker. FORBIDDEN: never spawn agent gate (Gate is superseded) — harness Mechanical close owns format/typecheck/rebase/GitHub wait.`;
    const noSleep =
      "Do not sleep. Do not poll GitHub with sleep. Do not `gh pr checks --watch`. Exit the Pi session only when the PR is pushed — the harness waits for required GitHub checks, then moves In Review. Fix the class from the CI excerpt.";
    const notANewTry = "Do not open a new try.";
    const helperNames =
      "Spawn Pi agents by these names only: nest, expo, drizzle, ui-ux, devops. react-expo is expo. If a helper exits immediately, retry that same name once.";
    const serialHelpers =
      "Spawn required helpers one at a time; wait for each return before the next. Order: nest → drizzle → expo → ui-ux → devops. Do not fan helpers out in parallel.";
    const tddBlock =
      "TDD: each required helper writes the failing test at its seam (red), then minimal green. Run the helper's targeted test command — not `pnpm test` (full graph is GitHub Actions only on this worker). Shared TDD/implement skills stay on the parent.";
    if (options.cheapRetry === true) {
      const feedback =
        typeof options.reviewFeedback === "string" && options.reviewFeedback.trim().length > 0
          ? options.reviewFeedback.trim()
          : "(missing — fail closed: do not invent a fix without the excerpt)";
      return `Factory role implement retry for ${identifier}.${adw} Same Implementing stay — this is not a new try. Skip Scout. Skip Draft. Skip helpers. Do not map the repo from scratch. Fix the class in ### Review feedback (format vs Zod vs unique-email vs migration prefix vs first-pass registry tag — not only the file a checker named). You MUST use the CI log excerpt in ### Review feedback; do not guess. Do not spawn Gate — harness Mechanical close owns format/typecheck. Wait for the harness GitHub wait. ${noSleep} ${notANewTry} ${codeEnglish} ${loopTail}

### Review feedback

${feedback}`;
    }
    if (options.mergeFailResume === true) {
      const feedback =
        typeof options.reviewFeedback === "string" && options.reviewFeedback.trim().length > 0
          ? options.reviewFeedback.trim()
          : "(missing — fail closed: verify PR MERGEABLE and required checks green)";
      return `Factory role implement for ${identifier}.${adw} Merge-fail resume. Skip Scout. Skip Draft. Skip helpers. Do not re-implement the feature. Rebase or merge origin/development onto the existing branch. ${noSleep} Verify the linked PR is MERGEABLE and required GitHub checks are green. Update the workpad and clear addressed land feedback. Do not spawn Gate. ${codeEnglish} ${loopTail}

### Review feedback

${feedback}`;
    }
    const firstPassClasses = Array.isArray(options.firstPassClasses)
      ? options.firstPassClasses
      : typeof options.workspace === "string" && options.workspace.length > 0
        ? loadFirstPassRegistry(options.workspace).classes
        : [];
    if (
      reviewFeedbackIsActionable(options.reviewFeedback) &&
      reviewFeedbackIsFirstPassOnly(options.reviewFeedback, firstPassClasses)
    ) {
      const feedback = String(options.reviewFeedback).trim();
      return `Factory role implement for ${identifier}.${adw} First-pass resume.${writeScopeSuffix} Same Implementing stay — not a full Scout/Draft/helpers tree. Skip Scout. Skip Draft. Skip helpers. Fix only the first-pass / registry-tagged class in ### Review feedback. Do not re-map the repo. Do not spawn Gate — harness Mechanical close owns format/typecheck. ${noSleep} ${codeEnglish} ${loopTail}

### Review feedback

${feedback}`;
    }
    if (
      reviewFeedbackIsActionable(options.reviewFeedback) &&
      reviewFeedbackIsSpecOnly(options.reviewFeedback)
    ) {
      const feedback = String(options.reviewFeedback).trim();
      return `Factory role implement for ${identifier}.${adw} Spec-only resume.${writeScopeSuffix} Same Implementing stay — not a full Scout/Draft/helpers tree. Skip Scout. Skip Draft. Skip helpers. Fix only the Spec findings in ### Review feedback (use ### Composition paths when present). Do not re-map the repo. Do not read full CONTEXT.md. Do not spawn Gate — harness Mechanical close owns format/typecheck. ${noSleep} ${codeEnglish} ${loopTail}

### Review feedback

${feedback}`;
    }
    const compositionNote =
      "After Scout, write workpad ### Composition with repo-relative files to mirror before inventing UI (paths only). Prefer the injected slice brief — do not read full CONTEXT.md unless a domain term is missing.";
    const skipDraft = options.implementContext?.modelRoute?.skipDraft === true;
    const routeBrief =
      typeof options.implementContext?.modelRouteBrief === "string"
        ? options.implementContext.modelRouteBrief.trim()
        : "";
    const routeSuffix = routeBrief.length > 0 ? `\n\n${routeBrief}` : "";
    const draftNote = skipDraft
      ? "Skip Draft — model route marked critical seam (auth/IAP/Vision/secrets). Composer helpers own the write."
      : "After ### Composition, spawn Draft once (agent name: draft) to scaffold boilerplate under write-scope. Draft rotates free OpenRouter models (MiniMax → GLM → Laguna → Hy3 → Composer) on 429. Parent and Composer helpers review and harden. Skip Draft when the slice is auth/IAP/Vision-only. Do not Skip Draft on a full Scout run unless that auth/IAP/Vision-only exception or Skip Draft route applies.";
    if (reviewFeedbackIsActionable(options.reviewFeedback)) {
      const feedback = String(options.reviewFeedback).trim();
      return `Factory role implement for ${identifier}.${adw} Checker-fail resume.${writeScopeSuffix} Update the existing workpad. Fix every workpad axis in ### Review feedback (Spec / Standards / Tests / Slop) — GitHub [factory-checker/slop] threads are a subset, not the whole request. Spawn Scout first. Do not Skip Scout. ${draftNote} Required helpers: ${helpers}. ${serialHelpers} Spawn every listed helper. Do not Skip helpers. ${helperNames} ${tddBlock} ${compositionNote} Do not spawn Gate. ${noSleep} ${codeEnglish} ${loopTail}${routeSuffix}

### Review feedback

${feedback}`;
    }
    return `Factory role implement for ${identifier}.${adw} First run.${writeScopeSuffix} Same Implementing stay — this is one try, ending at In Review. Update the existing workpad. When ### Review feedback has findings, fix the class on the same branch and PR. Spawn Scout first. Do not Skip Scout. ${draftNote} Required helpers: ${helpers}. ${serialHelpers} Spawn every listed helper before green implementation. Do not Skip helpers. ${helperNames} ${tddBlock} ${compositionNote} Do not spawn Gate — harness Mechanical close owns format/typecheck/rebase/GitHub wait. Wait for the harness GitHub wait. ${noSleep} ${notANewTry} ${codeEnglish} ${loopTail}${routeSuffix}`;
  }
  if (role === "factory-checker") {
    return `Factory role factory-checker for ${identifier}. Run /code-review (Standards + Spec + Slop in one pass) against the harness-injected review snapshot in the append (issue description + three-dot diff). Prefer that snapshot — do not re-run a full git discovery loop, do not read full CONTEXT.md, do not poll gh pr checks (harness owns gates). Readonly git bash only to fill gaps. Before exit, ### Review feedback MUST include all three axis lines (- Spec: …, - Standards: …, - Slop: … or Slop/…). Empty or partial Review feedback is a harness miss — the worker re-runs you in-slot, then parks for human; it does not bounce to implement. When a Standards or Slop finding matches the injected First-pass registry, write [first-pass:<id>] on that workpad line. Update the existing workpad via the linear_cli host tool only — replace ### Review feedback with the complete three-axis finding set (- Spec: (none), - Standards: (none), - Slop: (none) on pass; Slop/ prefix on hard Slop findings). Post each Slop hunk on the linked PR via gh_cli (comment-only — cannot merge or approve). Never merge. Never move Linear status — the harness applies pass/fail after you exit. Never spawn Gate. ${codeEnglish}`;
  }
  return typeof adwFile === "string"
    ? `Factory role ${role} for ${identifier}. ADW ${adwFile}.`
    : `Factory role ${role} for ${identifier}.`;
}

/**
 * @param {string | undefined} fromFile
 */
export function resolvePiWorkspace(env = process.env, fromFile = import.meta.url) {
  if (typeof env.PI_WORKSPACE === "string" && env.PI_WORKSPACE.length > 0) {
    return env.PI_WORKSPACE;
  }
  return join(dirname(fileURLToPath(fromFile)), "..");
}

/**
 * @param {{
 *   root: string,
 *   listPackages?: () => Promise<string>,
 * }} input
 */
export async function assertPiPackagesReady({ root, listPackages } = {}) {
  const settingsPath = join(root, ".pi/settings.json");
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    throw new Error(`missing Pi package manifest at ${settingsPath}`);
  }
  const listed = Array.isArray(settings.packages) ? settings.packages : [];
  const missingManifest = REQUIRED_PI_PACKAGES.filter((spec) => !listed.includes(spec));
  if (missingManifest.length > 0) {
    throw new Error(`missing Pi packages in .pi/settings.json: ${missingManifest.join(", ")}`);
  }

  const list =
    listPackages ??
    (async () => {
      const childEnv = { ...process.env };
      delete childEnv.PI_CODING_AGENT_DIR;
      const { stdout } = await execFile("pi", ["list"], {
        encoding: "utf8",
        timeout: 30_000,
        cwd: root,
        env: childEnv,
      });
      return stdout;
    });
  const installed = await list();
  const missingInstalled = REQUIRED_PI_PACKAGES.filter((spec) => {
    const name = spec.replace(/^npm:/, "");
    return !installed.includes(name);
  });
  if (missingInstalled.length > 0) {
    throw new Error(`Pi packages not installed: ${missingInstalled.join(", ")}`);
  }
  return true;
}

/**
 * @param {string} role
 * @param {string} workspace
 * @param {string} roleFile
 * @param {string} model
 * @param {string} prompt
 * @param {{
 *   browserSkill?: string,
 *   implementContext?: { requiredHelpers: string[], skills: string[], rules: string[], appendOverlay: string },
 *   reviewBundle?: string,
 * }} [options]
 * @returns {string[]}
 */
export function piArgsForRole(role, workspace, roleFile, model, prompt, options = {}) {
  if (role === "factory-checker") {
    const args = factoryCheckerPiArgs({
      workspace,
      roleFile,
      model,
      prompt,
      reviewBundle: options.reviewBundle,
    });
    // Skip AGENTS.md / CLAUDE.md auto-discovery — append already has the role + snapshot.
    const withNoContext = insertAfterFlag(args, "-a", ["--no-context-files"]);
    if (STREAMING_ROLES.has(role)) {
      return insertAfterFlag(withNoContext, "-a", ["--mode", "json"]);
    }
    return withNoContext;
  }
  /** @type {string[]} */
  const skillPaths = [];
  if (typeof options.browserSkill === "string" && options.browserSkill.length > 0) {
    skillPaths.push(options.browserSkill);
  }
  if (role === "implement" && options.implementContext?.skills?.length) {
    skillPaths.push(...resolveImplementSkillPaths(workspace, options.implementContext.skills));
  }
  const skillArgs = skillPaths.flatMap((skillPath) => ["--skill", skillPath]);
  const memoryReaderArgs =
    role === "implement" ? ["--exclude-tools", IMPLEMENT_MEMORY_EXCLUDED_TOOLS.join(",")] : [];
  const appendPrompt =
    role === "implement" && options.implementContext
      ? options.implementContext.slimOnly === true ||
        (Array.isArray(options.implementContext.rules) && options.implementContext.rules.length > 0)
        ? buildImplementAppendPath(workspace, roleFile, options.implementContext)
        : join(workspace, roleFile)
      : join(workspace, roleFile);
  return [
    "-p",
    "-a",
    "--no-context-files",
    ...(STREAMING_ROLES.has(role) ? ["--mode", "json"] : []),
    "--model",
    model,
    ...skillArgs,
    ...memoryReaderArgs,
    "--append-system-prompt",
    appendPrompt,
    "--",
    prompt,
  ];
}

/**
 * @param {string[]} args
 * @param {string} flag
 * @param {string[]} insert
 */
function insertAfterFlag(args, flag, insert) {
  const idx = args.indexOf(flag);
  if (idx < 0) {
    return [...insert, ...args];
  }
  return [...args.slice(0, idx + 1), ...insert, ...args.slice(idx + 1)];
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   workspace?: string,
 *   worktree?: { checkout: (input: { identifier: string }) => Promise<{ path: string, branch: string, lane: string }> },
 *   gh?: object,
 *   landGh?: object,
 *   checkerGh?: object,
 *   linear?: object,
 *   typecheckTouched?: (input: { cwd: string }) => Promise<unknown>,
 *   formatCheck?: (input: { cwd: string }) => Promise<unknown>,
 *   formatApply?: (input: { cwd: string }) => Promise<unknown>,
 *   spawnProcess?: (command: string, args: string[], options: object) => Promise<{ status?: number | null, stdout?: import("node:stream").Readable, closePromise?: Promise<{ status: number | null }> }>,
 *   runCommand?: (command: string, args: string[], options: object) => Promise<string>,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   capacitySleep?: (ms: number) => Promise<unknown>,
 *   readCapacity?: () => Promise<{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }>,
 *   waitTimeoutMs?: number,
 *   waitIntervalMs?: number,
 *   killProcessGroup?: (spawned: object, signal?: string) => void | Promise<void>,
 *   agentSession?: { start: () => Promise<void>, consumeLine: (line: string) => Promise<void>, finish: (outcome?: { ok?: boolean, idleTimeout?: boolean }) => Promise<void> },
 *   fetchImpl?: typeof fetch,
 * }} [deps]
 */
export function createPiJobRunner({
  env = process.env,
  workspace = resolvePiWorkspace(env),
  worktree,
  gh,
  landGh,
  checkerGh,
  linear,
  typecheckTouched,
  formatCheck,
  formatApply,
  spawnProcess,
  runCommand,
  now,
  sleep,
  capacitySleep,
  readCapacity,
  waitTimeoutMs,
  waitIntervalMs,
  killProcessGroup,
  agentSession,
  fetchImpl,
} = {}) {
  const trees =
    worktree ??
    createWorktreeAdapter({
      env,
      findOpenIssuePr:
        typeof gh?.findOpenIssuePr === "function"
          ? (identifier) => gh.findOpenIssuePr({ identifier })
          : undefined,
    });
  const applyFormat = formatApply ?? createFormatApply({ runCommand });
  const killGroup = killProcessGroup ?? killProcessGroupDefault;
  const spawnJob =
    spawnProcess ??
    ((command, args, options) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, args, { ...options, detached: true });
        child.on("error", reject);
        resolve({
          pid: child.pid,
          stdout: child.stdout,
          kill(signal) {
            killProcessGroupDefault({ pid: child.pid, kill: (sig) => child.kill(sig) }, signal);
          },
          closePromise: new Promise((res, rej) => {
            child.on("error", rej);
            child.on("close", (status) => res({ status }));
          }),
        });
      }));

  /**
   * @param {{ role: string, identifier?: string, issueId?: string, adwFile?: string }} job
   * @param {string} cwd
   * @param {string} model
   * @param {string} roleFile
   * @param {string} prompt
   * @param {NodeJS.ProcessEnv} spawnEnv
   * @param {{ browserSkill?: string, implementContext?: object, reviewBundle?: string }} [piOptions]
   */
  async function runPiJob(job, cwd, model, roleFile, prompt, spawnEnv, piOptions = {}) {
    const args = piArgsForRole(job.role, workspace, roleFile, model, prompt, piOptions);
    const jobIdentifier =
      typeof job.identifier === "string" && job.identifier.length > 0
        ? job.identifier
        : typeof job.issueId === "string"
          ? job.issueId
          : "unknown";
    const streamIssueId =
      typeof job.issueId === "string" && job.issueId.length > 0
        ? job.issueId
        : typeof job.identifier === "string" && job.identifier.length > 0
          ? job.identifier
          : undefined;
    const sessionBridge =
      agentSession ??
      createAgentSessionBridge({
        env,
        issueId: streamIssueId,
        identifier: jobIdentifier,
        role: job.role,
        fetchImpl,
      });
    await sessionBridge.start();
    const collectStdout = STREAMING_ROLES.has(job.role);
    const stdio = collectStdout ? ["inherit", "pipe", "inherit"] : "inherit";
    const spawned = await spawnJob("pi", args, { cwd, env: spawnEnv, stdio });
    const waitClose =
      spawned.closePromise ??
      spawned.closed ??
      Promise.resolve({ status: typeof spawned.status === "number" ? spawned.status : 0 });
    const liveChild =
      spawned.closePromise != null || spawned.closed != null || typeof spawned.pid === "number";
    const clock = now ?? Date.now;
    const snooze = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const idleMs = jobIdleMs(env);
    const pollMs = 1000;
    let lastStdoutAt = clock();
    if (spawned.stdout && typeof spawned.stdout.on === "function") {
      spawned.stdout.on("data", () => {
        lastStdoutAt = clock();
      });
    }
    const tokenCollector = createTokenUseCollector();
    const sessionLogger = createSessionLogCollector({
      role: job.role,
      identifier: jobIdentifier,
    });
    let agentEnded = false;
    let settleAgentEnd = () => {};
    const agentEndSeen = new Promise((resolve) => {
      settleAgentEnd = resolve;
    });
    let streamDone = Promise.resolve();
    if (collectStdout && spawned.stdout) {
      streamDone = pipeReadableJsonLines(spawned.stdout, {
        async consumeLine(line) {
          if (isPiAgentEndLine(line)) {
            agentEnded = true;
            settleAgentEnd();
          }
          await tokenCollector.consumeLine(line);
          await sessionLogger.consumeLine(line);
          await sessionBridge.consumeLine(line);
        },
      });
    }

    /**
     * @param {number | null | undefined} status
     * @param {{ idleTimeout?: boolean }} [extras]
     */
    async function closeSession(status, extras = {}) {
      await sessionBridge.finish({
        ok: extras.idleTimeout === true ? false : status === 0,
        idleTimeout: extras.idleTimeout === true,
      });
      return {
        status,
        stdout: spawned.stdout,
        tokenUse: tokenCollector.snapshot(),
        sessionId:
          typeof sessionBridge.getSessionId === "function"
            ? sessionBridge.getSessionId()
            : undefined,
        ...extras,
      };
    }

    if (!liveChild) {
      const [{ status }] = await Promise.all([waitClose, streamDone]);
      return closeSession(status);
    }

    let timedOut = false;
    let finished = false;
    let agentEndKilled = false;
    const closed = waitClose.then((closeResult) => {
      finished = true;
      return closeResult;
    });
    const idleWatch = (async () => {
      while (!finished && !agentEnded) {
        const elapsed = clock() - lastStdoutAt;
        if (elapsed >= idleMs) {
          timedOut = true;
          finished = true;
          await killGroup(spawned);
          return;
        }
        const remaining = idleMs - elapsed;
        await snooze(Math.max(1, Math.min(pollMs, remaining)));
      }
      if (!finished) {
        await closed;
      }
    })();
    const agentEndWatch = (async () => {
      await Promise.race([agentEndSeen, closed.then(() => undefined)]);
      if (finished) {
        return;
      }
      await snooze(Math.max(1, jobAgentEndGraceMs(env)));
      if (finished) {
        return;
      }
      agentEndKilled = true;
      finished = true;
      await killGroup(spawned);
    })();
    await Promise.race([closed, idleWatch, agentEndWatch]);
    if (timedOut) {
      return closeSession(null, { idleTimeout: true });
    }
    if (agentEndKilled) {
      return closeSession(0);
    }
    await streamDone;
    const closeResult = await closed;
    return closeSession(closeResult.status);
  }

  /**
   * @param {{ role: string, identifier?: string, issueId?: string }} job
   * @param {string} identifier
   * @param {number} idleMs
   */
  async function timeoutPark(job, identifier, idleMs) {
    const linearClient = linear ?? job.linear ?? createLinearCliClient({ env, runCommand });
    const issueId = job.issueId ?? identifier;
    const comments =
      typeof linearClient.listComments === "function"
        ? await linearClient.listComments(issueId)
        : [];
    const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
    const body = applyIdleTimeoutWorkpad(existing?.body, {
      role: job.role,
      identifier,
      idleMs,
    });
    if (typeof linearClient.updateWorkpad === "function") {
      await linearClient.updateWorkpad({
        issueId,
        body,
        commentId: existing?.id,
      });
    }
    if (typeof linearClient.setStatus === "function") {
      await linearClient.setStatus({ issueId, status: TIMEOUT_PARK_STATUS });
    }
    if (typeof trees.reap === "function") {
      await trees.reap({ identifier });
    }
    return { ...job, idleTimeout: true, nextStatus: TIMEOUT_PARK_STATUS };
  }

  /**
   * Fold token lines into whatever workpad write the exit path already makes.
   *
   * @param {object | undefined} linearClient
   * @param {{ lines: object[] } | null} tokens
   */
  function withTokenUse(linearClient, tokens) {
    if (!linearClient || typeof linearClient.updateWorkpad !== "function" || !tokens) {
      return linearClient;
    }
    return {
      ...linearClient,
      async updateWorkpad(input) {
        return linearClient.updateWorkpad({
          ...input,
          body: applyTokenUseWorkpad(input.body, tokens),
        });
      },
    };
  }

  return {
    /**
     * @param {{ role: string, identifier?: string, issueId?: string, adwFile?: string }} job
     */
    async run(job) {
      const identifier = job.identifier ?? job.issueId ?? "unknown";
      if (job.role === "planner") {
        const client = linear ?? createLinearCliClient({ env, runCommand });
        return runPlanner({ env, linear: client });
      }
      if (job.role === "intake") {
        const client = linear ?? createLinearCliClient({ env, runCommand });
        return runIntake({ env, linear: client });
      }
      if (CAPACITY_GATED_ROLES.has(job.role) && typeof readCapacity === "function") {
        const client =
          linear ??
          (typeof runCommand === "function" ? createLinearCliClient({ env, runCommand }) : linear);
        await waitForCapacity({
          readCapacity,
          floors: floorsFromEnv(env),
          linear: client,
          issueId: typeof job.issueId === "string" ? job.issueId : undefined,
          identifier,
          role: job.role,
          sleep: capacitySleep ?? sleep,
          pollMs: Number(env.PI_CAPACITY_POLL_MS ?? DEFAULT_CAPACITY_POLL_MS),
        });
      }
      if (job.role === "auto-merge") {
        const linearClient = linear ?? createLinearCliClient({ env, runCommand });
        const mergeGh = landGh ?? createLandGh({ env, runCommand });
        return completeAutoMerge({
          job: {
            issueId: job.issueId ?? identifier,
            identifier,
          },
          linear: linearClient,
          gh: mergeGh,
          delegateGateConfig: createDelegateGateConfig(env),
          env,
        });
      }
      if (job.role === "land") {
        const linearClient = linear ?? createLinearCliClient({ env, runCommand });
        const mergeGh = landGh ?? createLandGh({ env, runCommand });
        return completeLand({
          job: {
            issueId: job.issueId ?? identifier,
            identifier,
          },
          linear: linearClient,
          gh: mergeGh,
          worktree: trees,
        });
      }
      const roleFile = ROLE_FILES[job.role];
      if (typeof roleFile !== "string") {
        throw new Error(`no Pi role file for ${job.role}`);
      }
      const modelProfile = parseModelProfile(env.HARNESS_MODEL_PROFILE);
      let model = FAST_ROLES.has(job.role)
        ? resolveFastRoleModel(modelProfile, env.PI_MODEL_FAST)
        : env.PI_MODEL;
      if (typeof model !== "string" || model.length === 0) {
        throw new Error(`missing Pi model env for role ${job.role}`);
      }
      if (job.role === "implement") {
        const openRouterKey = env.OPENROUTER_API_KEY;
        if (typeof openRouterKey !== "string" || openRouterKey.length === 0) {
          throw new Error("missing OPENROUTER_API_KEY");
        }
        for (const relative of [
          ".pi/agents/scout.md",
          ".pi/agents/draft.md",
          ".pi/agents/gate.md",
        ]) {
          try {
            readFileSync(join(workspace, relative), "utf8");
          } catch {
            throw new Error(`implement requires ${relative}`);
          }
        }
      }
      /** @type {Array<{ id?: string, body?: string }>} */
      let implementComments = [];
      if (job.role === "implement") {
        const holdLinear = linear ?? job.linear;
        if (holdLinear && typeof holdLinear.listComments === "function") {
          implementComments = await holdLinear.listComments(job.issueId ?? identifier);
        }
      }
      let cwd = workspace;
      let checkout;
      if (job.role === "implement" || job.role === "factory-checker") {
        checkout = await trees.checkout({
          identifier,
          mode: job.role === "implement" ? "implement" : "reuse",
        });
        cwd = checkout.path;
      }
      const linearForPrompt = linear ?? job.linear;
      let prompt = implementPrompt(job.role, identifier, job.adwFile);
      let implementIssue = null;
      /** @type {{ requiredHelpers: string[], skills: string[], rules: string[], appendOverlay: string } | undefined} */
      let implementContext;
      let mergeFailResume = false;
      if (job.role === "implement") {
        const workpad = implementComments.find((comment) =>
          comment.body?.includes(WORKPAD_HEADING),
        );
        implementIssue =
          typeof linearForPrompt?.getIssue === "function"
            ? await linearForPrompt.getIssue(job.issueId ?? identifier)
            : null;
        const reviewFeedback = extractReviewFeedback(workpad?.body);
        mergeFailResume = reviewFeedbackIsLandFail(reviewFeedback);
        const cheapRetry = isCheapImplementRetry(job);
        const firstPassClasses = loadFirstPassRegistry(workspace).classes;
        const firstPassOnly =
          !cheapRetry &&
          !mergeFailResume &&
          reviewFeedbackIsActionable(reviewFeedback) &&
          reviewFeedbackIsFirstPassOnly(reviewFeedback, firstPassClasses);
        const specOnly =
          !cheapRetry &&
          !mergeFailResume &&
          !firstPassOnly &&
          reviewFeedbackIsActionable(reviewFeedback) &&
          reviewFeedbackIsSpecOnly(reviewFeedback);
        const ghClient = gh ?? job.gh;
        const linearClient = linear ?? job.linear;
        const adwFile = job.adwFile;
        if (
          mergeFailResume &&
          !cheapRetry &&
          typeof adwFile === "string" &&
          ghClient &&
          linearClient &&
          checkout
        ) {
          let pr = await ghClient.viewPr({ cwd: checkout.path });
          if (typeof ghClient.findOpenIssuePr === "function") {
            const listed = await ghClient.findOpenIssuePr({ identifier });
            if (listed?.url && typeof pr?.url !== "string") {
              pr = { ...listed, ...pr };
            }
          }
          if (pr?.mergeable === "MERGEABLE" && requiredChecksGreen(pr.checks)) {
            const tokens = tokenSnapshotFromCollected(job.role, {}, identifier, {
              env,
              issueId: typeof job.issueId === "string" ? job.issueId : undefined,
            });
            logTokenRun(tokens);
            const exit = await completeImplementAdw({
              job: { ...job, identifier, issueId: job.issueId ?? identifier },
              checkout,
              gh: ghClient,
              linear: withTokenUse(linearClient, tokens),
              typecheckTouched: typecheckTouched ?? createTypecheckTouched(),
              formatCheck,
              formatApply: applyFormat,
              adwText: readFileSync(join(workspace, adwFile), "utf8"),
              now,
              sleep,
              waitTimeoutMs,
              waitIntervalMs,
            });
            return { ...job, ...exit, tokens, mergeFailFastPath: true };
          }
        }
        const writeScope = parseWriteScopeLine(
          implementIssue?.description ?? job.description ?? "",
        );
        const hermesDirForContext =
          typeof env.KIT_PI_HERMES === "string" && env.KIT_PI_HERMES.length > 0
            ? env.KIT_PI_HERMES
            : WORKER_MEMORY_DIR;
        if (!cheapRetry && !mergeFailResume && !firstPassOnly && !specOnly) {
          implementContext = selectImplementContext({
            title: implementIssue?.title ?? job.title ?? "",
            writeScope,
            labels: implementIssue?.labels ?? job.labels ?? [],
            body: implementIssue?.description ?? job.description ?? "",
            reviewFeedback,
            workpadBody: workpad?.body ?? "",
            hermesDir: hermesDirForContext,
            cheapRetry,
            mergeFailResume,
            profile: modelProfile,
          });
        } else if ((cheapRetry || firstPassOnly || specOnly) && !mergeFailResume) {
          implementContext = selectImplementContext({
            title: implementIssue?.title ?? job.title ?? "",
            writeScope,
            labels: implementIssue?.labels ?? job.labels ?? [],
            body: implementIssue?.description ?? job.description ?? "",
            reviewFeedback,
            workpadBody: workpad?.body ?? "",
            hermesDir: hermesDirForContext,
            slimOnly: true,
            profile: modelProfile,
          });
        }
        if (implementContext?.modelRoute) {
          model = resolveImplementParentModel(implementContext.modelRoute, model);
        }
        prompt = implementPrompt(job.role, identifier, job.adwFile, {
          cheapRetry,
          mergeFailResume,
          reviewFeedback,
          writeScope,
          implementContext,
          workspace,
          firstPassClasses,
        });
      }
      const hermesDir =
        typeof env.KIT_PI_HERMES === "string" && env.KIT_PI_HERMES.length > 0
          ? env.KIT_PI_HERMES
          : WORKER_MEMORY_DIR;
      const agentDir =
        job.role === "factory-checker"
          ? join(workspace, HERMES_CHECKER_AGENT_DIR_REL)
          : typeof env.PI_CODING_AGENT_DIR === "string" && env.PI_CODING_AGENT_DIR.length > 0
            ? env.PI_CODING_AGENT_DIR
            : join(workspace, HERMES_AGENT_DIR_REL);
      const spawnEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
        LINEAR_API_KEY: env.LINEAR_CLI_API_KEY,
        KIT_PI_HERMES: hermesDir,
        PI_CODING_AGENT_DIR: agentDir,
      };
      delete spawnEnv.DATABASE_URL;
      if (job.role === "factory-checker") {
        spawnEnv.LINEAR_ISSUE_ID = job.issueId ?? identifier;
        applySlopAgentSpawnEnv(spawnEnv);
        const linearClient = linear ?? job.linear;
        const issue =
          typeof linearClient?.getIssue === "function"
            ? await linearClient.getIssue(job.issueId ?? identifier)
            : null;
        const checkerGhClient = checkerGh ?? createCheckerGh({ env, runCommand });
        const linkedResolution =
          issue && checkerGhClient
            ? await resolveLinkedPullRequest({
                attachments: issue.attachments,
                identifier,
                gh: checkerGhClient,
              })
            : null;
        const linkedPr = linkedResolution?.linked ?? null;
        if (linkedPr) {
          spawnEnv.GITHUB_PR_REPO = linkedPr.repo;
          spawnEnv.GITHUB_PR_NUMBER = String(linkedPr.number);
        }
      }
      let browserSkill;
      if (job.role === "implement") {
        const issue = implementIssue;
        const slice = {
          labels: issue?.labels ?? job.labels ?? [],
          description: issue?.description ?? job.description ?? "",
        };
        if (isUiImplementSlice(slice) && typeof readCapacity === "function") {
          const raw = await readCapacity();
          const chromium = evaluateChromiumCapacity({
            ramFreeMb: raw.ramFreeMb,
            diskFreeMb: raw.diskFreeMb,
            ...floorsFromEnv(env),
          });
          if (chromium.ready) {
            browserSkill = join(workspace, IMPLEMENT_BROWSER_SKILL_PATH);
          }
        }
      }
      /** @type {string | undefined} */
      let reviewBundle;
      if (job.role === "factory-checker" && checkout) {
        const linearClient = linear ?? job.linear;
        const issue =
          typeof linearClient?.getIssue === "function"
            ? await linearClient.getIssue(job.issueId ?? identifier)
            : null;
        let review = null;
        try {
          review = await captureCheckerReviewDiff({
            cwd: checkout.path,
            lane: checkout.lane ?? "development",
          });
        } catch (error) {
          harnessLog({
            role: job.role,
            identifier,
            event: "phase",
            gate: "yellow",
            phase: "checker-diff",
            detail: `diff snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
        reviewBundle = formatCheckerReviewBundle({
          identifier,
          issueDescription:
            typeof issue?.description === "string"
              ? issue.description
              : typeof job.description === "string"
                ? job.description
                : "",
          review,
        });
      }
      /** @type {() => void} */
      let restoreEconomyPins = () => {};
      if (
        modelProfile === "economy" &&
        checkout &&
        (job.role === "implement" || job.role === "factory-checker")
      ) {
        restoreEconomyPins = applyEconomyAgentPins(join(checkout.path, ".pi/agents"));
      }
      try {
        const result = await runPiJob(job, cwd, model, roleFile, prompt, spawnEnv, {
          browserSkill,
          implementContext,
          reviewBundle,
        });
        if (result.idleTimeout) {
          harnessLog({
            role: job.role,
            identifier,
            event: "fail",
            gate: "red",
            reason: "idle-timeout",
            error: `idle timeout after ${jobIdleMs(env)}ms`,
            loopRisk: 10,
          });
          return timeoutPark(job, identifier, jobIdleMs(env));
        }
        if (result.status !== 0 && job.role !== "implement") {
          harnessLog({
            role: job.role,
            identifier,
            event: "fail",
            gate: "red",
            reason: "pi-exit",
            error: `pi exited ${result.status}`,
            loopRisk: 8,
          });
          throw new Error(`pi exited ${result.status} for ${identifier}`);
        }
        if (job.role === "implement") {
          const adwFile = job.adwFile;
          if (typeof adwFile !== "string") {
            throw new Error("implement requires an ADW file");
          }
          const ghClient = gh ?? job.gh;
          const linearClient = linear ?? job.linear;
          if (!ghClient || !linearClient) {
            throw new Error("implement requires gh and Linear adapters");
          }
          const tokens = tokenSnapshotFromCollected(job.role, result.tokenUse ?? {}, identifier, {
            env,
            issueId: typeof job.issueId === "string" ? job.issueId : undefined,
            sessionId: typeof result.sessionId === "string" ? result.sessionId : undefined,
            parentModelId: model,
            parentModel: labelForModelId(model),
          });
          logTokenRun(tokens, {
            modelRoute: implementContext?.modelRoute ?? undefined,
            routeSuccess: true,
          });
          const exit = await completeImplementAdw({
            job: { ...job, identifier, issueId: job.issueId ?? identifier },
            checkout,
            gh: ghClient,
            linear: withTokenUse(linearClient, tokens),
            typecheckTouched: typecheckTouched ?? createTypecheckTouched(),
            formatCheck,
            formatApply: applyFormat,
            adwText: readFileSync(join(workspace, adwFile), "utf8"),
            now,
            sleep,
            waitTimeoutMs,
            waitIntervalMs,
          });
          return { ...job, ...exit, tokens };
        }
        if (job.role === "factory-checker") {
          const tokens = tokenSnapshotFromCollected(job.role, result.tokenUse ?? {}, identifier, {
            env,
            issueId: typeof job.issueId === "string" ? job.issueId : undefined,
            sessionId: typeof result.sessionId === "string" ? result.sessionId : undefined,
          });
          logTokenRun(tokens);
          const linearClient = linear ?? createLinearCliClient({ env, runCommand });
          const checkerGhClient = checkerGh ?? createCheckerGh({ env, runCommand });
          const exit = await completeChecker({
            job: { ...job, identifier, issueId: job.issueId ?? identifier },
            linear: withTokenUse(linearClient, tokens),
            gh: checkerGhClient,
            now,
            sleep,
            waitTimeoutMs,
            waitIntervalMs,
          });
          return { ...job, ...exit, tokens };
        }
        return job;
      } finally {
        restoreEconomyPins();
      }
    },
  };
}
