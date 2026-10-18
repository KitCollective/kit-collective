import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
  assert.equal(commands.filter((c) => c.includes("--verdict red")).length, 2);
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
  assert.equal(commands.at(-1), waitingCmds(commands)[0]);
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

test("a Device flows run with no verdict ends needs-human in Approval, with no fix round and no Reviewer", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) => (isPre(c) ? { code: 1, line: NO_VERDICT_LINE } : undefined),
  });
  assert.equal(result.status, "Approval");
  assert.equal(result.stoppedAt, "pre-review gate");
  assert.equal(result.note, "needs-human: run device-run.sh on the Mac on abc1234");
  assert.ok(commands.some((c) => c.includes("swap ready-for-agent ready-for-human")));
  assert.ok(commands.some((c) => c.includes("--code device-flows-no-verdict")));
  assert.equal(lastState(commands), "Approval");
  assert.ok(!commands.some((c) => c.includes("--code gate-closed")));
  assert.equal(commands.filter(isPre).length, 1);
  const agents = agentSpawns(spawns);
  assert.equal(agents.filter((s) => s.options.label.startsWith("engineer:")).length, 1);
  assert.equal(agents.filter((s) => s.options.label.startsWith("reviewer:")).length, 0);
});

test("a Device flows status still pending after five slices ends needs-human, not ci-pending", async () => {
  const pending = await run({
    shell: (c) => (isPre(c) ? { code: 3, line: PENDING_LINE("") } : undefined),
  });
  assert.equal(pending.commands.filter(isPre).length, 5);
  assert.equal(pending.result.status, "Approval");
  assert.equal(pending.result.note, "needs-human: run device-run.sh on the Mac on abc1234");
  assert.equal(lastState(pending.commands), "Approval");
  assert.ok(!pending.commands.some((c) => c.includes("--code ci-pending")));
  assert.equal(
    agentSpawns(pending.spawns).filter((s) => s.options.label.startsWith("reviewer:")).length,
    0,
  );

  // Any other pending check keeps the old ending: In Progress and ci-pending.
  const plain = await run({
    shell: (c) => (isPre(c) ? { code: 3, line: "WAITING: checks pending" } : undefined),
  });
  assert.equal(plain.result.status, "In Progress");
  assert.ok(plain.commands.some((c) => c.includes("--code ci-pending")));
  assert.ok(!plain.commands.some((c) => c.includes("--code device-flows-no-verdict")));
});

test("a red Device flows flow (or any closed gate without the no-verdict tag) still gets a fix round", async () => {
  let n = 0;
  const { result, commands } = await run({
    shell: (c) => {
      if (!isPre(c)) return undefined;
      n += 1;
      return n === 1
        ? {
            code: 1,
            line: "CLOSED (review): checks: RED (2 pass, 1 fail, 0 pending, 0 skipped): Device flows",
          }
        : { code: 0, line: "OPEN" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.ok(commands.some((c) => c.includes("--code gate-closed")));
  assert.ok(!commands.some((c) => c.includes("--code device-flows-no-verdict")));
});

test("a Device flows error that is asked for again and then turns green ends In Review, not Approval", async () => {
  let n = 0;
  const { result } = await run({
    shell: (c) => {
      if (!isPre(c)) return undefined;
      n += 1;
      if (n === 1)
        return {
          code: 3,
          line: "WAITING (review): checks: PENDING: Device flows stopped before the flow finished on abc1234; asked for again",
        };
      if (n === 2)
        return {
          code: 3,
          line: "WAITING (review): checks: PENDING (2 pass, 0 fail, 1 pending, 0 skipped): Device flows",
        };
      return { code: 0, line: "OPEN (review): clean" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.ok(result.stoppedAt !== "pre-review gate");
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
  'node scripts/linear.mjs waiting KIT-9 --stage "pre-review gate" --ask "needs-human: run device-run.sh on the Mac on abc1234"';

test("a gate-detected needs-human stop fills ### Waiting with linear.mjs waiting, once, after the move, with no agent", async () => {
  const noVerdict = await run({
    shell: (c) => (isPre(c) ? { code: 1, line: NO_VERDICT_LINE } : undefined),
  });
  assert.deepEqual(waitingCmds(noVerdict.commands), [WAITING_DEVICE_FLOWS]);
  assert.equal(noVerdict.commands.at(-1), WAITING_DEVICE_FLOWS);
  assert.equal(lastState(noVerdict.commands), "Approval");
  assert.ok(
    noVerdict.commands.findIndex((c) => c.includes('state KIT-9 "Approval"')) <
      noVerdict.commands.indexOf(WAITING_DEVICE_FLOWS),
  );
  assert.ok(!agentSpawns(noVerdict.spawns).some((s) => s.options.label.startsWith("waiting:")));

  // A write that fails leaves the stop standing: the state was set before it.
  const failing = await run({
    shell: (c) =>
      isPre(c)
        ? { code: 1, line: NO_VERDICT_LINE }
        : c.includes("linear.mjs waiting")
          ? { code: 1, line: "linear: the workpad of KIT-9 has no ### Waiting section" }
          : undefined,
  });
  assert.equal(failing.result.status, "Approval");
  assert.equal(lastState(failing.commands), "Approval");

  // The exhausted-pending ending writes it too; an ordinary ci-pending stop does not.
  const pending = await run({
    shell: (c) => (isPre(c) ? { code: 3, line: PENDING_LINE("") } : undefined),
  });
  assert.deepEqual(waitingCmds(pending.commands), [WAITING_DEVICE_FLOWS]);
  const plain = await run({
    shell: (c) => (isPre(c) ? { code: 3, line: "WAITING: checks pending" } : undefined),
  });
  assert.equal(waitingCmds(plain.commands).length, 0);
});

test("a resume whose gate has no Device flows verdict fills ### Waiting the same way", async () => {
  const { result, commands } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: resumeShell(0, (c) => (isPre(c) ? { code: 1, line: NO_VERDICT_LINE } : undefined)),
  });
  assert.equal(result.status, "Approval");
  assert.deepEqual(waitingCmds(commands), [WAITING_DEVICE_FLOWS]);
});

test("an Engineer without a simulator returns blocked needs-human for the Mac run: Approval, no Reviewer", async () => {
  const { result, commands, spawns } = await run({
    engineer: () => ({
      outcome: "blocked",
      sentence: "needs-human: run device-run.sh on the Mac on abc1234",
      threadId: ENGINEER_THREAD,
      prNumber: 77,
    }),
  });
  assert.equal(result.status, "Approval");
  assert.ok(commands.some((c) => c.includes("swap ready-for-agent ready-for-human")));
  assert.equal(lastState(commands), "Approval");
  assert.equal(
    agentSpawns(spawns).filter((s) => s.options.label.startsWith("reviewer:")).length,
    0,
  );
  assert.ok(!commands.some(isPre), "no gate is run after the Engineer's own stop");
  const engineer = agentSpawns(spawns).find((s) => s.options.label.startsWith("engineer:")).prompt;
  assert.match(engineer, /needs-human: run device-run\.sh on the Mac on <sha>/);
  assert.match(engineer, /request-device-flows\.mjs <pr> --issue KIT-9/);
  assert.match(engineer, /### Waiting/);
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
  for (const command of commands) {
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
    assert.match(
      spawn.options.model,
      spawn.options.label.startsWith("reviewer:") ? /^(deepseek|z-ai)\// : /^claude-/,
    );
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

test("a green run spends eight runners: the log lines ride with the gates", async () => {
  const { result, commands, spawns } = await run();
  assert.equal(result.status, "Approval");
  assert.deepEqual(labels(spawns), [
    "session-check",
    "start",
    "gate:pre-review",
    "head-changed",
    "linear:In Review",
    "gate:review",
    "receipt:dry-run",
    "linear:Approval",
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
    "gate:review",
    "receipt:dry-run",
    "linear:Approval",
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
  "REFUSED (receipt): thread thr_reviewer01 did not end with an exact AUDIT-RESULT line (nothing else on the line or after it)";

test("a receipt refused for a missing result line asks the Reviewer once, then tries again (KIT-283, KIT-286)", async () => {
  let receipts = 0;
  const { result, commands } = await run({
    shell: (c) => {
      if (!isReceipt(c)) return undefined;
      receipts += 1;
      return receipts === 1
        ? { code: 1, line: NO_LINE }
        : { code: 0, line: "WOULD POST (receipt): kc/audit success" };
    },
  });
  assert.equal(result.status, "Approval");
  assert.equal(commands.filter(isReceipt).length, 2);
  const tell = commands.find((c) => c.startsWith("bb thread tell thr_reviewer01 "));
  assert.ok(tell, "the Reviewer is asked for its line");
  assert.match(tell, new RegExp(`AUDIT-RESULT KIT-9 green ${SHA}"$`));
  const at = (needle) => commands.findIndex((c) => c.startsWith(needle));
  assert.ok(at("bb thread unarchive thr_reviewer01") < at("bb thread tell"));
  assert.ok(at("bb thread tell") < at("bb thread wait thr_reviewer01"));
  assert.ok(commands.some((c) => c.includes("--code no-result-line")));
});

test("the Reviewer is asked only once, and other refusals are not retried", async () => {
  const once = await run({ shell: (c) => (isReceipt(c) ? { code: 1, line: NO_LINE } : undefined) });
  assert.equal(once.result.stoppedAt, "receipt");
  assert.equal(once.commands.filter(isReceipt).length, 2);
  assert.equal(once.commands.filter((c) => c.startsWith("bb thread tell")).length, 1);

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
  assert.ok(!other.commands.some((c) => c.startsWith("bb thread tell")));

  const tellFailed = await run({
    shell: (c) =>
      isReceipt(c)
        ? { code: 1, line: NO_LINE }
        : c.startsWith("bb thread tell")
          ? { code: 1, line: "HTTP 409" }
          : undefined,
  });
  assert.equal(
    tellFailed.commands.filter(isReceipt).length,
    1,
    "no second receipt when the ask failed",
  );
});

test("the Reviewer prompt asks for the result line as its last text, after the workpad write", async () => {
  const { spawns } = await run();
  const reviewer = agentSpawns(spawns).find((s) => s.options.label.startsWith("reviewer:")).prompt;
  assert.match(reviewer, /write that line as your last text, after every other tool call/);
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

test("the Reviewer is DeepSeek for a Sonnet Engineer and GLM once an Engineer round ran Opus, through Optio's proxy (ADR-0067)", async () => {
  const sonnet = await run();
  const r1 = agentSpawns(sonnet.spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.equal(r1.options.label, "reviewer:KIT-9:r1:openrouter");
  assert.equal(r1.options.model, "deepseek/deepseek-v4-pro");
  assert.ok(
    sonnet.commands.some((c) =>
      /--step reviewer .*--provider claude-code --model deepseek\/deepseek-v4-pro/.test(c),
    ),
  );
  const opus = await run({ startDecision: { engineerModel: "opus" } });
  const r2 = agentSpawns(opus.spawns).find((s) => s.options.label.startsWith("reviewer:"));
  assert.equal(r2.options.model, "z-ai/glm-5.3");
});
