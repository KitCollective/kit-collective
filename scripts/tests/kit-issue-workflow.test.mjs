import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The kit-issue workflow runs in bb's QuickJS sandbox, which this repo cannot start. These tests
 * run the same source in a plain async function with `agent`, `phase` and `args` replaced by a
 * scripted fake: the fake plays the runner workers (it answers the numbered commands) and the
 * Lead, Engineer and Reviewer, and records every command and every spawn option.
 */
const SOURCE = readFileSync(
  join(fileURLToPath(new URL("../..", import.meta.url)), ".bb/workflows/kit-issue.js"),
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
 * @param {(command: string) => { code: number, line: string } | undefined} [opts.shell]
 * @param {(round: number) => any} [opts.engineer] returns the engineer result (or null / throws)
 * @param {(round: number) => any} [opts.reviewer]
 * @param {any} [opts.lead]
 */
async function run({ args = { issue: "KIT-9" }, shell, engineer, reviewer, lead } = {}) {
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
  };
  const fakeAgent = async (prompt, options = {}) => {
    spawns.push({ prompt, options });
    if (options.schema?.required?.includes("results")) {
      const lines = prompt
        .split("\n")
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => l.replace(/^\d+\. /, ""));
      const results = [];
      for (const command of lines) {
        commands.push(command);
        const custom = shell?.(command);
        const result =
          custom ??
          (command.includes("start-decision.mjs")
            ? { code: 0, line: JSON.stringify(decision) }
            : { code: 0, line: "OPEN: fine" });
        results.push(result);
        if (result.code !== 0 && !prompt.includes("Run every command")) break;
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
  assert.match(
    spawnReviewer,
    new RegExp(`--thread ${REVIEWER_THREAD} .*--model ${reviewer.options.model}`),
  );
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
  assert.equal(commands.length, 1);
  assert.equal(spawns.length, 1);
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
  const { result, commands, spawns } = await run({ reviewer: () => red });
  // Out of rounds a person acts: Approval + ready-for-human, and the status says what Linear shows.
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "review gate");
  assert.equal(result.rounds, 2);
  assert.ok(commands.some((c) => c.includes("label KIT-9 swap ready-for-agent ready-for-human")));
  assert.equal(lastState(commands), "Approval");
  assert.equal(commands.filter((c) => c.includes("--verdict red")).length, 2);
  assert.ok(commands.some((c) => c.includes('state KIT-9 "In Progress"')));
  assert.ok(
    agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:")).length === 2,
  );
  const second = agentSpawns(spawns).filter((s) => s.options.label.startsWith("engineer:"))[1];
  assert.match(second.prompt, /AC 2 is not met/);
  assert.ok(!commands.some((c) => c.includes("audit-receipt")));
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
    shell: (c) =>
      c.includes("gate.mjs pre-review")
        ? ++n < 3
          ? { code: 3, line: "WAITING: checks pending" }
          : { code: 0, line: "OPEN" }
        : undefined,
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter((c) => c.includes("gate.mjs pre-review")).length, 3);
  assert.ok(!commands.some((c) => c.includes("review-matrix")));
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
  assert.ok(!commands.some((c) => c.includes("audit-receipt") || c.includes("--verdict")));
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
  assert.ok(!badSha.commands.some((c) => c.includes("--verdict red")));
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
    await run({ args: { issue: "KIT-9", resume: true }, engineer: () => new Error("x") }),
  ];
  for (const { result, commands } of scenarios) {
    assert.equal(lastState(commands), result.status, `${result.stoppedAt}: ${result.note}`);
  }
});
