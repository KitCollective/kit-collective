import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  dailyCap,
  diffLines,
  independentReviewer,
  killSwitch,
  maxPerDay,
  queueState,
  riskClass,
} from "../lib/auto-land.mjs";
import { append, readEvents, validateEvent } from "../lib/run-log.mjs";

/**
 * auto-land.mjs at its seam: a scratch repo with a bare origin, a fake `gh`, a fake `bb`, a fake
 * Linear CLI and a fake gate, all on PATH or named by env the way the neighbouring tests do. The
 * merge lock, the sync, the audit receipt and the run log are the REAL scripts, so a refusal here
 * is the script's own decision, never a relayed result.
 */
const CLI = fileURLToPath(new URL("../auto-land.mjs", import.meta.url));
const IDENT = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, env: { ...process.env, ...IDENT }, encoding: "utf8" }).trim();
const tmp = (name) => mkdtempSync(join(tmpdir(), `autoland-${name}-`));
const script = (dir, name, body) => {
  writeFileSync(join(dir, name), body);
  chmodSync(join(dir, name), 0o755);
};

const FAKE_GH = `#!/usr/bin/env node
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const dir = process.env.WORLD;
const args = process.argv.slice(2);
const state = () => JSON.parse(fs.readFileSync(dir + "/gh-state.json", "utf8"));
const save = (s) => fs.writeFileSync(dir + "/gh-state.json", JSON.stringify(s));
fs.appendFileSync(dir + "/gh-calls.log", args.join(" ") + "\\n");
const s = state();
const joined = args.join(" ");
if (args[0] === "pr" && args[1] === "view") {
  console.log(JSON.stringify(s.pr));
} else if (args[0] === "pr" && args[1] === "merge") {
  if (s.mergeFails) { console.error("GraphQL: merge queue refused"); process.exit(1); }
  console.log("enqueued");
} else if (args[0] === "api" && /check-runs/.test(joined)) {
  if (s.advanceOnChecks) {
    const clone = s.advanceOnChecks;
    fs.writeFileSync(clone + "/newfile.txt", "x\\n");
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    execFileSync("git", ["add", "-A"], { cwd: clone, env });
    execFileSync("git", ["commit", "-m", "lane moves"], { cwd: clone, env });
    execFileSync("git", ["push", "origin", "development"], { cwd: clone, env });
    s.advanceOnChecks = null; save(s);
  }
  console.log(JSON.stringify(s.checks));
} else if (args[0] === "api" && /\\/statuses\\//.test(joined)) {
  if (args.includes("-f")) {
    const field = (name) => args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
    s.statuses.push({ context: field("context"), state: field("state"), description: field("description") });
    save(s);
  }
  console.log("{}");
} else if (args[0] === "api" && /\\/statuses/.test(joined)) {
  console.log(JSON.stringify(s.statuses));
} else if (args[0] === "api" && /\\/commits\\//.test(joined)) {
  console.log(JSON.stringify({ date: "2020-01-01T00:00:00Z" }));
} else {
  console.error("fake gh: unhandled " + joined);
  process.exit(1);
}
`;

const FAKE_BB = `#!/bin/sh
case "$*" in
  *"thread show"*) echo '{"thread":{"id":"thr_rev12345","providerId":"claude-code","createdAt":1800000000000}}';;
  *"thread output"*) printf '%s' "{\\"output\\":$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(process.env.WORLD + "/bb-output.txt", "utf8")))')}";;
esac
`;

const FAKE_LINEAR = `const fs = require("node:fs");
const dir = process.env.WORLD;
const [cmd, issue, ...rest] = process.argv.slice(2);
const file = dir + "/linear-issue.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (cmd === "issue") {
  console.log(JSON.stringify(data));
} else {
  let line = [cmd, issue, ...rest].join(" ");
  if (cmd === "comment") line += " :: " + fs.readFileSync(rest[1], "utf8").replace(/\\n/g, " / ");
  fs.appendFileSync(dir + "/linear-writes.log", line + "\\n");
  if (cmd === "state") { data.state = rest[0]; fs.writeFileSync(file, JSON.stringify(data)); }
}
`;

const FAKE_GATE = `const fs = require("node:fs");
const [sub] = process.argv.slice(2);
const exit = Number(process.env["FAKE_GATE_" + sub.toUpperCase()] ?? 0);
fs.appendFileSync(process.env.WORLD + "/gate-calls.log", process.argv.slice(2).join(" ") + " KC_DRY_RUN=" + (process.env.KC_DRY_RUN ?? "") + "\\n");
console.log((exit === 0 ? "OPEN" : exit === 3 ? "WAITING" : "CLOSED") + " (" + sub + "): fake gate says " + exit);
process.exit(exit);
`;

/** The scratch repos are built once per distinct shape (git is the slow part) and copied for each test. */
const templates = new Map();
function repoWorld({ files, enabled, maxPerDayConfig }) {
  const key = JSON.stringify({ files, enabled, maxPerDayConfig });
  if (!templates.has(key)) {
    const dir = tmp("template");
    const origin = join(dir, "origin.git");
    mkdirSync(origin);
    git(origin, "init", "--bare", "-b", "development");
    const work = join(dir, "work");
    mkdirSync(work);
    git(work, "init", "-b", "development");
    writeFileSync(
      join(work, "factory.config.json"),
      JSON.stringify({
        github: { ownerRepo: "o/r" },
        lanes: { integration: "development" },
        flow: { autoLand: { enabled, ...(maxPerDayConfig ? { maxPerDay: maxPerDayConfig } : {}) } },
      }),
    );
    writeFileSync(join(work, ".gitignore"), ".factory/\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "init");
    git(work, "remote", "add", "origin", origin);
    git(work, "push", "origin", "development");
    git(work, "checkout", "-b", "kit-9-x");
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(work, path, ".."), { recursive: true });
      writeFileSync(join(work, path), text);
    }
    git(work, "add", "-A");
    git(work, "commit", "-m", "KIT-9: change");
    git(work, "push", "origin", "kit-9-x");
    templates.set(key, { dir, head: git(work, "rev-parse", "HEAD") });
  }
  const template = templates.get(key);
  const dir = tmp("world");
  cpSync(template.dir, dir, { recursive: true });
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  git(work, "remote", "set-url", "origin", origin);
  return { dir, origin, work, head: template.head };
}

/**
 * A repo whose branch `kit-9-x` changes `apps/web/src/a.ts`, a bare origin, and the fakes.
 * @param {{ files?: Record<string, string>, description?: string, labels?: string[],
 *   enabled?: boolean, maxPerDayConfig?: number, reviewer?: { model: string }, noReviewer?: boolean }} [o]
 */
function world({
  files = { "apps/web/src/a.ts": "export const a = 1;\n" },
  description = "write-scope: apps/web/**\n\n## Seams\nnone",
  labels = ["ready-for-agent"],
  enabled = true,
  maxPerDayConfig,
  reviewerModel = "claude-opus-5-5",
  noReviewer = false,
} = {}) {
  const { dir, origin, work, head } = repoWorld({ files, enabled, maxPerDayConfig });

  const bin = join(dir, "bin");
  mkdirSync(bin);
  script(bin, "gh", FAKE_GH);
  script(bin, "bb", FAKE_BB);
  script(dir, "linear.js", FAKE_LINEAR);
  script(dir, "gate.js", FAKE_GATE);
  writeFileSync(
    join(dir, "gh-state.json"),
    JSON.stringify({
      pr: {
        state: "OPEN",
        headRefOid: head,
        headRefName: "kit-9-x",
        baseRefName: "development",
        mergeable: "MERGEABLE",
        isDraft: false,
        isCrossRepository: false,
        autoMergeRequest: null,
        title: "KIT-9: change",
        body: "write-scope: apps/web/**",
        mergeCommit: null,
      },
      checks: [{ name: "test", conclusion: "success" }],
      statuses: [],
    }),
  );
  writeFileSync(
    join(dir, "linear-issue.json"),
    JSON.stringify({
      identifier: "KIT-9",
      state: "In Review",
      labels,
      description,
      blockedBy: [],
      comments: [],
    }),
  );
  writeFileSync(join(dir, "bb-output.txt"), `done\nAUDIT-RESULT KIT-9 green ${head}`);
  const log = join(dir, "run-log.jsonl");
  const spawn = (extra) => append({ event: "spawn", issue: "KIT-9", ...extra }, { path: log });
  spawn({
    step: "engineer",
    thread: "thr_eng12345",
    provider: "claude-code",
    model: "claude-sonnet-5-5",
  });
  if (!noReviewer) {
    spawn({
      step: "reviewer",
      thread: "thr_rev12345",
      provider: "claude-code",
      model: reviewerModel,
    });
  }

  const w = {
    dir,
    work,
    origin,
    head,
    log,
    bin,
    ghState: () => JSON.parse(readFileSync(join(dir, "gh-state.json"), "utf8")),
    setGh: (fn) => {
      const s = JSON.parse(readFileSync(join(dir, "gh-state.json"), "utf8"));
      fn(s);
      writeFileSync(join(dir, "gh-state.json"), JSON.stringify(s));
    },
    setLinear: (fn) => {
      const s = JSON.parse(readFileSync(join(dir, "linear-issue.json"), "utf8"));
      fn(s);
      writeFileSync(join(dir, "linear-issue.json"), JSON.stringify(s));
    },
    read: (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : ""),
    events: () => readEvents(log),
    lockOnOrigin: () => git(work, "ls-remote", "origin", "refs/factory/merge-lock"),
    run: (args, env = {}) =>
      spawnSync("node", [CLI, ...args], {
        cwd: work,
        encoding: "utf8",
        env: {
          ...process.env,
          ...IDENT,
          PATH: `${bin}:${process.env.PATH}`,
          WORLD: dir,
          KC_RUN_LOG: log,
          KC_LINEAR_CLI: join(dir, "linear.js"),
          KC_GATE_CLI: join(dir, "gate.js"),
          AUTO_LAND_POLL_SECONDS: "0",
          ...env,
        },
      }),
    start: (extra = [], env = {}) => w.run(["start", "12", "--issue", "KIT-9", ...extra], env),
  };
  return w;
}

const refusedWith = (result, code) => {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`^REFUSED \\(auto-land\\): ${code}:`));
};
const noEffects = (w) => {
  assert.equal(w.read("linear-writes.log"), "", "no Linear write");
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/, "no merge call");
  assert.equal(w.lockOnOrigin(), "", "no lock taken");
};

// ---- the happy path, and a dry run that changes nothing ----------------------------------------------

test("happy path: every check holds, the receipt is posted, Merging is set, the PR is enqueued, the start is logged", () => {
  const w = world();
  const result = w.start();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^ENQUEUED \(auto-land\): PR 12 at /);
  const calls = w.read("gh-calls.log");
  assert.match(calls, /pr merge 12 --merge --auto/);
  assert.ok(w.ghState().statuses.some((s) => s.context === "kc/audit" && s.state === "success"));
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Merging/);
  assert.match(writes, /comment KIT-9 .*Auto-approved: risk low/);
  assert.ok(
    w.events().some((e) => e.event === "auto-land" && e.outcome === "start" && e.sha === w.head),
  );
  assert.ok(
    w.events().some((e) => e.event === "audit" && e.verdict === "green" && e.sha === w.head),
  );
  assert.match(w.lockOnOrigin(), /refs\/factory\/merge-lock/);
  // The order matters: the receipt before the gate, the lock before the Linear write, the write before the enqueue.
  assert.ok(calls.indexOf("/statuses/") < calls.indexOf("pr merge"));
});

test("a mobile issue passes with no-device-needed, and the config switch passes with --force-enabled", () => {
  const w = world({
    labels: ["ready-for-agent", "surface:mobile", "no-device-needed"],
    enabled: false,
  });
  const result = w.start(["--dry-run", "--force-enabled"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^WOULD ENQUEUE/);
});

test("--dry-run runs every check and changes nothing: no receipt, no lock, no Linear write, no enqueue, no log line", () => {
  const w = world();
  const before = readFileSync(w.log, "utf8");
  const result = w.start(["--dry-run"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^WOULD ENQUEUE \(auto-land\): .*nothing was changed/);
  noEffects(w);
  assert.equal(w.ghState().statuses.length, 0, "no kc/audit status posted");
  assert.doesNotMatch(w.read("gh-calls.log"), /-f state=/);
  assert.equal(readFileSync(w.log, "utf8"), before, "the run log is byte-for-byte unchanged");
  assert.match(w.read("gate-calls.log"), /review 12 --issue KIT-9 --timeout \d+ KC_DRY_RUN=1/);
});

test("--dry-run refuses like the real run does (a high-risk issue)", () => {
  const w = world({
    description: "write-scope: packages/db/**",
    files: { "packages/db/x.ts": "1\n" },
  });
  refusedWith(w.start(["--dry-run"]), "needs-human");
  noEffects(w);
});

// ---- the kill switch, three ways ----------------------------------------------------------------------

test("kill switch 1: the file .factory/auto-land.off in the main checkout, even with --force-enabled", () => {
  const w = world();
  mkdirSync(join(w.work, ".factory"), { recursive: true });
  writeFileSync(join(w.work, ".factory", "auto-land.off"), "");
  const result = w.start(["--force-enabled"]);
  refusedWith(result, "kill-switch");
  assert.match(result.stdout, /auto-land\.off/);
  noEffects(w);
});

test("kill switch 2: the label hold", () => {
  const w = world({ labels: ["ready-for-agent", "hold"] });
  const result = w.start(["--force-enabled"]);
  refusedWith(result, "kill-switch");
  assert.match(result.stdout, /hold/);
  noEffects(w);
});

test("kill switch 3: flow.autoLand.enabled false without --force-enabled", () => {
  const w = world({ enabled: false });
  const result = w.start();
  refusedWith(result, "kill-switch");
  assert.match(result.stdout, /flow\.autoLand\.enabled is false/);
  noEffects(w);
});

test("the enabled subcommand reads the config and the kill file, and only an exact line means on", () => {
  const on = world();
  const first = on.run(["enabled"]);
  assert.equal(first.status, 0);
  assert.equal(first.stdout.trim(), "AUTO-LAND ON");
  mkdirSync(join(on.work, ".factory"), { recursive: true });
  writeFileSync(join(on.work, ".factory", "auto-land.off"), "");
  assert.equal(on.run(["enabled"]).status, 1);
  const off = world({ enabled: false });
  const second = off.run(["enabled"]);
  assert.equal(second.status, 1);
  assert.match(second.stdout, /^AUTO-LAND OFF: flow\.autoLand\.enabled is false/);
});

// ---- the PR, the issue ---------------------------------------------------------------------------------

test("refuses when the checkout head is not the PR head", () => {
  const w = world();
  w.setGh((s) => {
    s.pr.headRefOid = "b".repeat(40);
  });
  refusedWith(w.start(), "head-mismatch");
  noEffects(w);
});

test("refuses a PR that already has auto-merge, is not MERGEABLE, is not open", () => {
  for (const [patch, text] of [
    [{ autoMergeRequest: { enabledAt: "now" } }, /auto-merge is already enabled/],
    [{ mergeable: "CONFLICTING" }, /CONFLICTING/],
    [{ state: "MERGED" }, /MERGED/],
  ]) {
    const w = world();
    w.setGh((s) => Object.assign(s.pr, patch));
    const result = w.start();
    refusedWith(result, "pr-not-ready");
    assert.match(result.stdout, text);
    noEffects(w);
  }
});

test("refuses an issue that is not In Review (Approval means a person must act), has a stop label or an open blocker", () => {
  const cases = [
    [(i) => (i.state = "Approval"), "issue-not-ready"],
    [(i) => i.labels.push("signal-up"), "hold-label"],
    [(i) => i.labels.push("wontfix"), "hold-label"],
    [(i) => i.labels.push("ready-for-human"), "hold-label"],
    [(i) => (i.blockedBy = [{ identifier: "KIT-1", state: "In Progress" }]), "blocked-by"],
  ];
  for (const [patch, code] of cases) {
    const w = world();
    w.setLinear(patch);
    refusedWith(w.start(), code);
    noEffects(w);
  }
});

// ---- the risk class ------------------------------------------------------------------------------------

test("refuses a high-risk issue as needs-human, however green everything else is", () => {
  const w = world({
    description: "write-scope: packages/db/**, apps/web/**",
    files: { "packages/db/schema.ts": "1\n" },
  });
  refusedWith(w.start(), "needs-human");
  noEffects(w);
});

test("refuses a diff that touches a workflow or a factory script even when the scope names it", () => {
  const w = world({
    description: "write-scope: scripts/gate.mjs",
    files: { "scripts/gate.mjs": "// edited\n" },
  });
  refusedWith(w.start(), "needs-human");
  noEffects(w);
});

test("refuses surface:mobile unless no-device-needed", () => {
  const w = world({ labels: ["ready-for-agent", "surface:mobile"] });
  const result = w.start();
  refusedWith(result, "needs-human");
  assert.match(result.stdout, /surface:mobile/);
  noEffects(w);
});

test("refuses a diff over 400 changed lines", () => {
  const w = world({ files: { "apps/web/src/big.ts": `${"x\n".repeat(401)}` } });
  const result = w.start();
  refusedWith(result, "oversize-diff");
  assert.match(result.stdout, /401 lines/);
  noEffects(w);
});

test("refuses a file outside the issue's write-scope, and an issue with no write-scope", () => {
  const out = world({
    files: { "apps/web/src/a.ts": "1\n", "apps/admin/src/b.ts": "2\n" },
  });
  const result = out.start();
  refusedWith(result, "out-of-scope");
  assert.match(result.stdout, /apps\/admin\/src\/b\.ts/);
  noEffects(out);
  const none = world({ description: "no scope here" });
  refusedWith(none.start(), "out-of-scope");
  noEffects(none);
});

// ---- the reviewer and the receipt ----------------------------------------------------------------------

test("refuses when the run log has no spawn reviewer for the issue", () => {
  const w = world({ noReviewer: true });
  refusedWith(w.start(), "no-independent-reviewer");
  assert.equal(w.ghState().statuses.length, 0, "no receipt posted without a reviewer");
  noEffects(w);
});

test("refuses a reviewer on the same provider and model as an engineer", () => {
  const w = world({ reviewerModel: "claude-sonnet-5-5" });
  refusedWith(w.start(), "same-model-reviewer");
  assert.equal(w.ghState().statuses.length, 0);
  noEffects(w);
});

test("refuses a stale audit: the reviewer thread audited another head", () => {
  const w = world();
  writeFileSync(join(w.dir, "bb-output.txt"), `AUDIT-RESULT KIT-9 green ${"c".repeat(40)}`);
  const result = w.start();
  refusedWith(result, "stale-audit");
  assert.equal(w.ghState().statuses.length, 0, "the receipt refused, nothing was posted");
  noEffects(w);
});

test("refuses when kc/audit is already green but the run log has no green audit for this head", () => {
  const w = world();
  w.setGh((s) =>
    s.statuses.push({ context: "kc/audit", state: "success", description: "by hand" }),
  );
  append(
    { event: "audit", issue: "KIT-9", verdict: "green", round: 1, sha: "d".repeat(40) },
    { path: w.log },
  );
  refusedWith(w.start(), "stale-audit");
  noEffects(w);
});

test("an audit the reviewer wrote as red is refused, not posted green", () => {
  const w = world();
  writeFileSync(join(w.dir, "bb-output.txt"), `AUDIT-RESULT KIT-9 red ${w.head} spec-ac`);
  const result = w.start();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^REFUSED \(auto-land\): (receipt-refused|stale-audit)/);
  noEffects(w);
});

// ---- the gate, the cap, the sync -----------------------------------------------------------------------

test("a gate that is still waiting is exit 3 with nothing logged, written or enqueued", () => {
  const w = world();
  const before = readFileSync(w.log, "utf8");
  const result = w.start([], { FAKE_GATE_REVIEW: "3" });
  assert.equal(result.status, 3, result.stdout);
  assert.match(result.stdout, /^WAITING \(auto-land\)/);
  assert.equal(readFileSync(w.log, "utf8").startsWith(before), true);
  assert.equal(w.events().filter((e) => e.event === "auto-land").length, 0);
  assert.equal(w.read("linear-writes.log"), "");
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
});

test("a closed gate is refused as review-gate-closed", () => {
  const w = world();
  const result = w.start([], { FAKE_GATE_REVIEW: "1" });
  refusedWith(result, "review-gate-closed");
  assert.equal(w.read("linear-writes.log"), "");
  assert.equal(w.lockOnOrigin(), "");
});

test("the daily cap: the sixth start in 24 hours is refused; older ones do not count; the config overrides the constant", () => {
  const w = world();
  for (let i = 0; i < 5; i += 1) {
    append(
      { event: "auto-land", issue: `KIT-${100 + i}`, outcome: "start", sha: "e".repeat(40) },
      { path: w.log },
    );
  }
  refusedWith(w.start(), "daily-cap");
  noEffects(w);

  const old = world();
  for (let i = 0; i < 5; i += 1) {
    append(
      { event: "auto-land", issue: `KIT-${100 + i}`, outcome: "start", sha: "e".repeat(40) },
      { path: old.log, now: new Date(Date.now() - 25 * 3600 * 1000) },
    );
  }
  assert.equal(old.start(["--dry-run"]).status, 0, "25 hours ago is outside the window");

  const one = world({ maxPerDayConfig: 1 });
  append(
    { event: "auto-land", issue: "KIT-100", outcome: "start", sha: "e".repeat(40) },
    { path: one.log },
  );
  refusedWith(one.start(), "daily-cap");
});

test("a lock held by another PR is waiting, not a merge", () => {
  const w = world();
  const other = tmp("other");
  git(other, "clone", w.origin, ".");
  execFileSync(
    "node",
    [fileURLToPath(new URL("../merge-lock.mjs", import.meta.url)), "take", "99"],
    {
      cwd: other,
      env: { ...process.env, ...IDENT },
    },
  );
  const result = w.start();
  assert.equal(result.status, 3, result.stdout);
  assert.match(result.stdout, /lock-held/);
  assert.equal(w.read("linear-writes.log"), "");
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
});

test("refuses when the branch is behind the lane, before anything is posted", () => {
  const w = world();
  const other = tmp("lane");
  git(other, "clone", w.origin, ".");
  git(other, "checkout", "development");
  writeFileSync(join(other, "later.txt"), "x\n");
  git(other, "add", "-A");
  git(other, "commit", "-m", "lane moves");
  git(other, "push", "origin", "development");
  refusedWith(w.start(), "sync-changed-head");
  noEffects(w);
});

test("refuses, with the lock given back, when the sync changes the head (the audit would be for another head)", () => {
  const w = world();
  const other = tmp("lane2");
  git(other, "clone", w.origin, ".");
  git(other, "checkout", "development");
  // The lane moves while the gate runs: the fake gh does it when the check runs are read.
  w.setGh((s) => {
    s.advanceOnChecks = other;
  });
  const result = w.start();
  refusedWith(result, "sync-changed-head");
  assert.equal(w.lockOnOrigin(), "", "the lock was released");
  assert.equal(w.read("linear-writes.log"), "", "Merging was never set");
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
  assert.equal(
    w.events().filter((e) => e.event === "auto-land" && e.outcome === "start").length,
    0,
  );
});

test("a refusal with --handoff asks a person in Linear; a dry run never does", () => {
  const w = world({ labels: ["ready-for-agent", "surface:mobile"] });
  const result = w.start(["--handoff"]);
  refusedWith(result, "needs-human");
  const writes = w.read("linear-writes.log");
  assert.match(writes, /label KIT-9 swap ready-for-agent ready-for-human/);
  assert.match(writes, /state KIT-9 Approval/);
  assert.match(writes, /comment KIT-9 .*Auto-land refused \(needs-human\)/);
  assert.ok(
    w
      .events()
      .some((e) => e.event === "auto-land" && e.outcome === "refused" && e.code === "needs-human"),
  );
  const dry = world({ labels: ["ready-for-agent", "surface:mobile"] });
  refusedWith(dry.start(["--handoff", "--dry-run"]), "needs-human");
  assert.equal(dry.read("linear-writes.log"), "");
});

test("a failed enqueue is the alarm: lock released, Approval with ready-for-human, a comment, a logged reason", () => {
  const w = world();
  w.setGh((s) => {
    s.mergeFails = true;
  });
  const result = w.start();
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^ALARM \(auto-land\): enqueue-failed/);
  assert.equal(w.lockOnOrigin(), "");
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Merging/);
  assert.match(writes, /state KIT-9 Approval/);
  assert.match(writes, /label KIT-9 swap ready-for-agent ready-for-human/);
  assert.ok(
    w
      .events()
      .some((e) => e.event === "auto-land" && e.outcome === "alarm" && e.code === "enqueue-failed"),
  );
});

// ---- finish --------------------------------------------------------------------------------------------

/** A world after a successful start: Merging, the lock held by PR 12, the start in the log. */
function started(patchPr = {}) {
  const w = world();
  assert.equal(w.start().status, 0);
  w.setGh((s) => Object.assign(s.pr, patchPr));
  return w;
}
const MERGE_SHA = "f".repeat(40);

test("finish: merged and integration green -> land gate, Done with the merge SHA, lock released, branch reaped", () => {
  const w = started({ state: "MERGED", mergeCommit: { oid: MERGE_SHA } });
  const result = w.run(["finish", "12", "--issue", "KIT-9"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^LANDED \(auto-land\): PR 12 merged as fffffff/);
  assert.match(w.read("gate-calls.log"), /land 12 --issue KIT-9/);
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Post-Merge/);
  assert.match(writes, new RegExp(`comment KIT-9 .*${MERGE_SHA}`));
  assert.match(writes, /state KIT-9 Done/);
  assert.equal(w.lockOnOrigin(), "", "the lock is released");
  assert.equal(
    git(w.work, "ls-remote", "--heads", "origin", "kit-9-x"),
    "",
    "the merged branch is deleted",
  );
  assert.ok(w.events().some((e) => e.event === "auto-land" && e.outcome === "landed"));
});

test("finish: still in the queue is waiting (exit 3); nothing is written", () => {
  const w = started({ autoMergeRequest: { enabledAt: "now" } });
  const result = w.run(["finish", "12", "--issue", "KIT-9", "--timeout", "1"], {
    AUTO_LAND_POLL_SECONDS: "5",
  });
  assert.equal(result.status, 3, result.stdout);
  assert.match(result.stdout, /^WAITING \(auto-land\)/);
  assert.doesNotMatch(w.read("linear-writes.log"), /Approval|Done/);
  assert.match(w.lockOnOrigin(), /merge-lock/, "the lock is kept while waiting");
});

test("finish: merged but integration checks still running is waiting too", () => {
  const w = started({ state: "MERGED", mergeCommit: { oid: MERGE_SHA } });
  const result = w.run(["finish", "12", "--issue", "KIT-9", "--timeout", "1"], {
    AUTO_LAND_POLL_SECONDS: "5",
    FAKE_GATE_LAND: "3",
  });
  assert.equal(result.status, 3, result.stdout);
  assert.doesNotMatch(w.read("linear-writes.log"), /Done/);
});

test("finish alarm: the queue ejected the PR (open, auto-merge off, not in the queue)", () => {
  const w = started({ autoMergeRequest: null, isInMergeQueue: false });
  const result = w.run(["finish", "12", "--issue", "KIT-9"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^ALARM \(auto-land\): queue-ejected/);
  assert.equal(w.lockOnOrigin(), "", "the lock is released");
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Approval/);
  assert.match(writes, /label KIT-9 swap ready-for-agent ready-for-human/);
  assert.match(writes, /comment KIT-9 .*queue-ejected/);
  assert.doesNotMatch(writes, /state KIT-9 Done/);
  assert.ok(
    w
      .events()
      .some((e) => e.event === "auto-land" && e.outcome === "alarm" && e.code === "queue-ejected"),
  );
});

test("finish alarm: the PR was closed without merging", () => {
  const w = started({ state: "CLOSED" });
  const result = w.run(["finish", "12", "--issue", "KIT-9"]);
  assert.match(result.stdout, /^ALARM \(auto-land\): queue-ejected/);
  assert.equal(w.lockOnOrigin(), "");
});

test("finish alarm: integration CI is red on the merge commit", () => {
  const w = started({ state: "MERGED", mergeCommit: { oid: MERGE_SHA } });
  const result = w.run(["finish", "12", "--issue", "KIT-9"], { FAKE_GATE_LAND: "1" });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^ALARM \(auto-land\): integration-red/);
  assert.equal(w.lockOnOrigin(), "");
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Approval/);
  assert.doesNotMatch(writes, /state KIT-9 Done/);
  assert.ok(w.events().some((e) => e.event === "auto-land" && e.code === "integration-red"));
});

test("finish only follows a start: no start in the run log, or an issue in another state, is refused", () => {
  const none = world();
  none.setLinear((i) => (i.state = "Merging"));
  const result = none.run(["finish", "12", "--issue", "KIT-9"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /no auto-land start/);
  const wrong = world();
  assert.match(wrong.run(["finish", "12", "--issue", "KIT-9"]).stdout, /issue-not-ready/);
});

// ---- the pure decisions --------------------------------------------------------------------------------

test("run-log accepts the auto-land event and its codes, and refuses an unknown outcome", () => {
  assert.deepEqual(
    validateEvent({ event: "auto-land", issue: "KIT-9", outcome: "start", sha: "a".repeat(40) }),
    [],
  );
  assert.deepEqual(
    validateEvent({ event: "auto-land", issue: "KIT-9", outcome: "refused", code: "daily-cap" }),
    [],
  );
  assert.ok(validateEvent({ event: "auto-land", issue: "KIT-9", outcome: "open" }).length > 0);
});

test("killSwitch, maxPerDay, diffLines, queueState, independentReviewer and dailyCap on plain data", () => {
  assert.equal(
    killSwitch({ labels: [], killFile: false, enabled: true, forceEnabled: false }),
    null,
  );
  assert.equal(
    killSwitch({ labels: [], killFile: false, enabled: false, forceEnabled: true }),
    null,
  );
  assert.equal(
    killSwitch({ labels: ["HOLD"], killFile: false, enabled: true, forceEnabled: true }).code,
    "kill-switch",
  );
  assert.equal(maxPerDay({}), 5);
  assert.equal(maxPerDay({ flow: { autoLand: { maxPerDay: 2 } } }), 2);
  assert.equal(maxPerDay({ flow: { autoLand: { maxPerDay: 0 } } }), 5);
  assert.equal(diffLines("3\t4\ta\n-\t-\timg.png\n"), 7 + 400);
  assert.equal(
    queueState({ state: "OPEN", autoMergeRequest: null, isInMergeQueue: true }),
    "queued",
  );
  assert.equal(queueState({ state: "OPEN", autoMergeRequest: null }), "not-queued");
  const events = [
    {
      event: "spawn",
      issue: "KIT-1",
      step: "engineer",
      thread: "thr_aaaa1",
      provider: "p",
      model: "m1",
    },
    {
      event: "spawn",
      issue: "KIT-1",
      step: "reviewer",
      thread: "thr_bbbb1",
      provider: "p",
      model: "m2",
    },
  ];
  assert.equal(independentReviewer(events, "KIT-1").reviewer.thread, "thr_bbbb1");
  assert.equal(independentReviewer(events, "KIT-2").code, "no-independent-reviewer");
  assert.equal(dailyCap([], 5), null);
  assert.equal(
    riskClass({ description: "write-scope: a/**", labels: [], files: ["a/x"], lines: 1 }),
    null,
  );
});
