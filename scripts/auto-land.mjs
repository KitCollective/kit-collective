#!/usr/bin/env node
/**
 * Auto-land (ADR-0061): the one script besides a person that may set an issue to `Merging`.
 * It enforces every condition itself, right before it enqueues, and trusts no result a model
 * relayed (ADR-0058): the checks below are read from GitHub, git, Linear and the run log here.
 *
 *   node scripts/auto-land.mjs start <pr> --issue KIT-n [--dry-run] [--force-enabled]
 *       Verifies in order, stopping at the first failure: (a) the kill switch is off, (b) the PR is
 *       open, MERGEABLE, at this checkout's HEAD, without auto-merge, (c) the issue is In Review
 *       with no stop label and no open blockedBy, (d) the risk class (high-risk, surface:mobile,
 *       more than 400 lines, a path outside the issue's write-scope: a person), (e) an independent
 *       reviewer is in the run log and the kc/audit receipt for the head is posted (the existing
 *       audit-receipt.mjs does it, with its own checks), (f) the review gate, run here, (g) the
 *       runaway ceiling. Only then: merge lock, a trial merge with the lane and the check that nobody pushed, the run log's `start`
 *       event, Merging plus one role comment, `gh pr merge --merge --auto`.
 *       --dry-run runs every check and changes nothing: no receipt, no lock, no Linear write, no
 *       enqueue, no run-log line. (It posts nothing, so a kc/audit that is a required check can make
 *       the gate say waiting in a dry run.)
 *   node scripts/auto-land.mjs finish <pr> --issue KIT-n [--timeout s]
 *       Waits (a slice, default 480 s) until the PR is merged and the integration checks on the
 *       merge commit are green, then runs the land gate itself, moves the issue to Done with the
 *       merge SHA, releases the lock and deletes the merged remote branch. A PR the queue ejects, a
 *       red integration check or anything else is the alarm: lock released, Approval plus
 *       ready-for-human, a comment, a reason code.
 *
 *   node scripts/auto-land.mjs reset
 *       Clears the circuit breaker (`breaker-open`: the last 3 finishes failed) by writing a
 *       `breaker-reset` event to the run log. No other side effect. A person runs it, after the fix.
 *   node scripts/auto-land.mjs enabled
 *       Prints `AUTO-LAND ON` (exit 0) or `AUTO-LAND OFF: <why>` (exit 1) from the config and the kill
 *       file. The workflow asks it; `start` re-checks everything itself.
 * `start --handoff` (the workflow passes it): a refusal also moves the issue to Approval with
 * ready-for-human and comments the reason, so a person finds it in Linear.
 *
 * One verdict line out. Exit: 0 enqueued / would enqueue / landed, 1 refused or alarm, 2 usage,
 * 3 waiting (checks or the merge are not done; run it again, as gate.mjs), 4 a source could not be read.
 * Env for tests only: KC_LINEAR_CLI (a fake Linear CLI), KC_GATE_CLI (a fake gate), AUTO_LAND_POLL_SECONDS.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  approvalComment,
  breaker,
  breakerAfter,
  dailyCap,
  diffLines,
  greenAuditFor,
  independentReviewer,
  issueReadiness,
  KILL_FILE,
  killSwitch,
  maxPerDay,
  prReadiness,
  queueState,
  receiptRefusal,
  riskClass,
  START_BUDGET_SECONDS,
  START_RESERVE_SECONDS,
  startsInLastDay,
} from "./lib/auto-land.mjs";
import { events, gh, git, linearCli, linearIssue, config as repoConfig } from "./lib/gate-io.mjs";
import { remainingWaitSeconds } from "./lib/gates.mjs";
import { landAtMergeGate } from "./lib/land-policy.mjs";
import { append, logPath, mainCheckout } from "./lib/run-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const [sub, first, ...rest] = process.argv.slice(2);
if (sub === "reset") {
  // Clears the circuit breaker; no other side effect.
  append({ event: "auto-land", outcome: "breaker-reset" }, { path: logPath() });
  process.stdout.write("BREAKER RESET (auto-land): the next start may run\n");
  process.exit(0);
}
if (sub === "enabled") {
  const main = mainCheckout(process.cwd());
  const on = (() => {
    try {
      return (
        JSON.parse(readFileSync(join(main, "factory.config.json"), "utf8")).flow?.autoLand
          ?.enabled === true
      );
    } catch {
      return false;
    }
  })();
  const off = existsSync(join(main, KILL_FILE))
    ? `${KILL_FILE} exists`
    : on
      ? ""
      : "flow.autoLand.enabled is false";
  process.stdout.write(off ? `AUTO-LAND OFF: ${off}\n` : "AUTO-LAND ON\n");
  process.exit(off ? 1 : 0);
}
const opt = (name) => {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
};
const pr = first;
const issue = opt("--issue");
const dryRun = rest.includes("--dry-run");
const startedAt = Date.now();
const cwd = process.cwd();

const out = (code, line) => {
  process.stdout.write(`${line}\n`);
  process.exit(code);
};
if (
  !["start", "finish"].includes(sub) ||
  !/^\d+$/.test(pr ?? "") ||
  !/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "") ||
  (sub === "finish" && (dryRun || rest.includes("--force-enabled")))
) {
  process.stderr.write(
    "usage: auto-land.mjs start <pr> --issue KIT-n [--dry-run] [--force-enabled] | finish <pr> --issue KIT-n [--timeout s]\n",
  );
  process.exit(2);
}

/** Runs a command to the end and never throws: `{ code, line }` with the last non-empty output line. */
async function sh(cmd, args, env = {}) {
  try {
    const { stdout, stderr } = await run(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, line: lastLine(`${stdout}\n${stderr}`), stdout };
  } catch (error) {
    const text = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    return {
      code: typeof error.code === "number" ? error.code : 4,
      line: lastLine(text) || String(error.message).split("\n")[0],
      stdout: error.stdout ?? "",
    };
  }
}
const lastLine = (text) => String(text).trim().split("\n").filter(Boolean).at(-1) ?? "(no output)";
const script = (name, ...args) => sh("node", [join(ROOT, "scripts", name), ...args]);
const linear = (...args) => sh("node", [linearCli(), ...args]);

/** The config of the main checkout (the lane that is merged, never the PR's own copy), else this repo's. */
function config() {
  try {
    return JSON.parse(readFileSync(join(mainCheckout(cwd), "factory.config.json"), "utf8"));
  } catch {
    return repoConfig();
  }
}

/** Logging is part of the enforcement here: a write that fails is an error, never skipped silently. */
function record(event) {
  if (dryRun) {
    return;
  }
  append({ event: "auto-land", issue, ...event }, { path: logPath() });
}

/** A refusal: logged (not in a dry run), one line, exit 1. A waiting verdict is never logged. */
async function refused(result, sha) {
  if (result.waiting) {
    out(3, result.line.replace("REFUSED", "WAITING"));
  }
  try {
    record({ outcome: "refused", code: result.code, ...(sha ? { sha } : {}) });
  } catch (error) {
    process.stderr.write(`run-log: ${error.message}\n`);
  }
  if (rest.includes("--handoff") && !dryRun) {
    const done = await askPerson(
      `Auto-land refused (${result.code})`,
      result.line.replace(/^REFUSED \(auto-land\): /, ""),
      sha,
    );
    out(1, `${result.line}; ${done.join("; ")}`);
  }
  out(1, result.line);
}

function bodyFile(text) {
  const file = join(mkdtempSync(join(tmpdir(), "auto-land-")), "comment.md");
  writeFileSync(file, text);
  return file;
}

const repo = config().github.ownerRepo;
const lane = config().lanes.integration;

/** Hands the issue to a person in Linear: ready-for-human, Approval and a comment. Returns what was done, for the verdict line. */
async function askPerson(title, detail, sha, lockNote = "") {
  let current = { labels: [] };
  try {
    current = await linearIssue(issue);
  } catch {
    // the writes below say whether Linear answered
  }
  const from = ["ready-for-agent", "needs-info", "needs-triage", "ready-for-human"].find((label) =>
    (current.labels ?? []).includes(label),
  );
  const label =
    from === "ready-for-human"
      ? { code: 0 }
      : from
        ? await linear("label", issue, "swap", from, "ready-for-human")
        : await linear("label", issue, "add", "ready-for-human");
  const state = await linear("state", issue, "Approval");
  const comment = await linear(
    "comment",
    issue,
    "--body-file",
    bodyFile(
      `${title}: ${detail}\n\nPR #${pr}${sha ? ` at ${sha.slice(0, 7)}` : ""}. A person has to look: the issue is in Approval with ready-for-human.${lockNote}`,
    ),
  );
  return [
    label.code === 0 && state.code === 0
      ? "issue in Approval with ready-for-human"
      : "Linear NOT fully updated",
    ...(comment.code === 0 ? [] : ["comment NOT posted"]),
  ];
}

/** The alarm: the lock is given back and a person is asked, in Linear, to look. Exit 1. */
async function alarm(code, detail, sha) {
  const lock = await script("merge-lock.mjs", "release", pr);
  const done = [lock.code === 0 ? "lock released" : `lock NOT released (${lock.line})`];
  done.push(
    ...(await askPerson(
      `Auto-land alarm (${code})`,
      detail,
      sha,
      lock.code === 0
        ? " The merge lock is released. Repeated failures open the auto-land circuit breaker; after the cause is fixed a person clears it with: node scripts/auto-land.mjs reset"
        : " The merge lock is still held: clear it with merge-lock.mjs release <pr> --force. Repeated failures open the auto-land circuit breaker; clear it with: node scripts/auto-land.mjs reset",
    )),
  );
  try {
    record({ outcome: "alarm", code, ...(sha ? { sha } : {}) });
  } catch (error) {
    done.push(`run log NOT written (${String(error.message).split("\n")[0]})`);
  }
  out(1, `ALARM (auto-land): ${code}: ${detail}; ${done.join("; ")}`);
}

const prFields =
  "state,headRefOid,headRefName,baseRefName,mergeable,isDraft,isCrossRepository,autoMergeRequest,title,body";
const viewPr = async () =>
  JSON.parse(await gh(["pr", "view", pr, "--repo", repo, "--json", prFields]));

/**
 * `git merge-tree --write-tree` of the lane into HEAD: no working-tree or index change, nothing pushed.
 * Null when the merge is clean (or HEAD already holds the lane), a `conflict` refusal when it clashes,
 * and `{ unknown: true }` when git itself failed, so the caller can give back a lock it holds first.
 * No `--quiet`: it needs git 2.40, the bb-harness container has 2.39, and git 2.39 answered every
 * trial merge with its usage text (exit 129), which stopped every auto-land of a branch behind the lane.
 * The tree id the command prints is not used; its exit code says clean (0) or conflict (1).
 */
async function trialMerge() {
  const held =
    (await sh("git", ["merge-base", "--is-ancestor", `origin/${lane}`, "HEAD"])).code === 0;
  if (held) {
    return null;
  }
  const trial = await sh("git", ["merge-tree", "--write-tree", `origin/${lane}`, "HEAD"]);
  if (trial.code === 0) {
    return null;
  }
  if (trial.code === 1) {
    return {
      code: "conflict",
      line: `REFUSED (auto-land): conflict: the branch conflicts with origin/${lane}; a person resolves it`,
    };
  }
  return {
    unknown: true,
    line: `UNKNOWN (auto-land): the trial merge with origin/${lane} failed: ${trial.line}`,
  };
}

async function start() {
  const killFile = existsSync(join(mainCheckout(cwd), KILL_FILE));
  const issueData = await linearIssue(issue);
  const cfg = config();
  const gone = killSwitch({
    labels: issueData.labels ?? [],
    killFile,
    enabled: cfg.flow?.autoLand?.enabled === true,
    forceEnabled: rest.includes("--force-enabled"),
  });
  if (gone) await refused(gone);
  const tripped = breaker(events(), breakerAfter(cfg));
  if (tripped) await refused(tripped);

  const view = await viewPr();
  const head = await git(["rev-parse", "HEAD"]);
  await sh("git", ["fetch", "--quiet", "origin", lane]);
  const dirty = (await git(["status", "--porcelain"])) !== "";
  const notReady = prReadiness({ view, head, lane, dirty });
  if (notReady) await refused(notReady, head);
  // Being behind the lane is not a problem by itself (the merge queue tests the combined state), but a
  // conflict is: a trial merge that touches nothing says which it is.
  const conflict = await trialMerge();
  if (conflict?.unknown) out(4, conflict.line);
  if (conflict) await refused(conflict, head);

  const issueBad = issueReadiness({
    state: issueData.state,
    labels: issueData.labels ?? [],
    blockedBy: issueData.blockedBy,
  });
  if (issueBad) await refused(issueBad, head);

  const range = `origin/${lane}...HEAD`;
  const files = (await git(["diff", "--name-only", "--no-renames", range]))
    .split("\n")
    .filter(Boolean);
  const lines = diffLines(await git(["diff", "--numstat", "--no-renames", range]));
  const risky = riskClass({
    description: issueData.description ?? "",
    labels: issueData.labels ?? [],
    files,
    lines,
  });
  if (risky) await refused(risky, head);

  // (e) an independent reviewer, and the receipt posted for exactly this head.
  const reviewer = independentReviewer(events(), issue);
  if (reviewer.code) await refused(reviewer, head);
  const present = await script("audit-receipt.mjs", "check", pr);
  if (present.code !== 0) {
    const post = await script(
      "audit-receipt.mjs",
      "post",
      pr,
      "--thread",
      reviewer.reviewer.thread,
      ...(reviewer.engineerThread ? ["--implementer-thread", reviewer.engineerThread] : []),
      "--require-different-model",
      ...(dryRun ? ["--dry-run"] : []),
    );
    if (post.code === 4) {
      out(4, post.line);
    }
    if (post.code !== 0) {
      await refused(receiptRefusal(post.line), head);
    }
    if (dryRun && !/WOULD POST \(receipt\): kc\/audit success: audit green /.test(post.line)) {
      await refused(receiptRefusal(`REFUSED (receipt): a dry run says ${post.line}`), head);
    }
  }
  if (!dryRun || present.code === 0) {
    if (!greenAuditFor(events(), issue, head)) {
      await refused(
        receiptRefusal(
          `REFUSED (receipt): the run log has no green audit event for ${head.slice(0, 7)} (audited ${(events().findLast((e) => e.event === "audit" && e.issue === issue)?.sha ?? "nothing").slice(0, 7)}, the head is ${head.slice(0, 7)})`,
        ),
        head,
      );
    }
  }

  // (f) the review gate, here, with whatever budget the call has left (--timeout is the TOTAL of that call).
  const budget = remainingWaitSeconds(
    START_BUDGET_SECONDS - START_RESERVE_SECONDS,
    Date.now() - startedAt,
  );
  if (budget === null) {
    out(
      3,
      "WAITING (auto-land): the 480 s budget is used up before the review gate; run start again",
    );
  }
  const gate = await sh(
    "node",
    [
      process.env.KC_GATE_CLI || join(ROOT, "scripts", "gate.mjs"),
      "review",
      pr,
      "--issue",
      issue,
      "--timeout",
      String(budget),
    ],
    dryRun ? { KC_DRY_RUN: "1" } : {},
  );
  if (gate.code === 3) {
    out(3, `WAITING (auto-land): ${gate.line}`);
  }
  if (gate.code === 4 || gate.code === 2) {
    out(4, `UNKNOWN (auto-land): the review gate could not be read: ${gate.line}`);
  }
  if (gate.code !== 0) {
    await refused(
      { code: "review-gate-closed", line: `REFUSED (auto-land): review-gate-closed: ${gate.line}` },
      head,
    );
  }

  // (g) the runaway ceiling (the breaker above is the real brake).
  const cap = maxPerDay(cfg);
  const capped = dailyCap(events(), cap);
  if (capped) await refused(capped, head);

  const checks = JSON.parse(
    await gh([
      "api",
      `repos/${repo}/commits/${head}/check-runs`,
      "--jq",
      "[.check_runs[] | {name, conclusion}]",
    ]),
  );
  const pre = landAtMergeGate({
    issueStatus: "Merging",
    pr: {
      number: Number(pr),
      mergeable: view.mergeable,
      baseRef: view.baseRefName,
      requiredChecks: checks,
    },
    lanes: { integration: lane },
    gh: { merge: () => ({ ok: true }) },
  });
  if (!pre.ghCalled) {
    await refused(
      { code: "pr-not-ready", line: `REFUSED (auto-land): pr-not-ready: ${pre.reason}` },
      head,
    );
  }

  const conditions = [
    `risk low (write-scope held, ${lines} changed lines, cap ${cap}/day)`,
    `reviewer ${reviewer.reviewer.provider}/${reviewer.reviewer.model} is not the engineer's model`,
    `kc/audit green on ${head.slice(0, 7)}`,
    "review gate open",
    `start ${startsInLastDay(events()) + 1} of ${cap} in 24 h`,
  ];
  if (dryRun) {
    out(
      0,
      `WOULD ENQUEUE (auto-land): PR ${pr} at ${head.slice(0, 7)}; ${conditions.join("; ")}; nothing was changed`,
    );
  }

  // (h) the lock, then a fresh trial merge and the check that nobody pushed (the audit is for this head), then the writes.
  // Wait for the lock inside the budget (one PR at a time), so a second start queues up instead of failing.
  const lockWait = process.env.AUTO_LAND_LOCK_WAIT_SECONDS
    ? Number(process.env.AUTO_LAND_LOCK_WAIT_SECONDS)
    : Math.max(0, START_BUDGET_SECONDS - Math.round((Date.now() - startedAt) / 1000) - 20);
  const lock = await sh("node", [join(ROOT, "scripts", "merge-lock.mjs"), "wait", pr], {
    MERGE_LOCK_WAIT: String(lockWait),
    MERGE_LOCK_POLL:
      process.env.AUTO_LAND_LOCK_POLL_SECONDS || String(Math.min(15, Math.max(1, lockWait))),
  });
  if (lock.code === 3) {
    out(3, `WAITING (auto-land): lock-held: ${lock.line}`);
  }
  if (lock.code !== 0) {
    out(4, `UNKNOWN (auto-land): ${lock.line}`);
  }
  const letGo = async (result) => {
    await script("merge-lock.mjs", "release", pr);
    await refused(result, head);
  };
  const again = dailyCap(events(), cap);
  if (again) await letGo(again);
  // The lane may have moved while the checks ran: fetch it again and trial-merge under the lock.
  await sh("git", ["fetch", "--quiet", "origin", lane]);
  const clash = await trialMerge();
  if (clash?.unknown) {
    // Give the lock back before an UNKNOWN exit, or every later start waits on a lock nobody holds.
    await script("merge-lock.mjs", "release", pr);
    out(4, clash.line);
  }
  if (clash) await letGo(clash);
  const prHead = (await viewPr()).headRefOid;
  if (prHead.toLowerCase() !== head.toLowerCase()) {
    await letGo({
      code: "head-mismatch",
      line: `REFUSED (auto-land): head-mismatch: the PR head moved ${head.slice(0, 7)} -> ${prHead.slice(0, 7)} while the checks ran, so the audit is for another head`,
    });
  }
  try {
    record({ outcome: "start", sha: head });
  } catch (error) {
    await letGo({
      code: "pr-not-ready",
      line: `REFUSED (auto-land): pr-not-ready: the run log could not be written (${String(error.message).split("\n")[0]}), so nothing was enqueued`,
    });
  }
  const moved = await linear("state", issue, "Merging");
  if (moved.code !== 0) {
    await alarm("enqueue-failed", `could not set Merging: ${moved.line}`, head);
  }
  const comment = await linear(
    "comment",
    issue,
    "--body-file",
    bodyFile(approvalComment(conditions)),
  );
  const result = landAtMergeGate({
    issueStatus: "Merging",
    pr: {
      number: Number(pr),
      mergeable: view.mergeable,
      baseRef: view.baseRefName,
      requiredChecks: checks,
    },
    lanes: { integration: lane },
    gh: {
      merge: (args) => {
        try {
          execFileSync("gh", [...args, "--repo", repo], { cwd, encoding: "utf8", stdio: "pipe" });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: String(error.stderr || error.message)
              .trim()
              .split("\n")[0],
          };
        }
      },
    },
  });
  if (!result.queued && !result.merged) {
    await alarm("enqueue-failed", result.reason, head);
  }
  out(
    0,
    `ENQUEUED (auto-land): PR ${pr} at ${head.slice(0, 7)} is in the merge queue, ${issue} is Merging${comment.code === 0 ? "" : " (the role comment failed)"}; run finish to land it`,
  );
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function finish() {
  const data = await linearIssue(issue);
  if (!["Merging", "Post-Merge"].includes(data.state)) {
    out(
      1,
      `REFUSED (auto-land): issue-not-ready: ${issue} is ${data.state}; finish follows a start`,
    );
  }
  if (
    !events().some((e) => e.event === "auto-land" && e.outcome === "start" && e.issue === issue)
  ) {
    out(1, `REFUSED (auto-land): issue-not-ready: the run log has no auto-land start for ${issue}`);
  }
  const deadline = startedAt + Number(opt("--timeout") ?? START_BUDGET_SECONDS) * 1000;
  const poll = Number(process.env.AUTO_LAND_POLL_SECONDS ?? 30);
  let notQueued = 0;
  let renewed = Date.now();
  let markedMerged = false;
  // `gh pr view --json` has no isInMergeQueue field (gh 2.97 and 2.102 answer "Unknown JSON field"),
  // so whether the PR sits in the merge queue comes from the GraphQL API.
  const [owner, name] = repo.split("/");
  const inMergeQueue = async () =>
    JSON.parse(
      await gh([
        "api",
        "graphql",
        "-f",
        "query=query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { isInMergeQueue } } }",
        "-f",
        `owner=${owner}`,
        "-f",
        `name=${name}`,
        "-F",
        `number=${pr}`,
      ]),
    ).data.repository.pullRequest.isInMergeQueue === true;
  for (;;) {
    const view = {
      ...JSON.parse(
        await gh([
          "pr",
          "view",
          pr,
          "--repo",
          repo,
          "--json",
          "state,mergeCommit,headRefOid,headRefName,autoMergeRequest",
        ]),
      ),
      isInMergeQueue: await inMergeQueue(),
    };
    const sha = view.headRefOid;
    const where = queueState(view);
    if (where === "closed") {
      await alarm("queue-ejected", "the PR was closed without being merged", sha);
    }
    if (where === "not-queued") {
      notQueued += 1;
      if (notQueued >= 2) {
        await alarm(
          "queue-ejected",
          "the merge queue dropped the PR (auto-merge is off and it is not in the queue); a red queue run or a conflict",
          sha,
        );
      }
    } else {
      notQueued = 0;
    }
    if (where === "merged") {
      if (!markedMerged) {
        markedMerged = true;
        await linear("state", issue, "Post-Merge");
      }
      const land = await sh("node", [
        process.env.KC_GATE_CLI || join(ROOT, "scripts", "gate.mjs"),
        "land",
        pr,
        "--issue",
        issue,
      ]);
      if (land.code === 0) {
        const merge = view.mergeCommit?.oid ?? "";
        await linear(
          "comment",
          issue,
          "--body-file",
          bodyFile(
            `Landed by auto-land: PR #${pr} merged as ${merge}, integration checks green (${land.line}).`,
          ),
        );
        const done = await linear("state", issue, "Done");
        const unlocked = await script("merge-lock.mjs", "release", pr);
        let reaped = "remote branch kept";
        if (view.headRefName && view.headRefName !== lane) {
          const gone = await sh("git", ["push", "origin", "--delete", view.headRefName]);
          reaped =
            gone.code === 0
              ? `remote branch ${view.headRefName} deleted`
              : "remote branch kept (already gone or protected)";
        }
        try {
          record({ outcome: "landed", sha });
        } catch (error) {
          process.stderr.write(`run-log: ${error.message}\n`);
        }
        out(
          done.code === 0 ? 0 : 4,
          `LANDED (auto-land): PR ${pr} merged as ${merge.slice(0, 7)}, integration green; ${issue} ${done.code === 0 ? "Done" : "NOT moved to Done"}; ${unlocked.code === 0 ? "lock released" : "lock NOT released"}; ${reaped}; the local worktree is for reap-worktree`,
        );
      }
      if (land.code === 1) {
        await alarm("integration-red", land.line, sha);
      }
    }
    if (Date.now() + poll * 1000 > deadline) {
      out(
        3,
        `WAITING (auto-land): PR ${pr} is ${where === "merged" ? "merged, integration checks are not done" : "in the queue"}; run finish again`,
      );
    }
    if (Date.now() - renewed > 5 * 60 * 1000) {
      await script("merge-lock.mjs", "take", pr);
      renewed = Date.now();
    }
    await sleep(poll);
  }
}

try {
  await (sub === "start" ? start() : finish());
} catch (error) {
  out(4, `UNKNOWN (auto-land): ${String(error.message).split("\n")[0]}`);
}
