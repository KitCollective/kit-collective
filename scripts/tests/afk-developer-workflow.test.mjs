import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LOCK_ROWS } from "../lib/review-matrix.mjs";
import { reviewMode } from "../lib/review-mode.mjs";
import { END_STATUSES, END_STOPS, validateEvent } from "../lib/run-log.mjs";

/**
 * The AFK developer workflow runs in bb's QuickJS sandbox, which this repo cannot start. These tests
 * run the same source in a plain async function with `agent`, `phase` and `args` replaced by a
 * scripted fake: the fake plays the runner workers (it answers the numbered commands) and the
 * Lead, Engineer and Reviewer, and records every command and every spawn option.
 */
const SOURCE = readFileSync(
  join(fileURLToPath(new URL("../..", import.meta.url)), ".bb/workflows/afk-developer.js"),
  "utf8",
);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = SOURCE.replace("export const meta =", "const meta =");

const ENGINEER_THREAD = "thr_engineer01";
const REVIEWER_THREAD = "thr_reviewer01";
const SHA = "a".repeat(40);

/**
 * @param {object} opts
 * @param {Record<string, any>} [opts.args]
 * @param {(command: string) => { code: number, line: string } | null | undefined} [opts.shell]
 * @param {(round: number) => any} [opts.engineer] returns the engineer result (or null / throws)
 * @param {(round: number) => any} [opts.reviewer]
 * @param {any} [opts.lead]
 */
async function run({
  args = { issue: "KIT-9" },
  shell,
  engineer,
  reviewer,
  lead,
  startDecision,
} = {}) {
  const commands = [];
  const spawns = [];
  const phases = [];
  let engineerRound = 0;
  let reviewerRound = 0;
  const decision = {
    plan: false,
    planWhy: "small",
    roles: [],
    engineerModel: "sonnet",
    modelWhy: "default",
    ...startDecision,
  };
  const fakeAgent = async (prompt, options = {}) => {
    spawns.push({ prompt, options });
    if (options.schema?.required?.includes("results")) {
      const lines = prompt
        .split("\n")
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => l.replace(/^\d+\. /, ""))
        // Every command arrives wrapped so the shell prints its own exit code; the tests see the bare command.
        .map((l) => /^\( (.*) \); echo "KIT-EXIT:\$\?"$/.exec(l)?.[1] ?? l);
      const results = [];
      for (const command of lines) {
        commands.push(command);
        const custom = shell?.(command);
        // `null` plays a runner that ended its turn without a results array entry (KIT-285).
        if (custom === null) return { results };
        const result =
          custom ??
          (command.includes("start-decision.mjs")
            ? { code: 0, line: JSON.stringify(decision) }
            : command.startsWith("bb optio reviewer-served")
              ? { code: 0, line: `SERVED ${REVIEWER_THREAD} as z-ai/glm-5.3 (3 calls)` }
              : { code: 0, line: "OPEN: fine" });
        // A `shell` answer with its own `exit` plays a runner that did not relay the printed marker.
        results.push({ exit: result.exit ?? `KIT-EXIT:${result.code}`, line: result.line });
        if (result.code !== 0 && !prompt.includes("Run every command even when one fails.")) break;
      }
      return { results };
    }
    if (options.label.startsWith("lead:")) {
      return lead ?? { outcome: "plan", sentence: "planned", threadId: "thr_lead0001" };
    }
    if (options.label.startsWith("engineer:")) {
      engineerRound += 1;
      const out = engineer
        ? engineer(engineerRound)
        : { outcome: "ready", sentence: "done", threadId: ENGINEER_THREAD, prNumber: 77 };
      if (out instanceof Error) throw out;
      return out;
    }
    reviewerRound += 1;
    const out = reviewer?.(reviewerRound) ?? {
      verdict: "green",
      sha: SHA,
      sentence: "clean",
      threadId: REVIEWER_THREAD,
    };
    if (out instanceof Error) throw out;
    return out;
  };
  const fn = new AsyncFunction("agent", "phase", "log", "args", body);
  const result = await fn(
    fakeAgent,
    (title) => phases.push(title),
    () => {},
    args,
  );
  return { result, commands, spawns, phases };
}

/** The last Linear state the workflow wrote, i.e. what Linear shows when the run returns. */
const lastState = (commands) =>
  commands
    .filter((c) => /linear\.mjs state /.test(c))
    .map((c) => /"([^"]+)"$/.exec(c)[1])
    .at(-1);

/** The run's last line, `run-log.mjs end`, is a log line, not a step: tests of the steps leave it out. */
const isEnd = (c) => c.startsWith("node scripts/run-log.mjs end ");
const steps = (commands) => commands.filter((c) => !isEnd(c));

const agentSpawns = (spawns) =>
  spawns.filter((s) => !s.options.schema?.required?.includes("results"));

test("meta is a literal, and every phase() title is a meta phase", () => {
  const meta = /export const meta = (\{[\s\S]*?\n\});/.exec(SOURCE)[1];
  assert.doesNotMatch(meta, /\$\{|\.\.\./);
  const declared = [...meta.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  const used = [...SOURCE.matchAll(/(?:phase\(|phase: )"([^"]+)"/g)].map((m) => m[1]);
  for (const title of new Set(used))
    assert.ok(declared.includes(title), `phase ${title} is not in meta`);
});

test("the literal provider and model in every agent() call match PROVIDER and MODELS", () => {
  // bb's validator wants string literals in the agent() options, so the source holds each id
  // twice: once in the call and once in the constants the run log is written from.
  const provider = /const PROVIDER = "([^"]+)";/.exec(SOURCE)[1];
  const block = /const MODELS = (\{[\s\S]*?\n\});/.exec(SOURCE)[1];
  const models = [...block.matchAll(/: "([^"]+)"/g)].map((m) => m[1]);
  // `agent()` with nothing in the parentheses is prose in a comment, not a call.
  const calls = [...SOURCE.matchAll(/\bagent\((?!\))/g)].length;
  const literalProviders = [...SOURCE.matchAll(/\bprovider: "([^"]*)"/g)].map((m) => m[1]);
  const literalModels = [...SOURCE.matchAll(/\bmodel: "([^"]*)"/g)].map((m) => m[1]);
  assert.ok(calls > 0 && models.length > 0);
  // One literal of each per call, so a call that selects by variable or by spread fails here too.
  assert.equal(literalProviders.length, calls);
  assert.equal(literalModels.length, calls);
  for (const literal of literalProviders) assert.equal(literal, provider);
  for (const literal of literalModels)
    assert.ok(models.includes(literal), `model ${literal} is not a value of MODELS`);
});

test("green path: ends at Approval, in the documented order, with a dry-run receipt", async () => {
  const { result, commands, phases } = await run();
  assert.equal(result.status, "Approval");
  assert.equal(result.prNumber, 77);
  assert.match(result.receipt, /OPEN|WOULD POST/);
  const at = (needle) => commands.findIndex((c) => c.includes(needle));
  const order = [
    "session-check.mjs KIT-9",
    "run-log.mjs start",
    "start-decision.mjs --issue KIT-9",
    "gate.mjs pre-review 77",
    "head-changed.mjs KIT-9 --pr 77",
    'state KIT-9 "In Review"',
    "gate.mjs review 77",
    "audit-receipt.mjs post 77",
    'state KIT-9 "Approval"',
  ];
  const positions = order.map(at);
  assert.ok(
    positions.every((p) => p >= 0),
    `missing step: ${order.filter((_, i) => positions[i] < 0)}`,
  );
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  // The matrix is validated only by the full gate, after the reviewer.
  assert.ok(
    commands.findIndex((c) => c.includes("gate.mjs review")) >
      commands.findIndex((c) => c.includes("--step reviewer")),
  );
  assert.ok(phases.indexOf("Reviewer") < phases.indexOf("Review gate"));
});

test("it never merges, enqueues, posts a receipt or sets Merging, Post-Merge or Done", async () => {
  const runs = [
    await run(),
    await run({
      lead: undefined,
      args: { issue: "KIT-9" },
      reviewer: (n) =>
        n === 1
          ? {
              verdict: "red",
              sha: SHA,
              rows: ["spec-ac"],
              sentence: "no",
              threadId: REVIEWER_THREAD,
            }
          : undefined,
    }),
  ];
  for (const { commands } of runs) {
    for (const command of commands) {
      assert.doesNotMatch(command, /"(Merging|Post-Merge|Done)"/);
      assert.doesNotMatch(command, /merge-lock|sync-pr|gh pr merge|auto-merge|reap/);
      if (command.includes("audit-receipt.mjs")) {
        assert.match(command, /--dry-run/);
        assert.match(command, /--require-different-model/);
      }
    }
  }
  assert.doesNotMatch(SOURCE, /state \$\{issue\} "(Merging|Post-Merge|Done)"/);
  assert.match(SOURCE, /const MAY_SET = \["In Progress", "In Review", "Approval", "Blocked"\]/);
});

test("the Reviewer runs on another model than the Engineer, and both spawns are logged with thread, provider and model", async () => {
  const { commands, spawns } = await run();
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:"));
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.notEqual(engineer.options.model, reviewer.options.model);
  assert.equal(engineer.options.model, "claude-sonnet-5-5");
  const spawnEngineer = commands.find((c) => c.includes("spawn") && c.includes("--step engineer"));
  assert.match(
    spawnEngineer,
    new RegExp(`--thread ${ENGINEER_THREAD} .*--provider claude-code --model claude-sonnet-5-5`),
  );
  const spawnReviewer = commands.find((c) => c.includes("spawn") && c.includes("--step reviewer"));
  // The proxied Reviewer is logged as the model that ran (GLM 5.3), not the carrier it names (ADR-0067).
  assert.match(spawnReviewer, new RegExp(`--thread ${REVIEWER_THREAD} .*--model z-ai/glm-5.3`));
  assert.match(
    commands.find((c) => c.includes("audit-receipt.mjs")),
    new RegExp(`--thread ${REVIEWER_THREAD} --implementer-thread ${ENGINEER_THREAD}`),
  );
});

test("an Opus Engineer gets a Reviewer on a different model too", async () => {
  const decision = JSON.stringify({
    plan: false,
    planWhy: "x",
    roles: [],
    engineerModel: "opus",
    modelWhy: "high-risk path",
  });
  const { spawns } = await run({
    shell: (c) => (c.includes("start-decision") ? { code: 0, line: decision } : undefined),
  });
  const [engineer, reviewer] = ["engineer:", "reviewer:"].map((p) =>
    agentSpawns(spawns).find((s) => s.options.label.startsWith(p)),
  );
  assert.equal(engineer.options.model, "claude-opus-5-5");
  assert.notEqual(reviewer.options.model, engineer.options.model);
});

test("session-check closed stops before anything else runs", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) =>
      c.includes("session-check")
        ? { code: 1, line: "CLOSED: KIT-9 already has open PR #5" }
        : undefined,
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.stoppedAt, "session-check");
  // The harness comparison (two git commands) shares the session check's runner.
  assert.equal(commands.length, 3);
  assert.equal(spawns.length, 1);
});

const isHarnessDiff = (c) => c.startsWith("git diff --quiet HEAD...origin/development");

test("a worktree whose harness differs from development stops before the session check counts a start (KIT-283)", async () => {
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) => (isHarnessDiff(c) ? { code: 1, line: "" } : undefined),
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.stoppedAt, "harness");
  assert.match(
    result.note,
    /differs from origin\/development: merge origin\/development into the branch/,
  );
  assert.equal(commands[0], "git fetch --quiet origin development");
  assert.match(
    commands[1],
    // Three dots: only the lane's own changes since the branch left it count (KIT-398, KIT-411).
    /^git diff --quiet HEAD\.\.\.origin\/development -- \.bb\/workflows scripts factory\.config\.json$/,
  );
  assert.ok(!commands.some((c) => c.includes("session-check.mjs")));
  assert.ok(
    !commands.some((c) => c.includes("run-log.mjs start")),
    "no start is logged, so the run cap is not spent",
  );
  assert.equal(spawns.length, 1);
});

test("a harness comparison that could not run is a stop, not a pass", async () => {
  const fetchFailed = await run({
    shell: (c) =>
      c.startsWith("git fetch") ? { code: 128, line: "fatal: unable to access" } : undefined,
  });
  assert.equal(fetchFailed.result.stoppedAt, "harness");
  assert.match(fetchFailed.result.note, /could not compare the harness.*fatal: unable to access/);
  const diffBroke = await run({
    shell: (c) => (isHarnessDiff(c) ? { code: 129, line: "usage: git diff" } : undefined),
  });
  assert.equal(diffBroke.result.stoppedAt, "harness");
  assert.match(diffBroke.result.note, /could not compare/);
  assert.equal(agentSpawns(diffBroke.spawns).length, 0);
});

test("a current harness adds no runner: the comparison rides with the session check", async () => {
  const { spawns } = await run();
  const first = spawns[0];
  assert.equal(first.options.label, "session-check");
  const numbered = first.prompt.split("\n").filter((l) => /^\d+\. /.test(l));
  assert.equal(numbered.length, 3);
  assert.match(numbered[2], /session-check\.mjs KIT-9/);
});

test("a bad issue key is refused without spawning anything", async () => {
  const { result, spawns } = await run({ args: { issue: "KIT-9; rm -rf" } });
  assert.equal(result.status, "refused");
  assert.equal(spawns.length, 0);
});

test("an Engineer that ends without a result is logged as no-result-line and retried once", async () => {
  const { result, commands } = await run({
    engineer: (n) =>
      n <= 1
        ? new Error("no result")
        : { outcome: "ready", sentence: "ok", threadId: ENGINEER_THREAD, prNumber: 77 },
  });
  assert.equal(result.status, "Approval");
  assert.ok(commands.some((c) => c.includes("reason") && c.includes("--code no-result-line")));
  const twice = await run({ engineer: () => new Error("no result") });
  assert.equal(twice.result.status, "In Progress");
  assert.equal(twice.result.stoppedAt, "engineer");
  assert.equal(twice.commands.filter((c) => c.includes("--code no-result-line")).length, 2);
});

test("a red review loops once to a fix pass, logs the red audit, and stops at the round cap", async () => {
  const red = {
    verdict: "red",
    sha: SHA,
    rows: ["spec-ac"],
    sentence: "AC 2 is not met",
    threadId: REVIEWER_THREAD,
  };
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", maxRounds: 2 },
    reviewer: () => red,
  });
  // Out of rounds a person acts: Approval + ready-for-human, and the status says what Linear shows.
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "review gate");
  assert.equal(result.rounds, 2);
  assert.ok(commands.some((c) => c.includes("label KIT-9 swap ready-for-agent ready-for-human")));
  assert.equal(lastState(commands), "Approval");
  assert.equal(steps(commands).filter((c) => c.includes("--verdict red")).length, 2);
  assert.ok(commands.some((c) => c.includes('state KIT-9 "In Progress"')));
  assert.ok(
    agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:")).length === 2,
  );
  const second = agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:"))[1];
  assert.match(second.prompt, /AC 2 is not met/);
  assert.ok(!commands.some((c) => c.includes("audit-receipt")));
  // The round-cap stop fills ### Waiting with fixed text: the Reviewer's sentence never enters the command.
  assert.deepEqual(waitingCmds(commands), [
    'node scripts/linear.mjs waiting KIT-9 --stage "review gate" --ask "needs-human: round cap reached after a red review, the findings are under ### Review feedback"',
  ]);
  assert.equal(steps(commands).at(-1), waitingCmds(commands)[0]);
});

test("a red review with only light findings at the cap gets one extra round, and that one only", async () => {
  const light = {
    verdict: "red",
    sha: SHA,
    rows: ["architecture"],
    sentence: "a SAFETY comment names the wrong table",
    threadId: REVIEWER_THREAD,
    light: true,
  };
  // Light red three times: rounds 1 and 2, then the one extra round, then a person.
  const two = { issue: "KIT-9", maxRounds: 2 };
  const capped = await run({ args: two, reviewer: () => light });
  assert.equal(capped.result.status, "Approval");
  assert.equal(capped.result.rounds, 3);
  assert.equal(capped.commands.filter((c) => c.includes("--code light-extra-round")).length, 1);
  assert.equal(
    agentSpawns(capped.spawns).filter((s) => s.options.label.startsWith("engineer:")).length,
    3,
  );
  // Light red at the cap, then green: the extra round reaches Approval through the normal green path.
  const fixed = await run({
    args: two,
    reviewer: (n) =>
      n <= 2 ? light : { verdict: "green", sha: SHA, sentence: "ok", threadId: REVIEWER_THREAD },
  });
  assert.equal(fixed.result.rounds, 3);
  assert.ok(fixed.commands.some((c) => c.includes("audit-receipt")));
  // A red that is not light at the cap gets no extra round.
  const heavy = await run({ args: two, reviewer: () => ({ ...light, light: false }) });
  assert.equal(heavy.result.rounds, 2);
  assert.ok(!heavy.commands.some((c) => c.includes("light-extra-round")));
});

test("red then green: the second round reaches Approval", async () => {
  const { result } = await run({
    reviewer: (n) =>
      n === 1
        ? { verdict: "red", sha: SHA, sentence: "fix x", threadId: REVIEWER_THREAD }
        : undefined,
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.rounds, 2);
});

test("a closed pre-review gate (scope missing in the PR) is logged with its own reason and fed back", async () => {
  let gateCalls = 0;
  const { result, commands, spawns } = await run({
    shell: (c) => {
      if (!c.includes("gate.mjs pre-review")) return undefined;
      gateCalls += 1;
      return gateCalls === 1
        ? {
            code: 1,
            line: "CLOSED (review): scope-in-pr: scope-missing-in-pr: the issue declares write-scope a/**",
          }
        : { code: 0, line: "OPEN (review): clean" };
    },
  });
  assert.ok(commands.some((c) => c.includes("--code scope-missing-in-pr")));
  const second = agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:"))[1];
  assert.match(second.prompt, /scope-missing-in-pr/);
  assert.equal(result.status, "Approval");
});

test("the pre-review gate waits again on exit 3 and the matrix is not read before the reviewer", async () => {
  let n = 0;
  const { result, commands } = await run({
    shell: (c) => {
      if (!c.includes("gate.mjs pre-review")) return undefined;
      n += 1;
      return n < 3 ? { code: 3, line: "WAITING: checks pending" } : { code: 0, line: "OPEN" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter((c) => c.includes("gate.mjs pre-review")).length, 3);
  assert.ok(!commands.some((c) => c.includes("scripts/review-matrix.mjs")));
});

test("an Engineer `blocked` moves to Approval with a label swap, or to Blocked with a relation", async () => {
  const human = await run({
    engineer: () => ({
      outcome: "blocked",
      sentence: "needs-human: which currency?",
      threadId: ENGINEER_THREAD,
    }),
  });
  assert.equal(human.result.status, "Approval");
  assert.ok(human.commands.some((c) => c.includes("label KIT-9 swap ready-for-agent needs-info")));
  const dep = await run({
    engineer: () => ({
      outcome: "blocked",
      sentence: "blocked-by KIT-3: schema first",
      threadId: ENGINEER_THREAD,
    }),
  });
  assert.equal(dep.result.status, "Blocked");
  assert.ok(dep.commands.some((c) => c.includes("block KIT-9 --by KIT-3")));
});

test("an amber review (checks pending) holds In Review and posts nothing", async () => {
  const { result, commands } = await run({
    reviewer: () => ({
      verdict: "amber",
      sha: SHA,
      sentence: "checks pending",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.equal(result.status, "In Review");
  assert.ok(!steps(commands).some((c) => c.includes("audit-receipt") || c.includes("--verdict")));
});

test("a Lead plan-approval ends the run in Approval before any Engineer", async () => {
  const planning = JSON.stringify({
    plan: true,
    planWhy: "no seams",
    roles: ["Backend"],
    engineerModel: "sonnet",
    modelWhy: "default",
  });
  const { result, spawns } = await run({
    shell: (c) => (c.includes("start-decision") ? { code: 0, line: planning } : undefined),
    lead: { outcome: "plan-approval", sentence: "touches auth", threadId: "thr_lead0001" },
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "lead");
  assert.ok(!agentSpawns(spawns).some((s) => s.options.label.startsWith("engineer:")));
  const lead = agentSpawns(spawns).find((s) => s.options.label.startsWith("lead:"));
  assert.equal(lead.options.model, "claude-opus-5-5");
  assert.match(lead.prompt, /read-only/);
});

test("runner commands are built from validated tokens only", async () => {
  const { commands } = await run({
    engineer: () => ({
      outcome: "ready",
      sentence: "$(rm -rf /)",
      threadId: ENGINEER_THREAD,
      prNumber: 77,
    }),
  });
  for (const command of commands) assert.doesNotMatch(command, /\$\(|`|;|\|/);
});

test("hostile text from the Reviewer never reaches a command", async () => {
  const hostile = ["a;touch /tmp/x", "$(id)", "x`id`", "spec-ac", "UPPER", "a b", "x|y"];
  const { commands } = await run({
    reviewer: () => ({
      verdict: "red",
      sha: SHA,
      rows: hostile,
      sentence: "$(id); rm -rf /",
      threadId: REVIEWER_THREAD,
    }),
  });
  const audit = commands.find((c) => c.includes("--verdict red"));
  assert.match(audit, /--rows spec-ac$/);
  for (const command of commands) {
    assert.doesNotMatch(command, /touch|\$\(|`|;|\||rm -rf|UPPER/);
  }
  const badSha = await run({
    reviewer: () => ({
      verdict: "red",
      sha: "abc; id",
      rows: [],
      sentence: "x",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.ok(!steps(badSha.commands).some((c) => c.includes("--verdict red")));
  const badVerdict = await run({
    reviewer: () => ({ verdict: "green; id", sha: SHA, sentence: "x", threadId: REVIEWER_THREAD }),
  });
  assert.ok(badVerdict.commands.every((c) => !c.includes("green; id")));
  assert.equal(badVerdict.result.status, "In Review");
  const badEngineer = await run({
    engineer: () => ({
      outcome: "ready; id",
      sentence: "x",
      threadId: ENGINEER_THREAD,
      prNumber: 77,
    }),
  });
  assert.ok(badEngineer.commands.every((c) => !c.includes("ready; id")));
  const badLead = await run({
    shell: (c) =>
      c.includes("start-decision")
        ? {
            code: 0,
            line: JSON.stringify({ plan: true, planWhy: "x", roles: [], engineerModel: "sonnet" }),
          }
        : undefined,
    lead: { outcome: "plan; id", sentence: "x", threadId: "thr_lead0001" },
  });
  assert.ok(badLead.commands.every((c) => !c.includes("plan; id")));
});

test("a refused receipt dry run holds In Review, not Approval", async () => {
  const refused = await run({
    shell: (c) =>
      c.includes("audit-receipt.mjs")
        ? { code: 1, line: "REFUSED (receipt): the reviewer ran on the same model as an engineer" }
        : undefined,
  });
  assert.equal(refused.result.status, "In Review");
  assert.equal(refused.result.stoppedAt, "receipt");
  assert.match(refused.result.note, /REFUSED \(receipt\)/);
  assert.ok(refused.commands.some((c) => c.includes("--code evidence-gap")));
  assert.equal(lastState(refused.commands), "In Review");
  assert.ok(!refused.commands.some((c) => c.includes('state KIT-9 "Approval"')));
  const passed = await run({
    shell: (c) =>
      c.includes("audit-receipt.mjs")
        ? { code: 0, line: "WOULD POST (receipt): kc/audit success" }
        : undefined,
  });
  assert.equal(passed.result.status, "Approval");
  assert.equal(lastState(passed.commands), "Approval");
});

test("the returned status matches the last Linear state in every stop path", async () => {
  const scenarios = [
    await run({ engineer: () => new Error("x") }),
    await run({
      engineer: () => ({ outcome: "failed", sentence: "x", threadId: ENGINEER_THREAD }),
    }),
    await run({ engineer: () => ({ outcome: "ready", sentence: "x", threadId: ENGINEER_THREAD }) }),
    await run({
      reviewer: () => ({ verdict: "amber", sha: SHA, sentence: "x", threadId: REVIEWER_THREAD }),
    }),
    await run({ reviewer: () => new Error("x") }),
    await run({
      shell: (c) => (c.includes("gate.mjs pre-review") ? { code: 4, line: "UNKNOWN" } : undefined),
    }),
    await run({
      shell: (c) =>
        c.includes("gate.mjs review ")
          ? { code: 1, line: "CLOSED (review): matrix: empty row" }
          : undefined,
    }),
    await run({
      args: { issue: "KIT-9", resume: true },
      shell: (c) => (c.includes("gh pr list") ? { code: 0, line: "77" } : undefined),
      engineer: () => new Error("x"),
    }),
  ];
  for (const { result, commands } of scenarios) {
    assert.equal(lastState(commands), result.status, `${result.stoppedAt}: ${result.note}`);
  }
});

const isPre = (c) => c.includes("gate.mjs pre-review");

test("the runner prompt forbids backgrounding and prose endings and says to wait in the foreground", async () => {
  const { spawns } = await run();
  const runner = spawns.find((s) => s.options.schema?.required?.includes("results")).prompt;
  assert.match(runner, /foreground/);
  assert.match(runner, /Never background/);
  for (const word of ["`&`", "`nohup`", "`timeout`"]) assert.ok(runner.includes(word), word);
  assert.match(runner, /Do not end your turn with prose/);
});

test("an empty runner result for the gate is retried once, then succeeds", async () => {
  let calls = 0;
  const { result, commands } = await run({
    shell: (c) => {
      if (!isPre(c)) return undefined;
      calls += 1;
      return calls === 1 ? null : undefined;
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter(isPre).length, 2);
  assert.ok(!commands.some((c) => c.includes("--code runner-no-result")));
});

test("a runner that returns nothing twice stops with runner-no-result, never as a gate verdict", async () => {
  const { result, commands } = await run({ shell: (c) => (isPre(c) ? null : undefined) });
  assert.equal(result.status, "In Progress");
  assert.equal(result.stoppedAt, "pre-review gate");
  assert.match(
    result.note,
    /runner-no-result: the command runner returned nothing for: node scripts\/gate\.mjs pre-review 77/,
  );
  assert.equal(commands.filter(isPre).length, 2);
  assert.ok(commands.some((c) => c.includes("reason") && c.includes("--code runner-no-result")));
  assert.ok(!commands.some((c) => c.includes("--code gate-closed")));
  assert.ok(!commands.some((c) => c.includes("reviewer")), "no Reviewer is spawned");
});

test("a runner that returns nothing for the review gate holds In Review, with no fix round", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) => (c.includes("gate.mjs review") ? null : undefined),
  });
  assert.equal(result.status, "In Review");
  assert.equal(result.stoppedAt, "review gate");
  assert.match(result.note, /runner-no-result/);
  assert.equal(
    agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:")).length,
    1,
  );
  assert.ok(commands.some((c) => c.includes("--code runner-no-result")));
});

test("a short results array without a failing last entry counts as a runner failure", async () => {
  const { result } = await run({
    shell: (c) => (c.includes("start-decision") ? null : undefined),
  });
  assert.equal(result.status, "stopped");
  assert.match(result.note, /runner-no-result/);
});

test("every runner command is wrapped so the shell prints its own exit code", async () => {
  const { spawns } = await run();
  const runner = spawns.find((s) => s.options.schema?.required?.includes("results")).prompt;
  const numbered = runner.split("\n").filter((l) => /^\d+\. /.test(l));
  assert.ok(numbered.length > 0);
  for (const l of numbered) assert.match(l, /^\d+\. \( .* \); echo "KIT-EXIT:\$\?"$/);
  assert.match(runner, /Never work out or guess the exit code/);
});

test("an exit code the runner made up is a runner failure, never a closed gate (KIT-295)", async () => {
  const { result, commands } = await run({
    shell: (c) =>
      isPre(c) ? { exit: "-1", code: 0, line: "OPEN (review): checks clean" } : undefined,
  });
  assert.equal(result.stoppedAt, "pre-review gate");
  assert.match(result.note, /runner-no-result/);
  assert.equal(commands.filter(isPre).length, 2);
  assert.ok(!commands.some((c) => c.includes("--code gate-closed")));
});

test("a runner failure is logged with a code the run log accepts", async () => {
  const { REASON_CODES } = await import("../lib/run-log.mjs");
  assert.ok(REASON_CODES.includes("runner-no-result"));
});

const lookup = (c) => c.includes("gh pr list");
const isPoint = (c) => c.includes("resume-point.mjs");
/** A resume on PR #55 whose resume point says build (`point` code 1) or review as it is (code 0). */
const resumeShell = (point, more) => (c) =>
  lookup(c)
    ? { code: 0, line: "55" }
    : isPoint(c)
      ? { code: point, line: point === 0 ? "OPEN: review it as it is" : "CLOSED: build first" }
      : more?.(c);
const engineers = (spawns) =>
  agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:"));

test("resume looks the PR up read-only and hands its number to the Engineer", async () => {
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(1),
    engineer: () => ({
      outcome: "ready",
      sentence: "done",
      threadId: ENGINEER_THREAD,
      prNumber: 55,
    }),
  });
  const lookupAt = commands.findIndex(lookup);
  assert.ok(lookupAt >= 0);
  assert.match(commands[lookupAt], /--state open --search "KIT-9 in:title"/);
  assert.doesNotMatch(commands[lookupAt], /create|merge|close|edit/);
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:"));
  assert.match(engineer.prompt, /PR #55 exist/);
  assert.match(engineer.prompt, /never open a second PR/);
  assert.equal(result.prNumber, 55);
  assert.equal(result.status, "Approval");
  assert.ok(commands.some((c) => c.includes('state KIT-9 "In Progress"')));
});

test("resume stops when the Engineer reports another PR than the existing one", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(1),
    engineer: () => ({
      outcome: "ready",
      sentence: "done",
      threadId: ENGINEER_THREAD,
      prNumber: 77,
    }),
  });
  assert.equal(result.status, "In Progress");
  assert.equal(result.stoppedAt, "engineer");
  assert.match(result.note, /second PR/);
  assert.ok(!commands.some(isPre), "no gate reads the second PR");
});

test("resume with two open PRs, or an unreadable answer, stops before the Engineer", async () => {
  for (const line of ["55,56", "OPEN: fine; $(rm -rf /)"]) {
    const { result, spawns } = await run({
      args: { issue: "KIT-9", resume: true },
      shell: (c) => (lookup(c) ? { code: 0, line } : undefined),
    });
    assert.equal(result.status, "stopped");
    assert.equal(result.stoppedAt, "resume");
    assert.equal(
      agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:")).length,
      0,
    );
  }
});

test("resume with no open PR tells the Engineer to open exactly one", async () => {
  const { spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) => (lookup(c) ? { code: 0, line: "" } : undefined),
  });
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:"));
  assert.match(engineer.prompt, /no open PR was found/);
  assert.match(engineer.prompt, /exactly one PR/);
});

test("a start-decision answered only with the exit line gets one more runner, then the run goes on (KIT-409)", async () => {
  let asked = 0;
  const { result, commands } = await run({
    shell: (c) => {
      if (!c.includes("start-decision")) return undefined;
      asked += 1;
      return asked === 1 ? { code: 0, line: "KIT-EXIT:0" } : undefined;
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter((c) => c.includes("start-decision.mjs --issue KIT-9")).length, 2);
  assert.equal(
    commands.filter((c) => c.includes("run-log.mjs start")).length,
    1,
    "start is logged once",
  );
  assert.equal(commands.filter((c) => c.includes('state KIT-9 "In Progress"')).length, 1);
});

test("a start-decision with no JSON twice stops at start-decision, after exactly one retry", async () => {
  const { result, commands } = await run({
    shell: (c) => (c.includes("start-decision") ? { code: 0, line: "KIT-EXIT:0" } : undefined),
  });
  assert.equal(result.status, "stopped");
  assert.equal(result.stoppedAt, "start-decision");
  assert.match(result.note, /no JSON twice/);
  assert.equal(commands.filter((c) => c.includes("start-decision.mjs")).length, 2);
});

test("a PR lookup answered only with the exit line is asked once more, not read as two PRs (KIT-409)", async () => {
  let asked = 0;
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) => {
      if (!lookup(c)) return undefined;
      asked += 1;
      return { code: 0, line: asked === 1 ? "KIT-EXIT:0" : "" };
    },
  });
  assert.notEqual(result.stoppedAt, "resume");
  assert.equal(commands.filter(lookup).length, 2);
});

test("a fresh run does no PR lookup", async () => {
  const { commands } = await run();
  assert.ok(!commands.some(lookup));
});

test("no command the workflow builds waits longer than the 10 minute foreground cap allows", async () => {
  const scenarios = [
    await run(),
    await run({
      args: { issue: "KIT-9", resume: true },
      shell: (c) => (c.includes("gh pr list") ? { code: 0, line: "77" } : undefined),
    }),
    await run({
      shell: (c) => (c.includes("gate.mjs") ? { code: 3, line: "WAITING" } : undefined),
    }),
  ];
  let seen = 0;
  for (const { commands, spawns } of scenarios) {
    for (const text of [...commands, ...spawns.map((s) => s.prompt)]) {
      for (const m of text.matchAll(/--timeout (\d+)/g)) {
        seen += 1;
        assert.ok(Number(m[1]) <= 560, `${m[0]} in: ${text.slice(0, 80)}`);
      }
    }
  }
  assert.ok(seen > 3, "the check must have seen gate and Engineer timeouts");
});

test("a gate that keeps waiting is bounded: five slices, then a clear stop in the right state", async () => {
  const pre = await run({
    shell: (c) => (isPre(c) ? { code: 3, line: "WAITING: checks pending" } : undefined),
  });
  assert.equal(pre.commands.filter(isPre).length, 5);
  assert.equal(pre.result.status, "In Progress");
  assert.equal(pre.result.stoppedAt, "pre-review gate");
  assert.match(pre.result.note, /still waiting after 5 slices of 480s/);
  assert.ok(pre.commands.some((c) => c.includes("--code ci-pending")));
  assert.equal(lastState(pre.commands), "In Progress");

  const review = await run({
    shell: (c) =>
      c.includes("gate.mjs review")
        ? { code: 3, line: "WAITING (review): checks pending" }
        : undefined,
  });
  assert.equal(review.commands.filter((c) => c.includes("gate.mjs review")).length, 5);
  assert.equal(review.result.status, "In Review");
  assert.equal(review.result.stoppedAt, "review gate");
  assert.match(review.result.note, /still waiting after 5 slices/);
  assert.equal(lastState(review.commands), "In Review");
  assert.equal(
    agentSpawns(review.spawns).filter((s) => s.options.label.startsWith("engineer:")).length,
    1,
  );
});

const NO_VERDICT_LINE =
  "CLOSED (review): checks: RED (2 pass, 1 fail, 0 pending, 0 skipped): Device flows; device-flows-no-verdict: needs-human: run device-run.sh on the Mac on abc1234";
const PENDING_LINE = (n) =>
  `WAITING (review): checks: TIMEOUT after 470s: PENDING (2 pass, 0 fail, 1 pending, 0 skipped): Device flows; device-flows-pending on abc1234${n}`;
const FLOW_RED_LINE =
  "CLOSED (review): checks: RED (2 pass, 1 fail, 0 pending, 0 skipped): Device flows";
const isReviewGate = (c) => c.includes("gate.mjs review");
const reviewers = (spawns) =>
  agentSpawns(spawns).filter((s) => s.options.label.startsWith("reviewer:"));

test("the Reviewer starts while Device flows still run: the pre-review gate is not held for them (amendment of 2026-10-18)", async () => {
  const { result, commands, spawns } = await run();
  assert.equal(result.status, "Approval");
  const request = commands.indexOf("node scripts/request-device-flows.mjs 77 --issue KIT-9");
  assert.ok(request >= 0 && request < commands.findIndex(isPre), "asked for before pre-review");
  assert.equal(commands.filter(isPre).length, 1);
  assert.equal(reviewers(spawns).length, 1);
  const reviewer = reviewers(spawns)[0].prompt;
  assert.match(reviewer, /`Device flows` status of a slice flow may still be running/);
  // The review gate is where the run waits: the request rides in front of every slice of it.
  commands.forEach((c, i) => {
    if (isReviewGate(c))
      assert.ok(commands[i - 1].includes("request-device-flows.mjs 77"), "the ask comes first");
  });
});

test("a Device flows run with no verdict at the review gate ends needs-human in Approval, with no fix round", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) => (isReviewGate(c) ? { code: 1, line: NO_VERDICT_LINE } : undefined),
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "review gate");
  assert.equal(result.note, "needs-human: run device-run.sh on the Mac on abc1234");
  assert.ok(commands.some((c) => c.includes("swap ready-for-agent ready-for-human")));
  assert.ok(commands.some((c) => c.includes("--code device-flows-no-verdict")));
  assert.equal(lastState(commands), "Approval");
  assert.ok(!commands.some((c) => c.includes("--code gate-closed")));
  assert.equal(commands.filter(isReviewGate).length, 1);
  assert.ok(!commands.some((c) => c.includes("audit-receipt.mjs")), "no receipt without a verdict");
  const agents = agentSpawns(spawns);
  assert.equal(agents.filter((s) => s.options.label.startsWith("engineer:")).length, 1);
  assert.equal(reviewers(spawns).length, 1);
});

test("a Device flows status still pending after five review gate slices ends needs-human, not ci-pending", async () => {
  const pending = await run({
    shell: (c) => (isReviewGate(c) ? { code: 3, line: PENDING_LINE("") } : undefined),
  });
  assert.equal(pending.commands.filter(isReviewGate).length, 5);
  assert.equal(pending.result.status, "Approval");
  assert.equal(pending.result.note, "needs-human: run device-run.sh on the Mac on abc1234");
  assert.equal(lastState(pending.commands), "Approval");
  assert.ok(!pending.commands.some((c) => c.includes("--code ci-pending")));

  // Any other pending check keeps the old ending: In Review and ci-pending.
  const plain = await run({
    shell: (c) => (isReviewGate(c) ? { code: 3, line: "WAITING: checks pending" } : undefined),
  });
  assert.equal(plain.result.status, "In Review");
  assert.ok(plain.commands.some((c) => c.includes("--code ci-pending")));
  assert.ok(!plain.commands.some((c) => c.includes("--code device-flows-no-verdict")));
});

test("a red Device flows run at the review gate is an Engineer fix round, and the new head is reviewed again", async () => {
  let gates = 0;
  const { result, commands, spawns } = await run({
    shell: (c) => {
      if (!isReviewGate(c)) return undefined;
      gates += 1;
      return gates === 1 ? { code: 1, line: FLOW_RED_LINE } : { code: 0, line: "OPEN (review)" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.verdict, "green");
  assert.ok(commands.some((c) => c.includes("--code gate-closed")));
  assert.ok(!commands.some((c) => c.includes("--code device-flows-no-verdict")));
  const engineerSpawns = agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:"));
  assert.equal(engineerSpawns.length, 2);
  assert.match(engineerSpawns[1].prompt, /The hosted Device flows run is red on the PR head/);
  assert.match(engineerSpawns[1].prompt, /request-device-flows\.mjs 77 --issue KIT-9/);
  // The green review of the first head never counts for the second: the new head goes through the
  // pre-review gate and a fresh Reviewer before the review gate opens.
  assert.equal(reviewers(spawns).length, 2);
  assert.equal(commands.filter(isPre).length, 2);
  assert.equal(commands.filter(isReviewGate).length, 2);
  const secondPre = commands.findLastIndex(isPre);
  const firstGate = commands.findIndex(isReviewGate);
  assert.ok(firstGate < secondPre);
  assert.ok(
    commands.slice(firstGate, secondPre).some((c) => c.includes("request-device-flows.mjs 77")),
    "the run is asked for again for the new head, before its pre-review gate",
  );
  // Only the last, open review gate leads to the receipt.
  assert.equal(commands.filter((c) => c.includes("audit-receipt.mjs")).length, 1);
  assert.ok(commands.findIndex((c) => c.includes("audit-receipt.mjs")) > secondPre);
});

test("a Device flows run that stays red counts toward the round cap and ends with a person", async () => {
  const { result, spawns } = await run({
    args: { issue: "KIT-9", maxRounds: 2 },
    shell: (c) => (isReviewGate(c) ? { code: 1, line: FLOW_RED_LINE } : undefined),
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "review gate");
  assert.match(result.note, /Device flows/);
  assert.equal(
    agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:")).length,
    2,
  );
});

test("a closed pre-review gate still gets a fix round; a Device flows error at the review gate that turns green is no stop", async () => {
  let n = 0;
  const pre = await run({
    shell: (c) => {
      if (!isPre(c)) return undefined;
      n += 1;
      return n === 1
        ? {
            code: 1,
            line: "CLOSED (review): checks: RED (2 pass, 1 fail, 0 pending, 0 skipped): test",
          }
        : { code: 0, line: "OPEN" };
    },
  });
  assert.equal(pre.result.status, "Approval");
  assert.ok(pre.commands.some((c) => c.includes("--code gate-closed")));

  let g = 0;
  const { result } = await run({
    shell: (c) => {
      if (!isReviewGate(c)) return undefined;
      g += 1;
      if (g === 1)
        return {
          code: 3,
          line: "WAITING (review): checks: PENDING: Device flows stopped before the flow finished on abc1234; asked for again; device-flows-pending on abc1234",
        };
      if (g === 2)
        return {
          code: 3,
          line: "WAITING (review): checks: PENDING (2 pass, 0 fail, 1 pending, 0 skipped): Device flows; device-flows-pending on abc1234",
        };
      return { code: 0, line: "OPEN (review): clean" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "approval");
});

test("the Device flows request rides in front of every pre-review slice, not only the first", async () => {
  const { commands } = await run({
    shell: (c) => (isPre(c) ? { code: 3, line: "WAITING: checks pending" } : undefined),
  });
  const asks = commands.filter((c) => c.includes("request-device-flows.mjs 77 --issue KIT-9"));
  assert.equal(asks.length, 5);
  commands.forEach((c, i) => {
    if (isPre(c))
      assert.ok(commands[i - 1].includes("request-device-flows.mjs"), "the ask comes first");
  });
});

const waitingCmds = (commands) => commands.filter((c) => c.includes("linear.mjs waiting"));
const WAITING_DEVICE_FLOWS =
  'node scripts/linear.mjs waiting KIT-9 --stage "review gate" --ask "needs-human: run device-run.sh on the Mac on abc1234"';

test("a gate-detected needs-human stop fills ### Waiting with linear.mjs waiting, once, after the move, with no agent", async () => {
  const noVerdict = await run({
    shell: (c) => (isReviewGate(c) ? { code: 1, line: NO_VERDICT_LINE } : undefined),
  });
  assert.deepEqual(waitingCmds(noVerdict.commands), [WAITING_DEVICE_FLOWS]);
  assert.equal(steps(noVerdict.commands).at(-1), WAITING_DEVICE_FLOWS);
  assert.equal(lastState(noVerdict.commands), "Approval");
  assert.ok(
    noVerdict.commands.findIndex((c) => c.includes('state KIT-9 "Approval"')) <
      noVerdict.commands.indexOf(WAITING_DEVICE_FLOWS),
  );
  assert.ok(!agentSpawns(noVerdict.spawns).some((s) => s.options.label.startsWith("waiting:")));

  // A write that fails leaves the stop standing: the state was set before it.
  const failing = await run({
    shell: (c) =>
      isReviewGate(c)
        ? { code: 1, line: NO_VERDICT_LINE }
        : c.includes("linear.mjs waiting")
          ? { code: 1, line: "linear: the workpad of KIT-9 has no ### Waiting section" }
          : undefined,
  });
  assert.equal(failing.result.status, "Approval");
  assert.equal(lastState(failing.commands), "Approval");

  // The exhausted-pending ending writes it too; an ordinary ci-pending stop does not.
  const pending = await run({
    shell: (c) => (isReviewGate(c) ? { code: 3, line: PENDING_LINE("") } : undefined),
  });
  assert.deepEqual(waitingCmds(pending.commands), [WAITING_DEVICE_FLOWS]);
  const plain = await run({
    shell: (c) => (isReviewGate(c) ? { code: 3, line: "WAITING: checks pending" } : undefined),
  });
  assert.equal(waitingCmds(plain.commands).length, 0);
});

test("a resume whose review gate has no Device flows verdict fills ### Waiting the same way", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0, (c) =>
      isReviewGate(c) ? { code: 1, line: NO_VERDICT_LINE } : undefined,
    ),
  });
  assert.equal(result.status, "Approval");
  assert.deepEqual(waitingCmds(commands), [WAITING_DEVICE_FLOWS]);
});

test("the Engineer asks for the hosted run but does not wait for it before ready", async () => {
  const { spawns } = await run();
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:")).prompt;
  assert.match(engineer, /request-device-flows\.mjs <pr> --issue KIT-9/);
  assert.match(engineer, /Do not wait for the `Device flows` status/);
  assert.doesNotMatch(engineer, /needs a green `Device flows` status/);
  assert.doesNotMatch(engineer, /gate\.mjs pre-review <pr>/);
});

test("the review gate keeps going when early slices wait and a later one is open", async () => {
  let n = 0;
  const { result } = await run({
    shell: (c) => {
      if (!c.includes("gate.mjs review")) return undefined;
      n += 1;
      return n < 3 ? { code: 3, line: "WAITING" } : { code: 0, line: "OPEN (review)" };
    },
  });
  assert.equal(result.status, "Approval");
});

test("the Engineer prompt asks for foreground slices and treats exit 5 as blocked", async () => {
  const { spawns } = await run();
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:")).prompt;
  assert.match(engineer, /wait-for-checks\.mjs <pr> --timeout 480/);
  assert.match(engineer, /up to 5 times/);
  assert.match(engineer, /Exit 5 means gh is unusable/);
});

const planCheck = (c) => c.includes("workpad-has-plan.mjs");
const planned = (extra) => run({ args: { issue: "KIT-9", resume: true }, ...extra });

test("resume skips the Lead when the workpad already has a plan, and logs it", async () => {
  const { result, commands, spawns } = await planned({
    startDecision: { plan: true },
    shell: (c) =>
      planCheck(c)
        ? { code: 0, line: "PLAN-PRESENT KIT-9" }
        : c.includes("gh pr list")
          ? { code: 0, line: "77" }
          : undefined,
  });
  assert.ok(commands.some(planCheck));
  assert.ok(commands.some((c) => c.includes("--code lead-skipped")));
  assert.ok(!agentSpawns(spawns).some((s) => s.options.label.startsWith("lead:")));
  assert.equal(result.status, "Approval");
});

test("resume without a plan still runs the Lead; an unreadable workpad stops the run", async () => {
  const lookup = (c) => (c.includes("gh pr list") ? { code: 0, line: "77" } : undefined);
  const none = await planned({
    startDecision: { plan: true },
    shell: (c) => (planCheck(c) ? { code: 1, line: "PLAN-ABSENT KIT-9" } : lookup(c)),
  });
  assert.ok(agentSpawns(none.spawns).some((s) => s.options.label.startsWith("lead:")));
  assert.ok(!none.commands.some((c) => c.includes("--code lead-skipped")));
  const broken = await planned({
    startDecision: { plan: true },
    shell: (c) => (planCheck(c) ? { code: 4, line: "UNKNOWN: boom" } : lookup(c)),
  });
  assert.equal(broken.result.status, "stopped");
  assert.ok(!agentSpawns(broken.spawns).some((s) => s.options.label.startsWith("lead:")));
});

test("a fresh run never asks for the workpad plan, and skipLead still skips the Lead", async () => {
  const fresh = await run({ startDecision: { plan: true } });
  assert.ok(!fresh.commands.some(planCheck));
  assert.ok(agentSpawns(fresh.spawns).some((s) => s.options.label.startsWith("lead:")));
  const skip = await planned({
    args: { issue: "KIT-9", resume: true, skipLead: true },
    startDecision: { plan: true },
    shell: (c) => (c.includes("gh pr list") ? { code: 0, line: "77" } : undefined),
  });
  assert.ok(!skip.commands.some(planCheck));
});

// ---- autoLand (ADR-0061) --------------------------------------------------------------------------------

const autoLandShell =
  ({
    start = { code: 0, line: "ENQUEUED (auto-land): PR 77" },
    finish = { code: 0, line: "LANDED (auto-land): PR 77" },
    enabled,
  } = {}) =>
  (command) => {
    if (command.includes("auto-land.mjs enabled")) return enabled;
    if (command.includes("auto-land.mjs start")) return start;
    if (command.includes("auto-land.mjs finish")) return finish;
    return undefined;
  };

test("autoLand off (the default): the run ends at Approval and only asks whether the config switch is on", async () => {
  const { result, commands } = await run({ shell: autoLandShell() });
  assert.equal(result.status, "Approval");
  assert.equal(lastState(commands), "Approval");
  assert.ok(!commands.some((c) => /auto-land\.mjs (start|finish)/.test(c)));
  // A runner that answers anything but the exact line leaves the default.
  const odd = await run({ shell: autoLandShell({ enabled: { code: 0, line: "OPEN: fine" } }) });
  assert.equal(odd.result.status, "Approval");
});

test("autoLand true: green hands the issue to auto-land start with --force-enabled, then finish, and ends Done", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: autoLandShell(),
  });
  assert.equal(result.status, "Done");
  assert.equal(result.stoppedAt, "done");
  const start = commands.findIndex((c) =>
    c.includes("auto-land.mjs start 77 --issue KIT-9 --handoff --force-enabled"),
  );
  const finish = commands.findIndex((c) => c.includes("auto-land.mjs finish 77 --issue KIT-9"));
  assert.ok(start >= 0 && finish > start, "start, then finish");
  assert.ok(commands.findIndex((c) => c.includes("audit-receipt.mjs post")) < start);
  assert.notEqual(lastState(commands), "Approval", "Approval is the exception exit, not a step");
  // The workflow itself still never merges, posts a receipt for real, or sets a merge state.
  for (const command of steps(commands)) {
    assert.doesNotMatch(command, /"(Merging|Post-Merge|Done)"/);
    assert.doesNotMatch(command, /gh pr merge|merge-lock|sync-pr|--auto\b/);
    if (command.includes("audit-receipt.mjs")) assert.match(command, /--dry-run/);
  }
});

test("autoLand from the config: the script says AUTO-LAND ON, so start runs without --force-enabled", async () => {
  const { result, commands } = await run({
    shell: autoLandShell({ enabled: { code: 0, line: "AUTO-LAND ON" } }),
  });
  assert.equal(result.status, "Done");
  const start = commands.find((c) => c.includes("auto-land.mjs start"));
  assert.match(start, /--handoff$/);
  assert.doesNotMatch(start, /--force-enabled/);
});

test("autoLand refused: the issue is moved to Approval, with the refusal in the note", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: autoLandShell({
      start: { code: 1, line: "REFUSED (auto-land): needs-human: surface:mobile" },
    }),
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "auto-land");
  assert.match(result.note, /needs-human: surface:mobile/);
  assert.equal(lastState(commands), "Approval");
  assert.ok(!commands.some((c) => c.includes("auto-land.mjs finish")));
});

test("autoLand waiting: start repeats while the verdict is exit 3, five slices at most, and stops In Review", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: autoLandShell({ start: { code: 3, line: "WAITING (auto-land): checks pending" } }),
  });
  assert.equal(commands.filter((c) => c.includes("auto-land.mjs start")).length, 5);
  assert.equal(result.status, "In Review");
  assert.equal(lastState(commands), "In Review");
  assert.match(result.note, /still waiting after 5 slices/);
});

test("autoLand finish alarm: the script already moved the issue to Approval; the workflow reports it", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: autoLandShell({ finish: { code: 1, line: "ALARM (auto-land): queue-ejected: ..." } }),
  });
  assert.equal(result.status, "Approval");
  assert.match(result.note, /ALARM \(auto-land\): queue-ejected/);
  assert.ok(!commands.some((c) => /state KIT-9 "(Done|Merging)"/.test(c)));
});

test("autoLand finish still waiting after the slices leaves the issue Merging and says how to go on", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: autoLandShell({ finish: { code: 3, line: "WAITING (auto-land): in the queue" } }),
  });
  assert.equal(commands.filter((c) => c.includes("auto-land.mjs finish")).length, 5);
  assert.equal(result.status, "Merging");
  assert.match(result.note, /run auto-land\.mjs finish again/);
});

test("a runner that returns nothing for auto-land start is never retried (the command is not idempotent) and the status is unknown", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: (c) => (c.includes("auto-land.mjs start") ? null : undefined),
  });
  assert.equal(commands.filter((c) => c.includes("auto-land.mjs start")).length, 1);
  assert.equal(result.status, "unknown");
  assert.match(result.note, /runner-no-result/);
  assert.match(result.note, /may have enqueued/);
});

test("a runner whose shell refused auto-land start reports DENIED, and the stop note names the refusal (KIT-384)", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: (c) =>
      c.includes("auto-land.mjs start")
        ? {
            exit: "DENIED",
            line: "Permission for this action was denied by the Claude Code auto mode classifier.",
          }
        : undefined,
  });
  assert.equal(commands.filter((c) => c.includes("auto-land.mjs start")).length, 1);
  assert.ok(commands.some((c) => c.includes("--code runner-no-result")));
  assert.equal(result.status, "unknown");
  assert.match(
    result.note,
    /runner-no-result: .*its shell refused the command: Permission for this action was denied/,
  );
});

test("autoLand must be a boolean in the input schema, and never changes how the Reviewer or the receipt dry run work", async () => {
  assert.match(SOURCE, /autoLand: \{ type: "boolean" \}/);
  const { spawns } = await run({
    args: { issue: "KIT-9", autoLand: true },
    shell: autoLandShell(),
  });
  for (const spawn of agentSpawns(spawns)) {
    assert.equal(spawn.options.provider, "claude-code");
    // The Reviewer runs on an OpenRouter model through Optio's proxy (ADR-0067); everyone else on Claude.
    assert.match(spawn.options.model, /^claude-/);
  }
});

test("a resume whose head is ready goes straight to the Reviewer: no Engineer, and In Progress rides with the resume point (KIT-295, ADR-0066)", async () => {
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0),
  });
  assert.equal(engineers(spawns).length, 0);
  assert.equal(result.status, "Approval");
  assert.equal(result.prNumber, 55);
  assert.equal(result.rounds, 0);
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.equal(reviewer.options.label, "reviewer:KIT-9:r0:openrouter");
  assert.equal(commands.filter((c) => c.includes('state KIT-9 "In Progress"')).length, 1);
  assert.ok(commands.some((c) => c.includes("--code engineer-skipped")));
  assert.equal(
    commands.filter(isPre).length,
    1,
    "the pre-review gate runs once, before the Reviewer",
  );
  const receipt = commands.find((c) => c.includes("audit-receipt.mjs"));
  assert.doesNotMatch(receipt, /--implementer-thread/);
  const { REASON_CODES } = await import("../lib/run-log.mjs");
  assert.ok(REASON_CODES.includes("engineer-skipped"));
});

test("a red review of a head reviewed as it is still leaves every Engineer round", async () => {
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true, maxRounds: 1 },
    shell: resumeShell(0),
    engineer: () => ({
      outcome: "ready",
      sentence: "fixed",
      threadId: ENGINEER_THREAD,
      prNumber: 55,
    }),
    reviewer: (round) =>
      round === 1
        ? {
            verdict: "red",
            sha: SHA,
            rows: ["spec"],
            sentence: "AC 2 unmet",
            threadId: REVIEWER_THREAD,
          }
        : undefined,
  });
  assert.equal(engineers(spawns).length, 1);
  assert.match(engineers(spawns)[0].prompt, /The Reviewer returned red/);
  assert.equal(result.status, "Approval");
  assert.equal(result.rounds, 1);
  assert.ok(commands.some((c) => c.includes("--step engineer") && c.includes("--mode fix")));
  assert.ok(commands.some((c) => c.includes("--round 0")));
});

test("a resume whose pre-review gate is closed builds, with the gate line as the change request", async () => {
  let gates = 0;
  const { result, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0, (c) => {
      if (!isPre(c)) return undefined;
      gates += 1;
      return gates === 1 ? { code: 1, line: "CLOSED (review): scope" } : undefined;
    }),
    engineer: () => ({
      outcome: "ready",
      sentence: "done",
      threadId: ENGINEER_THREAD,
      prNumber: 55,
    }),
  });
  assert.equal(engineers(spawns).length, 1);
  assert.match(
    engineers(spawns)[0].prompt,
    /The pre-review gate is closed: CLOSED \(review\): scope/,
  );
  assert.equal(result.status, "Approval");
});

test("a resume point the runner could not read stops the run before any worker is spent", async () => {
  const { result, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) => (lookup(c) ? { code: 0, line: "55" } : isPoint(c) ? null : undefined),
  });
  assert.equal(result.stoppedAt, "resume-point");
  assert.match(result.note, /runner-no-result/);
  assert.equal(agentSpawns(spawns).length, 0);
});

test("a fresh run, and a resume without a PR, never ask for the resume point", async () => {
  const fresh = await run();
  assert.ok(!fresh.commands.some(isPoint));
  const noPr = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) => (lookup(c) ? { code: 0, line: "" } : undefined),
  });
  assert.ok(!noPr.commands.some(isPoint));
  assert.equal(engineers(noPr.spawns).length, 1);
});

const runners = (spawns) => spawns.filter((s) => s.options.schema?.required?.includes("results"));
const labels = (spawns) => runners(spawns).map((s) => s.options.label);

test("a green run spends ten runners: the log lines ride with the gates, the end line has its own, and the proxied Reviewer's thread is looked up by title", async () => {
  const { result, commands, spawns } = await run();
  assert.equal(result.status, "Approval");
  assert.deepEqual(labels(spawns), [
    "session-check",
    "start",
    "gate:pre-review",
    "head-changed",
    "linear:In Review",
    "reviewer-served",
    "gate:review",
    "receipt:dry-run",
    "linear:Approval",
    "log:end",
  ]);
  const at = (needle) => commands.findIndex((c) => c.includes(needle));
  assert.ok(at("--step engineer --outcome ready") >= 0);
  assert.ok(at("--step engineer --outcome ready") < at("gate.mjs pre-review"));
  assert.ok(at("--step reviewer --outcome green") >= 0);
  assert.ok(at("--step reviewer --outcome green") < at("gate.mjs review"));
  assert.ok(
    at("gate.mjs review") < at("audit-receipt.mjs"),
    "the receipt reads a run log that has the reviewer",
  );
});

test("a shared runner that comes back incomplete asks the gate once more alone and repeats no log line", async () => {
  let calls = 0;
  const { result, commands, spawns } = await run({
    shell: (c) => {
      if (!isPre(c)) return undefined;
      calls += 1;
      return calls === 1 ? null : undefined;
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter((c) => c.includes("spawn --issue KIT-9 --step engineer")).length, 1);
  assert.equal(labels(spawns).filter((l) => l === "gate:pre-review").length, 2);
});

test("a stop before a gate still writes the log lines that would have ridden with it", async () => {
  const blocked = await run({
    engineer: () => ({
      outcome: "blocked",
      sentence: "needs-human: widen the write-scope?",
      threadId: ENGINEER_THREAD,
      prNumber: 77,
    }),
  });
  assert.ok(labels(blocked.spawns).includes("log:engineer"));
  assert.ok(blocked.commands.some((c) => c.includes("--step engineer --outcome blocked")));
  const amber = await run({
    reviewer: () => ({
      verdict: "amber",
      sha: SHA,
      sentence: "checks pending",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.equal(amber.result.verdict, "amber");
  assert.ok(labels(amber.spawns).includes("log:reviewer"));
  assert.ok(amber.commands.some((c) => c.includes("--step reviewer --outcome amber")));
});

test("a fix round opens without a runner of its own for In Progress", async () => {
  const { result, commands, spawns } = await run({
    reviewer: (round) =>
      round === 1
        ? {
            verdict: "red",
            sha: SHA,
            rows: ["spec"],
            sentence: "AC 2 unmet",
            threadId: REVIEWER_THREAD,
          }
        : undefined,
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.rounds, 2);
  assert.ok(!labels(spawns).includes("linear:In Progress"));
  const red = runners(spawns).find((s) => s.options.label === "log:red").prompt;
  assert.match(red, /run-log\.mjs audit .*--verdict red/);
  assert.match(red, /linear\.mjs state KIT-9 "In Progress"/);
  const states = commands
    .filter((c) => /linear\.mjs state /.test(c))
    .map((c) => /"([^"]+)"$/.exec(c)[1]);
  assert.deepEqual(states, ["In Progress", "In Review", "In Progress", "In Review", "Approval"]);
});

test("the last red review of a run does not move the issue back to In Progress", async () => {
  const { result, spawns } = await run({
    args: { issue: "KIT-9", maxRounds: 1 },
    reviewer: () => ({
      verdict: "red",
      sha: SHA,
      rows: ["spec"],
      sentence: "AC 2 unmet",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.equal(result.status, "Approval");
  const red = runners(spawns).find((s) => s.options.label === "log:red").prompt;
  assert.doesNotMatch(red, /"In Progress"/);
});

test("a resume that reviews the head as it is writes both skip lines on runners it needs anyway", async () => {
  const { result, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    startDecision: { plan: true },
    shell: resumeShell(0),
  });
  assert.equal(result.status, "Approval");
  assert.deepEqual(labels(spawns), [
    "session-check",
    "start",
    "pr-lookup",
    "plan-check",
    "resume-point",
    "gate:pre-review",
    "linear:In Review",
    "reviewer-served",
    "gate:review",
    "receipt:dry-run",
    "linear:Approval",
    "log:end",
  ]);
  const point = runners(spawns).find((s) => s.options.label === "resume-point").prompt;
  assert.match(point, /--code lead-skipped/);
  const review = runners(spawns).find((s) => s.options.label === "linear:In Review").prompt;
  assert.match(review, /--code engineer-skipped/);
});

test("the hosted Device flows run is asked for in the pre-review gate's own runner, before the gate (ADR-0059)", async () => {
  const { commands, spawns } = await run();
  const request = commands.findIndex(
    (c) => c === "node scripts/request-device-flows.mjs 77 --issue KIT-9",
  );
  assert.ok(request >= 0);
  assert.ok(request < commands.findIndex(isPre));
  const gate = runners(spawns).find((s) => s.options.label === "gate:pre-review").prompt;
  assert.match(gate, /request-device-flows\.mjs 77 --issue KIT-9/);

  const resumed = await run({ args: { issue: "KIT-9", resume: true }, shell: resumeShell(0) });
  const asked = resumed.commands.findIndex((c) =>
    c.includes("request-device-flows.mjs 55 --issue KIT-9"),
  );
  assert.ok(asked >= 0 && asked < resumed.commands.findIndex(isPre));
});

test("the runner and the Engineer are told to set the shell tool's timeout, which otherwise backgrounds a wait after 2 minutes (KIT-286)", async () => {
  const { spawns } = await run();
  const runner = spawns.find((s) => s.options.schema?.required?.includes("results")).prompt;
  assert.match(runner, /set the tool's timeout to 600000 ms/);
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:")).prompt;
  assert.match(engineer, /set the tool's timeout to 600000 ms/);
});

const isReceipt = (c) => c.includes("audit-receipt.mjs post");
const NO_LINE =
  "REFUSED (receipt): thread thr_reviewer01 did not end with an exact AUDIT-RESULT line (nothing else on the line or after it), and its last tool call is no bb_workflow_result call";

const FRESH_THREAD = "thr_reviewer02";
const FRESH_TITLE = "reviewer:KIT-9:r1:fresh:openrouter";
/** Optio serves each Reviewer's thread by title: the first review and the fresh one are two threads. */
const served = (c) =>
  c.startsWith("bb optio reviewer-served")
    ? {
        code: 0,
        line: `SERVED ${c.endsWith(FRESH_TITLE) ? FRESH_THREAD : REVIEWER_THREAD} as z-ai/glm-5.3 (3 calls)`,
      }
    : undefined;
/** Any message to, or wait on, a Reviewer thread after it returned: bb has already stopped it. */
const asksStopped = (c) =>
  /^bb thread (tell|unarchive|wait) thr_reviewer01\b/.test(c) && !c.includes("Review matrix");

test("the Reviewer is told to end on the line and make the result tool its very last call, and that the two must agree", async () => {
  const { spawns } = await run();
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:")).prompt;
  assert.match(reviewer, /Write that line as your last text, after every other tool call/);
  assert.match(reviewer, /as your very last tool call, return the same verdict, the full head sha/);
  assert.match(reviewer, /refuses when they disagree/);
});

test("a Reviewer that returned only through the result tool passes on the first receipt: no ask, no fresh Reviewer (KIT-432)", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) =>
      isReceipt(c)
        ? {
            code: 0,
            line: "WOULD POST (receipt): kc/audit success: audit green by thr_reviewer01 (claude-code/claude-opus-5-5) at aaaaaaa (verdict from the thread's result call)",
          }
        : undefined,
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter(isReceipt).length, 1);
  assert.ok(!commands.some(asksStopped));
  assert.equal(
    agentSpawns(spawns).filter((s) => s.options.label.startsWith("reviewer:")).length,
    1,
  );
});

test("no verdict in the Reviewer's thread never messages that stopped thread: one fresh Reviewer on the same head, whose own thread is the receipt (KIT-404, KIT-432)", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) => {
      if (isReceipt(c))
        return c.includes(`--thread ${FRESH_THREAD} `)
          ? { code: 0, line: "WOULD POST (receipt): kc/audit success" }
          : { code: 1, line: NO_LINE };
      return served(c);
    },
  });
  assert.equal(result.status, "Approval");
  assert.match(result.receipt, /WOULD POST/);
  // bb stops a worker at its result call; on 2026-10-19 the ask to such a thread got no answer.
  assert.ok(!commands.some(asksStopped), "the stopped Reviewer thread is not asked again");
  const reviewers = agentSpawns(spawns).filter((s) => s.options.label.startsWith("reviewer:"));
  assert.deepEqual(
    reviewers.map((s) => s.options.label),
    ["reviewer:KIT-9:r1:openrouter", FRESH_TITLE],
  );
  // Delta since the green head itself: the checks are re-read and the matrix carried forward.
  assert.match(reviewers[1].prompt, new RegExp(`--green ${SHA}`));
  assert.match(reviewers[1].prompt, /Write that line as your last text/);
  const at = (needle) => commands.findIndex((c) => c.includes(needle));
  assert.ok(at("--code no-result-line") > at(`--thread ${REVIEWER_THREAD} `));
  assert.ok(at("--code no-result-line") < at("--code fresh-reviewer"));
  assert.ok(at("--code fresh-reviewer") < at(`reviewer-served --title ${FRESH_TITLE}`));
  // The fresh thread is logged as a reviewer before its receipt, which audit-receipt requires.
  assert.ok(at(`spawn --issue KIT-9 --step reviewer --thread ${FRESH_THREAD}`) > 0);
  assert.ok(
    at(`spawn --issue KIT-9 --step reviewer --thread ${FRESH_THREAD}`) <
      at(`--thread ${FRESH_THREAD} --implementer-thread`),
  );
  assert.ok(
    commands.some((c) =>
      c.includes(`--step reviewer --outcome green --usage-thread ${FRESH_THREAD}`),
    ),
  );
  assert.ok(!commands.some((c) => c.includes("--code evidence-gap")));
});

test("only a missing verdict spawns the fresh Reviewer, and never a second one", async () => {
  const once = await run({ shell: (c) => (isReceipt(c) ? { code: 1, line: NO_LINE } : served(c)) });
  assert.equal(once.result.stoppedAt, "receipt");
  // The first try and the one on the fresh Reviewer's thread.
  assert.equal(once.commands.filter(isReceipt).length, 2);
  assert.ok(!once.commands.some(asksStopped));
  assert.equal(
    agentSpawns(once.spawns).filter((s) => s.options.label.startsWith("reviewer:")).length,
    2,
    "one fresh Reviewer, never a second",
  );

  const other = await run({
    shell: (c) =>
      isReceipt(c)
        ? {
            code: 1,
            line: "REFUSED (receipt): reviewer runs on claude-code/x, the same as an engineer spawn",
          }
        : undefined,
  });
  assert.equal(other.result.stoppedAt, "receipt");
  assert.equal(other.commands.filter(isReceipt).length, 1);
  assert.equal(
    agentSpawns(other.spawns).filter((s) => s.options.label.startsWith("reviewer:")).length,
    1,
  );
});

test("a fresh Reviewer that is not green on the same head, or not served, stops at the receipt without its receipt", async () => {
  const cases = [{ verdict: "red", sha: SHA }, { verdict: "green", sha: "b".repeat(40) }, null];
  for (const fresh of cases) {
    const { result, commands } = await run({
      reviewer: (n) =>
        n === 1
          ? { verdict: "green", sha: SHA, sentence: "clean", threadId: REVIEWER_THREAD }
          : fresh
            ? { ...fresh, sentence: "x", threadId: FRESH_THREAD }
            : new Error("no result"),
      shell: (c) => (isReceipt(c) ? { code: 1, line: NO_LINE } : served(c)),
    });
    assert.equal(result.stoppedAt, "receipt");
    assert.equal(result.status, "In Review");
    assert.match(result.receipt, /no verdict in the Reviewer.s thread/);
    assert.ok(!commands.some((c) => isReceipt(c) && c.includes(FRESH_THREAD)));
    assert.ok(!commands.some((c) => c.includes(`--thread ${FRESH_THREAD} --mode review`)));
    assert.ok(commands.some((c) => c.includes("--code evidence-gap")));
  }
  const notServed = await run({
    shell: (c) =>
      isReceipt(c)
        ? { code: 1, line: NO_LINE }
        : c.startsWith("bb optio reviewer-served") && c.endsWith(FRESH_TITLE)
          ? { code: 1, line: `NOT SERVED ${FRESH_THREAD}: no proxied calls` }
          : served(c),
  });
  assert.equal(notServed.result.stoppedAt, "receipt");
  assert.match(notServed.result.receipt, /did not serve/);
  assert.ok(!notServed.commands.some((c) => isReceipt(c) && c.includes(FRESH_THREAD)));
});

test("fresh-reviewer is a run-log reason code", async () => {
  const { REASON_CODES } = await import("../lib/run-log.mjs");
  assert.ok(REASON_CODES.includes("fresh-reviewer"));
});

const PUBLISH = `node scripts/linear.mjs review-matrix KIT-9 --head ${SHA}`;
const isPublish = (c) => c.startsWith("node scripts/linear.mjs review-matrix ");
const MATRIX_MISSING =
  "linear: matrix-missing: the Reviewer wrote no .factory/review-matrix-KIT-9.md";

test("the Reviewer writes the matrix to its file and never to Linear (KIT-298, KIT-404)", async () => {
  const { spawns } = await run();
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:")).prompt;
  assert.match(reviewer, /to the file \.factory\/review-matrix-KIT-9\.md in this checkout/);
  assert.match(
    reviewer,
    /node scripts\/review-matrix\.mjs validate \.factory\/review-matrix-KIT-9\.md/,
  );
  assert.match(reviewer, /never call scripts\/linear\.mjs comment-update/);
  assert.match(reviewer, /write nothing to Linear/);
  // No workpad-write amber any more: amber is only for pending checks.
  assert.doesNotMatch(reviewer, /row workpad|failed workpad write/);
  assert.doesNotMatch(reviewer, /--body-file/);
});

test("the workflow moves the matrix into the workpad in the review gate's own runner, right before the gate", async () => {
  const { result, commands, spawns } = await run();
  assert.equal(result.status, "Approval");
  assert.deepEqual(commands.filter(isPublish), [PUBLISH]);
  const at = (needle) => commands.findIndex((c) => c.startsWith(needle));
  assert.ok(at("node scripts/run-log.mjs result --issue KIT-9 --step reviewer") < at(PUBLISH));
  assert.ok(at(PUBLISH) < at("node scripts/gate.mjs review"));
  const gateRunner = runners(spawns).find((s) => s.options.label === "gate:review").prompt;
  assert.match(gateRunner, /linear\.mjs review-matrix KIT-9 --head/);
  assert.match(gateRunner, /gate\.mjs review 77/);
  // An earlier round's file is removed with the move to In Review, before the Reviewer starts.
  assert.ok(
    at("rm -f .factory/review-matrix-KIT-9.md") <
      at("node scripts/run-log.mjs spawn --issue KIT-9 --step reviewer"),
  );
});

test("a Reviewer sha that is not 40 hex publishes nothing and is logged as matrix-invalid", async () => {
  const { commands } = await run({
    reviewer: () => ({
      verdict: "red",
      sha: "abc; rm -rf /",
      rows: ["spec-ac"],
      sentence: "x",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.ok(!commands.some(isPublish));
  assert.ok(
    commands.includes("node scripts/run-log.mjs reason --issue KIT-9 --code matrix-invalid"),
  );
});

test("a green review whose file is missing asks the Reviewer once for the file, then publishes and gates again", async () => {
  let publishes = 0;
  const { result, commands } = await run({
    shell: (c) => {
      if (!isPublish(c)) return undefined;
      publishes += 1;
      return publishes === 1
        ? { code: 1, line: MATRIX_MISSING }
        : { code: 0, line: "c-pad: moved" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.ok(
    commands.includes("node scripts/run-log.mjs reason --issue KIT-9 --code matrix-missing"),
  );
  assert.equal(commands.filter(isPublish).length, 2);
  assert.equal(commands.filter(isReviewGate).length, 2);
  const tells = commands.filter((c) => c.startsWith("bb thread tell thr_reviewer01 "));
  assert.equal(tells.length, 1);
  assert.match(tells[0], /\.factory\/review-matrix-KIT-9\.md/);
  assert.match(tells[0], /Never call scripts\/linear\.mjs comment-update/);
  assert.match(tells[0], new RegExp(`AUDIT-RESULT KIT-9 green ${SHA}"$`));
  assert.doesNotMatch(tells[0], /`/, "no backtick reaches the shell");
  assert.doesNotMatch(tells[0], /matrix-missing/, "the publish line stays out of the shell");
  const at = (needle) => commands.findIndex((c) => c.startsWith(needle));
  assert.ok(at("bb thread unarchive thr_reviewer01") < at("bb thread tell"));
  assert.ok(at("bb thread wait thr_reviewer01") < commands.findLastIndex(isPublish));
  assert.ok(commands.findLastIndex(isPublish) < commands.findLastIndex(isReviewGate));
  assert.equal(
    commands.filter((c) => c.includes("--step reviewer") && c.includes(" spawn ")).length,
    1,
    "the reviewer's log lines are not written twice",
  );
});

test("a green review whose matrix never reaches the workpad holds In Review, even when the gate is open", async () => {
  for (const line of [MATRIX_MISSING, "linear: matrix-invalid: row `spec-ac` is missing"]) {
    const { result, commands } = await run({
      shell: (c) => (isPublish(c) ? { code: 1, line } : undefined),
    });
    assert.equal(result.status, "In Review");
    assert.equal(result.stoppedAt, "review gate");
    assert.equal(result.verdict, "amber");
    assert.match(result.note, /did not reach the workpad/);
    assert.equal(commands.filter((c) => c.startsWith("bb thread tell")).length, 1, "asked once");
    assert.ok(!commands.some(isReceipt), "no receipt for a matrix the workpad lacks");
    assert.equal(lastState(commands), "In Review");
  }
});

test("a failed Linear write is logged as matrix-write-failed and holds In Review without asking the Reviewer", async () => {
  const { result, commands } = await run({
    shell: (c) => (isPublish(c) ? { code: 1, line: "linear: request failed: 503" } : undefined),
  });
  assert.equal(result.status, "In Review");
  assert.ok(
    commands.includes("node scripts/run-log.mjs reason --issue KIT-9 --code matrix-write-failed"),
  );
  assert.ok(!commands.some((c) => c.startsWith("bb thread tell")));
});

test("a red review whose file is missing is logged and still goes to the fix round, with no ask", async () => {
  const { commands } = await run({
    shell: (c) => (isPublish(c) ? { code: 1, line: MATRIX_MISSING } : undefined),
    reviewer: (n) =>
      n === 1
        ? {
            verdict: "red",
            sha: SHA,
            rows: ["spec-ac"],
            sentence: "AC 2 unmet",
            threadId: REVIEWER_THREAD,
          }
        : { verdict: "green", sha: SHA, sentence: "clean", threadId: REVIEWER_THREAD },
  });
  assert.ok(
    commands.includes("node scripts/run-log.mjs reason --issue KIT-9 --code matrix-missing"),
  );
  assert.ok(commands.some((c) => c.includes("--verdict red --round")));
  assert.ok(commands.some((c) => /spawn --issue KIT-9 --step engineer/.test(c)));
});

test("a shared runner that comes back short publishes again alone, then reads the gate again", async () => {
  let gates = 0;
  const { result, commands, spawns } = await run({
    shell: (c) => {
      if (!isReviewGate(c)) return undefined;
      gates += 1;
      return gates === 1 ? null : undefined;
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter(isPublish).length, 2);
  assert.ok(labels(spawns).includes("matrix:publish"));
  assert.ok(commands.findLastIndex(isPublish) < commands.findLastIndex(isReviewGate));
});

test("the ask is not made for a failed tell, and no second publish follows it", async () => {
  const { result, commands } = await run({
    shell: (c) =>
      isPublish(c)
        ? { code: 1, line: MATRIX_MISSING }
        : c.startsWith("bb thread tell")
          ? { code: 1, line: "HTTP 409" }
          : undefined,
  });
  assert.equal(commands.filter(isPublish).length, 1);
  assert.equal(result.stoppedAt, "review gate");
  assert.equal(result.status, "In Review");
});

// ---- Scenario titles in the Engineer prompt (KIT-351) -----------------------------------------------

const TITLES = [
  "A Collector edits one fact on their own jersey",
  "A Collector adds a home shirt from a photo",
  "A Collector removes a shirt from the Collection",
  "A Collector corrects a wrong season on a Kit",
  "A Collector sees the Kit's labels after saving",
  "A Collector adds a second photo to an existing Kit",
  "A Collector opens the Collection with no Kits yet",
];
const TITLES_COMMAND = /^node scripts\/scenarios\.mjs titles --issue KIT-9$/;
const titlesAnswer =
  (answer, code = 0) =>
  (command) =>
    TITLES_COMMAND.test(command)
      ? { code, line: typeof answer === "string" ? answer : JSON.stringify(answer) }
      : undefined;
const withTitles = (titles, extra = {}) => ({
  verdict: "SCENARIOS titles holdout-scenarios/holdout.md: LEAK-VERDICT",
  path: "holdout-scenarios/holdout.md",
  titles,
  ...extra,
});
const engineerPrompts = (spawns) =>
  agentSpawns(spawns)
    .filter((s) => s.options.label.startsWith("engineer:"))
    .map((s) => s.prompt);
const SECTION_TEXT = /### (Starting situation|Actions|End state)/;

test("titles reach the Engineer prompt, in every round, and Scenario text never does", async () => {
  const { result, commands, spawns } = await run({
    shell: titlesAnswer(withTitles(TITLES)),
    // A red review sends a second round to the Engineer: both prompts carry the titles.
    reviewer: (round) => ({
      verdict: round === 1 ? "red" : "green",
      sha: SHA,
      sentence: "x",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.ok(result.rounds >= 2, "the run did not reach a second Engineer round");
  const prompts = engineerPrompts(spawns);
  assert.ok(prompts.length >= 2);
  for (const prompt of prompts) {
    assert.match(prompt, /will be judged on these Scenarios \(titles only/);
    for (const [i, title] of TITLES.entries()) {
      assert.ok(prompt.includes(`${i + 1}. ${title}`), title);
    }
    assert.ok(!prompt.includes("LEAK-VERDICT"), "the CLI's verdict text entered the prompt");
  }
  for (const text of [...spawns.map((s) => s.prompt), ...commands]) {
    assert.doesNotMatch(text, SECTION_TEXT);
  }
  // The titles command holds only the issue key, and `read` is never named in a command.
  const titlesCommands = commands.filter((c) => c.includes("scenarios.mjs"));
  assert.equal(titlesCommands.length, 1);
  assert.match(titlesCommands[0], TITLES_COMMAND);
  assert.ok(!commands.some((c) => c.includes("scenarios.mjs read")));
  for (const title of TITLES) assert.ok(!commands.some((c) => c.includes(title)));
});

test("the titles command is the last of the start runner and a resume carries it too", async () => {
  const fresh = await run({ shell: titlesAnswer(withTitles(TITLES)) });
  const at = fresh.commands.findIndex((c) => TITLES_COMMAND.test(c));
  assert.ok(at > fresh.commands.findIndex((c) => c.includes('state KIT-9 "In Progress"')));
  const resumed = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(1, titlesAnswer(withTitles(TITLES))),
    engineer: () => ({
      outcome: "ready",
      sentence: "done",
      threadId: ENGINEER_THREAD,
      prNumber: 55,
    }),
  });
  assert.ok(resumed.commands.some((c) => TITLES_COMMAND.test(c)));
  assert.ok(engineerPrompts(resumed.spawns)[0].includes(`1. ${TITLES[0]}`));
});

test("a milestone with no Holdout file gives 'no Scenarios' in the prompt and the run reaches Approval", async () => {
  const empty = withTitles([], {
    verdict: "SCENARIOS titles x/y.md: no Scenarios (no Holdout file)",
  });
  const { result, spawns } = await run({ shell: titlesAnswer(empty) });
  assert.equal(result.status, "Approval");
  assert.ok(engineerPrompts(spawns)[0].includes("Milestone Scenarios: no Scenarios."));
  const none = await run({ shell: titlesAnswer({ ...empty, path: null }) });
  assert.equal(none.result.status, "Approval");
  assert.ok(engineerPrompts(none.spawns)[0].includes("Milestone Scenarios: no Scenarios."));
});

test("a title or answer that fails its pattern never enters a prompt or a command, and the run continues", async () => {
  const long = "x".repeat(121);
  const bad = {
    newline: withTitles(["fine title", "two\nlines"]),
    backtick: withTitles(["fine title", "run `id`"]),
    long: withTitles(["fine title", long]),
    control: withTitles(["fine title", "bell\u0007"]),
    separator: withTitles(["fine title", "a b"]),
    empty: withTitles(["fine title", ""]),
    padded: withTitles(["fine title", " padded "]),
    notString: withTitles(["fine title", 7]),
    notArray: withTitles("a title"),
    tooMany: withTitles(Array.from({ length: 21 }, (_, i) => `Title ${i}`)),
    badPath: withTitles(["fine title"], { path: "../etc/passwd" }),
    pathNotString: withTitles(["fine title"], { path: 5 }),
    notJson: "SCENARIOS titles x/y.md: 2 Scenarios",
    jsonNull: "null",
    malformed: "MALFORMED: x/y.md: no Scenario",
  };
  for (const [name, answer] of Object.entries(bad)) {
    const { result, commands, spawns } = await run({ shell: titlesAnswer(answer) });
    assert.equal(result.status, "Approval", name);
    const [prompt] = engineerPrompts(spawns);
    assert.ok(prompt.includes("no usable answer"), `${name}: not marked unusable`);
    assert.ok(!prompt.includes("fine title"), `${name}: part of a bad answer got through`);
    assert.ok(!commands.some((c) => c.includes("fine title") || c.includes("passwd")), name);
  }
  // A failing exit code or a runner that dropped the command is the same: no usable answer, run goes on.
  const failed = await run({ shell: titlesAnswer(withTitles(TITLES), 4) });
  assert.equal(failed.result.status, "Approval");
  assert.ok(engineerPrompts(failed.spawns)[0].includes("no usable answer"));
  const dropped = await run({ shell: (c) => (TITLES_COMMAND.test(c) ? null : undefined) });
  assert.equal(dropped.result.status, "Approval");
  assert.ok(engineerPrompts(dropped.spawns)[0].includes("no usable answer"));
});

test("a failing titles command does not stop the start, and a failing start step still does", async () => {
  const { result } = await run({ shell: titlesAnswer("boom", 4) });
  assert.equal(result.status, "Approval");
  const stop = await run({
    shell: (c) => (c.includes("start-decision") ? { code: 4, line: "nope" } : undefined),
  });
  assert.equal(stop.result.stoppedAt, "start");
});

test("five rounds by default, and from the third the Lead replans before the Engineer (ADR-0066)", async () => {
  const red = {
    verdict: "red",
    sha: SHA,
    rows: ["spec-ac"],
    sentence: "AC 2 is not met",
    threadId: REVIEWER_THREAD,
  };
  const { result, spawns, commands } = await run({ reviewer: () => red });
  assert.equal(result.status, "Approval");
  assert.equal(result.rounds, 5);
  const labels = agentSpawns(spawns).map((s) => s.options.label);
  assert.equal(labels.filter((l) => l.startsWith("engineer:")).length, 5);
  // Two replans at most in a run: before rounds 3 and 4.
  assert.equal(labels.filter((l) => l === "lead:KIT-9:replan").length, 2);
  assert.ok(labels.indexOf("lead:KIT-9:replan") < labels.indexOf("engineer:KIT-9:r3"));
  assert.equal(commands.filter((c) => c.includes("--mode replan")).length, 2);
  const replan = agentSpawns(spawns).find((s) => s.options.label === "lead:KIT-9:replan");
  assert.match(replan.prompt, /mode replan/);
  assert.match(replan.prompt, /AC 2 is not met/);
});

test("an Engineer stop the Lead can settle is settled inside the run, never Approval (ADR-0066)", async () => {
  const { result, spawns, commands } = await run({
    engineer: (n) =>
      n === 1
        ? {
            outcome: "blocked",
            sentence: "needs-human: the overview needs a file outside the write-scope",
            threadId: ENGINEER_THREAD,
          }
        : { outcome: "ready", sentence: "done", threadId: ENGINEER_THREAD, prNumber: 77 },
  });
  const labels = agentSpawns(spawns).map((s) => s.options.label);
  assert.ok(labels.includes("lead:KIT-9:replan"));
  assert.equal(labels.filter((l) => l.startsWith("engineer:")).length, 2);
  const second = agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:"))[1];
  assert.match(second.prompt, /The Lead settled your stop/);
  assert.notEqual(result.stoppedAt, "engineer");
  assert.ok(
    !commands.some((c) => c.includes("swap ready-for-agent ready-for-human")) ||
      result.status === "Approval",
  );
});

test("a Human call from the Lead goes to Approval; a blocked-by stop goes to Blocked without a replan", async () => {
  const human = await run({
    engineer: () => ({
      outcome: "blocked",
      sentence: "needs-human: AC 3 conflicts with the design lock",
      threadId: ENGINEER_THREAD,
    }),
    lead: {
      outcome: "stop",
      sentence: "AC 3 conflicts with the design lock: which wins?",
      threadId: "thr_lead0001",
    },
  });
  assert.equal(human.result.status, "Approval");
  assert.equal(human.result.stoppedAt, "lead");
  assert.match(human.result.note, /Human call/);
  const blockedBy = await run({
    engineer: () => ({
      outcome: "blocked",
      sentence: "blocked-by KIT-12: the API lands there",
      threadId: ENGINEER_THREAD,
    }),
  });
  assert.ok(!agentSpawns(blockedBy.spawns).some((s) => s.options.label === "lead:KIT-9:replan"));
  assert.equal(blockedBy.result.status, "Blocked");
});

test("the Reviewer marks each finding gating or nit and says what green looks like (ADR-0066)", async () => {
  const { spawns } = await run();
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.match(reviewer.prompt, /`gating` or `nit`/);
  assert.match(reviewer.prompt, /what green looks like/);
});

test("the Reviewer is GLM 5.3 through Optio's proxy on a catalog carrier, for every Engineer (ADR-0067)", async () => {
  const sonnet = await run();
  const r1 = agentSpawns(sonnet.spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.equal(r1.options.label, "reviewer:KIT-9:r1:openrouter");
  assert.equal(r1.options.model, "claude-haiku-5-5");
  assert.equal(r1.options.reasoningLevel, "low");
  assert.ok(
    sonnet.commands.some((c) =>
      /--step reviewer .*--provider claude-code --model z-ai\/glm-5.3/.test(c),
    ),
  );
  assert.ok(
    sonnet.commands.some(
      (c) => c === "bb optio reviewer-served --title reviewer:KIT-9:r1:openrouter",
    ),
  );
  const opus = await run({ startDecision: { engineerModel: "opus" } });
  const r2 = agentSpawns(opus.spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.equal(r2.options.model, "claude-haiku-5-5");
});

test("a green review the proxy never served ran on the carrier: it holds In Review and is not green", async () => {
  const { result, commands } = await run({
    shell: (c) =>
      c.startsWith("bb optio reviewer-served")
        ? { code: 1, line: "NOT SERVED thr_reviewer01: the proxy forwarded no call of this thread" }
        : undefined,
  });
  assert.equal(result.status, "In Review");
  assert.equal(result.stoppedAt, "receipt");
  assert.match(result.note, /did not serve/);
  assert.ok(commands.some((c) => c.includes("--code evidence-gap")));
  assert.ok(!commands.some((c) => c.includes("auto-land.mjs start")));
});

test("a Reviewer that reports the Issue thread's id is still found by its title, and the served review auto-lands (KIT-400, 2026-10-18)", async () => {
  const ISSUE_THREAD = "thr_7jfxi558dt";
  const SERVED_THREAD = "thr_2ktb6maqxm";
  const { result, commands } = await run({
    args: { issue: "KIT-9", autoLand: true },
    reviewer: () => ({ verdict: "green", sha: SHA, sentence: "clean", threadId: ISSUE_THREAD }),
    shell: (c) =>
      c === "bb optio reviewer-served --title reviewer:KIT-9:r1:openrouter"
        ? { code: 0, line: `SERVED ${SERVED_THREAD} as z-ai/glm-5.3 (41 calls)` }
        : autoLandShell()(c),
  });
  assert.equal(result.status, "Done");
  assert.equal(result.stoppedAt, "done");
  const at = (needle) => commands.findIndex((c) => c.includes(needle));
  assert.ok(at("bb optio reviewer-served --title") < at("--step reviewer --outcome green"));
  assert.match(
    commands.find((c) => c.includes("spawn") && c.includes("--step reviewer")),
    new RegExp(`--thread ${SERVED_THREAD} .*--model z-ai/glm-5.3`),
  );
  assert.match(
    commands.find((c) => c.includes("--step reviewer --outcome green")),
    new RegExp(`--usage-thread ${SERVED_THREAD}$`),
  );
  assert.match(
    commands.find((c) => c.includes("audit-receipt.mjs")),
    new RegExp(`--thread ${SERVED_THREAD} `),
  );
  assert.ok(!commands.some((c) => c.includes(ISSUE_THREAD)), "the model's id enters no command");
  assert.ok(!commands.some((c) => c.includes("reviewer-served --thread")));
});

test("no thread with the Reviewer's title, or a runner that cannot ask, stops a green review as evidence-gap", async () => {
  for (const answer of [
    { code: 1, line: "NOT FOUND: no thread titled reviewer:KIT-9:r1:openrouter" },
    null,
  ]) {
    const { result, commands } = await run({
      args: { issue: "KIT-9", autoLand: true },
      shell: (c) => (c.startsWith("bb optio reviewer-served") ? answer : autoLandShell()(c)),
    });
    assert.equal(result.status, "In Review");
    assert.equal(result.stoppedAt, "receipt");
    assert.ok(commands.some((c) => c.includes("--code evidence-gap")));
    assert.ok(!commands.some((c) => c.includes("audit-receipt.mjs")));
    assert.ok(!commands.some((c) => c.includes("auto-land.mjs start")));
  }
});

test("every agent() call names provider, model and reasoningLevel together, as bb workflows validate demands (2026-10-18)", () => {
  // The GLM reviewer shipped without reasoningLevel and validate refused the whole workflow for an hour.
  // Each call runs from its `agent(` to the next one; the options sit inside that stretch.
  const calls = SOURCE.split(/\bagent\(/)
    .slice(1)
    .filter((call) => /provider:\s*"/.test(call.split(/\bagent\(/)[0]));
  assert.ok(calls.length >= 4, `found ${calls.length} agent() calls with a provider`);
  for (const call of calls.map((c) => c.slice(0, c.search(/provider:\s*"/) + 400))) {
    assert.match(call, /model:/, call);
    assert.match(call, /reasoningLevel:/, call);
  }
});

// ---- A resume of a PR that conflicts with development (2026-10-18: KIT-404 and KIT-400) -----------
const CONFLICT_POINT =
  "CLOSED: conflicting: the PR conflicts with development; merge origin/development into it first";
const MERGE_NOTE =
  /First job of this round, before anything else: PR #55 conflicts with development/;
const onPr55 = () => ({
  outcome: "ready",
  sentence: "merged",
  threadId: ENGINEER_THREAD,
  prNumber: 55,
});

test("a resume the dispatcher could not merge opens with an Engineer merge round, never a review as it is", async () => {
  // resume-point says review as it is, but the dispatcher's merge conflicted: the head is not what lands.
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true, mergeFirst: true, autoLand: true },
    shell: resumeShell(0),
    engineer: onPr55,
  });
  assert.equal(engineers(spawns).length, 1);
  const prompt = engineers(spawns)[0].prompt;
  assert.match(prompt, MERGE_NOTE);
  assert.match(prompt, /git merge --no-edit origin\/development/);
  assert.match(prompt, /both sides' features survive/);
  assert.match(prompt, /Never rebase, force-push/);
  assert.match(prompt, /never open a second PR/);
  assert.ok(prompt.indexOf("First job of this round") < prompt.indexOf("Read `### Plan`"));
  // The only pre-review gate is the one after the merge round, and the review follows it.
  assert.equal(commands.filter(isPre).length, 1);
  assert.ok(!commands.some((c) => c.includes("--code engineer-skipped")));
  assert.ok(commands.some((c) => c.includes("--code conflict")));
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.equal(reviewer.options.label, "reviewer:KIT-9:r1:openrouter");
  assert.ok(
    commands.some((c) => c.startsWith("node scripts/auto-land.mjs start 55 --issue KIT-9")),
  );
  assert.equal(result.status, "Done");
  assert.equal(result.prNumber, 55);
});

test("a resume whose resume point says CONFLICTING merges first without the dispatcher's flag", async () => {
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) =>
      lookup(c)
        ? { code: 0, line: "55" }
        : isPoint(c)
          ? { code: 1, line: CONFLICT_POINT }
          : undefined,
    engineer: onPr55,
  });
  assert.equal(engineers(spawns).length, 1);
  assert.match(engineers(spawns)[0].prompt, MERGE_NOTE);
  assert.equal(commands.filter(isPre).length, 1);
  assert.equal(result.status, "Approval");
});

test("a pre-review gate that finds the PR CONFLICTING opens the next round with the merge, and only that round", async () => {
  let gates = 0;
  const { result, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(1, (c) => {
      if (!isPre(c)) return undefined;
      gates += 1;
      return gates === 1
        ? {
            code: 1,
            line: "CLOSED (review): checks: checks green (9 pass) but PR is CONFLICTING (DIRTY)",
          }
        : undefined;
    }),
    engineer: onPr55,
    reviewer: (round) =>
      round === 1
        ? {
            verdict: "red",
            sha: SHA,
            rows: ["spec"],
            sentence: "AC 2 unmet",
            threadId: REVIEWER_THREAD,
          }
        : undefined,
  });
  const prompts = engineers(spawns).map((s) => s.prompt);
  assert.equal(prompts.length, 3);
  assert.doesNotMatch(prompts[0], MERGE_NOTE);
  assert.match(prompts[1], MERGE_NOTE);
  assert.doesNotMatch(prompts[2], MERGE_NOTE);
  assert.equal(result.status, "Approval");
});

test("a resume gate closed on CONFLICTING also opens the first round with the merge", async () => {
  const { spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0, (c) =>
      isPre(c)
        ? { code: 1, line: "CLOSED (review): checks: checks green but PR is CONFLICTING (DIRTY)" }
        : undefined,
    ),
    engineer: onPr55,
  });
  assert.match(engineers(spawns)[0].prompt, MERGE_NOTE);
});

test("mergeFirst means nothing without a PR to merge into: a fresh run and a resume without a PR build as before", async () => {
  for (const extra of [
    { args: { issue: "KIT-9", mergeFirst: true } },
    {
      args: { issue: "KIT-9", resume: true, mergeFirst: true },
      shell: (c) => (lookup(c) ? { code: 0, line: "" } : undefined),
    },
  ]) {
    const { commands, spawns } = await run(extra);
    assert.doesNotMatch(engineers(spawns)[0].prompt, /First job of this round/);
    assert.ok(!commands.some((c) => c.includes("--code conflict")));
  }
});

test("the dispatch tick starts a conflicting resume with mergeFirst, a flag the workflow accepts", () => {
  const tick = readFileSync(
    join(fileURLToPath(new URL("../..", import.meta.url)), "staff/max/tick.js"),
    "utf8",
  );
  // 2026-10-18: the tick aborted the merge and reported, and KIT-404 and KIT-400 waited for a person.
  assert.doesNotMatch(tick, /report the conflict instead of starting the run/);
  assert.match(tick, /git merge --abort\\` and \\`git checkout -q --detach origin\/development\\`/);
  assert.match(tick, /start the run anyway with \\`"mergeFirst":true\\`/);
  // The input schema has additionalProperties: false, so bb refuses an arg the meta does not name.
  const meta = /export const meta = (\{[\s\S]*?\n\});/.exec(SOURCE)[1];
  assert.match(meta, /additionalProperties: false/);
  assert.match(meta, /mergeFirst: \{ type: "boolean" \}/);
});

/** The `end` event a `run-log.mjs end` command would append, as run-log.mjs parses its flags. */
const endEvent = (command) => {
  const event = { event: "end" };
  for (const [, key, quoted, bare] of command.matchAll(/--([a-z-]+) (?:"([^"]*)"|(\S+))/g)) {
    const name = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    event[name] = name === "round" ? Number(bare) : (quoted ?? bare);
  }
  return event;
};

test("an amber review at the end of a run writes one end line, so Max resumes it on the next tick (KIT-298)", async () => {
  const { result, commands } = await run({
    reviewer: () => ({
      verdict: "amber",
      sha: SHA,
      sentence: "pending",
      threadId: REVIEWER_THREAD,
    }),
  });
  assert.equal(result.status, "In Review");
  const ends = commands.filter(isEnd);
  assert.equal(ends.length, 1);
  assert.equal(commands.at(-1), ends[0]);
  assert.match(
    ends[0],
    /^node scripts\/run-log\.mjs end --issue KIT-9 --status "In Review" --stopped-at "reviewer" --reason ci-pending --verdict amber --round \d+$/,
  );
  assert.deepEqual(validateEvent(endEvent(ends[0])), []);
});

test("every return after start writes exactly one valid end line, last, with status and stop of the result", async () => {
  const red = {
    verdict: "red",
    sha: SHA,
    rows: ["spec"],
    sentence: "x",
    threadId: REVIEWER_THREAD,
  };
  const runs = [
    await run(),
    await run({ args: { issue: "KIT-9", maxRounds: 1 }, reviewer: () => red }),
    await run({ args: { issue: "KIT-9", autoLand: true }, shell: autoLandShell() }),
    await run({ engineer: () => new Error("no result") }),
    await run({
      lead: { outcome: "plan-approval", sentence: "ask", threadId: "thr_lead0001" },
      startDecision: { plan: true },
    }),
  ];
  for (const { result, commands } of runs) {
    const ends = commands.filter(isEnd);
    assert.equal(ends.length, 1, result.stoppedAt);
    assert.equal(commands.at(-1), ends[0]);
    const event = endEvent(ends[0]);
    assert.deepEqual(validateEvent(event), [], ends[0]);
    assert.equal(event.status, result.status);
    assert.equal(event.stoppedAt, result.stoppedAt);
  }
  assert.equal(endEvent(runs[1].commands.at(-1)).reason, "needs-human");
});

test("a stop before start is logged writes no end line: no run began, and another may be live", async () => {
  const harness = await run({
    shell: (c) => (isHarnessDiff(c) ? { code: 1, line: "" } : undefined),
  });
  const session = await run({
    shell: (c) => (c.includes("session-check") ? { code: 1, line: "CLOSED: run live" } : undefined),
  });
  const startFailed = await run({
    shell: (c) => (c.includes("run-log.mjs start") ? { code: 2, line: "bad" } : undefined),
  });
  for (const { commands } of [harness, session, startFailed]) assert.ok(!commands.some(isEnd));
});

test("every stop point and status the workflow returns after start is in the run log's end vocabulary", () => {
  const calls = [...SOURCE.matchAll(/\bstopped\("([^"]+)", (?:"([^"]+)"|\w+)/g)];
  assert.ok(calls.length > 20);
  // harness and session-check return before start is logged and write no end line.
  for (const [, stoppedAt, status] of calls.filter(
    (c) => !["harness", "session-check"].includes(c[1]),
  )) {
    assert.ok(END_STOPS.includes(stoppedAt), stoppedAt);
    if (status !== undefined) assert.ok(END_STATUSES.includes(status), status);
  }
});

// ---- Review mode: CI is the evidence, and a development merge gets a delta review (2026-10-19) ----

const isReviewMode = (c) => c.startsWith("node scripts/review-mode.mjs ");
const GREEN_BEFORE = "b".repeat(40);

test("the Reviewer reads the required checks on the head and never re-runs the suites CI ran", async () => {
  const { commands, spawns } = await run();
  const prompt = reviewers(spawns)[0].prompt;
  assert.match(prompt, /read the required checks on the head with gh pr checks 77/);
  assert.match(
    prompt,
    /Never re-run a full test suite, typecheck, lint or build that a required check already ran green on this head/,
  );
  assert.match(prompt, /one targeted test file at most, with its output trimmed \(\| tail -30\)/);
  // No delta was offered, so this is the full review of the merge-base diff.
  assert.match(prompt, /run it on the PR's merge-base diff/);
  assert.doesNotMatch(prompt, /Delta review/);
  // The mode is asked for once, with the move to In Review, before the Reviewer starts.
  assert.deepEqual(commands.filter(isReviewMode), ["node scripts/review-mode.mjs KIT-9"]);
  const mode = commands.findIndex(isReviewMode);
  assert.deepEqual(commands.slice(mode - 3, mode), [
    'node scripts/linear.mjs state KIT-9 "In Review"',
    "rm -f .factory/review-matrix-KIT-9.md",
    "node scripts/reviewer-route.mjs",
  ]);
  assert.ok(mode < commands.findIndex((c) => c.includes("--step reviewer")));
});

test("a head that moved only by a development merge gets a delta review since the green head", async () => {
  const { result, spawns } = await run({
    shell: (c) =>
      isReviewMode(c) ? { code: 0, line: `REVIEW-MODE delta ${GREEN_BEFORE}` } : undefined,
  });
  assert.equal(result.status, "Approval");
  const prompt = reviewers(spawns)[0].prompt;
  assert.match(prompt, /run its development-merge delta review/);
  assert.doesNotMatch(prompt, /run it on the PR's merge-base diff/);
  assert.ok(
    prompt.includes(
      `git diff ${GREEN_BEFORE}..HEAD restricted to the globs on the PR body's write-scope: line`,
    ),
  );
  assert.ok(prompt.includes(`node scripts/review-mode.mjs KIT-9 --green ${GREEN_BEFORE}`));
  assert.match(prompt, /git show --cc <merge>/);
  assert.ok(prompt.includes(`evidence \`unchanged since ${GREEN_BEFORE.slice(0, 12)}\``));
  assert.match(prompt, /re-read mergeable and required-checks on the head/);
  // CI stays the evidence in a delta review too.
  assert.match(prompt, /Never re-run a full test suite/);
});

test("any answer but a well-formed delta line is a full review", async () => {
  const answers = [
    {
      code: 0,
      line: "REVIEW-MODE full abc123456789 is a commit of the branch, not a merge of origin/development",
    },
    { code: 0, line: "REVIEW-MODE delta abc1234" },
    { code: 0, line: `REVIEW-MODE delta ${GREEN_BEFORE}; rm -rf .` },
    { code: 4, line: `REVIEW-MODE delta ${GREEN_BEFORE}` },
    { code: 4, line: "UNKNOWN: linear down" },
    { code: 0, line: "KIT-EXIT:0" },
  ];
  for (const answer of answers) {
    const { result, spawns } = await run({ shell: (c) => (isReviewMode(c) ? answer : undefined) });
    assert.equal(result.status, "Approval", answer.line);
    const prompt = reviewers(spawns)[0].prompt;
    assert.match(prompt, /run it on the PR's merge-base diff/, answer.line);
    assert.doesNotMatch(prompt, /Delta review/, answer.line);
  }
});

test("a green review whose gate closed hands its head to the next round's review-mode as --green", async () => {
  let gates = 0;
  const { commands } = await run({
    shell: (c) => {
      if (!isReviewGate(c)) return undefined;
      gates += 1;
      return gates === 1 ? { code: 1, line: FLOW_RED_LINE } : { code: 0, line: "OPEN (review)" };
    },
  });
  assert.deepEqual(commands.filter(isReviewMode), [
    "node scripts/review-mode.mjs KIT-9",
    `node scripts/review-mode.mjs KIT-9 --green ${SHA}`,
  ]);
});

test("a red review hands no --green to the next round", async () => {
  const { commands } = await run({
    reviewer: (n) =>
      n === 1
        ? {
            verdict: "red",
            sha: SHA,
            rows: ["spec-ac"],
            sentence: "gap",
            threadId: REVIEWER_THREAD,
          }
        : undefined,
  });
  const modes = commands.filter(isReviewMode);
  assert.equal(modes.length, 2);
  assert.ok(modes.every((c) => c === "node scripts/review-mode.mjs KIT-9"));
});

/** A throwaway repo: `development` and `feature` share a base; `feature` changes the issue's file. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "review-mode-"));
  const raw = (args) =>
    execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  const git = (args) => {
    try {
      return raw(args);
    } catch {
      return null;
    }
  };
  const write = (file, text) => writeFileSync(join(dir, file), text);
  const commit = (message) => {
    raw(["add", "-A"]);
    raw(["commit", "-q", "-m", message]);
    return raw(["rev-parse", "HEAD"]);
  };
  raw(["init", "-q", "-b", "development"]);
  raw(["config", "user.email", "test@example.com"]);
  raw(["config", "user.name", "test"]);
  raw(["config", "commit.gpgsign", "false"]);
  write("issue.txt", "one\ntwo\nthree\nfour\nfive\nsix\nseven\n");
  write("other.txt", "lane\n");
  commit("base");
  raw(["checkout", "-q", "-b", "feature"]);
  write("issue.txt", "ONE\ntwo\nthree\nfour\nfive\nsix\nseven\n");
  const green = commit("the issue's change");
  const onLane = (file, text) => {
    raw(["checkout", "-q", "development"]);
    write(file, text);
    commit(`lane changes ${file}`);
    raw(["checkout", "-q", "feature"]);
  };
  const rows = (at = green, status = "checked") =>
    LOCK_ROWS.map((lock) => ({ id: lock.id, status, evidence: "ok", at }));
  const mode = (opts = {}) => reviewMode({ rows: rows(), lane: "development", git, ...opts });
  const done = () => rmSync(dir, { recursive: true, force: true });
  return { raw, write, commit, green, onLane, rows, mode, done };
}

test("review-mode: a merge of development that touched other files is a delta since the green head", () => {
  const r = repo();
  try {
    r.onLane("other.txt", "lane moved\n");
    r.raw(["merge", "-q", "--no-edit", "development"]);
    const merge = r.raw(["rev-parse", "HEAD"]);
    assert.deepEqual(r.mode({ green: r.green }), {
      mode: "delta",
      since: r.green,
      head: merge,
      merges: [merge],
      overlap: [],
    });
    // The matrix alone names the green head when the run has none, short sha included.
    assert.equal(r.mode({ rows: r.rows(r.green.slice(0, 9)) }).mode, "delta");
  } finally {
    r.done();
  }
});

test("review-mode: a file both sides changed and git combined is listed for the Reviewer", () => {
  const r = repo();
  try {
    r.onLane("issue.txt", "one\ntwo\nthree\nfour\nfive\nsix\nSEVEN\n");
    r.raw(["merge", "-q", "--no-edit", "development"]);
    const out = r.mode();
    assert.equal(out.mode, "delta");
    assert.deepEqual(out.overlap, ["issue.txt"]);
  } finally {
    r.done();
  }
});

test("review-mode: a commit of the branch since the green head is a full review", () => {
  const r = repo();
  try {
    r.onLane("other.txt", "lane moved\n");
    r.raw(["merge", "-q", "--no-edit", "development"]);
    r.write("issue.txt", "ONE\nTWO\nthree\nfour\nfive\nsix\nseven\n");
    r.commit("more of the issue");
    const out = r.mode();
    assert.equal(out.mode, "full");
    assert.match(out.why, /is a commit of the branch, not a merge of development/);
  } finally {
    r.done();
  }
});

test("review-mode: a merge that took one side of a shared file whole is a full review", () => {
  const r = repo();
  try {
    r.onLane("issue.txt", "one\ntwo\nthree\nfour\nfive\nsix\nSEVEN\n");
    r.raw(["merge", "-q", "--no-edit", "-s", "ours", "development"]);
    const out = r.mode();
    assert.equal(out.mode, "full");
    assert.match(out.why, /took one side of issue\.txt whole/);
  } finally {
    r.done();
  }
});

test("review-mode: a matrix that is not green at one head, or a rewritten branch, is a full review", () => {
  const r = repo();
  try {
    r.onLane("other.txt", "lane moved\n");
    r.raw(["merge", "-q", "--no-edit", "development"]);
    assert.match(r.mode({ rows: [] }).why, /no review matrix/);
    assert.match(r.mode({ rows: r.rows(r.green, "finding") }).why, /holds a finding/);
    assert.match(r.mode({ rows: r.rows().slice(1) }).why, /incomplete/);
    const mixed = r.rows();
    mixed[0] = { ...mixed[0], at: "c".repeat(40) };
    assert.match(r.mode({ rows: mixed }).why, /not all read at one head/);
    assert.match(r.mode({ green: "d".repeat(40) }).why, /not at the green head/);
    // The branch was rewritten: the green head is no ancestor of HEAD.
    r.raw(["reset", "-q", "--hard", "development"]);
    r.write("issue.txt", "redone\n");
    r.commit("rewritten");
    assert.match(r.mode().why, /does not descend from/);
  } finally {
    r.done();
  }
});

// ---- Reviewer route and the Claude fallback (ADR-0067, consequence of 2026-10-19) ----------------

const ROUTE = "node scripts/reviewer-route.mjs";
const CLAUDE_ROUTE = { code: 0, line: "REVIEWER claude low-credit: 0.00 USD left, below 1 USD" };
const SERVED_ONE = { code: 0, line: `SERVED ${REVIEWER_THREAD} as z-ai/glm-5.3 (1 calls)` };
const SERVED_MANY = { code: 0, line: `SERVED ${REVIEWER_THREAD} as z-ai/glm-5.3 (40 calls)` };
const isServed = (c) => c.startsWith("bb optio reviewer-served");
const reviewerSpawns = (spawns) =>
  agentSpawns(spawns).filter((s) => s.options.label.startsWith("reviewer:"));
/** The first (GLM) Reviewer dies without a result, as on the 402 of KIT-408; later ones are green. */
const glmDies = (n) =>
  n === 1 ? new Error("API Error: 402 This request requires more credits") : undefined;

test("the reviewer route rides with the move to In Review and costs no runner of its own", async () => {
  const { commands, spawns } = await run();
  assert.equal(commands.filter((c) => c === ROUTE).length, 1);
  const inReview = runners(spawns).find((s) => s.options.label === "linear:In Review");
  assert.match(inReview.prompt, /node scripts\/reviewer-route\.mjs/);
  assert.ok(!labels(spawns).includes("reviewer-fallback"));
});

test("route claude: a Sonnet Engineer's Reviewer runs on Opus, unproxied, and no served check is asked", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) => (c === ROUTE ? CLAUDE_ROUTE : undefined),
  });
  assert.equal(result.status, "Approval");
  const [reviewer] = reviewerSpawns(spawns);
  assert.equal(reviewer.options.model, "claude-opus-5-5");
  assert.equal(reviewer.options.label, "reviewer:KIT-9:r1");
  assert.ok(!commands.some(isServed));
  assert.match(
    commands.find((c) => c.includes("spawn") && c.includes("--step reviewer")),
    new RegExp(`--thread ${REVIEWER_THREAD} .*--model claude-opus-5-5`),
  );
  assert.ok(!commands.some((c) => c.includes("--code reviewer-fallback")));
});

test("route claude: an Opus Engineer's Reviewer runs on Sonnet, never the Engineer's model", async () => {
  const { result, commands, spawns } = await run({
    startDecision: { engineerModel: "opus" },
    shell: (c) => (c === ROUTE ? CLAUDE_ROUTE : undefined),
  });
  assert.equal(result.status, "Approval");
  const [reviewer] = reviewerSpawns(spawns);
  assert.equal(reviewer.options.model, "claude-sonnet-5-5");
  assert.match(
    commands.find((c) => c.includes("spawn") && c.includes("--step reviewer")),
    /--model claude-sonnet-5-5/,
  );
});

test("no path picks Fable for the Reviewer: route, fallback, fresh Reviewer and Opus rounds (Nicklas, 2026-10-19)", async () => {
  // No alias and no model id for it: spawn() cannot start a Fable thread at all.
  assert.doesNotMatch(SOURCE, /"fable"|claude-fable/);
  const claudeEverywhere = (c) =>
    c === ROUTE ? CLAUDE_ROUTE : isServed(c) ? SERVED_ONE : undefined;
  const red = (n) =>
    n <= 2
      ? { verdict: "red", sha: SHA, sentence: "bad", threadId: REVIEWER_THREAD, rows: [] }
      : undefined;
  const runs = [
    await run({ shell: claudeEverywhere }),
    await run({ shell: claudeEverywhere, startDecision: { engineerModel: "opus" } }),
    // Two red rounds, so round 3 runs the Engineer on Opus.
    await run({ shell: claudeEverywhere, reviewer: red }),
    // The GLM Reviewer dies and the Claude fallback takes over, for both Engineer models.
    await run({ reviewer: glmDies, shell: (c) => (isServed(c) ? SERVED_ONE : undefined) }),
    await run({
      reviewer: glmDies,
      startDecision: { engineerModel: "opus" },
      shell: (c) => (isServed(c) ? SERVED_ONE : undefined),
    }),
  ];
  for (const { spawns, commands } of runs) {
    const models = reviewerSpawns(spawns).map((s) => s.options.model);
    assert.ok(models.length > 0);
    for (const model of models) assert.doesNotMatch(model, /fable/);
    assert.ok(!commands.some((c) => /fable/.test(c)));
  }
  // Round 3's Opus Engineer gets a Sonnet Reviewer.
  assert.deepEqual(
    reviewerSpawns(runs[2].spawns)
      .map((s) => s.options.model)
      .slice(0, 3),
    ["claude-opus-5-5", "claude-opus-5-5", "claude-sonnet-5-5"],
  );
  assert.equal(reviewerSpawns(runs[4].spawns)[1].options.model, "claude-sonnet-5-5");
});

test("a GLM Reviewer that died on its first calls is followed by one Claude Reviewer on the same head (reviewer-fallback)", async () => {
  for (const served of [SERVED_ONE, { code: 1, line: `NOT SERVED ${REVIEWER_THREAD}: no call` }]) {
    const { result, commands, spawns } = await run({
      reviewer: glmDies,
      shell: (c) => (isServed(c) ? served : undefined),
    });
    assert.equal(result.status, "Approval");
    const [glm, claude] = reviewerSpawns(spawns);
    assert.equal(reviewerSpawns(spawns).length, 2);
    assert.equal(glm.options.label, "reviewer:KIT-9:r1:openrouter");
    assert.equal(claude.options.label, "reviewer:KIT-9:r1:claude");
    assert.equal(claude.options.model, "claude-opus-5-5");
    // Served and route are asked in one runner, and only for the GLM thread.
    const fallback = runners(spawns).find((s) => s.options.label === "reviewer-fallback");
    assert.match(fallback.prompt, /reviewer-served --title reviewer:KIT-9:r1:openrouter/);
    assert.match(fallback.prompt, /reviewer-route\.mjs/);
    assert.ok(!commands.some((c) => isServed(c) && c.includes(":claude")));
    const at = (needle) => commands.findIndex((c) => c.includes(needle));
    assert.ok(at("--code reviewer-fallback") >= 0);
    assert.ok(at("--code reviewer-fallback") < at("--step reviewer --outcome green"));
    assert.match(
      commands.find((c) => c.includes("spawn") && c.includes("--step reviewer")),
      new RegExp(`--thread ${REVIEWER_THREAD} .*--model claude-opus-5-5`),
    );
    assert.ok(commands.some((c) => c.includes("audit-receipt.mjs post 77")));
  }
});

test("a GLM Reviewer with no result that the proxy served many calls stops as before, unless the route now says claude", async () => {
  const stopped = await run({
    reviewer: glmDies,
    shell: (c) => (isServed(c) ? SERVED_MANY : undefined),
  });
  assert.equal(stopped.result.stoppedAt, "reviewer");
  assert.equal(reviewerSpawns(stopped.spawns).length, 1);
  assert.ok(!stopped.commands.some((c) => c.includes("--code reviewer-fallback")));
  assert.ok(stopped.commands.some((c) => c.includes("--code no-result-line")));

  // The route said glm before the Reviewer started and says claude by the time it died.
  let routes = 0;
  const switched = await run({
    reviewer: glmDies,
    shell: (c) => {
      if (isServed(c)) return SERVED_MANY;
      if (c === ROUTE) {
        routes += 1;
        return routes === 1 ? { code: 0, line: "REVIEWER glm" } : CLAUDE_ROUTE;
      }
      return undefined;
    },
  });
  assert.equal(switched.result.status, "Approval");
  assert.equal(reviewerSpawns(switched.spawns)[1].options.model, "claude-opus-5-5");
  assert.ok(switched.commands.some((c) => c.includes("--code reviewer-fallback")));
});

test("a Claude fallback that also returns nothing stops at the reviewer with both reasons logged", async () => {
  const { result, commands, spawns } = await run({
    reviewer: () => new Error("no result"),
    shell: (c) => (isServed(c) ? SERVED_ONE : undefined),
  });
  assert.equal(result.stoppedAt, "reviewer");
  assert.equal(reviewerSpawns(spawns).length, 2);
  assert.match(result.note, /the Claude fallback too/);
  assert.ok(commands.some((c) => c.includes("--code reviewer-fallback")));
  assert.ok(commands.some((c) => c.includes("--code no-result-line")));
});

test("reviewer-fallback is a run-log reason code", async () => {
  const { REASON_CODES } = await import("../lib/run-log.mjs");
  assert.ok(REASON_CODES.includes("reviewer-fallback"));
});

// ---- Infrastructure failures (2026-10-19: OpenRouter's 402 used up four issues' daily starts) ------

const endOf = (commands) => endEvent(commands.filter(isEnd).at(-1));

test("a resumed review whose GLM Reviewer and Claude fallback both die ends infra-failure with cause reviewer-fallback-failed", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    reviewer: () => new Error("API Error: 402 This request requires more credits"),
    shell: resumeShell(0, (c) => (isServed(c) ? SERVED_ONE : undefined)),
  });
  assert.equal(result.stoppedAt, "reviewer");
  const end = endOf(commands);
  assert.equal(end.reason, "infra-failure");
  assert.equal(end.cause, "reviewer-fallback-failed");
  assert.deepEqual(validateEvent(end), []);
});

test("a stop after an Engineer round is never infra-failure: the round is work product", async () => {
  const fallback = await run({
    reviewer: () => new Error("no result"),
    shell: (c) => (isServed(c) ? SERVED_ONE : undefined),
  });
  assert.equal(fallback.result.stoppedAt, "reviewer");
  assert.equal(endOf(fallback.commands).reason, "unspecified");
  assert.equal(endOf(fallback.commands).cause, undefined);

  const runner = await run({ shell: (c) => (isPre(c) ? null : undefined) });
  assert.equal(endOf(runner.commands).reason, "runner-no-result");
  assert.deepEqual(validateEvent(endOf(runner.commands)), []);
});

test("a GLM Reviewer that worked (many calls) and gave no result is no infra-failure, even with no work product", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    reviewer: () => new Error("no result"),
    shell: resumeShell(0, (c) => (isServed(c) ? SERVED_MANY : undefined)),
  });
  assert.equal(result.stoppedAt, "reviewer");
  assert.notEqual(endOf(commands).reason, "infra-failure");
});

test("a runner that returns nothing before any work product ends infra-failure with cause runner-no-result", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0, (c) => (isPre(c) ? null : undefined)),
  });
  assert.match(result.note, /^runner-no-result/);
  const end = endOf(commands);
  assert.equal(end.reason, "infra-failure");
  assert.equal(end.cause, "runner-no-result");
  assert.deepEqual(validateEvent(end), []);
});

test("a review verdict is work product: a runner failure after it is not infra-failure", async () => {
  const { commands } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0, (c) => (c.includes("gate.mjs review") ? null : undefined)),
  });
  assert.notEqual(endOf(commands).reason, "infra-failure");
});
