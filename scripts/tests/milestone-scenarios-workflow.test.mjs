import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateEvent } from "../lib/run-log.mjs";
import { ERROR_CODES, parseVerdicts, scoreVerdicts } from "../lib/scenarios.mjs";

/**
 * The Milestone scenarios workflow (KIT-353) runs in bb's QuickJS sandbox, which this repo cannot
 * start. As for the AFK developer, these tests run the same source in a plain async function with
 * `agent`, `phase` and `args` replaced by a scripted fake: the fake plays the runner workers (it
 * answers the numbered commands) and the Scenario judge, and records every command and spawn.
 */
const ROOT = join(fileURLToPath(new URL("../..", import.meta.url)));
const SOURCE = readFileSync(join(ROOT, ".bb/workflows/milestone-scenarios.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = SOURCE.replace("export const meta =", "const meta =");

const SHA = "c".repeat(40);
const NONCE = "0a1b2c3d";
const TITLES = ["A Collector adds a shirt", "A Collector removes a shirt"];
const ARGS = { project: "Holdout Scenarios", milestone: "Fixture", pr: 12 };
/** Text only an agent wrote. It must never reach a command or another agent's prompt. */
const MARKER = "SCENARIO-TEXT-MARKER";

const checkAnswer = (extra = {}) => ({
  verdict: "SCENARIOS check holdout-scenarios/fixture.md: 2 Scenarios on cccccccc",
  path: "holdout-scenarios/fixture.md",
  sha: SHA,
  titles: TITLES,
  runsPerScenario: 3,
  nonce: NONCE,
  ...extra,
});

const flag = (command, name) => new RegExp(`--${name} (\\S+)`).exec(command)?.[1];

/**
 * Every run-log line the workflow writes must be one the run log accepts: under keepGoing a refused
 * line (exit 2) is lost without a trace, so a code outside REASON_CODES would vanish silently.
 */
function assertLoggable(command) {
  const m = /^node scripts\/run-log\.mjs (\S+) (.*)$/.exec(command);
  if (!m) return;
  const words = m[2].split(" ");
  const event = { event: m[1] };
  for (let i = 0; i < words.length; i += 2) {
    const key = words[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key !== "usageThread") event[key] = words[i + 1];
  }
  assert.deepEqual(validateEvent(event), [], `the run log refuses: ${command}`);
}

/** The default answer of a command, the way the real scripts answer it. */
function defaultShell(command, state) {
  if (command.includes("scenarios.mjs check")) {
    return { code: 0, line: JSON.stringify(checkAnswer(state.check)) };
  }
  if (command.includes("scenarios.mjs flow")) {
    state.producer += 1;
    return {
      code: 0,
      line: JSON.stringify({
        verdict: "x",
        name: flag(command, "name"),
        run: 500 + state.producer,
      }),
    };
  }
  if (command.includes("scenarios.mjs run")) {
    state.dispatched += 1;
    return { code: 0, line: JSON.stringify({ verdict: "x", run: 7000 + state.dispatched }) };
  }
  if (command.includes("scenarios.mjs wait")) {
    const runs = flag(command, "runs").split(",").map(Number);
    return {
      code: 0,
      line: JSON.stringify({
        verdict: "SCENARIOS wait",
        runs: runs.map((run) => ({
          run,
          outcome: "flow-passed",
          evidence: `/x/.factory/scenario-runs/${run}`,
          frames: true,
        })),
      }),
    };
  }
  if (command.includes("scenarios.mjs status") && command.includes("--verdicts")) {
    // The real arithmetic, so the fake cannot disagree with the CLI.
    const parsed = parseVerdicts(flag(command, "verdicts"), {
      scenarios: flag(command, "scenarios"),
      runsPerScenario: state.runsPerScenario,
    });
    assert.ok(parsed.entries, `bad verdict list: ${command}`);
    const { description, ...score } = scoreVerdicts(parsed.entries, {
      scenarios: Number(flag(command, "scenarios")),
      satisfiedToMeet: 2,
    });
    return {
      code: score.passed ? 0 : 1,
      line: JSON.stringify({ ...score, verdict: `SCENARIOS status ${score.state}`, posted: true }),
    };
  }
  if (command.includes("scenarios.mjs report")) {
    const parsed = parseVerdicts(flag(command, "verdicts"), {
      scenarios: flag(command, "scenarios"),
      runsPerScenario: state.runsPerScenario,
    });
    assert.ok(parsed.entries, `bad verdict list: ${command}`);
    const score = scoreVerdicts(parsed.entries, {
      scenarios: Number(flag(command, "scenarios")),
      satisfiedToMeet: 2,
    });
    const failed = score.scenarios.filter((x) => !x.met);
    return {
      code: 0,
      line: JSON.stringify({
        verdict: "SCENARIOS report",
        satisfaction: score.satisfaction,
        comment: true,
        filed: failed.map((_, i) => `KIT-${900 + i}`),
        existing: [],
      }),
    };
  }
  if (command.includes("scenarios.mjs status")) {
    return {
      code: 0,
      line: JSON.stringify({
        verdict: "SCENARIOS status",
        state: flag(command, "state"),
        posted: true,
      }),
    };
  }
  return { code: 0, line: "logged" };
}

/**
 * @param {object} [opts]
 * @param {Record<string, any>} [opts.args]
 * @param {(command: string, state: any) => any} [opts.shell] an answer, `null` for a runner that
 *   returned nothing, or undefined for the default
 * @param {(label: string, n: number) => any} [opts.writer] the flow writer's result
 * @param {(label: string, n: number) => any} [opts.judge] the run judge's result
 * @param {Record<string, any>} [opts.check] fields over the default check answer
 */
async function run({ args = ARGS, shell, writer, judge, check } = {}) {
  const commands = [];
  const spawns = [];
  const phases = [];
  const state = { producer: 0, dispatched: 0, check, runsPerScenario: check?.runsPerScenario ?? 3 };
  let writers = 0;
  let judges = 0;
  const fakeAgent = async (prompt, options = {}) => {
    spawns.push({ prompt, options });
    if (options.schema?.required?.includes("results")) {
      const lines = prompt
        .split("\n")
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => l.replace(/^\d+\. /, ""))
        .map((l) => /^\( (.*) \); echo "KIT-EXIT:\$\?"$/.exec(l)?.[1] ?? l);
      const results = [];
      for (const command of lines) {
        commands.push(command);
        assertLoggable(command);
        const custom = shell?.(command, state);
        if (custom === null) return { results };
        const result = custom ?? defaultShell(command, state);
        results.push({ exit: `KIT-EXIT:${result.code}`, line: result.line });
        if (result.code !== 0 && !prompt.includes("Run every command even when one fails.")) break;
      }
      return { results };
    }
    if (options.label.startsWith("flow-writer:")) {
      writers += 1;
      const out = writer?.(options.label, writers) ?? {
        outcome: "written",
        sentence: `wrote the flow ${MARKER}`,
        threadId: `thr_writer${writers}`,
      };
      if (out instanceof Error) throw out;
      return out;
    }
    judges += 1;
    const out = judge?.(options.label, judges) ?? {
      verdict: "satisfied",
      sentence: `the Collector got through ${MARKER}`,
      threadId: `thr_judge${judges}`,
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

const agentSpawns = (spawns) =>
  spawns.filter((s) => !s.options.schema?.required?.includes("results"));
const statusCommands = (commands) => commands.filter((c) => c.includes("scenarios.mjs status"));
const reportCommands = (commands) => commands.filter((c) => c.includes("scenarios.mjs report "));
const scenarioCommands = (commands, sub) =>
  commands.filter((c) => c.includes(`scenarios.mjs ${sub} `));

/** No run that set pending ends with the status still pending: the last status written is final. */
function assertNeverLeftPending(commands) {
  const statuses = statusCommands(commands);
  if (statuses.some((c) => c.includes("--state pending"))) {
    assert.ok(!statuses.at(-1).includes("--state pending"), "the run ended with Scenarios pending");
  }
}

test("meta is a literal, and every phase() title is a meta phase", () => {
  const meta = /export const meta = (\{[\s\S]*?\n\});/.exec(SOURCE)[1];
  assert.doesNotMatch(meta, /\$\{|\.\.\./);
  const declared = [...meta.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  const used = [...SOURCE.matchAll(/(?:phase\(|phase: )"([^"]+)"/g)].map((m) => m[1]);
  for (const title of new Set(used))
    assert.ok(declared.includes(title), `phase ${title} is not in meta`);
  assert.match(meta, /name: "milestone-scenarios"/);
});

test("every agent() call has a literal provider and model; the Scenario judge is Opus on high", async () => {
  const provider = /const PROVIDER = "([^"]+)";/.exec(SOURCE)[1];
  const judgeModel = /const JUDGE_MODEL = "([^"]+)";/.exec(SOURCE)?.[1];
  assert.equal(judgeModel, "claude-opus-5-5");
  const calls = [...SOURCE.matchAll(/\bagent\((?!\))/g)].length;
  const literalProviders = [...SOURCE.matchAll(/\bprovider: "([^"]*)"/g)].map((m) => m[1]);
  const literalModels = [...SOURCE.matchAll(/\bmodel: "([^"]*)"/g)].map((m) => m[1]);
  assert.ok(calls > 0);
  assert.equal(literalProviders.length, calls);
  assert.equal(literalModels.length, calls);
  for (const literal of literalProviders) assert.equal(literal, "claude-code");
  assert.equal(provider, "claude-code");
  // The runner's model is a literal in its one call; every other call is the Scenario judge.
  assert.deepEqual(
    literalModels.filter((m) => m !== judgeModel),
    ["claude-haiku-5-5"],
  );
  assert.doesNotMatch(SOURCE, /const MODELS\b/);

  const { spawns } = await run();
  const judges = agentSpawns(spawns);
  assert.ok(judges.length > 0);
  for (const { options } of judges) {
    assert.equal(options.provider, "claude-code");
    assert.equal(options.model, "claude-opus-5-5");
    assert.equal(options.reasoningLevel, "high");
  }
});

test("green path: check, pending, one flow per Scenario, runsPerScenario hosted runs each, one judge per run, then the score", async () => {
  const { result, commands, spawns, phases } = await run();
  assert.equal(result.status, "met");
  assert.equal(result.state, "success");
  assert.equal(result.sha, SHA);
  assert.equal(result.satisfaction, "6/6 (100%)");
  assert.deepEqual(
    result.scenarios.map((s) => [s.index, s.title, s.met, s.satisfied, s.runs]),
    [
      [1, TITLES[0], true, 3, 3],
      [2, TITLES[1], true, 3, 3],
    ],
  );
  const at = (needle) => commands.findIndex((c) => c.includes(needle));
  const order = [
    "git diff --quiet origin/development",
    "run-log.mjs start --milestone holdout-scenarios/fixture",
    `scenarios.mjs check --project "Holdout Scenarios" --milestone "Fixture" --pr 12`,
    `scenarios.mjs status --sha ${SHA} --state pending`,
    `scenarios.mjs flow --name scn-${NONCE}-1`,
    `scenarios.mjs flow --name scn-${NONCE}-2`,
    "scenarios.mjs run --flow-run 501",
    "scenarios.mjs wait",
    `scenarios.mjs status --sha ${SHA} --scenarios 2 --verdicts`,
    "--outcome met",
    `scenarios.mjs report --project "Holdout Scenarios" --milestone "Fixture" --sha ${SHA} --scenarios 2 --verdicts`,
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
  assert.deepEqual(
    agentSpawns(spawns).map((s) => s.options.label.split(":")[0]),
    ["flow-writer", "flow-writer", "judge", "judge", "judge", "judge", "judge", "judge"],
  );
  assert.deepEqual(
    [...new Set(phases)],
    ["Session", "Flows", "Hosted runs", "Judge runs", "Score", "Report"],
  );
  assertNeverLeftPending(commands);
});

test("an unfinished milestone is refused: no status, no judge, a run-log reason", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) =>
      c.includes("scenarios.mjs check")
        ? {
            code: 1,
            line: "REFUSED: 2 issues of the milestone are not Done or Canceled: KIT-288 (Backlog), KIT-289 (Backlog)",
          }
        : undefined,
  });
  assert.equal(result.status, "refused");
  assert.equal(result.stoppedAt, "check");
  assert.match(result.note, /KIT-288 \(Backlog\)/);
  assert.equal(statusCommands(commands).length, 0, "a refused milestone posted a status");
  assert.equal(agentSpawns(spawns).length, 0);
  assert.ok(
    commands.some((c) =>
      c.includes("reason --milestone holdout-scenarios/fixture --code scenarios-refused"),
    ),
  );
});

test("a PR that is not development → staging is refused the same way", async () => {
  const { result, commands, spawns } = await run({
    shell: (c) =>
      c.includes("scenarios.mjs check")
        ? { code: 1, line: "REFUSED: PR #12 is kit-1-x → development, not development → staging" }
        : undefined,
  });
  assert.equal(result.status, "refused");
  assert.match(result.note, /not development → staging/);
  assert.equal(statusCommands(commands).length, 0);
  assert.equal(agentSpawns(spawns).length, 0);
});

test("each Scenario gets exactly runsPerScenario hosted runs, all waited for on the checked sha", async () => {
  for (const runsPerScenario of [3, 2]) {
    const { result, commands } = await run({ check: { runsPerScenario } });
    assert.equal(result.status, "met");
    const runs = scenarioCommands(commands, "run");
    assert.equal(runs.length, 2 * runsPerScenario);
    assert.equal(runs.filter((c) => c.includes(`--name scn-${NONCE}-1`)).length, runsPerScenario);
    assert.equal(runs.filter((c) => c.includes(`--name scn-${NONCE}-2`)).length, runsPerScenario);
    assert.ok(
      runs
        .filter((c) => c.includes(`--name scn-${NONCE}-1`))
        .every((c) => c.includes("--flow-run 501")),
    );
    assert.ok(
      runs
        .filter((c) => c.includes(`--name scn-${NONCE}-2`))
        .every((c) => c.includes("--flow-run 502")),
    );
    const [wait] = scenarioCommands(commands, "wait");
    assert.equal(flag(wait, "sha"), SHA);
    assert.equal(flag(wait, "runs").split(",").length, 2 * runsPerScenario);
    const verdicts = flag(statusCommands(commands).at(-1), "verdicts").split(",");
    assert.equal(verdicts.length, 2 * runsPerScenario);
  }
});

test("a wait ERROR ends with Scenarios error linked to the failing run, and no judge runs", async () => {
  for (const [line, code] of [
    ["ERROR: development-moved: run 7002 ran dddddddd, not cccccccc", "development-moved"],
    [
      "ERROR: hosted-run-error: run 7002 concluded cancelled, its flows step cancelled",
      "hosted-run-error",
    ],
  ]) {
    const { result, commands, spawns } = await run({
      shell: (c) => (c.includes("scenarios.mjs wait") ? { code: 1, line } : undefined),
    });
    assert.equal(result.status, "error");
    assert.equal(result.state, "error");
    assert.equal(
      statusCommands(commands).at(-1),
      `node scripts/scenarios.mjs status --sha ${SHA} --state error --code ${code} --run 7002`,
    );
    assert.ok(!agentSpawns(spawns).some((s) => s.options.label.startsWith("judge:")));
    assertNeverLeftPending(commands);
  }
});

test("wait exhaustion and a runner that returns nothing after pending both end as error, never pending", async () => {
  const exhausted = await run({
    shell: (c) =>
      c.includes("scenarios.mjs wait")
        ? { code: 3, line: "WAITING: 6 of 6 hosted runs unfinished" }
        : undefined,
  });
  assert.equal(exhausted.result.status, "error");
  assert.match(statusCommands(exhausted.commands).at(-1), /--state error --code wait-exhausted/);
  const slices = /const WAIT_SLICES = (\d+);/.exec(SOURCE)[1];
  const seconds = /const WAIT_SLICE_SECONDS = (\d+);/.exec(SOURCE)[1];
  assert.equal(scenarioCommands(exhausted.commands, "wait").length, Number(slices));
  assert.ok(
    Number(slices) * Number(seconds) >= 3.5 * 3600,
    "the wait bound is shorter than a queued cold macOS run",
  );
  assert.ok(Number(seconds) <= 480);
  assertNeverLeftPending(exhausted.commands);

  for (const where of [
    "scenarios.mjs run",
    "scenarios.mjs flow",
    "scenarios.mjs wait",
    "--verdicts",
  ]) {
    const lost = await run({ shell: (c) => (c.includes(where) ? null : undefined) });
    assert.equal(lost.result.status, "error", where);
    assert.match(
      statusCommands(lost.commands).at(-1),
      /--state error --code runner-no-result/,
      where,
    );
    assert.ok(
      lost.commands.some((c) =>
        c.includes("reason --milestone holdout-scenarios/fixture --code runner-no-result"),
      ),
      where,
    );
    assertNeverLeftPending(lost.commands);
  }
});

test("a judge without a usable result, a flow that cannot be written and a failed producer each end as error", async () => {
  const noVerdict = await run({
    judge: () => ({ verdict: "maybe", sentence: "x", threadId: "thr_judge001" }),
  });
  assert.equal(noVerdict.result.status, "error");
  assert.match(
    statusCommands(noVerdict.commands).at(-1),
    /--state error --code judge-no-result --run 7001/,
  );
  assert.equal(
    agentSpawns(noVerdict.spawns).filter((s) => s.options.label.startsWith("judge:")).length,
    2,
    "the judge was not asked twice",
  );

  const cannot = await run({
    writer: () => ({ outcome: "cannot", sentence: "no", threadId: "thr_writer1" }),
  });
  assert.match(statusCommands(cannot.commands).at(-1), /--state error --code flow-not-written$/);
  assert.equal(scenarioCommands(cannot.commands, "flow").length, 0);

  const producer = await run({
    shell: (c) =>
      c.includes("scenarios.mjs flow")
        ? { code: 1, line: "FAILED: the producer run 7 of scn-0a1b2c3d-1 concluded failure" }
        : undefined,
  });
  assert.match(statusCommands(producer.commands).at(-1), /--state error --code producer-failed$/);
  assert.equal(scenarioCommands(producer.commands, "run").length, 0);

  const dispatch = await run({
    shell: (c) =>
      c.includes("scenarios.mjs run")
        ? { code: 4, line: "UNKNOWN: cannot dispatch device-flows.yml: HTTP 403" }
        : undefined,
  });
  assert.match(statusCommands(dispatch.commands).at(-1), /--state error --code dispatch-failed$/);
  assert.equal(
    scenarioCommands(dispatch.commands, "run").length,
    1,
    "it kept dispatching after a failed dispatch",
  );
  for (const r of [noVerdict, cannot, producer, dispatch]) assertNeverLeftPending(r.commands);
});

test("the Flows phase hands each flow to the CLI by name only; a producer run id (a Holdout run) never links the status (KIT-366)", async () => {
  const green = await run();
  const flows = scenarioCommands(green.commands, "flow");
  assert.deepEqual(flows, [
    `node scripts/scenarios.mjs flow --name scn-${NONCE}-1`,
    `node scripts/scenarios.mjs flow --name scn-${NONCE}-2`,
  ]);
  // The CLI holds the repos: the workflow names neither the Holdout nor kit-collective.
  for (const command of green.commands) {
    assert.doesNotMatch(command, /kit-scenarios|KitCollective\//, command);
  }
  const producerIds = ["501", "502"];
  const unreachable = await run({
    shell: (c) =>
      c.includes("scenarios.mjs flow")
        ? {
            code: 4,
            line: "UNKNOWN: cannot dispatch scenario-flow.yml: HTTP 404 (SCENARIOS_GH_TOKEN is not set, so the gh login was used)",
          }
        : undefined,
  });
  assert.match(
    statusCommands(unreachable.commands).at(-1),
    /--state error --code dispatch-failed$/,
  );
  for (const r of [green, unreachable]) {
    for (const status of statusCommands(r.commands)) {
      const linked = / --run (\d+)/.exec(status)?.[1];
      assert.ok(!producerIds.includes(linked), `a producer run linked the status: ${status}`);
    }
    assertNeverLeftPending(r.commands);
  }
  // The producer's run ids only ever reach `run --flow-run`.
  for (const command of green.commands.filter((c) => /\b50[12]\b/.test(c))) {
    assert.match(command, /^node scripts\/scenarios\.mjs run --flow-run 50[12] --name /, command);
  }
});

test("a not-satisfied run fails the milestone, links the status to that run and returns the judge's sentences", async () => {
  const { result, commands } = await run({
    judge: (_label, n) => ({
      verdict: n <= 2 ? "not-satisfied" : "satisfied",
      sentence: `stuck at the photo picker ${MARKER}`,
      threadId: `thr_judge${n}`,
    }),
  });
  assert.equal(result.status, "not-met");
  assert.equal(result.state, "failure");
  assert.equal(result.satisfaction, "4/6 (67%)");
  assert.deepEqual(
    result.scenarios.map((s) => s.met),
    [false, true],
  );
  assert.equal(
    flag(statusCommands(commands).at(-1), "verdicts"),
    "1:n:7001,1:n:7002,1:s:7003,2:s:7004,2:s:7005,2:s:7006",
  );
  assert.deepEqual(result.sentences[0], {
    index: 1,
    run: 7001,
    verdict: "not-satisfied",
    sentence: `stuck at the photo picker ${MARKER}`,
  });
  assert.ok(
    commands.some((c) =>
      c.includes(
        "result --milestone holdout-scenarios/fixture --step scenario-judge --outcome not-met --sha",
      ),
    ),
  );
});

test("agent text never enters a command, a runner prompt or another agent's prompt", async () => {
  const { result, commands, spawns } = await run();
  for (const command of commands)
    assert.ok(!command.includes(MARKER), `marker in command: ${command}`);
  for (const { prompt } of spawns)
    assert.ok(!prompt.includes(MARKER), "an agent's text reached a prompt");
  // The flow writer's sentence may describe the Scenario: it is not in the output either.
  assert.ok(!JSON.stringify(result).includes("wrote the flow"));
});

test("the run judge's prompt names the read command and its own evidence directory, and nothing else to read", async () => {
  const { spawns } = await run();
  const judges = agentSpawns(spawns).filter((s) => s.options.label.startsWith("judge:"));
  assert.equal(judges.length, 6);
  for (const [n, { prompt }] of judges.entries()) {
    const own = 7001 + n;
    assert.ok(
      prompt.includes(
        "`node scripts/scenarios.mjs read --project holdout-scenarios --milestone fixture`",
      ),
    );
    assert.ok(prompt.includes(`.factory/scenario-runs/${own}`));
    const named = [...prompt.matchAll(/\.factory\/scenario-runs\/(\d+)/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(named)], [own]);
    assert.doesNotMatch(
      prompt,
      /apps\/|scripts\/(?!scenarios\.mjs)|\.yaml|git diff|scenario-flows/,
    );
    assert.match(prompt, /never the diff|not the diff/i);
  }
  const writers = agentSpawns(spawns).filter((s) => s.options.label.startsWith("flow-writer:"));
  assert.ok(writers[0].prompt.includes(`.factory/scenario-flows/scn-${NONCE}-1.yaml`));
  assert.ok(writers[0].prompt.includes("run it alone"));
});

test("the flow writer is asked for a screenshot after every Action and a simulator-photos line for library photos", async () => {
  const { spawns } = await run();
  const writers = agentSpawns(spawns).filter((s) => s.options.label.startsWith("flow-writer:"));
  assert.equal(writers.length, 2);
  for (const [k, { prompt }] of writers.entries()) {
    const name = `scn-${NONCE}-${k + 1}`;
    assert.match(prompt, /`takeScreenshot` after every Action/);
    assert.ok(prompt.includes(`kc__${name}__NN-`), prompt);
    assert.match(prompt, /`# simulator-photos: <name>, <name>, \.\.\.`/);
    assert.ok(prompt.includes("apps/mobile/.maestro/fixtures/photos/catalog.json"));
    assert.match(prompt, /picks? (a photo|photos) from the (photo )?library/);
  }
});

test("the run judge is told the failure screenshot is the screen at the failing step, and still reads no flow file", async () => {
  const outcome = (run) => (run % 2 === 0 ? "flow-failed" : "flow-passed");
  const { spawns } = await run({
    shell: (command) => {
      if (!command.includes("scenarios.mjs wait")) return undefined;
      const runs = command.split("--runs ")[1].split(" ")[0].split(",").map(Number);
      return {
        code: 0,
        line: JSON.stringify({
          verdict: "SCENARIOS wait",
          runs: runs.map((r) => ({
            run: r,
            outcome: outcome(r),
            evidence: `/x/${r}`,
            frames: true,
          })),
        }),
      };
    },
  });
  const judges = agentSpawns(spawns).filter((s) => s.options.label.startsWith("judge:"));
  assert.equal(judges.length, 6);
  for (const { prompt, options } of judges) {
    const run = Number(options.label.split(":")[2]);
    assert.ok(prompt.includes("`kc__*__failure-NN.png`"), prompt);
    if (outcome(run) === "flow-failed") {
      assert.match(
        prompt,
        /highest-numbered `kc__\*__failure-NN\.png` is the screen at the failing step/,
      );
    } else {
      assert.doesNotMatch(prompt, /screen at the failing step/);
    }
    // Rule 3 is unchanged: no flow file, nothing outside its evidence directory.
    assert.ok(
      prompt.includes(
        "3. Read nothing else: never the diff or the code, no git history, no flow file, no other run's evidence, no PR and no issue.",
      ),
    );
    assert.doesNotMatch(prompt, /apps\/|\.yaml|scenario-flows|catalog\.json|simulator-photos/);
  }
});

test("it never moves an issue, merges, pushes or names a promotion lane in a command", async () => {
  const runs = [
    await run(),
    await run({
      judge: () => ({ verdict: "not-satisfied", sentence: "x", threadId: "thr_judge001" }),
    }),
    await run({
      shell: (c) =>
        c.includes("scenarios.mjs wait")
          ? { code: 1, line: "ERROR: hosted-run-error: run 7001 x" }
          : undefined,
    }),
  ];
  for (const { commands } of runs) {
    for (const command of commands) {
      assert.doesNotMatch(command, /linear\.mjs|gh pr merge|git push|staging|production|--issue/);
    }
  }
});

test("run-log start, spawn and result are written with --milestone; judge spawns carry thread, provider and model", async () => {
  const { commands } = await run();
  const logs = commands.filter((c) => c.includes("run-log.mjs"));
  assert.ok(logs.length > 0);
  for (const c of logs)
    assert.match(
      c,
      /^node scripts\/run-log\.mjs (start|spawn|result|reason) --milestone holdout-scenarios\/fixture( |$)/,
    );
  const spawnsLogged = logs.filter((c) => c.includes(" spawn "));
  assert.equal(spawnsLogged.length, 8);
  for (const c of spawnsLogged) {
    assert.match(
      c,
      /--step scenario-judge --thread thr_\w+ --provider claude-code --model claude-opus-5-5/,
    );
  }
  assert.equal(
    logs.filter((c) => /result .*--outcome (satisfied|not-satisfied)/.test(c)).length,
    6,
  );
  assert.equal(logs.filter((c) => /result .*--outcome written/.test(c)).length, 2);
});

test("bad args and a check answer that fails its patterns stop before pending", async () => {
  for (const args of [
    { ...ARGS, project: 'Holdout"; rm -rf ~; "' },
    { ...ARGS, milestone: "Fix$(id)" },
    { ...ARGS, milestone: "Fix`id`" },
    { ...ARGS, pr: "12" },
    { ...ARGS, pr: 0 },
    { project: "Holdout Scenarios", milestone: "Fixture" },
  ]) {
    const { result, commands } = await run({ args });
    assert.equal(result.status, "refused", JSON.stringify(args));
    assert.equal(commands.length, 0);
  }
  for (const check of [
    { sha: "abc" },
    { path: "holdout-scenarios/holdout.md" },
    { nonce: "ZZZZZZZZ" },
    { runsPerScenario: 9 },
    { titles: [] },
    { titles: Array.from({ length: 11 }, (_, i) => `Scenario ${i}`) },
    { titles: ["a `backtick` title", "b"] },
  ]) {
    const { result, commands, spawns } = await run({ check });
    assert.equal(result.status, "stopped", JSON.stringify(check));
    assert.equal(statusCommands(commands).length, 0, JSON.stringify(check));
    assert.equal(agentSpawns(spawns).length, 0);
  }
});

test("every code the workflow can log or post is a status --code and a milestone run-log reason", () => {
  const block = /const ERROR_CODES = \[([\s\S]*?)\];/.exec(SOURCE)[1];
  const workflowCodes = [...block.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  // One list: the workflow's copy (bb workflows cannot import) equals the CLI's.
  assert.deepEqual([...workflowCodes].sort(), Object.keys(ERROR_CODES).sort());
  const literal = [...SOURCE.matchAll(/--code ([a-z-]+)/g)].map((m) => m[1]);
  // finish() sends any code through pick(code, ERROR_CODES), so these are all it can write.
  for (const code of new Set([...workflowCodes, ...literal])) {
    assert.deepEqual(
      validateEvent({ event: "reason", milestone: "holdout-scenarios/fixture", code }),
      [],
      code,
    );
  }
  assert.match(SOURCE, /const fixed = pick\(code, ERROR_CODES\) \?\? "stopped";/);
});

test("every exit of every CLI call maps to a status cause that names what happened", async () => {
  const cases = [
    [
      "status --sha",
      "--state pending",
      { code: 4, line: "UNKNOWN: cannot post the Scenarios status: HTTP 403" },
      "status-failed",
    ],
    [
      "scenarios.mjs flow",
      "",
      { code: 1, line: "FAILED: the producer run 7 of scn-0a1b2c3d-1 did not finish in 420s" },
      "producer-failed",
    ],
    [
      "scenarios.mjs flow",
      "",
      { code: 1, line: "FAILED: the producer run 7 of scn-0a1b2c3d-1 concluded failure" },
      "producer-failed",
    ],
    [
      "scenarios.mjs flow",
      "",
      { code: 4, line: "UNKNOWN: cannot dispatch scenario-flow.yml: HTTP 403" },
      "dispatch-failed",
    ],
    [
      "scenarios.mjs flow",
      "",
      {
        code: 4,
        line: "UNKNOWN: the dispatch of scenario-flow.yml for scn-0a1b2c3d-1 returned no run id and no run is named for it",
      },
      "dispatch-failed",
    ],
    [
      "scenarios.mjs flow",
      "",
      { code: 4, line: "UNKNOWN: cannot read run 7: HTTP 502" },
      "github-unreachable",
    ],
    [
      "scenarios.mjs flow",
      "",
      { code: 2, line: "UNREADABLE: no flow file for scn-0a1b2c3d-1: ENOENT" },
      "flow-not-written",
    ],
    [
      "scenarios.mjs flow",
      "",
      { code: 2, line: "USAGE: node scripts/scenarios.mjs flow --name <name>" },
      "bad-command",
    ],
    ["scenarios.mjs flow", "", { code: 3, line: "?" }, "bad-answer"],
    [
      "scenarios.mjs run",
      "",
      {
        code: 4,
        line: "UNKNOWN: the dispatch of device-flows.yml returned no run id (return_run_details)",
      },
      "dispatch-failed",
    ],
    [
      "scenarios.mjs run",
      "",
      { code: 4, line: "UNKNOWN: cannot dispatch device-flows.yml: HTTP 403" },
      "dispatch-failed",
    ],
    ["scenarios.mjs run", "", { code: 2, line: "USAGE: x" }, "bad-command"],
    [
      "scenarios.mjs wait",
      "",
      { code: 4, line: "UNKNOWN: cannot read run 7001: HTTP 502" },
      "github-unreachable",
    ],
    ["scenarios.mjs wait", "", { code: 2, line: "USAGE: x" }, "bad-command"],
    [
      "scenarios.mjs wait",
      "",
      { code: 1, line: "ERROR: something-new: run 7001 x" },
      "hosted-run-error",
    ],
    [
      "--verdicts",
      "",
      { code: 4, line: "UNKNOWN: cannot post the Scenarios status: HTTP 403" },
      "status-failed",
    ],
    ["--verdicts", "", { code: 2, line: "USAGE: x" }, "bad-command"],
  ];
  for (const [where, also, answer, cause] of cases) {
    const { result, commands } = await run({
      shell: (c) => (c.includes(where) && c.includes(also) ? answer : undefined),
    });
    const label = `${where} ${answer.code} ${answer.line}`;
    assert.equal(result.status, "error", label);
    assert.match(
      statusCommands(commands).at(-1),
      new RegExp(`--state error --code ${cause}( |$)`),
      label,
    );
    assert.ok(ERROR_CODES[cause], `${cause} has no status description`);
    assertNeverLeftPending(commands);
  }
});

test("an error status that cannot be posted is logged as status-failed and named in the note", async () => {
  const { result, commands } = await run({
    shell: (c) =>
      c.includes("scenarios.mjs wait")
        ? { code: 1, line: "ERROR: hosted-run-error: run 7001 concluded cancelled" }
        : c.includes("--state error")
          ? { code: 4, line: "UNKNOWN: cannot post the Scenarios status: HTTP 403" }
          : undefined,
  });
  assert.equal(result.state, "unknown");
  assert.match(result.note, /may still say pending/);
  assert.ok(
    commands.some((c) =>
      c.includes("reason --milestone holdout-scenarios/fixture --code status-failed"),
    ),
  );
});

// ---- Report (KIT-354): one scenarios.mjs report after the score, tokens only -----------------------

const notSatisfiedFirstScenario = (_label, n) => ({
  verdict: n <= 2 ? "not-satisfied" : "satisfied",
  sentence: `stuck at the photo picker ${MARKER}`,
  threadId: `thr_judge${n}`,
});

test("after the score, report runs once with the score's tokens only, and no judge sentence reaches a command", async () => {
  const { result, commands, spawns } = await run({ judge: notSatisfiedFirstScenario });
  const reports = reportCommands(commands);
  assert.equal(reports.length, 1);
  const statusLine = statusCommands(commands).at(-1);
  assert.equal(
    reports[0],
    `node scripts/scenarios.mjs report --project "Holdout Scenarios" --milestone "Fixture" --sha ${SHA} --scenarios 2 --verdicts ${flag(statusLine, "verdicts")}`,
  );
  assert.match(
    reports[0],
    /^node scripts\/scenarios\.mjs report --project "[^"`$\\!]+" --milestone "[^"`$\\!]+" --sha [0-9a-f]{40} --scenarios \d+ --verdicts [0-9:sn,]+$/,
  );
  // After the status that scored, after the result line; never retried; no command after it but its own logs.
  const at = (needle) => commands.findIndex((c) => c.includes(needle));
  assert.ok(at("scenarios.mjs report ") > at("--outcome not-met"));
  assert.ok(at("--outcome not-met") > at("--verdicts"));
  for (const command of commands)
    assert.ok(!command.includes(MARKER), `marker in command: ${command}`);
  for (const { prompt } of spawns) assert.ok(!prompt.includes(MARKER));
  assert.equal(result.status, "not-met");
  assert.deepEqual(result.report, { comment: true, filed: ["KIT-900"], existing: [] });
  assertNeverLeftPending(commands);
});

test("a met milestone reports too: the comment is written, no issue is filed", async () => {
  const { result, commands } = await run();
  assert.equal(reportCommands(commands).length, 1);
  assert.deepEqual(result.report, { comment: true, filed: [], existing: [] });
  assert.equal(result.status, "met");
});

test("every run judge is told to write its sentence to its own file, and to none other", async () => {
  const { spawns } = await run();
  const judges = agentSpawns(spawns).filter((s) => s.options.label.startsWith("judge:"));
  assert.equal(judges.length, 6);
  for (const [n, { prompt }] of judges.entries()) {
    const own = 7001 + n;
    assert.ok(prompt.includes(`\`.factory/scenario-sentences/${own}.txt\``), `run ${own}`);
    const named = [...prompt.matchAll(/\.factory\/scenario-sentences\/(\d+)\.txt/g)].map((m) =>
      Number(m[1]),
    );
    assert.deepEqual([...new Set(named)], [own]);
    // Rule 3 forbids everything outside the evidence, so it must allow this one write by name.
    const rule3 = prompt.split("\n").find((l) => l.startsWith("3. "));
    assert.ok(
      rule3.includes(`except writing your sentence to \`.factory/scenario-sentences/${own}.txt\``),
      rule3,
    );
  }
});

test("a report that fails does not change the score: Scenarios stays as posted, the note says what to run, the run log says report-failed", async () => {
  for (const shell of [
    (c) => (c.includes("scenarios.mjs report ") ? null : undefined),
    (c) =>
      c.includes("scenarios.mjs report ")
        ? { code: 4, line: "UNKNOWN: cannot list the milestone's issues: boom" }
        : undefined,
    (c) => (c.includes("scenarios.mjs report ") ? { code: 0, line: "not json" } : undefined),
    (c) =>
      c.includes("scenarios.mjs report ")
        ? {
            code: 0,
            line: JSON.stringify({ comment: true, filed: ["KIT-1; rm -rf /"], existing: [] }),
          }
        : undefined,
    (c) =>
      c.includes("scenarios.mjs report ")
        ? { code: 0, line: JSON.stringify({ comment: "yes", filed: [], existing: [] }) }
        : undefined,
  ]) {
    const { result, commands } = await run({ shell, judge: notSatisfiedFirstScenario });
    assert.equal(reportCommands(commands).length, 1, "report must not be retried");
    assert.equal(result.status, "not-met");
    assert.equal(result.state, "failure");
    assert.equal(result.report, undefined);
    assert.match(result.note, /comment and the failure issues were not written/);
    assert.match(
      result.note,
      /node scripts\/scenarios\.mjs report --project "Holdout Scenarios" --milestone "Fixture" --sha c{40} --scenarios 2 --verdicts 1:n:7001/,
    );
    assert.ok(
      commands.some((c) =>
        c.includes("reason --milestone holdout-scenarios/fixture --code report-failed"),
      ),
    );
    // The status the score posted is the last one; nothing re-posts it as an error.
    assert.ok(statusCommands(commands).at(-1).includes("--verdicts"));
    assertNeverLeftPending(commands);
  }
});
