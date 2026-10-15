import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_EXIT } from "../lib/gates.mjs";
import { assertCreateGuardrails, SCENARIO_FAILURE_FOOTER } from "../lib/linear-issues.mjs";
import { parseWriteScopeGlobs } from "../lib/pr-write-scope.mjs";
import { FAILURE_WRITE_SCOPE, failureIssueBody, slug } from "../lib/scenarios.mjs";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const CLI = join(ROOT, "scripts", "scenarios.mjs");

const SCENARIO_A = `## A Collector adds a shirt

### Starting situation

A Test Collector with an empty Collection.

### Actions

The Collector taps Add and saves one photo.

### End state

The Collection shows one Kit.
`;

const SCENARIO_B = `## A Collector removes a shirt

### Starting situation

A Test Collector whose Collection holds one Kit.

### Actions

The Collector removes the Kit.

### End state

The Collection is empty.
`;

/** A Holdout directory holding `holdout-scenarios/holdout.md` with `text` (when given). */
function holdout(text) {
  const dir = mkdtempSync(join(tmpdir(), "scenarios-"));
  if (text !== undefined) {
    mkdirSync(join(dir, "holdout-scenarios"));
    writeFileSync(join(dir, "holdout-scenarios", "holdout.md"), text);
  }
  return dir;
}

/** A fresh run-log path in a temp dir. `read` logs, so no test may reach the real log. */
const tmpLog = () => join(mkdtempSync(join(tmpdir(), "scenarios-log-")), "run-log.jsonl");

function run(args, { dir, env } = {}) {
  const argv = [CLI, ...args];
  if (dir) argv.push("--dir", dir);
  const result = spawnSync(process.execPath, argv, {
    encoding: "utf8",
    env: { ...process.env, BB_THREAD_ID: "", KC_RUN_LOG: tmpLog(), ...env },
  });
  const lines = result.stdout.trimEnd().split("\n");
  return { ...result, lines, verdict: lines.at(-1) };
}

const MILESTONE = ["--project", "Holdout Scenarios", "--milestone", "Holdout"];

test("slug: the Linear name lowercased, runs of non-alphanumerics to one dash", () => {
  assert.equal(slug("Holdout Scenarios"), "holdout-scenarios");
  assert.equal(slug("  KitCollective: v1 / Beta!! "), "kitcollective-v1-beta");
});

test("titles prints only the titles, never the other sections", () => {
  const dir = holdout(`${SCENARIO_A}\n${SCENARIO_B}`);
  const result = run(["titles", ...MILESTONE], { dir });
  assert.equal(result.status, GATE_EXIT.open);
  assert.deepEqual(result.lines.slice(0, 2), [
    "A Collector adds a shirt",
    "A Collector removes a shirt",
  ]);
  assert.match(result.verdict, /^SCENARIOS titles holdout-scenarios\/holdout\.md: 2 Scenarios$/);
  for (const hidden of [
    "empty Collection",
    "taps Add",
    "shows one Kit",
    "Starting situation",
    "End state",
  ]) {
    assert.ok(!result.stdout.includes(hidden), `titles leaked "${hidden}"`);
  }
});

test("read prints every section of every Scenario, then one verdict line", () => {
  const dir = holdout(`${SCENARIO_A}\n${SCENARIO_B}`);
  const result = run(["read", ...MILESTONE], { dir });
  assert.equal(result.status, GATE_EXIT.open);
  for (const shown of [
    "## A Collector adds a shirt",
    "### Starting situation",
    "A Test Collector with an empty Collection.",
    "### Actions",
    "The Collector removes the Kit.",
    "### End state",
    "The Collection is empty.",
  ]) {
    assert.ok(result.stdout.includes(shown), `read did not print "${shown}"`);
  }
  assert.match(result.verdict, /^SCENARIOS read holdout-scenarios\/holdout\.md: 2 Scenarios$/);
  assert.equal(result.lines.filter((line) => line.startsWith("SCENARIOS ")).length, 1);
});

test("a milestone with no Holdout file is exit 0 and 'no Scenarios', for titles and read", () => {
  for (const command of ["titles", "read"]) {
    const result = run([command, ...MILESTONE], { dir: holdout() });
    assert.equal(result.status, GATE_EXIT.open, command);
    assert.equal(result.lines.length, 1, `${command} printed more than the verdict`);
    assert.match(result.verdict, /no Scenarios \(no Holdout file\)$/);
  }
});

test("malformed input is refused with exit 2 and the first problem on the verdict line", () => {
  const cases = {
    "a Scenario missing a section": [
      "## No end state\n\n### Starting situation\n\nx\n\n### Actions\n\ny\n",
      /missing "### End state"/,
    ],
    "an empty section": [
      SCENARIO_A.replace("The Collection shows one Kit.", ""),
      /empty "### End state"/,
    ],
    "an empty title": [SCENARIO_A.replace("## A Collector adds a shirt", "## "), /empty title/],
    "a duplicate title": [
      `${SCENARIO_A}\n${SCENARIO_A}`,
      /duplicate title "A Collector adds a shirt"/,
    ],
    "an unknown section": [`${SCENARIO_A}\n### Notes\n\nz\n`, /unknown section "### Notes"/],
    "a repeated section": [`${SCENARIO_A}\n### Actions\n\nz\n`, /repeated "### Actions"/],
    "a file with no Scenarios": ["# Holdout\n\nNothing here yet.\n", /no "## <title>" Scenario/],
    "an empty file": ["", /no "## <title>" Scenario/],
  };
  for (const [name, [text, problem]] of Object.entries(cases)) {
    for (const command of ["titles", "read"]) {
      const result = run([command, ...MILESTONE], { dir: holdout(text) });
      assert.equal(result.status, GATE_EXIT.usage, `${name} (${command})`);
      assert.match(result.verdict, /^MALFORMED: holdout-scenarios\/holdout\.md: /, name);
      assert.match(result.verdict, problem, name);
      assert.ok(!result.stdout.includes("empty Collection"), `${name} printed Scenario text`);
    }
  }
});

test("more than one problem is counted on the verdict line", () => {
  const result = run(["titles", ...MILESTONE], { dir: holdout("## One\n\n## Two\n") });
  assert.equal(result.status, GATE_EXIT.usage);
  assert.match(result.verdict, /\(\+\d+ more\)$/);
});

test("text before the first Scenario heading is ignored, and CRLF files parse", () => {
  const text = `# Holdout milestone\n\nNotes for the human.\n\n${SCENARIO_A}`.replaceAll(
    "\n",
    "\r\n",
  );
  const result = run(["titles", ...MILESTONE], { dir: holdout(text) });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(result.lines[0], "A Collector adds a shirt");
});

test("usage errors are exit 2: unknown subcommand, missing or unusable --project and --milestone, unknown flag", () => {
  const dir = holdout(SCENARIO_A);
  const bad = [
    [],
    ["list", ...MILESTONE],
    ["titles", "--milestone", "Holdout"],
    ["titles", "--project", "Holdout Scenarios"],
    ["titles", "--project", "!!!", "--milestone", "Holdout"],
    ["titles", ...MILESTONE, "--verbose"],
    ["titles", "--project"],
  ];
  for (const args of bad) {
    const result = run(args, { dir });
    assert.equal(result.status, GATE_EXIT.usage, JSON.stringify(args));
    assert.match(result.verdict, /^USAGE: /, JSON.stringify(args));
  }
});

test("a --dir that does not exist is exit 4, not 'no Scenarios'", () => {
  const result = run(["titles", ...MILESTONE], { dir: join(tmpdir(), "scenarios-does-not-exist") });
  assert.equal(result.status, GATE_EXIT.unknown);
  assert.match(result.verdict, /^UNKNOWN: /);
});

test("a milestone file that exists but cannot be read is exit 4 with one verdict line, not a crash", () => {
  const dir = holdout();
  mkdirSync(join(dir, "holdout-scenarios", "holdout.md"), { recursive: true });
  for (const command of ["titles", "read"]) {
    const result = run([command, ...MILESTONE], { dir });
    assert.equal(result.status, GATE_EXIT.unknown);
    assert.match(result.verdict, /^UNKNOWN: cannot read .*holdout\.md: /);
    assert.equal(result.stderr, "");
  }
});

/** A fake `gh` on PATH. `contents` answers the file read, `repo` the repo probe, `put` the write. */
function fakeGh({ contents, repo, put }) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  const path = join(dir, "gh");
  const answer = (spec, name) => {
    if (!spec.ok) return `echo ${JSON.stringify(spec.error)} >&2; exit 1`;
    writeFileSync(join(dir, name), spec.body);
    return `cat "${join(dir, name)}"; exit 0`;
  };
  writeFileSync(
    path,
    `#!/bin/sh
echo "$@" >> "${join(dir, "calls.log")}"
case "$*" in
  *PUT*) ${put ? answer(put, "put") : "exit 99"} ;;
  *contents*) ${answer(contents, "contents")} ;;
  *) ${answer(repo, "repo")} ;;
esac
`,
  );
  chmodSync(path, 0o755);
  return {
    env: { PATH: `${dir}${delimiter}${process.env.PATH}` },
    calls: () => readFileSync(join(dir, "calls.log"), "utf8"),
  };
}

test("without --dir it reads the Holdout repo from factory.config.json through gh", () => {
  const gh = fakeGh({ contents: { ok: true, body: SCENARIO_A }, repo: { ok: true, body: "{}" } });
  const result = run(["titles", ...MILESTONE], { env: gh.env });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(result.lines[0], "A Collector adds a shirt");
  const config = JSON.parse(readFileSync(join(ROOT, "factory.config.json"), "utf8"));
  assert.ok(
    gh
      .calls()
      .includes(`repos/${config.scenarios.holdoutRepo}/contents/holdout-scenarios/holdout.md`),
  );
  assert.ok(gh.calls().includes("application/vnd.github.raw"));
});

test("gh: a 404 on the file in an existing repo is 'no Scenarios'; a 404 on the repo is exit 4", () => {
  const missingFile = fakeGh({
    contents: { ok: false, error: "gh: Not Found (HTTP 404)" },
    repo: { ok: true, body: "{}" },
  });
  const noFile = run(["read", ...MILESTONE], { env: missingFile.env });
  assert.equal(noFile.status, GATE_EXIT.open);
  assert.match(noFile.verdict, /no Scenarios \(no Holdout file\)$/);

  const missingRepo = fakeGh({
    contents: { ok: false, error: "gh: Not Found (HTTP 404)" },
    repo: { ok: false, error: "gh: Not Found (HTTP 404)" },
  });
  const noRepo = run(["read", ...MILESTONE], { env: missingRepo.env });
  assert.equal(noRepo.status, GATE_EXIT.unknown);
  assert.match(noRepo.verdict, /^UNKNOWN: cannot read KitCollective\/kit-scenarios: /);
});

test("gh: any other failure is exit 4 with the cause", () => {
  const gh = fakeGh({
    contents: { ok: false, error: "gh: Bad credentials (HTTP 401)" },
    repo: { ok: false, error: "gh: Bad credentials (HTTP 401)" },
  });
  const result = run(["titles", ...MILESTONE], { env: gh.env });
  assert.equal(result.status, GATE_EXIT.unknown);
  assert.match(result.verdict, /^UNKNOWN: cannot read KitCollective\/kit-scenarios: .*401/);
});

test("both config files hold the scenarios block: 3 runs, 2 to meet, the same Holdout repo", () => {
  const read = (name) => JSON.parse(readFileSync(join(ROOT, name), "utf8")).scenarios;
  const real = read("factory.config.json");
  const example = read("factory.config.example.json");
  assert.equal(real.runsPerScenario, 3);
  assert.equal(real.satisfiedToMeet, 2);
  assert.equal(real.holdoutRepo, "KitCollective/kit-scenarios");
  assert.deepEqual(Object.keys(example).sort(), Object.keys(real).sort());
  assert.equal(example.runsPerScenario, real.runsPerScenario);
  assert.equal(example.satisfiedToMeet, real.satisfiedToMeet);
  assert.equal(example.holdoutRepo, real.holdoutRepo);
});

const logLines = (path) =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

test("read writes one run-log line naming the Holdout file and the reading thread", () => {
  const log = tmpLog();
  const dir = holdout(`${SCENARIO_A}\n${SCENARIO_B}`);
  const result = run(["read", ...MILESTONE], {
    dir,
    env: { KC_RUN_LOG: log, BB_THREAD_ID: "thr_abcd1234" },
  });
  assert.equal(result.status, GATE_EXIT.open);
  const lines = logLines(log);
  assert.equal(lines.length, 1);
  const { at, ...event } = lines[0];
  assert.match(at, /^\d{4}-/);
  assert.deepEqual(event, {
    event: "holdout",
    code: "holdout-read",
    holdout: "holdout-scenarios/holdout.md",
    thread: "thr_abcd1234",
  });
});

test("read logs a line even when the milestone has no Holdout file; a human read has no thread", () => {
  const log = tmpLog();
  const result = run(["read", ...MILESTONE], { dir: holdout(), env: { KC_RUN_LOG: log } });
  assert.equal(result.status, GATE_EXIT.open);
  const lines = logLines(log);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].holdout, "holdout-scenarios/holdout.md");
  assert.equal("thread" in lines[0], false);
});

test("titles writes no run-log line", () => {
  const log = tmpLog();
  const result = run(["titles", ...MILESTONE], {
    dir: holdout(SCENARIO_A),
    env: { KC_RUN_LOG: log, BB_THREAD_ID: "thr_abcd1234" },
  });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(existsSync(log), false);
});

test("read that cannot log (malformed BB_THREAD_ID) is exit 4 and prints no Scenario text", () => {
  const log = tmpLog();
  const result = run(["read", ...MILESTONE], {
    dir: holdout(SCENARIO_A),
    env: { KC_RUN_LOG: log, BB_THREAD_ID: "not a thread" },
  });
  assert.equal(result.status, GATE_EXIT.unknown);
  assert.match(result.verdict, /^UNKNOWN: cannot log the read: /);
  assert.equal(result.lines.length, 1);
  assert.ok(!result.stdout.includes("empty Collection"));
  assert.equal(logLines(log).length, 0);
});

test("read with a usage error writes no line", () => {
  const log = tmpLog();
  const result = run(["read", "--project", "Holdout Scenarios"], {
    dir: holdout(SCENARIO_A),
    env: { KC_RUN_LOG: log },
  });
  assert.equal(result.status, GATE_EXIT.usage);
  assert.equal(existsSync(log), false);
});

/** A `--file` draft outside the repo and the Holdout, as the skill writes it. */
function draft(text) {
  const file = join(mkdtempSync(join(tmpdir(), "scenarios-draft-")), "draft.md");
  writeFileSync(file, text);
  return file;
}

const PUT_PATH = "holdout-scenarios/holdout.md";
const putArgs = (file) => ["put", ...MILESTONE, "--file", file];

test("put creates the milestone file, and read gives the same Scenarios back", () => {
  const dir = holdout();
  const put = run(putArgs(draft(`${SCENARIO_A}\n${SCENARIO_B}`)), { dir });
  assert.equal(put.status, GATE_EXIT.open);
  assert.deepEqual(put.lines, [`SCENARIOS put ${PUT_PATH}: 2 Scenarios`]);
  const read = run(["read", ...MILESTONE], { dir });
  assert.equal(read.status, GATE_EXIT.open);
  assert.ok(read.stdout.includes("The Collector removes the Kit."));
  assert.ok(read.stdout.includes("## A Collector adds a shirt"));
  assert.match(read.verdict, /: 2 Scenarios$/);
});

test("put refuses a malformed file with exit 2 and writes nothing", () => {
  const dir = holdout();
  const result = run(putArgs(draft("## No sections\n")), { dir });
  assert.equal(result.status, GATE_EXIT.usage);
  assert.match(result.verdict, /^MALFORMED: holdout-scenarios\/holdout\.md: /);
  assert.equal(existsSync(join(dir, PUT_PATH)), false);
});

test("put refuses to overwrite an existing milestone file: exit 2 REFUSED, file unchanged", () => {
  const dir = holdout(SCENARIO_A);
  const result = run(putArgs(draft(SCENARIO_B)), { dir });
  assert.equal(result.status, GATE_EXIT.usage);
  assert.match(result.verdict, /^REFUSED: holdout-scenarios\/holdout\.md already exists/);
  assert.equal(readFileSync(join(dir, PUT_PATH), "utf8"), SCENARIO_A);
});

test("put needs a readable --file; --file is refused for titles and read", () => {
  const dir = holdout();
  const bad = [
    ["put", ...MILESTONE],
    ["put", ...MILESTONE, "--file", join(tmpdir(), "scenarios-no-such-draft.md")],
    ["titles", ...MILESTONE, "--file", draft(SCENARIO_A)],
    ["read", ...MILESTONE, "--file", draft(SCENARIO_A)],
  ];
  for (const args of bad) {
    const result = run(args, { dir });
    assert.equal(result.status, GATE_EXIT.usage, JSON.stringify(args));
    assert.match(result.verdict, /^(USAGE|UNREADABLE): /, JSON.stringify(args));
  }
  assert.equal(existsSync(join(dir, PUT_PATH)), false);
});

test("put prints no Scenario text and writes no run-log line", () => {
  const log = tmpLog();
  const result = run(putArgs(draft(SCENARIO_A)), { dir: holdout(), env: { KC_RUN_LOG: log } });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(result.lines.length, 1);
  assert.ok(!result.stdout.includes("empty Collection"));
  assert.equal(existsSync(log), false);
});

test("gh: put on a missing file does one PUT of the base64 file to the Holdout repo", () => {
  const gh = fakeGh({
    contents: { ok: false, error: "gh: Not Found (HTTP 404)" },
    repo: { ok: true, body: "{}" },
    put: { ok: true, body: "{}" },
  });
  const text = `${SCENARIO_A}\n${SCENARIO_B}`;
  const result = run(putArgs(draft(text)), { env: gh.env });
  assert.equal(result.status, GATE_EXIT.open);
  assert.deepEqual(result.lines, [`SCENARIOS put ${PUT_PATH}: 2 Scenarios`]);
  const puts = gh
    .calls()
    .split("\n")
    .filter((line) => line.includes("PUT"));
  assert.equal(puts.length, 1);
  assert.ok(puts[0].includes(`repos/KitCollective/kit-scenarios/contents/${PUT_PATH}`));
  const content = /content=(\S+)/.exec(puts[0])[1];
  assert.equal(Buffer.from(content, "base64").toString("utf8"), text);
});

test("gh: put on an existing file is REFUSED with no PUT", () => {
  const gh = fakeGh({
    contents: { ok: true, body: SCENARIO_A },
    repo: { ok: true, body: "{}" },
    put: { ok: true, body: "{}" },
  });
  const result = run(putArgs(draft(SCENARIO_B)), { env: gh.env });
  assert.equal(result.status, GATE_EXIT.usage);
  assert.match(result.verdict, /^REFUSED: /);
  assert.ok(!gh.calls().includes("PUT"));
});

test("gh: put that cannot reach or write the repo is exit 4 with the cause", () => {
  const down = fakeGh({
    contents: { ok: false, error: "gh: Bad credentials (HTTP 401)" },
    repo: { ok: false, error: "gh: Bad credentials (HTTP 401)" },
  });
  const probe = run(putArgs(draft(SCENARIO_A)), { env: down.env });
  assert.equal(probe.status, GATE_EXIT.unknown);
  assert.match(probe.verdict, /^UNKNOWN: cannot read KitCollective\/kit-scenarios: .*401/);

  const noWrite = fakeGh({
    contents: { ok: false, error: "gh: Not Found (HTTP 404)" },
    repo: { ok: true, body: "{}" },
    put: { ok: false, error: "gh: Resource not accessible (HTTP 403)" },
  });
  const write = run(putArgs(draft(SCENARIO_A)), { env: noWrite.env });
  assert.equal(write.status, GATE_EXIT.unknown);
  assert.match(write.verdict, /^UNKNOWN: cannot write KitCollective\/kit-scenarios: .*403/);
  assert.equal(write.lines.length, 1);
});

// ---- titles --issue (KIT-351): the milestone of a Linear issue, as one JSON line ----------------

/** A fake Linear CLI that answers `issue <KEY>` with `issue` as JSON, or fails when it is null. */
function fakeLinear(issue) {
  const dir = mkdtempSync(join(tmpdir(), "scenarios-linear-"));
  const file = join(dir, "linear.mjs");
  writeFileSync(
    file,
    issue === null
      ? 'process.stderr.write("linear: unauthorized\\n"); process.exit(1);\n'
      : `process.stdout.write(${JSON.stringify(JSON.stringify(issue))});\n`,
  );
  return { KC_LINEAR_CLI: file };
}

const HOLDOUT_ISSUE = { identifier: "KIT-9", project: "Holdout Scenarios", milestone: "Holdout" };
const issueArgs = ["titles", "--issue", "KIT-9"];

test("titles --issue prints one JSON line with the milestone's titles and no section text", () => {
  const dir = holdout(`${SCENARIO_A}\n${SCENARIO_B}`);
  const result = run(issueArgs, { dir, env: fakeLinear(HOLDOUT_ISSUE) });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(result.lines.length, 1, "more than one line on stdout");
  assert.deepEqual(JSON.parse(result.verdict), {
    verdict: "SCENARIOS titles holdout-scenarios/holdout.md: 2 Scenarios",
    path: "holdout-scenarios/holdout.md",
    titles: ["A Collector adds a shirt", "A Collector removes a shirt"],
  });
  for (const hidden of ["empty Collection", "taps Add", "Starting situation", "End state"]) {
    assert.ok(!result.stdout.includes(hidden), `titles --issue leaked "${hidden}"`);
  }
});

test("titles --issue carries seven real-length titles on one line", () => {
  const titles = [
    "A Collector edits one fact on their own jersey",
    "A Collector adds a home shirt from a photo",
    "A Collector removes a shirt from the Collection",
    "A Collector corrects a wrong season on a Kit",
    "A Collector sees the Kit's labels after saving",
    "A Collector adds a second photo to an existing Kit",
    "A Collector opens the Collection with no Kits yet",
  ];
  const file = titles
    .map(
      (t) => `## ${t}\n\n### Starting situation\n\nx\n\n### Actions\n\ny\n\n### End state\n\nz\n`,
    )
    .join("\n");
  const result = run(issueArgs, { dir: holdout(file), env: fakeLinear(HOLDOUT_ISSUE) });
  assert.equal(result.lines.length, 1);
  assert.deepEqual(JSON.parse(result.verdict).titles, titles);
});

test("titles --issue: no Holdout file is exit 0 with titles []", () => {
  const result = run(issueArgs, { dir: holdout(), env: fakeLinear(HOLDOUT_ISSUE) });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(result.lines.length, 1);
  assert.deepEqual(JSON.parse(result.verdict), {
    verdict: "SCENARIOS titles holdout-scenarios/holdout.md: no Scenarios (no Holdout file)",
    path: "holdout-scenarios/holdout.md",
    titles: [],
  });
});

test("titles --issue: an issue without a milestone (or project) is exit 0, path null, titles []", () => {
  for (const issue of [
    { project: "Holdout Scenarios", milestone: null },
    { project: null, milestone: null },
  ]) {
    const result = run(issueArgs, { dir: holdout(), env: fakeLinear(issue) });
    assert.equal(result.status, GATE_EXIT.open);
    const answer = JSON.parse(result.verdict);
    assert.equal(answer.path, null);
    assert.deepEqual(answer.titles, []);
    assert.match(answer.verdict, /no Scenarios \(the issue has no project or milestone\)$/);
  }
});

test("titles --issue: a malformed file or an unreadable Linear is the usual one-line verdict, never Scenario text", () => {
  const malformed = run(issueArgs, {
    dir: holdout(SCENARIO_A.replace("The Collection shows one Kit.", "")),
    env: fakeLinear(HOLDOUT_ISSUE),
  });
  assert.equal(malformed.status, GATE_EXIT.usage);
  assert.equal(malformed.lines.length, 1);
  assert.match(malformed.verdict, /^MALFORMED: holdout-scenarios\/holdout\.md: /);
  assert.ok(!malformed.stdout.includes("Test Collector"));

  const down = run(issueArgs, { dir: holdout(), env: fakeLinear(null) });
  assert.equal(down.status, GATE_EXIT.unknown);
  assert.equal(down.lines.length, 1);
  assert.match(down.verdict, /^UNKNOWN: cannot read KIT-9 from Linear: /);

  const noDir = run(issueArgs, { dir: "/nonexistent-holdout-dir", env: fakeLinear(HOLDOUT_ISSUE) });
  assert.equal(noDir.status, GATE_EXIT.unknown);
  assert.match(noDir.verdict, /^UNKNOWN: /);
});

test("--issue is usage (exit 2) with read, put, --project, --milestone, a bad key or twice", () => {
  const env = fakeLinear(HOLDOUT_ISSUE);
  const bad = [
    ["read", "--issue", "KIT-9"],
    ["put", "--issue", "KIT-9", "--file", "x"],
    ["titles", "--issue", "KIT-9", "--project", "Holdout Scenarios"],
    ["titles", "--issue", "KIT-9", ...MILESTONE],
    ["titles", "--issue", "kit-9"],
    ["titles", "--issue", "KIT-9; id"],
    ["titles", "--issue", "KIT-9", "--issue", "KIT-10"],
    ["titles", "--issue"],
  ];
  for (const argv of bad) {
    const result = run(argv, { dir: holdout(), env });
    assert.equal(result.status, GATE_EXIT.usage, argv.join(" "));
    assert.match(result.verdict, /^USAGE: /);
  }
});

test("titles --issue writes no run-log line, and the --project form is unchanged", () => {
  const log = tmpLog();
  const dir = holdout(SCENARIO_A);
  run(issueArgs, { dir, env: { ...fakeLinear(HOLDOUT_ISSUE), KC_RUN_LOG: log } });
  assert.ok(!existsSync(log) || readFileSync(log, "utf8") === "");
  const plain = run(["titles", ...MILESTONE], { dir });
  assert.deepEqual(plain.lines, [
    "A Collector adds a shirt",
    "SCENARIOS titles holdout-scenarios/holdout.md: 1 Scenario",
  ]);
});

test("the guard lets `titles --issue` through alone and runner-wrapped, and still denies a direct gh read of the Holdout", () => {
  const guard = join(ROOT, ".claude", "hooks", "holdout-guard.mjs");
  const verdict = (command) =>
    spawnSync(process.execPath, [guard], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: ROOT }),
      encoding: "utf8",
    }).status;
  assert.equal(verdict("node scripts/scenarios.mjs titles --issue KIT-288"), 0);
  // The runner wraps every command like this; the wrapper names no Holdout path.
  assert.equal(
    verdict('( node scripts/scenarios.mjs titles --issue KIT-288 ); echo "KIT-EXIT:$?"'),
    0,
  );
  assert.equal(verdict("gh api repos/KitCollective/kit-scenarios/contents/x"), 2);
});

// ---- Milestone scenarios (KIT-353): check, score, status, flow, run, wait ------------------------

const SHA40 = "c".repeat(40);
const OTHER_SHA = "d".repeat(40);
const REPO = "KitCollective/kit-collective";

/**
 * A scripted fake `gh` on PATH. Each rule is `{ match, answers }`: the first rule whose `match` (a
 * substring of the joined argv) fits answers with the next of its `answers` (the last one repeats).
 * An answer is `{ stdout?, stderr?, code?, files? }`; `files` are written into the `--dir` argument.
 * Every call is recorded with its argv and stdin.
 */
function scriptedGh(rules) {
  const dir = mkdtempSync(join(tmpdir(), "scripted-gh-"));
  writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
  writeFileSync(
    join(dir, "gh"),
    `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const dir = ${JSON.stringify(dir)};
const argv = process.argv.slice(2);
let stdin = "";
try { stdin = argv.includes("--input") ? fs.readFileSync(0, "utf8") : ""; } catch {}
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({ argv, stdin }) + "\\n");
const rules = JSON.parse(fs.readFileSync(path.join(dir, "rules.json"), "utf8"));
const joined = argv.join(" ");
const index = rules.findIndex((r) => joined.includes(r.match));
if (index < 0) { process.stderr.write("fake gh: no rule for " + joined + "\\n"); process.exit(97); }
const counter = path.join(dir, "count-" + index);
const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter, "utf8")) : 0;
fs.writeFileSync(counter, String(n + 1));
const answers = rules[index].answers;
const answer = answers[Math.min(n, answers.length - 1)];
if (answer.files) {
  const target = argv[argv.indexOf("--dir") + 1];
  for (const [name, body] of Object.entries(answer.files)) {
    fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true });
    fs.writeFileSync(path.join(target, name), body);
  }
}
if (answer.sleepMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, answer.sleepMs);
if (answer.stdout) process.stdout.write(answer.stdout);
if (answer.stderr) process.stderr.write(answer.stderr);
process.exit(answer.code ?? 0);
`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  return {
    env: { PATH: `${dir}${delimiter}${process.env.PATH}` },
    calls: () =>
      existsSync(join(dir, "calls.jsonl"))
        ? readFileSync(join(dir, "calls.jsonl"), "utf8")
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l))
        : [],
  };
}

/** A temp work dir for flows and evidence, and no ffmpeg, so a test never touches the checkout. */
function workEnv(extra = {}) {
  const work = mkdtempSync(join(tmpdir(), "scenarios-work-"));
  return {
    work,
    env: {
      KC_SCENARIO_WORK: work,
      KC_POLL_SECONDS: "0",
      KC_FFMPEG: "/nonexistent/ffmpeg",
      ...extra,
    },
  };
}

const json = (value) => JSON.stringify(value);

test("score: a Scenario is met at 2 of 3 satisfied runs, not at 1 of 3", () => {
  const met = run(["score", "--scenarios", "1", "--verdicts", "1:s:11,1:s:12,1:n:13"]);
  assert.equal(met.status, GATE_EXIT.open);
  assert.equal(met.lines.length, 1);
  const metAnswer = JSON.parse(met.verdict);
  assert.equal(metAnswer.passed, true);
  assert.deepEqual(metAnswer.scenarios, [{ index: 1, met: true, satisfied: 2, runs: 3 }]);
  assert.equal(metAnswer.satisfaction, "2/3 (67%)");

  const notMet = run(["score", "--scenarios", "1", "--verdicts", "1:s:11,1:n:12,1:n:13"]);
  assert.equal(notMet.status, GATE_EXIT.closed);
  const notMetAnswer = JSON.parse(notMet.verdict);
  assert.equal(notMetAnswer.passed, false);
  assert.deepEqual(notMetAnswer.scenarios, [{ index: 1, met: false, satisfied: 1, runs: 3 }]);
});

test("score: one unmet Scenario fails a milestone whose other Scenarios are met", () => {
  const result = run([
    "score",
    "--scenarios",
    "2",
    "--verdicts",
    "1:s:11,1:s:12,1:s:13,2:n:21,2:s:22,2:n:23",
  ]);
  assert.equal(result.status, GATE_EXIT.closed);
  const answer = JSON.parse(result.verdict);
  assert.equal(answer.passed, false);
  assert.deepEqual(
    answer.scenarios.map((s) => s.met),
    [true, false],
  );
  assert.equal(answer.satisfaction, "4/6 (67%)");
  // The link is the first run that did not satisfy its Scenario.
  assert.equal(answer.run, 21);
  assert.match(
    answer.verdict,
    /^SCENARIOS score: not met, 1 of 2 Scenarios met, Satisfaction 4\/6 \(67%\)$/,
  );
});

test("score: Satisfaction is the share of all runs, as 7/9 (78%)", () => {
  const result = run([
    "score",
    "--scenarios",
    "3",
    "--verdicts",
    "1:s:1,1:s:2,1:s:3,2:s:4,2:s:5,2:n:6,3:s:7,3:s:8,3:n:9",
  ]);
  assert.equal(result.status, GATE_EXIT.open);
  const answer = JSON.parse(result.verdict);
  assert.equal(answer.satisfaction, "7/9 (78%)");
  assert.equal(answer.passed, true);
  assert.equal(answer.run, 6);
});

test("score: a verdict list that is not exactly runsPerScenario per Scenario is usage (exit 2)", () => {
  const bad = [
    ["--scenarios", "1", "--verdicts", "1:s:11,1:s:12"],
    ["--scenarios", "1", "--verdicts", "1:s:11,1:s:12,1:s:13,1:s:14"],
    ["--scenarios", "2", "--verdicts", "1:s:11,1:s:12,1:s:13"],
    ["--scenarios", "1", "--verdicts", "2:s:11,2:s:12,2:s:13"],
    ["--scenarios", "1", "--verdicts", "1:s:11,1:s:11,1:s:13"],
    ["--scenarios", "1", "--verdicts", "1:satisfied:11,1:s:12,1:s:13"],
    ["--scenarios", "1", "--verdicts", "1:s:11,1:s:12,1:s:the Collector got stuck"],
    ["--scenarios", "0", "--verdicts", ""],
    ["--verdicts", "1:s:11,1:s:12,1:s:13"],
    ["--scenarios", "1"],
  ];
  for (const argv of bad) {
    const result = run(["score", ...argv]);
    assert.equal(result.status, GATE_EXIT.usage, argv.join(" "));
    assert.equal(result.lines.length, 1);
    assert.match(result.verdict, /^USAGE: /);
  }
});

test("status --verdicts posts Scenarios on the sha: failure linked to the first unsatisfied run", () => {
  const gh = scriptedGh([{ match: "statuses", answers: [{ stdout: "{}" }] }]);
  const result = run(
    ["status", "--sha", SHA40, "--scenarios", "1", "--verdicts", "1:s:11,1:n:12,1:n:13"],
    { env: gh.env },
  );
  assert.equal(result.status, GATE_EXIT.closed);
  const answer = JSON.parse(result.verdict);
  assert.equal(answer.state, "failure");
  assert.equal(answer.posted, true);
  const [call] = gh.calls();
  const argv = call.argv.join(" ");
  assert.match(argv, new RegExp(`api --method POST repos/${REPO}/statuses/${SHA40}`));
  assert.match(argv, /-f context=Scenarios/);
  assert.match(argv, /-f state=failure/);
  assert.match(argv, /-f description=0 of 1 Scenarios met\. Satisfaction 1\/3 \(33%\)/);
  assert.match(argv, new RegExp(`-f target_url=https://github.com/${REPO}/actions/runs/12( |$)`));
});

test("status --verdicts posts success linked to the first run when every Scenario is met", () => {
  const gh = scriptedGh([{ match: "statuses", answers: [{ stdout: "{}" }] }]);
  const result = run(
    ["status", "--sha", SHA40, "--scenarios", "1", "--verdicts", "1:s:11,1:s:12,1:n:13"],
    { env: gh.env },
  );
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(JSON.parse(result.verdict).state, "success");
  const argv = gh.calls()[0].argv.join(" ");
  assert.match(argv, /-f state=success/);
  assert.match(argv, /-f description=Every Scenario met \(1\/1\)\. Satisfaction 2\/3 \(67%\)/);
  assert.match(argv, /actions\/runs\/13/);
});

test("status --state pending|error posts a fixed description; the state is never success or failure by hand", () => {
  const gh = scriptedGh([{ match: "statuses", answers: [{ stdout: "{}" }] }]);
  const pending = run(["status", "--sha", SHA40, "--state", "pending"], { env: gh.env });
  assert.equal(pending.status, GATE_EXIT.open);
  assert.equal(JSON.parse(pending.verdict).state, "pending");
  const error = run(
    ["status", "--sha", SHA40, "--state", "error", "--code", "development-moved", "--run", "77"],
    { env: gh.env },
  );
  assert.equal(error.status, GATE_EXIT.open);
  const [first, second] = gh.calls().map((c) => c.argv.join(" "));
  assert.match(first, /-f state=pending/);
  assert.doesNotMatch(first, /target_url/);
  assert.match(second, /-f state=error/);
  assert.match(second, /-f description=development moved/);
  assert.match(second, /actions\/runs\/77/);

  for (const argv of [
    ["--state", "success"],
    ["--state", "failure"],
    ["--state", "error", "--code", "the judge said so"],
    ["--state", "pending", "--scenarios", "1", "--verdicts", "1:s:1,1:s:2,1:s:3"],
    ["--state", "pending", "--run", "abc"],
    [],
  ]) {
    const refused = run(["status", "--sha", SHA40, ...argv], { env: gh.env });
    assert.equal(refused.status, GATE_EXIT.usage, argv.join(" "));
  }
  assert.equal(
    run(["status", "--sha", "abc", "--state", "pending"], { env: gh.env }).status,
    GATE_EXIT.usage,
  );
  assert.equal(gh.calls().length, 2, "a refused status posted something");
});

test("status: a post that fails is exit 4; --dry-run posts nothing and prints the payload", () => {
  const down = scriptedGh([{ match: "statuses", answers: [{ code: 1, stderr: "HTTP 403" }] }]);
  const failed = run(["status", "--sha", SHA40, "--state", "pending"], { env: down.env });
  assert.equal(failed.status, GATE_EXIT.unknown);
  assert.match(failed.verdict, /^UNKNOWN: cannot post the Scenarios status: .*403/);

  const gh = scriptedGh([{ match: "statuses", answers: [{ stdout: "{}" }] }]);
  const dry = run(
    ["status", "--sha", SHA40, "--scenarios", "1", "--verdicts", "1:s:1,1:s:2,1:s:3", "--dry-run"],
    { env: gh.env },
  );
  assert.equal(dry.status, GATE_EXIT.open);
  const answer = JSON.parse(dry.verdict);
  assert.equal(answer.posted, false);
  assert.equal(answer.payload.context, "Scenarios");
  assert.equal(answer.payload.state, "success");
  assert.equal(gh.calls().length, 0);
});

// -- check: the milestone is finished, the PR is the promotion, the Holdout has Scenarios.

/** A fake Linear CLI whose `list` answers `issues` (or fails when null), recording its argv. */
function fakeLinearList(issues) {
  const dir = mkdtempSync(join(tmpdir(), "scenarios-linear-list-"));
  const file = join(dir, "linear.mjs");
  writeFileSync(
    file,
    `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(join(dir, "argv.log"))}, JSON.stringify(process.argv.slice(2)) + "\\n");
${
  issues === null
    ? 'process.stderr.write("linear: unauthorized\\n"); process.exit(1);'
    : `process.stdout.write(${JSON.stringify(JSON.stringify(issues))});`
}
`,
  );
  return { env: { KC_LINEAR_CLI: file }, argv: () => readFileSync(join(dir, "argv.log"), "utf8") };
}

const done = (n, state = "Done") => ({ identifier: `KIT-${n}`, state });
const promotionPr = {
  state: "OPEN",
  baseRefName: "staging",
  headRefName: "development",
  headRefOid: SHA40,
};
const prGh = (pr) => scriptedGh([{ match: "pr view", answers: [{ stdout: json(pr) }] }]);
const CHECK = ["check", ...MILESTONE, "--pr", "12"];

function check({
  issues = [done(1), done(2, "Canceled")],
  pr = promotionPr,
  text = SCENARIO_A,
  env = {},
} = {}) {
  const linear = fakeLinearList(issues);
  const gh = prGh(pr);
  const log = tmpLog();
  const result = run(CHECK, {
    dir: holdout(text),
    env: { ...linear.env, ...gh.env, KC_RUN_LOG: log, ...env },
  });
  return { ...result, linear, gh, log };
}

test("check: a finished milestone, a development → staging PR and a Holdout file is one JSON line", () => {
  const result = check({ text: `${SCENARIO_A}\n${SCENARIO_B}` });
  assert.equal(result.status, GATE_EXIT.open);
  assert.equal(result.lines.length, 1);
  const answer = JSON.parse(result.verdict);
  assert.equal(answer.path, "holdout-scenarios/holdout.md");
  assert.equal(answer.sha, SHA40);
  assert.deepEqual(answer.titles, ["A Collector adds a shirt", "A Collector removes a shirt"]);
  assert.equal(answer.runsPerScenario, 3);
  assert.match(answer.nonce, /^[0-9a-f]{8}$/);
  assert.match(
    answer.verdict,
    /^SCENARIOS check holdout-scenarios\/holdout\.md: 2 Scenarios on cccccccc$/,
  );
  for (const hidden of ["empty Collection", "taps Add", "Starting situation"]) {
    assert.ok(!result.stdout.includes(hidden), `check leaked "${hidden}"`);
  }
  // It asks Linear for exactly this milestone, and logs no Holdout read.
  assert.match(
    result.linear.argv(),
    /"list","--project","Holdout Scenarios","--milestone","Holdout"/,
  );
  assert.ok(!existsSync(result.log) || readFileSync(result.log, "utf8") === "");
  assert.match(result.gh.calls()[0].argv.join(" "), new RegExp(`pr view 12 --repo ${REPO}`));
});

test("check refuses (exit 1) a milestone with no issues or with issues not Done or Canceled, naming up to 3", () => {
  const none = check({ issues: [] });
  assert.equal(none.status, GATE_EXIT.closed);
  assert.match(none.verdict, /^REFUSED: the milestone Holdout of Holdout Scenarios has no issues$/);

  const open = check({
    issues: [
      done(1),
      done(2, "In Progress"),
      done(3, "Backlog"),
      done(4, "Post-Merge"),
      done(5, "To-do"),
      done(6, "Canceled"),
    ],
  });
  assert.equal(open.status, GATE_EXIT.closed);
  assert.equal(open.lines.length, 1);
  assert.match(
    open.verdict,
    /^REFUSED: 4 issues of the milestone are not Done or Canceled: KIT-2 \(In Progress\), KIT-3 \(Backlog\), KIT-4 \(Post-Merge\) \(\+1 more\)$/,
  );
  assert.equal(open.gh.calls().length, 0, "check read the PR after refusing the milestone");
});

test("check refuses (exit 1) a PR that is not an open development → staging promotion", () => {
  for (const pr of [
    { ...promotionPr, baseRefName: "development", headRefName: "kit-1-x" },
    { ...promotionPr, baseRefName: "production", headRefName: "staging" },
    { ...promotionPr, headRefName: "kit-353-milestone-scenarios" },
    { ...promotionPr, state: "MERGED" },
  ]) {
    const result = check({ pr });
    assert.equal(result.status, GATE_EXIT.closed, json(pr));
    assert.match(
      result.verdict,
      /^REFUSED: PR #12 is (not open|.* → .*, not development → staging)/,
    );
  }
});

test("check refuses (exit 1) a milestone without a Holdout file; a malformed file is exit 2", () => {
  const linear = fakeLinearList([done(1)]);
  const gh = prGh(promotionPr);
  const missing = run(CHECK, { dir: holdout(), env: { ...linear.env, ...gh.env } });
  assert.equal(missing.status, GATE_EXIT.closed);
  assert.match(
    missing.verdict,
    /^REFUSED: holdout-scenarios\/holdout\.md: no Holdout file, so no Scenarios to judge$/,
  );
  const malformed = check({ text: SCENARIO_A.replace("The Collection shows one Kit.", "") });
  assert.equal(malformed.status, GATE_EXIT.usage);
  assert.match(malformed.verdict, /^MALFORMED: /);
});

test("check: an unreadable Linear or PR is exit 4; usage errors are exit 2", () => {
  const down = check({ issues: null });
  assert.equal(down.status, GATE_EXIT.unknown);
  assert.match(down.verdict, /^UNKNOWN: cannot list the milestone's issues: /);
  const linear = fakeLinearList([done(1)]);
  const gh = scriptedGh([{ match: "pr view", answers: [{ code: 1, stderr: "HTTP 404" }] }]);
  const noPr = run(CHECK, { dir: holdout(SCENARIO_A), env: { ...linear.env, ...gh.env } });
  assert.equal(noPr.status, GATE_EXIT.unknown);
  assert.match(noPr.verdict, /^UNKNOWN: cannot read PR #12: /);
  for (const argv of [
    ["check", ...MILESTONE],
    ["check", ...MILESTONE, "--pr", "12; id"],
    ["check", "--project", "Holdout Scenarios", "--pr", "12"],
    ["check", ...MILESTONE, "--pr", "12", "--file", "x"],
  ]) {
    assert.equal(run(argv, { dir: holdout(SCENARIO_A) }).status, GATE_EXIT.usage, argv.join(" "));
  }
});

// -- flow, run, wait: the hosted runs, found by the id the dispatch returns.

const FLOW =
  "appId: app.kitcollective.mobile\nname: scn-0a1b2c3d-1\n---\n- launchApp\n# SECRET-SCENARIO-WORDS\n";

function flowFile(work, name, text = FLOW) {
  mkdirSync(join(work, "scenario-flows"), { recursive: true });
  writeFileSync(join(work, "scenario-flows", `${name}.yaml`), text);
}

test("flow dispatches the producer with the flow on stdin, waits for it, deletes the file and prints its run", () => {
  const { work, env } = workEnv();
  flowFile(work, "scn-0a1b2c3d-1");
  const gh = scriptedGh([
    {
      match: "scenario-flow.yml/dispatches",
      answers: [{ stdout: json({ workflow_run_id: 501, run_url: "x", html_url: "y" }) }],
    },
    {
      match: "actions/runs/501",
      answers: [
        { stdout: json({ id: 501, status: "in_progress", conclusion: null }) },
        { stdout: json({ id: 501, status: "completed", conclusion: "success" }) },
      ],
    },
  ]);
  const result = run(["flow", "--name", "scn-0a1b2c3d-1"], { env: { ...env, ...gh.env } });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  assert.equal(result.lines.length, 1);
  const answer = JSON.parse(result.verdict);
  assert.deepEqual({ name: answer.name, run: answer.run }, { name: "scn-0a1b2c3d-1", run: 501 });
  const [dispatch] = gh.calls();
  assert.match(
    dispatch.argv.join(" "),
    new RegExp(
      `api --method POST repos/${REPO}/actions/workflows/scenario-flow.yml/dispatches --input -`,
    ),
  );
  const body = JSON.parse(dispatch.stdin);
  assert.deepEqual(body, {
    ref: "development",
    inputs: { name: "scn-0a1b2c3d-1", flow: FLOW },
    return_run_details: true,
  });
  // The flow text is in the request body only: never in argv, never on stdout.
  assert.ok(gh.calls().every((c) => !c.argv.join(" ").includes("SECRET-SCENARIO-WORDS")));
  assert.ok(!result.stdout.includes("SECRET-SCENARIO-WORDS"));
  assert.ok(
    !existsSync(join(work, "scenario-flows", "scn-0a1b2c3d-1.yaml")),
    "the flow file was kept",
  );
});

test("flow without a run id in the answer finds the producer run by its unique run name, never the newest", () => {
  const { work, env } = workEnv();
  flowFile(work, "scn-0a1b2c3d-2");
  const gh = scriptedGh([
    { match: "scenario-flow.yml/dispatches", answers: [{ stdout: "" }] },
    {
      match: "scenario-flow.yml/runs",
      answers: [
        { stdout: json({ workflow_runs: [{ id: 900, display_title: "Scenario flow other" }] }) },
        {
          stdout: json({
            workflow_runs: [
              { id: 902, display_title: "Scenario flow scn-0a1b2c3d-22" },
              { id: 901, display_title: "Scenario flow scn-0a1b2c3d-2" },
              { id: 900, display_title: "Scenario flow other" },
            ],
          }),
        },
      ],
    },
    {
      match: "actions/runs/901",
      answers: [{ stdout: json({ id: 901, status: "completed", conclusion: "success" }) }],
    },
  ]);
  const result = run(["flow", "--name", "scn-0a1b2c3d-2"], { env: { ...env, ...gh.env } });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  assert.equal(JSON.parse(result.verdict).run, 901);
});

test("flow: a failed producer is exit 1; a missing or foreign flow file is exit 2 and dispatches nothing", () => {
  const { work, env } = workEnv();
  flowFile(work, "scn-0a1b2c3d-3");
  const failing = scriptedGh([
    { match: "dispatches", answers: [{ stdout: json({ workflow_run_id: 7 }) }] },
    {
      match: "actions/runs/7",
      answers: [{ stdout: json({ id: 7, status: "completed", conclusion: "failure" }) }],
    },
  ]);
  const failed = run(["flow", "--name", "scn-0a1b2c3d-3"], { env: { ...env, ...failing.env } });
  assert.equal(failed.status, GATE_EXIT.closed);
  assert.match(failed.verdict, /^FAILED: the producer run 7 of scn-0a1b2c3d-3 concluded failure$/);
  assert.ok(!existsSync(join(work, "scenario-flows", "scn-0a1b2c3d-3.yaml")));

  const gh = scriptedGh([
    { match: "dispatches", answers: [{ stdout: json({ workflow_run_id: 8 }) }] },
  ]);
  const missing = run(["flow", "--name", "scn-0a1b2c3d-4"], { env: { ...env, ...gh.env } });
  assert.equal(missing.status, GATE_EXIT.usage);
  flowFile(work, "scn-0a1b2c3d-5", "name: x\n---\n- launchApp\n# SECRET-SCENARIO-WORDS\n");
  const foreign = run(["flow", "--name", "scn-0a1b2c3d-5"], { env: { ...env, ...gh.env } });
  assert.equal(foreign.status, GATE_EXIT.usage);
  assert.ok(!foreign.stdout.includes("SECRET-SCENARIO-WORDS"));
  assert.equal(gh.calls().length, 0);
  for (const name of ["Scn-1", "../x", "scn 1", ""]) {
    assert.equal(
      run(["flow", "--name", name], { env: { ...env, ...gh.env } }).status,
      GATE_EXIT.usage,
      name,
    );
  }
});

test("run dispatches device-flows.yml as an artifact run of the named flow and prints its run id", () => {
  const gh = scriptedGh([
    {
      match: "device-flows.yml/dispatches",
      answers: [{ stdout: json({ workflow_run_id: 7001 }) }],
    },
  ]);
  const result = run(["run", "--flow-run", "501", "--name", "scn-0a1b2c3d-1"], { env: gh.env });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  assert.equal(JSON.parse(result.verdict).run, 7001);
  assert.deepEqual(JSON.parse(gh.calls()[0].stdin), {
    ref: "development",
    inputs: { flows: "artifact", flow_run: "501", flow_artifact: "scenario-flow-scn-0a1b2c3d-1" },
    return_run_details: true,
  });
  // device-flows.yml has no run name, so an answer without a run id is an error, never "the newest run".
  const blind = scriptedGh([{ match: "dispatches", answers: [{ stdout: "" }] }]);
  const noId = run(["run", "--flow-run", "501", "--name", "scn-0a1b2c3d-1"], { env: blind.env });
  assert.equal(noId.status, GATE_EXIT.unknown);
  assert.match(noId.verdict, /^UNKNOWN: the dispatch of device-flows\.yml returned no run id/);
  assert.equal(blind.calls().length, 1);
  assert.equal(
    run(["run", "--flow-run", "x", "--name", "scn-0a1b2c3d-1"], { env: gh.env }).status,
    GATE_EXIT.usage,
  );
});

/** The gh answers for one finished device-flows run. */
const finished = (
  id,
  { conclusion = "success", step = conclusion, sha = SHA40, artifact = true } = {},
) => [
  {
    match: `actions/runs/${id}/jobs`,
    answers: [
      {
        stdout: json({
          jobs: [
            {
              name: "iOS Simulator",
              steps: [
                { name: "Install dependencies", conclusion: "success" },
                { name: "Run the flows", conclusion: step },
              ],
            },
          ],
        }),
      },
    ],
  },
  {
    match: `actions/runs/${id}`,
    answers: [{ stdout: json({ id, status: "completed", conclusion, head_sha: sha }) }],
  },
  {
    match: `run download ${id}`,
    answers: [
      artifact
        ? {
            files: {
              "apps/mobile/.maestro/out/kc__scn__01-start.png": "png",
              "kc__scn.mp4": "mp4",
            },
          }
        : { code: 1, stderr: "no artifact matches any of the names or patterns provided" },
    ],
  },
];

test("wait: every run finished with a judged flow is exit 0, one JSON line, evidence downloaded per run", () => {
  const { work, env } = workEnv();
  const gh = scriptedGh([...finished(11), ...finished(12, { conclusion: "failure" })]);
  const result = run(["wait", "--runs", "11,12", "--sha", SHA40, "--timeout", "60"], {
    env: { ...env, ...gh.env },
  });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  assert.equal(result.lines.length, 1);
  const answer = JSON.parse(result.verdict);
  assert.deepEqual(
    answer.runs.map((r) => [r.run, r.outcome]),
    [
      [11, "flow-passed"],
      [12, "flow-failed"],
    ],
  );
  assert.equal(answer.runs[0].evidence, join(work, "scenario-runs", "11"));
  assert.ok(
    existsSync(join(work, "scenario-runs", "12", "apps/mobile/.maestro/out/kc__scn__01-start.png")),
  );
  const download = gh.calls().find((c) => c.argv[0] === "run" && c.argv[1] === "download");
  assert.match(
    download.argv.join(" "),
    new RegExp(`run download 11 --repo ${REPO} --name device-flows-${SHA40} --dir `),
  );
});

test("wait: a run still going is exit 3 (waiting) and downloads nothing", () => {
  const { env } = workEnv();
  const gh = scriptedGh([
    ...finished(11),
    {
      match: "actions/runs/12",
      answers: [{ stdout: json({ id: 12, status: "queued", conclusion: null, head_sha: SHA40 }) }],
    },
  ]);
  const result = run(["wait", "--runs", "11,12", "--sha", SHA40, "--timeout", "0"], {
    env: { ...env, ...gh.env },
  });
  assert.equal(result.status, GATE_EXIT.waiting);
  assert.match(result.verdict, /^WAITING: 1 of 2 hosted runs unfinished$/);
  assert.ok(gh.calls().every((c) => c.argv[1] !== "download"));
});

test("wait: a run that stopped early, ran another commit or has no evidence is exit 1 ERROR, never a verdict", () => {
  const cases = [
    [
      { conclusion: "cancelled", step: "cancelled" },
      /^ERROR: hosted-run-error: run 11 concluded cancelled/,
    ],
    [
      { conclusion: "timed_out", step: "cancelled" },
      /^ERROR: hosted-run-error: run 11 concluded timed_out/,
    ],
    [
      { conclusion: "failure", step: "skipped" },
      /^ERROR: hosted-run-error: run 11 concluded failure, its flows step skipped/,
    ],
    [
      { conclusion: "startup_failure", step: null },
      /^ERROR: hosted-run-error: run 11 concluded startup_failure/,
    ],
    [{ sha: OTHER_SHA }, /^ERROR: development-moved: run 11 ran dddddddd, not cccccccc/],
    [{ artifact: false }, /^ERROR: hosted-run-error: run 11 has no artifact device-flows-cccccccc/],
  ];
  for (const [shape, line] of cases) {
    const { env } = workEnv();
    const gh = scriptedGh(finished(11, shape));
    const result = run(["wait", "--runs", "11", "--sha", SHA40, "--timeout", "60"], {
      env: { ...env, ...gh.env },
    });
    assert.equal(result.status, GATE_EXIT.closed, json(shape));
    assert.equal(result.lines.length, 1);
    assert.match(result.verdict, line);
  }
  const { env } = workEnv();
  for (const argv of [
    ["--runs", "11,x", "--sha", SHA40],
    ["--runs", "11", "--sha", "main"],
    ["--runs", "", "--sha", SHA40],
  ]) {
    assert.equal(run(["wait", ...argv], { env }).status, GATE_EXIT.usage, argv.join(" "));
  }
});

test("the guard lets the Scenario judge's `read` through when it runs alone", () => {
  const guard = join(ROOT, ".claude", "hooks", "holdout-guard.mjs");
  const verdict = (command) =>
    spawnSync(process.execPath, [guard], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: ROOT }),
      encoding: "utf8",
    }).status;
  assert.equal(
    verdict("node scripts/scenarios.mjs read --project holdout-scenarios --milestone fixture"),
    0,
  );
});

test("runOutcome: only a flows step that succeeded or failed on the checked sha is judged", async () => {
  const { runOutcome } = await import("../lib/scenarios.mjs");
  const jobs = (step) => ({ jobs: [{ steps: [{ name: "Run the flows", conclusion: step }] }] });
  const at = (conclusion, step, sha = SHA40) =>
    runOutcome({
      id: 5,
      run: { status: "completed", conclusion, head_sha: sha },
      jobs: jobs(step),
      sha: SHA40,
    });
  assert.deepEqual(at("success", "success"), { outcome: "flow-passed" });
  assert.deepEqual(at("failure", "failure"), { outcome: "flow-failed" });
  assert.equal(at("cancelled", "cancelled").error, "hosted-run-error");
  assert.equal(at("timed_out", null).error, "hosted-run-error");
  assert.equal(at("failure", "skipped").error, "hosted-run-error");
  assert.equal(at("success", "success", OTHER_SHA).error, "development-moved");
  assert.deepEqual(
    runOutcome({
      id: 5,
      run: { status: "in_progress", conclusion: null, head_sha: SHA40 },
      jobs: null,
      sha: SHA40,
    }),
    { outcome: "waiting" },
  );
});

test("flow: a producer run that does not finish within --timeout is exit 1 FAILED, like a failed one", () => {
  const { work, env } = workEnv();
  flowFile(work, "scn-0a1b2c3d-6");
  const gh = scriptedGh([
    { match: "dispatches", answers: [{ stdout: json({ workflow_run_id: 9 }) }] },
    {
      match: "actions/runs/9",
      answers: [{ stdout: json({ id: 9, status: "queued", conclusion: null }) }],
    },
  ]);
  const result = run(["flow", "--name", "scn-0a1b2c3d-6", "--timeout", "0"], {
    env: { ...env, ...gh.env },
  });
  assert.equal(result.status, GATE_EXIT.closed);
  assert.match(
    result.verdict,
    /^FAILED: the producer run 9 of scn-0a1b2c3d-6 did not finish in 0s$/,
  );
});

/** A fake ffmpeg: `-version` answers at once; extracting sleeps `ms`, then writes one still. */
function fakeFfmpeg(ms) {
  const dir = mkdtempSync(join(tmpdir(), "fake-ffmpeg-"));
  const path = join(dir, "ffmpeg");
  writeFileSync(
    path,
    `#!${process.execPath}
const fs = require("node:fs");
const argv = process.argv.slice(2);
if (argv[0] === "-version") process.exit(0);
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms});
fs.writeFileSync(argv.at(-1).replace("%03d", "001"), "png");
`,
  );
  chmodSync(path, 0o755);
  return path;
}

test("wait keeps only the screenshots, the recording and its stills in a run's evidence", () => {
  const { work, env } = workEnv({ KC_FFMPEG: fakeFfmpeg(0) });
  const rules = finished(11);
  rules[2].answers = [
    {
      files: {
        "apps/mobile/.maestro/out/kc__scn__01-start.png": "png",
        "kc__scn.mp4": "mp4",
        "local-api.log": "api log",
        "apps/mobile/.maestro/out/maestro.log": "x",
      },
    },
  ];
  const gh = scriptedGh(rules);
  const result = run(["wait", "--runs", "11", "--sha", SHA40, "--timeout", "60"], {
    env: { ...env, ...gh.env },
  });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  const evidence = join(work, "scenario-runs", "11");
  const files = readdirSync(evidence, { recursive: true })
    .map(String)
    .filter((f) => statSync(join(evidence, f)).isFile())
    .sort();
  assert.deepEqual(files, [
    "apps/mobile/.maestro/out/kc__scn__01-start.png",
    "frames/kc__scn-001.png",
    "kc__scn.mp4",
  ]);
  assert.equal(JSON.parse(result.verdict).runs[0].frames, true);
});

test("wait has one deadline: a slow download or ffmpeg is exit 3 inside --timeout, and the next slice resumes", () => {
  const slowGh = () => {
    const rules = [...finished(11), ...finished(12)];
    rules[5].answers = [{ sleepMs: 8000, files: { "kc__b.png": "png" } }];
    return scriptedGh(rules);
  };
  const { work, env } = workEnv();
  const started = Date.now();
  const first = run(["wait", "--runs", "11,12", "--sha", SHA40, "--timeout", "3"], {
    env: { ...env, ...slowGh().env },
  });
  assert.ok(Date.now() - started < 7000, `wait ran ${Date.now() - started} ms past a 3 s deadline`);
  assert.equal(first.status, GATE_EXIT.waiting, first.stdout);
  assert.match(first.verdict, /^WAITING: evidence of 1 of 2 hosted runs not downloaded yet$/);
  assert.ok(existsSync(join(work, "scenario-runs", "11", "kc__scn.mp4")));

  // The next slice downloads only what is missing.
  const fast = scriptedGh([...finished(11), ...finished(12)]);
  const second = run(["wait", "--runs", "11,12", "--sha", SHA40, "--timeout", "60"], {
    env: { ...env, ...fast.env },
  });
  assert.equal(second.status, GATE_EXIT.open, second.stdout);
  const downloads = fast
    .calls()
    .filter((c) => c.argv[1] === "download")
    .map((c) => c.argv[2]);
  assert.deepEqual(downloads, ["12"]);

  const slowFrames = workEnv({ KC_FFMPEG: fakeFfmpeg(8000) });
  const t0 = Date.now();
  const frames = run(["wait", "--runs", "11", "--sha", SHA40, "--timeout", "3"], {
    env: { ...slowFrames.env, ...scriptedGh(finished(11)).env },
  });
  assert.ok(Date.now() - t0 < 7000, "ffmpeg ran past the deadline");
  assert.equal(frames.status, GATE_EXIT.waiting, frames.stdout);
});

// ---- report (KIT-354): the project comment, one issue per failed Scenario, no duplicates ---------

/** Text only the Holdout's sections hold. It must reach no issue, comment, argv or output. */
const SECRET = ["SECRET-STARTING-SITUATION", "SECRET-ACTIONS", "SECRET-END-STATE"];
const secretScenario = (title) => `## ${title}

### Starting situation

${SECRET[0]} a Test Collector whose Collection is completely empty today.

### Actions

${SECRET[1]} the Collector taps Add and then saves exactly one photo.

### End state

${SECRET[2]} the Collection now shows one brand new Kit.
`;
const TITLE_A = "A Collector adds a shirt";
const TITLE_B = "A Collector removes a shirt";
const TWO = `${secretScenario(TITLE_A)}\n${secretScenario(TITLE_B)}`;
const FAILURE_A = `Scenario not met: ${TITLE_A}`;

/**
 * A fake Linear CLI: `list` answers `issues`; `create` and `project-comment` log their argv and the
 * body file's text as it was when they ran (the CLI deletes its temp file), and answer like linear.mjs.
 * `failOn` makes that subcommand exit 1.
 */
function fakeReportLinear({ issues = [], failOn = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "scenarios-report-linear-"));
  const log = join(dir, "calls.jsonl");
  const file = join(dir, "linear.mjs");
  writeFileSync(
    file,
    `import { appendFileSync, readFileSync } from "node:fs";
const argv = process.argv.slice(2);
const [command] = argv;
const at = argv.indexOf("--body-file");
const body = at === -1 ? null : readFileSync(argv[at + 1], "utf8");
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv, body, bodyFile: at === -1 ? null : argv[at + 1] }) + "\\n");
if (command === ${JSON.stringify(failOn)}) { process.stderr.write("linear: request failed\\n"); process.exit(1); }
if (command === "list") process.stdout.write(${JSON.stringify(JSON.stringify(issues))});
if (command === "create") process.stdout.write("KIT-" + (900 + readFileSync(${JSON.stringify(log)}, "utf8").split("\\n").filter((l) => l.includes('"create"')).length) + " https://linear.app/x\\n");
if (command === "project-comment") process.stdout.write("c-1 https://linear.app/x/c-1\\n");
`,
  );
  const calls = () =>
    existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];
  return {
    env: { KC_LINEAR_CLI: file },
    calls,
    of: (command) => calls().filter((c) => c.argv[0] === command),
  };
}

/** Sentence files `<work>/scenario-sentences/<run>.txt`, like the run judges write them. */
function sentenceDir(sentences) {
  const work = mkdtempSync(join(tmpdir(), "scenarios-work-"));
  mkdirSync(join(work, "scenario-sentences"));
  for (const [run, text] of Object.entries(sentences)) {
    writeFileSync(join(work, "scenario-sentences", `${run}.txt`), text);
  }
  return work;
}

// Scenario 1 is not met (1 of 3 satisfied), Scenario 2 is met.
const FAIL_A_VERDICTS = "1:n:7001,1:n:7002,1:s:7003,2:s:7004,2:s:7005,2:s:7006";
const SENTENCES = {
  7001: "The photo picker never opened after Add.",
  7002: "Stuck on the empty Collection screen.",
  7003: "The Collection showed one Kit.",
  7004: "Showed an empty Collection after the removal.",
};

function report({
  scenarios = 2,
  issues,
  failOn,
  verdicts = FAIL_A_VERDICTS,
  sentences = SENTENCES,
  text = TWO,
  args = [],
  env = {},
} = {}) {
  const linear = fakeReportLinear({ issues, failOn });
  const work = sentenceDir(sentences);
  const result = run(
    [
      "report",
      ...MILESTONE,
      "--sha",
      SHA40,
      "--scenarios",
      String(scenarios),
      "--verdicts",
      verdicts,
      ...args,
    ],
    {
      dir: holdout(text === null ? undefined : text),
      env: { ...linear.env, KC_SCENARIO_WORK: work, ...env },
    },
  );
  return {
    ...result,
    linear,
    work,
    answer: result.status === 0 ? JSON.parse(result.verdict) : null,
  };
}

test("report files one To-do ready-for-agent issue per failed Scenario in its milestone, and one project comment", () => {
  const result = report();
  assert.equal(result.status, GATE_EXIT.open, result.stdout + result.stderr);
  assert.equal(result.lines.length, 1);
  assert.deepEqual(
    { ...result.answer, verdict: undefined },
    {
      verdict: undefined,
      satisfaction: "4/6 (67%)",
      comment: true,
      filed: ["KIT-901"],
      existing: [],
    },
  );

  const created = result.linear.of("create");
  assert.equal(created.length, 1, "one issue for the one failed Scenario, none for the met one");
  assert.deepEqual(created[0].argv.slice(0, 1).concat(created[0].argv.slice(2, 3)), [
    "create",
    "--body-file",
  ]);
  assert.equal(created[0].argv[1], FAILURE_A);
  for (const [flag, value] of [
    ["--state", "To-do"],
    ["--label", "ready-for-agent"],
    ["--project", "Holdout Scenarios"],
    ["--milestone", "Holdout"],
  ]) {
    assert.equal(created[0].argv[created[0].argv.indexOf(flag) + 1], value, flag);
  }
  const body = created[0].body;
  assert.ok(body.includes(TITLE_A));
  for (const run of [7001, 7002, 7003]) {
    assert.ok(body.includes(`https://github.com/${REPO}/actions/runs/${run}`), `run link ${run}`);
  }
  assert.ok(
    body.includes(SENTENCES[7001]) &&
      body.includes(SENTENCES[7002]) &&
      body.includes(SENTENCES[7003]),
  );
  assert.ok(!body.includes(SENTENCES[7004]), "a sentence of another Scenario");
  assert.ok(!body.includes(TITLE_B));
  assert.ok(body.split("\n").includes(SCENARIO_FAILURE_FOOTER));
  assert.deepEqual(parseWriteScopeGlobs(body), ["apps/mobile/**", "apps/api/**", "packages/**"]);

  const comments = result.linear.of("project-comment");
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0].argv.slice(0, 2), ["project-comment", "Holdout Scenarios"]);
  assert.ok(comments[0].body.includes("4/6 (67%)"));
  assert.ok(comments[0].body.includes(`"${TITLE_A}"`));
  assert.ok(!comments[0].body.includes(TITLE_B));
  assert.ok(comments[0].body.includes("KIT-901"));
  assert.ok(comments[0].body.length < 400, "the comment is short");
  // Issue first, then the comment that names it.
  assert.deepEqual(
    result.linear.calls().map((c) => c.argv[0]),
    ["list", "create", "project-comment"],
  );
});

test("the failure issue body passes create's own guardrails for ready-for-agent", () => {
  const body = failureIssueBody({
    title: TITLE_A,
    ownerRepo: REPO,
    sha: SHA40,
    scenarioRuns: [{ run: 7001, satisfied: false, sentence: "x" }],
  });
  const labels = [{ id: "l", name: "ready-for-agent", parent: null }];
  assert.doesNotThrow(() =>
    assertCreateGuardrails({ labels: ["ready-for-agent"], state: "To-do", body }, labels),
  );
  assert.match(FAILURE_WRITE_SCOPE, /^apps\/mobile\/\*\*, apps\/api\/\*\*, packages\/\*\*$/);
});

test("no failure issue, comment, argv, answer or log line ever holds the Scenario text", () => {
  const result = report({
    sentences: { ...SENTENCES, 7001: "Never retells; a sentence of the judge." },
  });
  assert.equal(result.status, GATE_EXIT.open);
  const everything = JSON.stringify(result.linear.calls()) + result.stdout + result.stderr;
  for (const secret of SECRET) {
    assert.ok(!everything.includes(secret), `report leaked "${secret}"`);
  }
  for (const hidden of ["Starting situation", "Actions", "End state"]) {
    assert.ok(!everything.includes(`### ${hidden}`));
  }
});

test("report logs no Holdout read, and passes the model's sentences through files, never argv", () => {
  const log = tmpLog();
  const result = report({ env: { KC_RUN_LOG: log } });
  assert.equal(result.status, GATE_EXIT.open);
  assert.ok(!existsSync(log) || readFileSync(log, "utf8") === "");
  for (const call of result.linear.calls()) {
    for (const sentence of Object.values(SENTENCES)) {
      assert.ok(!call.argv.join(" ").includes(sentence), "a sentence was passed in argv");
    }
  }
  for (const call of result.linear.calls().filter((c) => c.bodyFile)) {
    assert.ok(
      call.bodyFile.startsWith(tmpdir()) || call.bodyFile.startsWith("/private"),
      call.bodyFile,
    );
    assert.ok(!existsSync(call.bodyFile), "the body file was left behind");
  }
});

test("a re-run files no duplicate for a Scenario with an open failure issue, and names it", () => {
  const open = [
    { identifier: "KIT-77", title: FAILURE_A, state: "To-do", scenarioFailure: true },
    { identifier: "KIT-78", title: "Something else", state: "Backlog", scenarioFailure: false },
  ];
  const result = report({ issues: open });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  assert.deepEqual(result.answer.filed, []);
  assert.deepEqual(result.answer.existing, ["KIT-77"]);
  assert.equal(result.linear.of("create").length, 0, "a duplicate was filed");
  assert.equal(result.linear.of("project-comment").length, 1);
  assert.ok(result.linear.of("project-comment")[0].body.includes("KIT-77"));

  // A title compared without case, an in-progress issue, and an issue without the footer all count as open.
  for (const issue of [
    {
      identifier: "KIT-80",
      title: FAILURE_A.toUpperCase(),
      state: "In Progress",
      scenarioFailure: true,
    },
    { identifier: "KIT-81", title: FAILURE_A, state: "In Review", scenarioFailure: false },
  ]) {
    const again = report({ issues: [issue] });
    assert.deepEqual(again.answer.existing, [issue.identifier], issue.identifier);
    assert.equal(again.linear.of("create").length, 0);
  }
});

test("a closed failure issue does not block a new one; only the failed Scenario is matched", () => {
  const closed = [
    { identifier: "KIT-70", title: FAILURE_A, state: "Done", scenarioFailure: true },
    { identifier: "KIT-71", title: FAILURE_A, state: "Canceled", scenarioFailure: true },
    {
      identifier: "KIT-72",
      title: `Scenario not met: ${TITLE_B}`,
      state: "To-do",
      scenarioFailure: true,
    },
  ];
  const result = report({ issues: closed });
  assert.deepEqual(result.answer.filed, ["KIT-901"]);
  assert.deepEqual(result.answer.existing, []);
});

test("every failed Scenario gets its own issue; every Scenario met files none and says so", () => {
  const both = report({ verdicts: "1:n:7001,1:n:7002,1:s:7003,2:n:7004,2:s:7005,2:n:7006" });
  assert.deepEqual(both.answer.filed, ["KIT-901", "KIT-902"]);
  assert.equal(both.linear.of("create").length, 2);
  assert.equal(both.linear.of("project-comment").length, 1);
  assert.ok(both.linear.of("project-comment")[0].body.includes(`"${TITLE_A}", "${TITLE_B}"`));

  const met = report({ verdicts: "1:s:7001,1:s:7002,1:s:7003,2:s:7004,2:s:7005,2:n:7006" });
  assert.equal(met.status, GATE_EXIT.open);
  assert.deepEqual(met.answer.filed, []);
  assert.equal(met.linear.of("create").length, 0);
  const [comment] = met.linear.of("project-comment");
  assert.match(comment.body, /Satisfaction 5\/6 \(83%\)/);
  assert.match(comment.body, /Every Scenario met/);
});

test("a sentence file that is missing, over 400 characters, multi-line, has a backtick or a control character is not used", () => {
  const result = report({
    sentences: {
      7001: "x".repeat(401),
      7002: "fine sentence\non two lines",
      7003: "with a `backtick`",
      // 7004 to 7006 belong to the met Scenario; 7001-7003 are the failed one's.
    },
  });
  const body = result.linear.of("create")[0].body;
  assert.equal(body.split("(no usable sentence from the judge)").length - 1, 2);
  assert.ok(body.includes("fine sentence on two lines"), "whitespace is collapsed");
  assert.ok(!body.includes("`backtick`"));
  assert.ok(!body.includes("x".repeat(401)));
  const control = report({ sentences: { 7001: "bell\u0007here", 7002: "ok", 7003: "ok too" } });
  assert.ok(!control.linear.of("create")[0].body.includes("\u0007"));
});

test("sentence files are deleted once everything is written, and kept when Linear fails", () => {
  const ok = report();
  assert.equal(ok.status, GATE_EXIT.open);
  assert.deepEqual(readdirSync(join(ok.work, "scenario-sentences")), []);
  const failed = report({ failOn: "create" });
  assert.equal(failed.status, GATE_EXIT.unknown);
  assert.equal(readdirSync(join(failed.work, "scenario-sentences")).length, 4);
});

test("a Linear that cannot be reached is exit 4: no comment after a failed issue, and nothing filed is hidden", () => {
  for (const failOn of ["list", "create"]) {
    const result = report({ failOn });
    assert.equal(result.status, GATE_EXIT.unknown, failOn);
    assert.equal(result.lines.length, 1);
    assert.match(result.verdict, /^UNKNOWN: /);
    assert.equal(result.linear.of("project-comment").length, 0, failOn);
  }
  const noComment = report({ failOn: "project-comment" });
  assert.equal(noComment.status, GATE_EXIT.unknown);
  assert.match(noComment.verdict, /KIT-901/, "the issue it did file is named");
  // Run again: the filed issue is found, so nothing is duplicated.
  const rerun = report({
    issues: [{ identifier: "KIT-901", title: FAILURE_A, state: "To-do", scenarioFailure: true }],
  });
  assert.equal(rerun.linear.of("create").length, 0);
});

test("report refuses a Holdout whose Scenario count differs from the run's, and writes nothing", () => {
  const result = report({ text: secretScenario(TITLE_A) });
  assert.equal(result.status, GATE_EXIT.usage);
  assert.match(result.verdict, /^MALFORMED: .*1 Scenario.*2/);
  assert.equal(result.linear.of("create").length + result.linear.of("project-comment").length, 0);
  const none = report({ text: null });
  assert.equal(none.status, GATE_EXIT.usage);
  assert.equal(none.linear.calls().length, 0);
  for (const secret of SECRET) assert.ok(!result.stdout.includes(secret));
});

test("report --dry-run reads Linear and the Holdout and writes nothing", () => {
  const result = report({ args: ["--dry-run"] });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  assert.equal(result.answer.dryRun, true);
  assert.deepEqual(result.answer.wouldFile, [FAILURE_A]);
  assert.equal(result.linear.of("create").length + result.linear.of("project-comment").length, 0);
  assert.equal(
    readdirSync(join(result.work, "scenario-sentences")).length,
    4,
    "dry-run keeps the sentence files",
  );
});

test("report usage: a bad sha, a bad verdict list, a missing flag or a repeated one is exit 2 and writes nothing", () => {
  const linear = fakeReportLinear();
  const base = [
    "report",
    ...MILESTONE,
    "--sha",
    SHA40,
    "--scenarios",
    "2",
    "--verdicts",
    FAIL_A_VERDICTS,
  ];
  const swap = (flag, value) => base.map((arg, i) => (base[i - 1] === flag ? value : arg));
  for (const argv of [
    swap("--sha", "abc"),
    swap("--verdicts", "1:n:7001"),
    swap("--verdicts", "1:x:7001"),
    base.slice(0, -2),
    [...base, "--sha", SHA40],
    [...base, "--other", "1"],
  ]) {
    const result = run(argv, { dir: holdout(TWO), env: linear.env });
    assert.equal(result.status, GATE_EXIT.usage, argv.join(" "));
    assert.match(result.verdict, /^USAGE: /);
  }
  assert.equal(linear.calls().length, 0);
});

// ---- check lets a re-run through when only the failure issues it filed are open ------------------

test("check: open failure issues of Milestone scenarios (title and footer) do not block a re-run", () => {
  const failure = (n, state = "To-do", extra = {}) => ({
    identifier: `KIT-${n}`,
    state,
    title: `Scenario not met: ${TITLE_A}`,
    scenarioFailure: true,
    ...extra,
  });
  const only = check({ issues: [done(1), failure(50), failure(51, "In Progress")] });
  assert.equal(only.status, GATE_EXIT.open, only.stdout);
  assert.equal(JSON.parse(only.verdict).sha, SHA40);
});

test("check: any other open issue still blocks, a failure-looking title or footer alone does not pass, and only the others are named", () => {
  const failure = {
    identifier: "KIT-50",
    state: "To-do",
    title: `Scenario not met: ${TITLE_A}`,
    scenarioFailure: true,
  };
  const blocked = check({ issues: [done(1), failure, done(2, "In Progress")] });
  assert.equal(blocked.status, GATE_EXIT.closed);
  assert.match(
    blocked.verdict,
    /^REFUSED: 1 issue of the milestone is not Done or Canceled: KIT-2 \(In Progress\)$/,
  );

  // Hand-written title without the footer, and the footer under another title, are ordinary open issues.
  for (const forged of [
    { ...failure, scenarioFailure: false },
    { ...failure, title: "Something else" },
    { identifier: "KIT-50", state: "To-do", title: `Scenario not met: ${TITLE_A}` },
  ]) {
    const result = check({ issues: [done(1), forged] });
    assert.equal(result.status, GATE_EXIT.closed, JSON.stringify(forged));
    assert.match(result.verdict, /KIT-50 \(To-do\)/);
  }
});

test("a sentence that quotes the Scenario (6 or more consecutive words of any section) is replaced, the marker reaches nothing", () => {
  const retold = {
    // The End state with its marker, whitespace and case changed.
    7001: `${SECRET[2]}   THE collection now shows ONE brand new Kit`,
    // Six words of the Actions without the marker.
    7002: "It failed because the Collector taps Add and then saves, then nothing.",
    // Five consecutive words only: still the judge's own sentence.
    7003: "Collector taps Add and then stalled.",
  };
  const result = report({ sentences: { ...SENTENCES, ...retold } });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  const body = result.linear.of("create")[0].body;
  assert.equal(body.split("(no usable sentence from the judge)").length - 1, 2);
  assert.ok(body.includes(retold[7003]));
  const everything = JSON.stringify(result.linear.calls()) + result.stdout + result.stderr;
  for (const secret of SECRET) assert.ok(!everything.includes(secret), `leaked ${secret}`);
  assert.ok(!everything.includes("taps Add and then saves"));
  assert.ok(!everything.includes("brand new Kit"));
});

test("no kc-report folder is left in the temp dir when Linear fails, or when everything works", () => {
  for (const failOn of ["create", "project-comment", null]) {
    const tmp = mkdtempSync(join(tmpdir(), "scenarios-tmp-"));
    report({ failOn, env: { TMPDIR: tmp } });
    assert.deepEqual(
      readdirSync(tmp).filter((name) => name.startsWith("kc-report-")),
      [],
      String(failOn),
    );
  }
});

test("the retelling filter compares the three section bodies only: a long title survives, a quote across numbered items does not", () => {
  const longTitle = "A new Collector adds their very first shirt";
  const text = `## ${longTitle}

### Starting situation

A Test Collector whose Collection is completely empty today.

### Actions

1. The Collector opens the Add screen
2. then picks a photo from the library
3. and saves it with the default name

### End state

The Collection now shows one brand new Kit.
`;
  const sentences = {
    7001: `Stuck early in "${longTitle}" before any photo.`,
    7002: "The Collector opens the Add screen then picks a photo and nothing happened.",
    // 6 words across items 2 and 3, numbers left out.
    7003: "It never got as far as picks a photo from the library and saves it.",
  };
  const result = report({
    text,
    scenarios: 1,
    verdicts: "1:n:7001,1:n:7002,1:n:7003",
    sentences,
    args: [],
  });
  assert.equal(result.status, GATE_EXIT.open, result.stdout);
  const body = result.linear.of("create")[0].body;
  assert.ok(body.includes(sentences[7001]), "a sentence naming the title was dropped");
  assert.ok(!body.includes("opens the Add screen"));
  assert.ok(!body.includes("picks a photo from the library"));
  assert.equal(body.split("(no usable sentence from the judge)").length - 1, 2);
});
