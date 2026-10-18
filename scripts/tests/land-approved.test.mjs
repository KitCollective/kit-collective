import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
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
import { handOverLabel, startDecision, verdict } from "../lib/land-approved.mjs";

/**
 * land-approved.mjs at its seam: a scratch checkout with its own factory.config.json, a fake `gh`
 * on PATH, a fake Linear CLI and a fake land gate named by env, as auto-land.test.mjs does.
 */
const CLI = fileURLToPath(new URL("../land-approved.mjs", import.meta.url));
const script = (dir, name, body) => {
  writeFileSync(join(dir, name), body);
  chmodSync(join(dir, name), 0o755);
};

const FAKE_GH = `#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.WORLD;
const args = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(dir + "/gh-state.json", "utf8"));
const save = () => fs.writeFileSync(dir + "/gh-state.json", JSON.stringify(s));
fs.appendFileSync(dir + "/gh-calls.log", args.join(" ") + "\\n");
const joined = args.join(" ");
if (args[0] === "pr" && args[1] === "view") {
  const fields = (args[args.indexOf("--json") + 1] || "").split(",");
  if (fields.includes("isInMergeQueue")) {
    console.error('Unknown JSON field: "isInMergeQueue"');
    process.exit(1);
  }
  console.log(JSON.stringify(Object.fromEntries(fields.map((field) => [field, s.pr[field] ?? null]))));
} else if (args[0] === "api" && args[1] === "graphql" && /isInMergeQueue/.test(joined)) {
  console.log(JSON.stringify({ data: { repository: { pullRequest: { isInMergeQueue: s.pr.isInMergeQueue === true } } } }));
} else if (args[0] === "pr" && args[1] === "merge") {
  if (s.mergeFails) { console.error("GraphQL: merge queue refused"); process.exit(1); }
  s.pr.autoMergeRequest = { enabledAt: "now" }; save();
  console.log("enqueued");
} else if (args[0] === "api" && /check-runs/.test(joined)) {
  console.log(JSON.stringify([{ total_count: s.checks.length, check_runs: s.checks }]));
} else {
  console.error("fake gh: unhandled " + joined);
  process.exit(1);
}
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
  if ((process.env.FAKE_LINEAR_FAIL ?? "").split(",").includes(cmd)) {
    console.error("fake linear: " + cmd + " failed");
    process.exit(1);
  }
  fs.appendFileSync(dir + "/linear-writes.log", line + "\\n");
  if (cmd === "state") { data.state = rest[0]; fs.writeFileSync(file, JSON.stringify(data)); }
}
`;

const FAKE_GATE = `const fs = require("node:fs");
const [sub] = process.argv.slice(2);
const exit = Number(process.env["FAKE_GATE_" + sub.toUpperCase()] ?? 0);
fs.appendFileSync(process.env.WORLD + "/gate-calls.log", process.argv.slice(2).join(" ") + "\\n");
console.log((exit === 0 ? "OPEN" : exit === 3 ? "WAITING" : "CLOSED") + " (" + sub + "): fake gate says " + exit);
process.exit(exit);
`;

const HEAD = "a".repeat(40);
const MERGE_SHA = "f".repeat(40);

/** A checkout, the fakes and an issue in `state` whose PR 12 is open, MERGEABLE and green. */
function world({ state = "Merging", labels = ["ready-for-agent"] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "land-approved-"));
  const work = join(dir, "work");
  mkdirSync(work);
  execFileSync("git", ["init", "-q", "-b", "development"], { cwd: work });
  writeFileSync(
    join(work, "factory.config.json"),
    JSON.stringify({ github: { ownerRepo: "o/r" }, lanes: { integration: "development" } }),
  );
  const bin = join(dir, "bin");
  mkdirSync(bin);
  script(bin, "gh", FAKE_GH);
  script(dir, "linear.js", FAKE_LINEAR);
  script(dir, "gate.js", FAKE_GATE);
  writeFileSync(
    join(dir, "gh-state.json"),
    JSON.stringify({
      pr: {
        state: "OPEN",
        headRefOid: HEAD,
        baseRefName: "development",
        mergeable: "MERGEABLE",
        autoMergeRequest: null,
        mergeCommit: null,
      },
      checks: [{ name: "test", conclusion: "success" }],
    }),
  );
  writeFileSync(
    join(dir, "linear-issue.json"),
    JSON.stringify({ identifier: "KIT-9", state, labels }),
  );
  const w = {
    dir,
    setGh: (fn) => {
      const s = JSON.parse(readFileSync(join(dir, "gh-state.json"), "utf8"));
      fn(s);
      writeFileSync(join(dir, "gh-state.json"), JSON.stringify(s));
    },
    read: (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : ""),
    run: (args, env = {}) =>
      spawnSync("node", [CLI, ...args], {
        cwd: work,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          WORLD: dir,
          KC_LINEAR_CLI: join(dir, "linear.js"),
          KC_GATE_CLI: join(dir, "gate.js"),
          LAND_APPROVED_POLL_SECONDS: "0",
          ...env,
        },
      }),
    start: (env) => w.run(["start", "12", "--issue", "KIT-9"], env),
    finish: (extra = [], env = {}) => w.run(["finish", "12", "--issue", "KIT-9", ...extra], env),
    stop: (reason, env = {}) => w.run(["stop", "12", "--issue", "KIT-9", "--reason", reason], env),
  };
  return w;
}

const handedOver = (w, code) => {
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Approval/);
  assert.match(writes, /label KIT-9 swap ready-for-agent ready-for-human/);
  assert.match(writes, new RegExp(`comment KIT-9 .*Landing stopped \\(${code}\\)`));
  assert.doesNotMatch(writes, /state KIT-9 Done/);
};

// ---- start ---------------------------------------------------------------------------------------------

test("start enqueues a Merging issue's PR once through the merge gate", () => {
  const w = world();
  const result = w.start();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^QUEUED \(land-approved\): PR 12 /);
  const merges = w.read("gh-calls.log").match(/pr merge 12 --merge --auto --repo o\/r/g) ?? [];
  assert.equal(merges.length, 1);
  assert.equal(w.read("linear-writes.log"), "", "start writes nothing to Linear");
});

test("start never enqueues an issue that is not Merging, and writes nothing", () => {
  const w = world({ state: "Approval" });
  const result = w.start();
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^REFUSED \(land-approved\): issue-not-merging: KIT-9 is Approval/);
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
  assert.equal(w.read("linear-writes.log"), "");
});

test("start on a PR that is already queued or merged says queued and enqueues nothing again", () => {
  for (const patch of [{ autoMergeRequest: { enabledAt: "now" } }, { state: "MERGED" }]) {
    const w = world();
    w.setGh((s) => Object.assign(s.pr, patch));
    const result = w.start();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^QUEUED \(land-approved\)/);
    assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
  }
});

test("start finds a PR the merge queue already holds without an auto-merge request, and enqueues nothing", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { autoMergeRequest: null, isInMergeQueue: true }));
  const result = w.start();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^QUEUED \(land-approved\): PR 12 is already in the merge queue/);
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
});

test("start waits (exit 3) while checks run on the head, and writes nothing", () => {
  const w = world();
  w.setGh((s) => (s.checks = [{ name: "test", conclusion: null }]));
  const result = w.run(["start", "12", "--issue", "KIT-9", "--timeout", "1"], {
    LAND_APPROVED_POLL_SECONDS: "5",
  });
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /^WAITING \(land-approved\): approved: /);
  assert.doesNotMatch(w.read("gh-calls.log"), /pr merge/);
  assert.equal(w.read("linear-writes.log"), "");
});

test("start hands a refused enqueue to a person: Approval, ready-for-human, the reason", () => {
  const w = world();
  w.setGh((s) => (s.mergeFails = true));
  const result = w.start();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^STOPPED \(land-approved\): enqueue-failed: /);
  handedOver(w, "enqueue-failed");
});

test("start hands a closed or conflicting PR to a person", () => {
  for (const [patch, code] of [
    [{ state: "CLOSED" }, "pr-closed"],
    [{ mergeable: "CONFLICTING" }, "conflict"],
  ]) {
    const w = world();
    w.setGh((s) => Object.assign(s.pr, patch));
    const result = w.start();
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, new RegExp(`^STOPPED \\(land-approved\\): ${code}: `));
    handedOver(w, code);
  }
});

// ---- finish --------------------------------------------------------------------------------------------

test("finish: merged to Done: Post-Merge, the land gate, one comment with the merge SHA, then Done", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { state: "MERGED", mergeCommit: { oid: MERGE_SHA } }));
  const result = w.finish();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^LANDED \(land-approved\): PR 12 merged as fffffff/);
  assert.match(w.read("gate-calls.log"), /land 12 --issue KIT-9/);
  const writes = w.read("linear-writes.log").trim().split("\n");
  assert.equal(writes.length, 3, writes.join("\n"));
  assert.match(writes[0], /^state KIT-9 Post-Merge$/);
  assert.match(writes[1], new RegExp(`^comment KIT-9 .*${MERGE_SHA}`));
  assert.match(writes[2], /^state KIT-9 Done$/);
});

test("finish: ejected from the queue (open, not queued on two polls) goes to a person", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { autoMergeRequest: null, isInMergeQueue: false }));
  const result = w.finish();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^STOPPED \(land-approved\): queue-ejected: /);
  assert.equal((w.read("gh-calls.log").match(/pr view/g) ?? []).length, 2, "two polls");
  handedOver(w, "queue-ejected");
});

test("finish: a PR closed without merging goes to a person", () => {
  const w = world();
  w.setGh((s) => (s.pr.state = "CLOSED"));
  const result = w.finish();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^STOPPED \(land-approved\): queue-ejected: /);
  handedOver(w, "queue-ejected");
});

test("finish: a red integration check (the land gate closed) goes to a person after Post-Merge", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { state: "MERGED", mergeCommit: { oid: MERGE_SHA } }));
  const result = w.finish([], { FAKE_GATE_LAND: "1" });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /^STOPPED \(land-approved\): integration-red: CLOSED \(land\)/);
  assert.match(w.read("linear-writes.log"), /state KIT-9 Post-Merge/);
  handedOver(w, "integration-red");
});

test("finish: a land gate still waiting leaves the issue in Post-Merge (exit 3), no person asked", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { state: "MERGED", mergeCommit: { oid: MERGE_SHA } }));
  const result = w.finish(["--timeout", "1"], {
    FAKE_GATE_LAND: "3",
    LAND_APPROVED_POLL_SECONDS: "5",
  });
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /^WAITING \(land-approved\): merged: PR 12 merged as fffffff/);
  const writes = w.read("linear-writes.log");
  assert.match(writes, /state KIT-9 Post-Merge/);
  assert.doesNotMatch(writes, /Approval|Done|comment/);
  // The next slice does not set Post-Merge again.
  w.finish(["--timeout", "1"], { FAKE_GATE_LAND: "3", LAND_APPROVED_POLL_SECONDS: "5" });
  assert.equal((w.read("linear-writes.log").match(/Post-Merge/g) ?? []).length, 1);
});

test("finish: still in the queue is waiting (exit 3) and writes nothing", () => {
  const w = world();
  w.setGh((s) => (s.pr.autoMergeRequest = { enabledAt: "now" }));
  const result = w.finish(["--timeout", "1"], { LAND_APPROVED_POLL_SECONDS: "5" });
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /^WAITING \(land-approved\): queued: PR 12 is in the merge queue/);
  assert.equal(w.read("linear-writes.log"), "");
});

test("finish refuses an issue that is not landing, and answers LANDED again for one already Done", () => {
  const w = world({ state: "Approval" });
  const refused = w.finish();
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /^REFUSED \(land-approved\): issue-not-merging: /);
  assert.equal(w.read("linear-writes.log"), "");
  const done = world({ state: "Done" });
  done.setGh((s) => Object.assign(s.pr, { state: "MERGED", mergeCommit: { oid: MERGE_SHA } }));
  const again = done.finish();
  assert.equal(again.status, 0, again.stdout);
  assert.match(again.stdout, /^LANDED \(land-approved\): .*already Done/);
  assert.equal(done.read("linear-writes.log"), "");
});

test("finish: a land gate that cannot decide (exit 4) is UNKNOWN (exit 4), never waiting", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { state: "MERGED", mergeCommit: { oid: MERGE_SHA } }));
  const result = w.finish(["--timeout", "2"], {
    FAKE_GATE_LAND: "4",
    LAND_APPROVED_POLL_SECONDS: "1",
  });
  assert.equal(result.status, 4, result.stdout + result.stderr);
  assert.match(result.stdout, /^UNKNOWN \(land-approved\): .*the land gate answered 4/);
  assert.doesNotMatch(w.read("linear-writes.log"), /Approval|Done/);
});

test("finish: a Post-Merge write that fails is UNKNOWN (exit 4), and the land gate is not run", () => {
  const w = world();
  w.setGh((s) => Object.assign(s.pr, { state: "MERGED", mergeCommit: { oid: MERGE_SHA } }));
  const result = w.finish([], { FAKE_LINEAR_FAIL: "state" });
  assert.equal(result.status, 4, result.stdout + result.stderr);
  assert.match(result.stdout, /^UNKNOWN \(land-approved\): .*NOT moved to Post-Merge/);
  assert.equal(w.read("gate-calls.log"), "");
});

test("a hand-over whose Linear writes fail is UNKNOWN (exit 4), not STOPPED", () => {
  const w = world();
  w.setGh((s) => (s.mergeFails = true));
  const result = w.start({ FAKE_LINEAR_FAIL: "state" });
  assert.equal(result.status, 4, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /^UNKNOWN \(land-approved\): enqueue-failed: .*NOT moved to Approval/,
  );
});

// ---- stop ----------------------------------------------------------------------------------------------

test("stop hands a landing issue (Merging or Post-Merge) to a person with the reason it is given", () => {
  for (const state of ["Merging", "Post-Merge"]) {
    const w = world({ state });
    const result = w.stop("the runs machine did not answer: timeout");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      /^STOPPED \(land-approved\): optio: the runs machine did not answer/,
    );
    handedOver(w, "optio");
    assert.match(
      w.read("linear-writes.log"),
      /comment KIT-9 .*the runs machine did not answer: timeout/,
    );
    assert.equal(w.read("gh-calls.log"), "", "stop asks GitHub nothing");
  }
});

test("stop refuses an issue that left the landing states, and writes nothing", () => {
  for (const state of ["Approval", "In Progress", "Done", "Canceled"]) {
    const w = world({ state });
    const result = w.stop("the runs machine did not answer");
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /^REFUSED \(land-approved\): issue-not-landing: /);
    assert.equal(w.read("linear-writes.log"), "");
  }
});

test("a bad command line is usage (exit 2)", () => {
  const w = world();
  assert.equal(w.run(["start", "x", "--issue", "KIT-9"]).status, 2);
  assert.equal(w.run(["land", "12", "--issue", "KIT-9"]).status, 2);
  assert.equal(w.run(["finish", "12", "--issue", "kit-9"]).status, 2);
  assert.equal(w.run(["stop", "12", "--issue", "KIT-9"]).status, 2, "stop needs a reason");
});

// ---- the pure decisions --------------------------------------------------------------------------------

test("the hand-over label replaces whoever acts with ready-for-human", () => {
  assert.deepEqual(handOverLabel(["Feature", "ready-for-agent"]), [
    "swap",
    "ready-for-agent",
    "ready-for-human",
  ]);
  assert.deepEqual(handOverLabel(["Feature"]), ["add", "ready-for-human"]);
  assert.equal(handOverLabel(["ready-for-human"]), null);
});

test("startDecision reads a PR view and its checks", () => {
  const open = { state: "OPEN", mergeable: "MERGEABLE", autoMergeRequest: null };
  const green = [{ conclusion: "success" }];
  assert.equal(startDecision(open, green).act, "enqueue");
  assert.equal(startDecision({ ...open, isInMergeQueue: true }, green).act, "queued");
  assert.equal(startDecision({ ...open, mergeable: "UNKNOWN" }, green).act, "wait");
  assert.equal(startDecision(open, [{ conclusion: null }]).act, "wait");
  assert.equal(startDecision({ ...open, state: "CLOSED" }, green).code, "pr-closed");
  assert.equal(verdict("LANDED", "x"), "LANDED (land-approved): x");
});
