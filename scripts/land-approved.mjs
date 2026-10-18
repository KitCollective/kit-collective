#!/usr/bin/env node
/**
 * Lands a PR a person approved (the issue is `Merging`, set by a person or from Optio's Inbox), end
 * to end. Optio runs it through its host bundle on the runs machine after an approval and goes by
 * the verdict line and the exit code; no model relays the result.
 *
 *   node scripts/land-approved.mjs start <pr> --issue KIT-n [--timeout s]
 *       Checks that the issue is Merging and the PR is open, MERGEABLE and green, then enqueues it in
 *       the merge queue through the merge gate (`landAtMergeGate`, the only route to
 *       `gh pr merge --merge --auto`). An issue that is not Merging is refused and nothing is written.
 *       A PR already queued or merged is QUEUED again with no second enqueue. Checks still running
 *       wait (a slice, default 480 s). A closed or conflicting PR, or a refused enqueue, is a stop.
 *   node scripts/land-approved.mjs finish <pr> --issue KIT-n [--timeout s]
 *       Waits one slice for the merge. Merged: Post-Merge, then the land gate. Open: one comment with
 *       the merge SHA, then Done. A land gate still waiting at the end of the slice leaves the issue
 *       in Post-Merge (WAITING). A PR the queue ejects (closed, or not queued on two polls) or a
 *       closed land gate (a red integration check) is a stop.
 *
 * A stop hands the issue to a person: Approval, ready-for-human and one comment with the reason.
 *
 * One verdict line on every path:
 *   QUEUED (land-approved): …                exit 0, start enqueued it (or found it queued)
 *   LANDED (land-approved): …                exit 0, Done
 *   WAITING (land-approved): <phase>: …      exit 3, run the same command again; phase is
 *                                            approved (not enqueued yet), queued or merged
 *   STOPPED (land-approved): <code>: …       exit 1, handed to a person
 *   REFUSED (land-approved): <code>: …       exit 1, nothing was written
 *   UNKNOWN (land-approved): …               exit 4, a source could not be read
 * Exit 2 is usage. Env for tests only: KC_LINEAR_CLI (a fake Linear CLI), KC_GATE_CLI (a fake gate),
 * LAND_APPROVED_POLL_SECONDS.
 */
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { latestCheckRuns, queueState } from "./lib/auto-land.mjs";
import { gh, linearCli, linearIssue, config as repoConfig } from "./lib/gate-io.mjs";
import {
  handOverLabel,
  landedComment,
  startDecision,
  stoppedComment,
  verdict,
} from "./lib/land-approved.mjs";
import {
  landAtMergeGate,
  MERGE_PERMISSION_STATUS,
  MERGED_STATUS,
  POST_MERGE_STATUS,
} from "./lib/land-policy.mjs";
import { mainCheckout } from "./lib/run-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const [sub, pr, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
};
const issue = opt("--issue");
const timeout = opt("--timeout") ?? "480";
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
  !/^\d+$/.test(timeout)
) {
  process.stderr.write("usage: land-approved.mjs start|finish <pr> --issue KIT-n [--timeout s]\n");
  process.exit(2);
}

/** Runs a command to the end and never throws: `{ code, line }` with the last non-empty output line. */
async function sh(cmd, args) {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, line: lastLine(`${stdout}\n${stderr}`) };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 4,
      line:
        lastLine(`${error.stdout ?? ""}\n${error.stderr ?? ""}`) ||
        String(error.message).split("\n")[0],
    };
  }
}
const lastLine = (text) => String(text).trim().split("\n").filter(Boolean).at(-1) ?? "";
const linear = (...args) => sh("node", [linearCli(), ...args]);

/** The config of the main checkout (the lane's copy, never a PR's), else this repo's. */
function config() {
  try {
    return JSON.parse(readFileSync(join(mainCheckout(cwd), "factory.config.json"), "utf8"));
  } catch {
    return repoConfig();
  }
}
const repo = config().github.ownerRepo;
const lane = config().lanes.integration;

const deadline = startedAt + Number(timeout) * 1000;
const poll = Number(process.env.LAND_APPROVED_POLL_SECONDS ?? 30);
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
/** True when another poll still fits in the slice. */
const timeLeft = () => Date.now() + poll * 1000 <= deadline;

function bodyFile(text) {
  const file = join(mkdtempSync(join(tmpdir(), "land-approved-")), "comment.md");
  writeFileSync(file, text);
  return file;
}

/** Hands the issue to a person: ready-for-human, Approval and one comment with the reason. Exit 1. */
async function stop(code, detail, labels) {
  const swap = handOverLabel(labels);
  const label = swap === null ? { code: 0 } : await linear("label", issue, ...swap);
  const state = await linear("state", issue, "Approval");
  const comment = await linear(
    "comment",
    issue,
    "--body-file",
    bodyFile(stoppedComment(code, detail, pr)),
  );
  const done = [
    label.code === 0 && state.code === 0
      ? "issue in Approval with ready-for-human"
      : "Linear NOT fully updated",
    ...(comment.code === 0 ? [] : ["comment NOT posted"]),
  ];
  out(1, verdict("STOPPED", `${code}: ${detail}; ${done.join("; ")}`));
}

const viewPr = async (fields) =>
  JSON.parse(await gh(["pr", "view", pr, "--repo", repo, "--json", fields]));

// `gh pr view --json` has no isInMergeQueue field, so the merge queue is asked through GraphQL.
async function inMergeQueue() {
  const [owner, name] = repo.split("/");
  const answer = JSON.parse(
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
  );
  return answer.data.repository.pullRequest.isInMergeQueue === true;
}

async function checksOn(head) {
  const pages = JSON.parse(
    await gh([
      "api",
      "--paginate",
      "--slurp",
      `repos/${repo}/commits/${head}/check-runs?per_page=100`,
    ]),
  );
  return latestCheckRuns(
    (Array.isArray(pages) ? pages : [pages]).flatMap((page) => page?.check_runs ?? []),
  );
}

async function start() {
  const data = await linearIssue(issue);
  if (data.state !== MERGE_PERMISSION_STATUS) {
    out(
      1,
      verdict(
        "REFUSED",
        `issue-not-merging: ${issue} is ${data.state}; only a person's move to ${MERGE_PERMISSION_STATUS} lets it land`,
      ),
    );
  }
  for (;;) {
    const view = await viewPr("state,mergeable,baseRefName,headRefOid,autoMergeRequest");
    const checks = view.state === "OPEN" ? await checksOn(view.headRefOid) : [];
    const decision = startDecision(view, checks);
    if (decision.act === "queued") {
      out(0, verdict("QUEUED", `PR ${pr} ${decision.detail}; run finish to land it`));
    }
    if (decision.act === "stop") {
      await stop(decision.code, decision.detail, data.labels ?? []);
    }
    if (decision.act === "enqueue") {
      const result = landAtMergeGate({
        issueStatus: MERGE_PERMISSION_STATUS,
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
              execFileSync("gh", [...args, "--repo", repo], {
                cwd,
                encoding: "utf8",
                stdio: "pipe",
              });
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
      if (result.queued || result.merged) {
        out(
          0,
          verdict(
            "QUEUED",
            `PR ${pr} at ${view.headRefOid.slice(0, 7)} is in the merge queue; run finish to land it`,
          ),
        );
      }
      await stop("enqueue-failed", result.reason, data.labels ?? []);
    }
    if (!timeLeft()) {
      out(
        3,
        verdict(
          "WAITING",
          `approved: PR ${pr} is not enqueued yet: ${decision.detail}; run start again`,
        ),
      );
    }
    await sleep(poll);
  }
}

async function finish() {
  const data = await linearIssue(issue);
  if (data.state === MERGED_STATUS) {
    const view = await viewPr("state,mergeCommit");
    if (view.state === "MERGED") {
      out(
        0,
        verdict(
          "LANDED",
          `PR ${pr} merged as ${(view.mergeCommit?.oid ?? "").slice(0, 7)}; ${issue} is already Done`,
        ),
      );
    }
  }
  if (![MERGE_PERMISSION_STATUS, POST_MERGE_STATUS].includes(data.state)) {
    out(
      1,
      verdict(
        "REFUSED",
        `issue-not-merging: ${issue} is ${data.state}; finish follows an approval (${MERGE_PERMISSION_STATUS})`,
      ),
    );
  }
  let markedMerged = data.state === POST_MERGE_STATUS;
  let notQueued = 0;
  for (;;) {
    const view = {
      ...(await viewPr("state,mergeCommit,headRefOid,autoMergeRequest")),
      isInMergeQueue: await inMergeQueue(),
    };
    const where = queueState(view);
    if (where === "closed") {
      await stop("queue-ejected", "the PR was closed without being merged", data.labels ?? []);
    }
    notQueued = where === "not-queued" ? notQueued + 1 : 0;
    if (notQueued >= 2) {
      await stop(
        "queue-ejected",
        "the merge queue dropped the PR (auto-merge is off and it is not in the queue): a red queue run or a conflict",
        data.labels ?? [],
      );
    }
    let gateLine = "";
    const merge = view.mergeCommit?.oid ?? "";
    if (where === "merged") {
      if (!markedMerged) {
        markedMerged = true;
        await linear("state", issue, POST_MERGE_STATUS);
      }
      const land = await sh("node", [
        process.env.KC_GATE_CLI || join(ROOT, "scripts", "gate.mjs"),
        "land",
        pr,
        "--issue",
        issue,
      ]);
      gateLine = land.line;
      if (land.code === 0) {
        const comment = await linear(
          "comment",
          issue,
          "--body-file",
          bodyFile(landedComment(pr, merge, land.line)),
        );
        const done = await linear("state", issue, MERGED_STATUS);
        out(
          done.code === 0 ? 0 : 4,
          verdict(
            done.code === 0 ? "LANDED" : "UNKNOWN",
            `PR ${pr} merged as ${merge.slice(0, 7)}, the land gate is open; ${issue} ${done.code === 0 ? "Done" : `NOT moved to Done (${done.line})`}${comment.code === 0 ? "" : " (the comment failed)"}`,
          ),
        );
      }
      if (land.code === 1) {
        await stop("integration-red", land.line, data.labels ?? []);
      }
    }
    if (!timeLeft()) {
      out(
        3,
        verdict(
          "WAITING",
          where === "merged"
            ? `merged: PR ${pr} merged as ${merge.slice(0, 7)}, the land gate is waiting (${gateLine}); run finish again`
            : `queued: PR ${pr} is in the merge queue; run finish again`,
        ),
      );
    }
    await sleep(poll);
  }
}

try {
  await (sub === "start" ? start() : finish());
} catch (error) {
  out(4, verdict("UNKNOWN", String(error.message).split("\n")[0]));
}
