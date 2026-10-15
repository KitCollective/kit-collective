import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

function run(args, { dir, env } = {}) {
  const argv = [CLI, ...args];
  if (dir) argv.push("--dir", dir);
  const result = spawnSync(process.execPath, argv, {
    encoding: "utf8",
    env: { ...process.env, ...env },
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

/** A fake `gh` on PATH. `contents` answers the file read, `repo` the repo probe. */
function fakeGh({ contents, repo }) {
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
