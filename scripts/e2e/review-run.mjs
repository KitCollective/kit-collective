#!/usr/bin/env node
/**
 * After a device-flow run (KIT-267): records the run in the evidence bucket, and for a PR
 * compares it with the latest passed `development` run at or before the merge
 * base, reviews the steps that differ, and writes the evidence to the PR and
 * the Linear workpad.
 *
 * A red flow blocks through the `Device flows` commit status. This script never
 * fails over a design finding: findings are advisory.
 *
 * Started by `apps/mobile/.maestro/run-evidence.sh`. Environment: E2E_SHA,
 * E2E_RUN_ORIGIN (`pr` | `integration`), E2E_FLOWS_STATUS, E2E_PR_NUMBER,
 * E2E_PR_TITLE, E2E_REPOSITORY, E2E_EVIDENCE_BASE_URL, E2E_GITHUB_TOKEN,
 * E2E_LINEAR_API_KEY, E2E_R2_BUCKET, the R2 account settings and, optionally,
 * E2E_REVIEW_MODEL (a Claude Code model alias, default `sonnet`). The review
 * runs `claude -p` on the Mac's Claude subscription.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPrefix, runRecordKey, screenshotFromKey } from "./artifacts.mjs";
import { selectBefore } from "./before.mjs";
import { compareRuns, flowOfKey, stepKey } from "./compare.mjs";
import { fetchIssue, issueIdentifier, updateComment } from "./linear.mjs";
import { createR2Client, evidenceBucketEnv } from "./r2.mjs";
import {
  evidenceLines,
  renderComment,
  replaceEvidenceSection,
  upsertPrComment,
} from "./report.mjs";
import { buildReviewPrompt, designExcerpt, requestVerdict, reviewContract } from "./review.mjs";
import { onlyFlows, sliceDesignSections } from "./slices.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FACTORY = JSON.parse(readFileSync(join(REPO_ROOT, "factory.config.json"), "utf8"));
const ANCESTOR_LOOKBACK = 50;

const env = process.env;
const required = (name) => {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};
const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();

const sha = required("E2E_SHA");
const isPullRequest = required("E2E_RUN_ORIGIN") === "pr";
const flowsStatus = required("E2E_FLOWS_STATUS");
const r2 = createR2Client(evidenceBucketEnv(env));

/** Screenshots of one run, keyed by flow step. */
async function loadScreenshots(runSha) {
  const screenshots = new Map();
  for (const key of await r2.listKeys(runPrefix(runSha))) {
    const step = screenshotFromKey(runSha, key);
    if (step) {
      screenshots.set(stepKey(step.flow, step.step), await r2.getObject(key));
    }
  }
  return screenshots;
}

async function findBefore() {
  const lane = FACTORY.lanes.integration;
  git("fetch", "--quiet", "origin", lane);
  const mergeBase = git("merge-base", `origin/${lane}`, sha);
  const ancestors = git("rev-list", "--first-parent", `--max-count=${ANCESTOR_LOOKBACK}`, mergeBase)
    .split("\n")
    .filter(Boolean);
  const runs = [];
  for (const ancestor of ancestors) {
    const record = await r2.getObject(runRecordKey(ancestor));
    if (record) {
      runs.push(JSON.parse(record.toString("utf8")));
      if (selectBefore({ ancestors, runs })) {
        break;
      }
    }
  }
  return selectBefore({ ancestors, runs });
}

const reasonOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * The PR's Linear issue, and whether it could be read. Linear being down must
 * not turn a run whose flows passed into an error.
 */
async function readIssue(identifier, linearKey) {
  if (!identifier) {
    return { issue: null, issueRead: { status: "none" } };
  }
  if (!linearKey) {
    return {
      issue: null,
      issueRead: { status: "unread", reason: "E2E_LINEAR_API_KEY is not set" },
    };
  }
  try {
    const issue = await fetchIssue(linearKey, identifier, FACTORY.agent.workpadHeading);
    if (!issue?.description.trim()) {
      const reason = issue ? `${identifier} has no description` : `${identifier} was not found`;
      return { issue, issueRead: { status: "unread", reason } };
    }
    return { issue, issueRead: { status: "read", description: issue.description } };
  } catch (error) {
    return { issue: null, issueRead: { status: "unread", reason: reasonOf(error) } };
  }
}

/**
 * The sections a flow asks for: the regression flows are listed in
 * `design-sections.json`; a slice flow names its own in its header comment.
 */
function sectionsOfFlow(sections, flow) {
  if (sections.flows[flow]) {
    return sections.flows[flow];
  }
  try {
    const slice = readFileSync(
      join(REPO_ROOT, `apps/mobile/.maestro/slices/${flow.toUpperCase()}.yaml`),
      "utf8",
    );
    return sliceDesignSections(slice);
  } catch {
    return [];
  }
}

async function reviewDifferences(pairs, before, after, issueRead) {
  const reviews = new Map();
  const different = pairs.filter((pair) => pair.status !== "same");
  const model = env.E2E_REVIEW_MODEL?.trim() || "sonnet";
  if (different.length === 0) {
    return reviews;
  }
  const { contract, unavailable } = reviewContract(issueRead);
  if (unavailable) {
    for (const pair of different) {
      reviews.set(stepKey(pair.flow, pair.step), { error: unavailable });
    }
    return reviews;
  }
  const sections = JSON.parse(
    readFileSync(join(REPO_ROOT, "apps/mobile/.maestro/design-sections.json"), "utf8"),
  );
  const designSystem = readFileSync(join(REPO_ROOT, "docs/design-system.md"), "utf8");
  for (const pair of different) {
    const key = stepKey(pair.flow, pair.step);
    try {
      const beforePng = before.get(key) ?? null;
      const afterPng = after.get(key) ?? null;
      const verdict = await requestVerdict({
        model,
        beforePng,
        afterPng,
        prompt: buildReviewPrompt({
          flow: pair.flow,
          step: pair.step,
          status: pair.status,
          contract,
          excerpt: designExcerpt(designSystem, [
            ...sections.always,
            ...sectionsOfFlow(sections, pair.flow),
          ]),
          hasBefore: beforePng !== null,
          hasAfter: afterPng !== null,
        }),
      });
      reviews.set(key, { verdict });
    } catch (error) {
      reviews.set(key, { error: reasonOf(error) });
    }
  }
  return reviews;
}

const after = await loadScreenshots(sha);
const flows = [...new Set([...after.keys()].map(flowOfKey))].sort();

await r2.putObject(
  runRecordKey(sha),
  Buffer.from(
    JSON.stringify({
      sha,
      origin: isPullRequest ? "pr" : "integration",
      status: flowsStatus === "success" ? "passed" : "failed",
      flows,
      createdAt: new Date().toISOString(),
    }),
  ),
  "application/json",
);
process.stdout.write(`recorded run ${sha} (${flowsStatus})\n`);

if (isPullRequest) {
  const evidenceBaseUrl = required("E2E_EVIDENCE_BASE_URL");
  const title = env.E2E_PR_TITLE ?? "";
  const identifier = issueIdentifier(title, FACTORY.linear.teamKey);
  const linearKey = env.E2E_LINEAR_API_KEY?.trim();
  const { issue, issueRead } = await readIssue(identifier, linearKey);
  if (issueRead.status === "unread") {
    process.stdout.write(`issue not read: ${issueRead.reason}\n`);
  }

  const beforeSha = await findBefore();
  // A slice flow has no before; the other flows of the before run are not part of this one.
  const before = beforeSha
    ? onlyFlows(await loadScreenshots(beforeSha), new Set(flows), flowOfKey)
    : new Map();
  const pairs = beforeSha ? compareRuns(before, after) : [];
  const reviews = await reviewDifferences(pairs, before, after, issueRead);

  const commentUrl = await upsertPrComment({
    repository: required("E2E_REPOSITORY"),
    pullNumber: Number(required("E2E_PR_NUMBER")),
    token: required("E2E_GITHUB_TOKEN"),
    body: renderComment({
      evidenceBaseUrl,
      afterSha: sha,
      beforeSha,
      flowsStatus,
      flows,
      pairs,
      reviews,
    }),
  });
  process.stdout.write(`PR comment: ${commentUrl}\n`);

  if (issue?.workpad) {
    const body = replaceEvidenceSection(
      issue.workpad.body,
      evidenceLines({ evidenceBaseUrl, afterSha: sha, flows, commentUrl }),
    );
    if (body) {
      // The run is already recorded and commented; a Linear failure here is reported, not fatal.
      try {
        await updateComment(linearKey, issue.workpad.id, body);
        process.stdout.write(`updated ${identifier} workpad evidence\n`);
      } catch (error) {
        process.stdout.write(`workpad evidence not updated: ${reasonOf(error)}\n`);
      }
    }
  }
}
