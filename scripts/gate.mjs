#!/usr/bin/env node
/**
 * One entry for the flow gates (ADR-0053). Each subcommand prints one verdict line and logs a
 * `gate` event to the run log.
 *
 *   node scripts/gate.mjs pre-review <pr> --issue KIT-n [--timeout s] [--require-scope]
 *       the gate before a reviewer exists: pnpm check:review-gate, doc references, the PR
 *       write-scope and wait-for-checks. It never reads the review matrix (the reviewer has not
 *       written it yet; ADR-0058). When the PR head holds the issue's slice flow
 *       (apps/mobile/.maestro/slices/<KEY>.yaml), the `Device flows` status is waited for with
 *       the checks (ADR-0059).
 *   node scripts/gate.mjs review <pr> --issue KIT-n [--workpad <file>] [--timeout s] [--require-scope]
 *       the full gate, run only after the reviewer has written the matrix: everything above plus
 *       the matrix validation. Both must run from the PR's worktree (HEAD == the PR head, else exit 4).
 *       Mechanical steps run first and stop at the first failure; checks are awaited only when
 *       they are clean. The scope comes from the PR text (PR_TITLE/PR_BODY/PR_HEAD_REF), else from
 *       the Linear issue's `write-scope:` line; an issue scope the PR body lacks closes the gate
 *       with `scope-missing-in-pr`. No scope anywhere adds `note: scope: no write-scope declared`
 *       (`--require-scope` closes).
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
import {
  commitStatuses,
  config,
  existsAtHead,
  gh,
  git,
  linearIssue,
  logGate,
  prView,
  sh,
  workpadOf,
} from "./lib/gate-io.mjs";
import {
  DEVICE_FLOWS_CONTEXT,
  deviceFlowsStep,
  foldReview,
  GATE_EXIT,
  landGate,
  parseResultLine,
  prBound,
  remainingWaitSeconds,
  scopeSource,
  shouldLogGate,
  sliceFlowPath,
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
  !["review", "pre-review", "land"].includes(sub) ||
  !/^\d+$/.test(pr ?? "") ||
  !/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "")
)
  usage();

const startedAt = Date.now();
try {
  if (sub === "review" || sub === "pre-review") {
    const full = sub === "review";
    const linear = await linearIssue(issue);
    let workpadFile = opt("--workpad");
    if (full && !workpadFile) {
      workpadFile = join(mkdtempSync(join(tmpdir(), "gate-")), "workpad.md");
      writeFileSync(workpadFile, workpadOf(linear));
    }
    const view = await prView(pr);
    const bound = prBound({ head: await git(["rev-parse", "HEAD"]), prHead: view.headRefOid });
    if (!bound.ok) {
      done({ code: GATE_EXIT.unknown, line: bound.line });
    }
    const base = { BASE_REF: "origin/development" };
    const scope = scopeSource(view, linear.description);
    // Mechanical steps first; the long wait for checks only when they are clean.
    const steps = [];
    const mechanical = [
      () => step("review-gate", "scripts/check-code-english.mjs", [], base),
      () => step("doc-references", "scripts/check-doc-references.mjs", [], base),
      ...(full
        ? [() => step("matrix", "scripts/review-matrix.mjs", ["validate", workpadFile])]
        : []),
      () => step("scope", "scripts/check-pr-write-scope.mjs", [], { ...base, ...scope.env }),
      async () => ({
        name: "scope-in-pr",
        code: scope.problem ? 1 : 0,
        line: scope.problem ?? "ok",
      }),
    ];
    for (const run of mechanical) {
      steps.push(await run());
      if (steps.at(-1).code !== 0) break;
    }
    if (
      steps.every((s) => s.code === 0) &&
      scope.source === "none" &&
      rest.includes("--require-scope")
    ) {
      steps.push({
        name: "scope",
        code: 1,
        line: "no write-scope declared on the PR (--require-scope)",
      });
    }
    if (steps.every((s) => s.code === 0)) {
      // --timeout is the TOTAL budget of this call (the caller's foreground command is capped),
      // so the mechanical steps above are subtracted from what the wait may use.
      const budget = remainingWaitSeconds(opt("--timeout") ?? "1800", Date.now() - startedAt);
      // A slice with its own Device flow is not ready for review before that flow has a verdict
      // on this head (ADR-0059): a missing status waits, a red one closes.
      const hasSliceFlow = await existsAtHead(sliceFlowPath(issue), view.headRefOid);
      const also = hasSliceFlow ? ["--also", DEVICE_FLOWS_CONTEXT] : [];
      let checks =
        budget === null
          ? {
              name: "checks",
              code: 2,
              line: "PENDING: the --timeout budget is used up by the mechanical steps; run the gate again",
            }
          : await step("checks", "scripts/wait-for-checks.mjs", [
              pr,
              "--timeout",
              String(budget),
              ...also,
            ]);
      // A Device flows run that cannot reach a verdict is a person's to settle, not a fix round.
      if (hasSliceFlow && (checks.code === 1 || checks.code === 2)) {
        try {
          checks = {
            name: "checks",
            ...deviceFlowsStep(checks, await commitStatuses(view.headRefOid), view.headRefOid),
          };
        } catch {
          // The statuses could not be read: the wait-for-checks answer stands.
        }
      }
      steps.push(checks);
    }
    const result = foldReview(steps);
    if (result.code === GATE_EXIT.open && scope.source === "none") {
      result.line += "; note: scope: no write-scope declared";
    }
    // A waiting verdict is not an outcome: the slice that follows decides, so only open or closed is logged.
    if (shouldLogGate(result)) {
      logGate(issue, sub, result.code === GATE_EXIT.open ? "open" : "closed", view.headRefOid);
    }
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
  if (shouldLogGate(result)) {
    logGate(issue, "land", result.code === GATE_EXIT.open ? "open" : "closed", view.headRefOid);
  }
  done(result);
} catch (error) {
  done({ code: GATE_EXIT.unknown, line: `UNKNOWN: ${String(error.message).split("\n")[0]}` });
}
