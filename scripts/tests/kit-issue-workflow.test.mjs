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
        .map((l) => l.replace(/^\d+\. /, ""));
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

test("a runner failure is logged with a code the run log accepts", async () => {
  const { REASON_CODES } = await import("../lib/run-log.mjs");
  assert.ok(REASON_CODES.includes("runner-no-result"));
});

const lookup = (c) => c.includes("gh pr list");

test("resume looks the PR up read-only and hands its number to the Engineer", async () => {
  const { result, commands, spawns } = await run({
    args: { issue: "KIT-9", resume: true },
    shell: (c) => (lookup(c) ? { code: 0, line: "55" } : undefined),
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
    shell: (c) => (lookup(c) ? { code: 0, line: "55" } : undefined),
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
  assert.match(pre.result.note, /still waiting after 5 slices of 540s/);
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
  assert.match(engineer, /wait-for-checks\.mjs <pr> --timeout 540/);
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
