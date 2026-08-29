/**
 * Webhook router (KIT-52 + KIT-113).
 *
 * Issue HMAC on POST /webhooks/linear → enqueue exactly one factory role
 * (planner | implement | factory-checker | auto-merge | land) or skip.
 * POST /webhooks/linear/agent-session is not registered (404). AgentSession
 * payloads on the issue channel are skipped without enqueue or activity ack.
 * Pi argv, worktree paths, and ADW yaml stay behind this interface.
 * Fake Linear and `gh` at this seam; do not call Pi or hosted MCP.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createDelegateGateConfig, delegateGate } from "./delegate-gate.mjs";

const HMAC_REJECT = "invalid hmac";
const REPLAY_WINDOW_MS = 60_000;
const READY_FOR_AGENT = "ready-for-agent";
const SIGNAL_UP = "signal-up";
const AGENT_SESSION_PATH = "/webhooks/linear/agent-session";

const ADW_BY_TYPE = {
  Feature: ".pi/adw/feature.yaml",
  Bug: ".pi/adw/bug.yaml",
  Improvement: ".pi/adw/improvement.yaml",
};

/**
 * @param {string | Buffer | undefined} rawBody
 * @param {unknown} signature
 * @param {string} secret
 * @returns {boolean}
 */
function hmacValid(rawBody, signature, secret) {
  if (typeof signature !== "string" || typeof secret !== "string" || secret.length === 0) {
    return false;
  }
  if (rawBody === undefined) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let provided;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

/**
 * @param {unknown} updatedFrom
 * @returns {boolean}
 */
function statusChangedIn(updatedFrom) {
  if (updatedFrom === null || typeof updatedFrom !== "object") {
    return false;
  }
  return Object.hasOwn(updatedFrom, "stateId") || Object.hasOwn(updatedFrom, "state");
}

/**
 * Linear MCP / some HMAC deliveries omit `updatedFrom` on a real status
 * change. Fetch the issue and dispatch; `dispatchIssue` still skips
 * non-factory statuses. Title-only updates keep `updatedFrom` without state
 * and stay skipped.
 *
 * @param {object} payload
 */
function shouldDispatchIssueUpdate(payload) {
  if (statusChangedIn(payload?.updatedFrom)) {
    return true;
  }
  return payload?.updatedFrom === undefined || payload?.updatedFrom === null;
}

/**
 * @param {Array<{ status?: string, statusType?: string }> | undefined} blockedBy
 * @returns {boolean}
 */
function hasUnresolvedBlocker(blockedBy) {
  if (!Array.isArray(blockedBy) || blockedBy.length === 0) {
    return false;
  }
  return blockedBy.some((blocker) => {
    if (blocker?.statusType === "completed" || blocker?.statusType === "canceled") {
      return false;
    }
    if (blocker?.status === "Done" || blocker?.status === "Canceled") {
      return false;
    }
    return true;
  });
}

/**
 * @param {{ linearType?: string, labels?: string[] }} issue
 * @returns {string | undefined}
 */
function adwFileFor(issue) {
  const fromType = issue.linearType && ADW_BY_TYPE[issue.linearType];
  if (fromType) {
    return fromType;
  }
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  for (const typeName of ["Bug", "Improvement", "Feature"]) {
    if (labels.includes(typeName)) {
      return ADW_BY_TYPE[typeName];
    }
  }
  return undefined;
}

/**
 * @param {object} issue
 * @param {{ names: string[], appUserId?: string }} delegateGateConfig
 * @returns {{ kind: "skip", reason: string } | { kind: "enqueue", role: string, adwFile?: string }}
 */
export function dispatchIssue(issue, delegateGateConfig) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  if (labels.includes(SIGNAL_UP)) {
    return { kind: "skip", reason: "signal-up" };
  }

  const delegate = delegateGate(issue.delegate, delegateGateConfig);
  if (delegate === "blocked") {
    return { kind: "skip", reason: "delegate is not Pi app" };
  }

  switch (issue.status) {
    case "Backlog": {
      if (!labels.includes(READY_FOR_AGENT)) {
        return { kind: "skip", reason: "missing ready-for-agent" };
      }
      if (hasUnresolvedBlocker(issue.blockedBy)) {
        return { kind: "skip", reason: "blockedBy unresolved" };
      }
      return { kind: "enqueue", role: "planner" };
    }
    case "Implementing": {
      const adwFile = adwFileFor(issue);
      if (!adwFile) {
        return { kind: "skip", reason: "missing Linear Type for ADW" };
      }
      return { kind: "enqueue", role: "implement", adwFile };
    }
    case "In Review":
      return { kind: "enqueue", role: "factory-checker" };
    case "Ready for merge":
      return { kind: "enqueue", role: "auto-merge" };
    case "Merging":
      return { kind: "enqueue", role: "land" };
    default:
      return { kind: "skip", reason: `no factory role for ${issue.status}` };
  }
}

/**
 * @param {object} payload
 */
function isAgentSessionPayload(payload) {
  const type = payload?.type;
  return type === "AgentSessionEvent" || type === "AgentSession";
}

/**
 * @param {{
 *   rawBody: string | Buffer,
 *   signature: unknown,
 *   secret: string,
 *   now?: number,
 *   linear: { getIssue: (id: string) => Promise<object | null> | object | null, clearDelegate?: Function },
 *   gh: object,
 *   enqueue: { enqueue: (job: object) => void },
 *   worktree?: { reap?: (input: { identifier: string }) => Promise<unknown> },
 *   delegateGateConfig?: { names: string[], appUserId?: string },
 *   allowedDelegates?: string[],
 * }} input
 */
export async function routeWebhook(input) {
  const {
    rawBody,
    signature,
    secret,
    now = Date.now(),
    linear,
    gh,
    enqueue,
    worktree,
    delegateGateConfig = createDelegateGateConfig(input.env),
    allowedDelegates,
  } = input;
  const gateConfig =
    delegateGateConfig ??
    (Array.isArray(allowedDelegates)
      ? { names: allowedDelegates, appUserId: undefined }
      : createDelegateGateConfig(input.env));

  if (!hmacValid(rawBody, signature, secret)) {
    return { kind: "rejected", reason: HMAC_REJECT };
  }

  let payload;
  try {
    payload = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    return { kind: "skip", reason: "invalid json" };
  }

  const timestamp = payload?.webhookTimestamp;
  if (typeof timestamp !== "number" || Math.abs(now - timestamp) > REPLAY_WINDOW_MS) {
    return { kind: "rejected", reason: "stale webhook" };
  }

  if (isAgentSessionPayload(payload)) {
    return { kind: "skip", reason: "AgentSession path removed (KIT-113)" };
  }

  if (payload?.type !== "Issue") {
    return { kind: "skip", reason: "not an Issue webhook" };
  }

  if (payload?.action !== "update" || !shouldDispatchIssueUpdate(payload)) {
    return { kind: "skip", reason: "not a status change" };
  }

  const issueId = payload?.data?.id;
  if (typeof issueId !== "string" || issueId.length === 0) {
    return { kind: "skip", reason: "missing issue id" };
  }

  const issue = await linear.getIssue(issueId);
  if (!issue) {
    return { kind: "skip", reason: "issue not found" };
  }

  if (issue.status === "Done" || issue.status === "Canceled") {
    if (delegateGate(issue.delegate, gateConfig) === "pi") {
      if (typeof linear.clearDelegate === "function") {
        await linear.clearDelegate({ issueId: issue.id });
      }
    }
    if (typeof worktree?.reap === "function" && typeof issue.identifier === "string") {
      await worktree.reap({ identifier: issue.identifier });
    }
    return { kind: "skip", reason: `no factory role for ${issue.status}` };
  }

  const decision = dispatchIssue(issue, gateConfig);
  if (decision.kind !== "enqueue") {
    return decision;
  }

  enqueue.enqueue({
    role: decision.role,
    issueId: issue.id,
    identifier: issue.identifier,
    linear,
    gh,
    ...(decision.adwFile ? { adwFile: decision.adwFile } : {}),
  });

  return decision.adwFile
    ? { kind: "enqueue", role: decision.role, adwFile: decision.adwFile }
    : { kind: "enqueue", role: decision.role };
}

/**
 * In-memory adapter for tests. Same seam as the HTTP handler.
 *
 * @param {object} deps
 */
export function createMemoryAdapter(deps) {
  return {
    /**
     * @param {{ rawBody: string | Buffer, signature: unknown, now?: number }} request
     */
    handle({ rawBody, signature, now }) {
      return routeWebhook({
        ...deps,
        rawBody,
        signature,
        now: now ?? (typeof deps.now === "function" ? deps.now() : deps.now),
      });
    },
  };
}

/**
 * Production HTTP adapter. Responds 401 on HMAC/replay rejection, 404 on removed
 * agent-session path, 200 on skip or enqueue.
 *
 * @param {object} deps
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createHttpHandler(deps) {
  return async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      const path = (req.url ?? "/").split("?")[0];
      if (path === AGENT_SESSION_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks);
      const now = typeof deps.now === "function" ? deps.now() : (deps.now ?? Date.now());
      const result = await routeWebhook({
        ...deps,
        rawBody,
        signature: req.headers["linear-signature"],
        now,
      });
      res.writeHead(result.kind === "rejected" ? 401 : 200);
      res.end();
    } catch {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    }
  };
}
