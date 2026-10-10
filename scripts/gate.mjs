#!/usr/bin/env node
/**
 * One entry for the flow gates (ADR-0053). Each subcommand prints one verdict line and logs a
 * `gate` event to the run log.
 *
 *   node scripts/gate.mjs review <pr> --issue KIT-n [--workpad <file>] [--timeout s]
 *       must run from the PR's worktree (HEAD == the PR head, else exit 4). Folds pnpm check:review-gate, the review matrix, the PR write-scope and
 *       wait-for-checks (required checks green and MERGEABLE) into one verdict. Mechanical steps
 *       run first and stop at the first failure; checks are awaited only when they are clean.
 *       The scope step gets the PR text through PR_TITLE/PR_BODY/PR_HEAD_REF. A PR with no
 *       write-scope line adds `note: scope: no write-scope declared` (`--require-scope` closes).
 *   node scripts/gate.mjs land <pr> --issue KIT-n
 *       Done is allowed only when the PR is merged, its merge commit is on origin/<integration>
 *       and the checks on that merge commit are green. A step that returned no result line
 *       is not trusted: the orchestrator runs this gate itself and goes by its exit code.
 *   node scripts/gate.mjs result <TAG> [file|-]
 *       exit 0 and print the parsed line when the text holds `<TAG> KIT-n <outcome> ...`,
 *       exit 1 (`NO-RESULT`) when it does not; the orchestrator then runs the gate itself.
 *
 * Exit: 0 open, 1 closed, 2 usage, 3 waiting (retry: checks pending, merge not on the lane yet),
 * 4 unknown (a source could not be read).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, gh, git, linearIssue, logGate, prView, sh, workpadOf } from "./lib/gate-io.mjs";
import {
  declaresScope,
  foldReview,
  GATE_EXIT,
  landGate,
  parseResultLine,
  prBound,
  scopeEnv,
} from "./lib/gates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [sub, first, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
};
const done = (result) => {
  process.stdout.write(`${result.line}\n`);
  process.exit(result.code);
};
const usage = () => {
  process.stderr.write("usage: gate.mjs review|land <pr> --issue KIT-n | result <TAG> [file|-]\n");
  process.exit(GATE_EXIT.usage);
};

/** Runs a node script, resolving `{ code, line }` with its last output line. */
function step(name, script, scriptArgs, env = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", [join(ROOT, script), ...scriptArgs], {
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const lines = out.trim().split("\n").filter(Boolean);
      resolve({ name, code: code ?? 1, line: lines.at(-1) ?? "(no output)" });
    });
  });
}

if (sub === "result") {
  if (!first) usage();
  const text = readFileSync(rest[0] && rest[0] !== "-" ? rest[0] : 0, "utf8");
  const parsed = parseResultLine(first, text);
  if (!parsed) done({ code: 1, line: `NO-RESULT: no ${first} line; run the gate yourself` });
  done({ code: 0, line: `${first} ${parsed.issue} ${parsed.outcome} ${parsed.rest}`.trim() });
}

const pr = first;
const issue = opt("--issue");
if (
  !["review", "land"].includes(sub) ||
  !/^\d+$/.test(pr ?? "") ||
  !/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "")
)
  usage();

try {
  if (sub === "review") {
    let workpadFile = opt("--workpad");
    if (!workpadFile) {
      workpadFile = join(mkdtempSync(join(tmpdir(), "gate-")), "workpad.md");
      writeFileSync(workpadFile, workpadOf(await linearIssue(issue)));
    }
    const view = await prView(pr);
    const bound = prBound({ head: await git(["rev-parse", "HEAD"]), prHead: view.headRefOid });
    if (!bound.ok) {
      done({ code: GATE_EXIT.unknown, line: bound.line });
    }
    const base = { BASE_REF: "origin/development" };
    const declared = declaresScope(view);
    // Mechanical steps first; the long wait for checks only when they are clean.
    const steps = [];
    const mechanical = [
      () => step("review-gate", "scripts/check-code-english.mjs", [], base),
      () => step("doc-references", "scripts/check-doc-references.mjs", [], base),
      () => step("matrix", "scripts/review-matrix.mjs", ["validate", workpadFile]),
      () => step("scope", "scripts/check-pr-write-scope.mjs", [], { ...base, ...scopeEnv(view) }),
    ];
    for (const run of mechanical) {
      steps.push(await run());
      if (steps.at(-1).code !== 0) break;
    }
    if (steps.every((s) => s.code === 0) && !declared && rest.includes("--require-scope")) {
      steps.push({
        name: "scope",
        code: 1,
        line: "no write-scope declared on the PR (--require-scope)",
      });
    }
    if (steps.every((s) => s.code === 0)) {
      steps.push(
        await step("checks", "scripts/wait-for-checks.mjs", [
          pr,
          "--timeout",
          opt("--timeout") ?? "1800",
        ]),
      );
    }
    const result = foldReview(steps);
    if (result.code === GATE_EXIT.open && !declared) {
      result.line += "; note: scope: no write-scope declared";
    }
    logGate(issue, "review", result.code === GATE_EXIT.open ? "open" : "closed", view.headRefOid);
    done(result);
  }

  const lane = config().lanes.integration;
  const repo = config().github.ownerRepo;
  const view = JSON.parse(
    await gh(["pr", "view", pr, "--repo", repo, "--json", "state,mergeCommit,headRefOid"]),
  );
  const mergeSha = view.mergeCommit?.oid ?? null;
  let onIntegration = false;
  if (mergeSha) {
    await sh("git", ["fetch", "origin", lane]);
    onIntegration = await sh("git", [
      "merge-base",
      "--is-ancestor",
      mergeSha,
      `origin/${lane}`,
    ]).then(
      () => true,
      () => false,
    );
  }
  const runs = mergeSha
    ? JSON.parse(
        await gh([
          "api",
          `repos/${repo}/commits/${mergeSha}/check-runs`,
          "--jq",
          "[.check_runs[] | {name, conclusion}]",
        ]),
      )
    : null;
  const result = landGate({
    pr: { state: view.state, mergeCommit: mergeSha, headSha: view.headRefOid },
    onIntegration,
    checks: runs,
  });
  logGate(issue, "land", result.code === GATE_EXIT.open ? "open" : "closed", view.headRefOid);
  done(result);
} catch (error) {
  done({ code: GATE_EXIT.unknown, line: `UNKNOWN: ${String(error.message).split("\n")[0]}` });
}
