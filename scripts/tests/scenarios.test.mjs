import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_EXIT } from "../lib/gates.mjs";
import { slug } from "../lib/scenarios.mjs";

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

test("the guard lets a lone `titles --issue` through and still denies it when chained", () => {
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
