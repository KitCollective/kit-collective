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
 * LINEAR_API_KEY, E2E_REVIEW_API_KEY, E2E_REVIEW_MODEL, E2E_R2_BUCKET and the R2 account settings.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPrefix, runRecordKey, screenshotFromKey } from "./artifacts.mjs";
import { selectBefore } from "./before.mjs";
import { compareRuns, stepKey } from "./compare.mjs";
import { fetchIssue, issueIdentifier, updateComment } from "./linear.mjs";
import { createR2Client, evidenceBucketEnv } from "./r2.mjs";
import {
  evidenceLines,
  renderComment,
  replaceEvidenceSection,
  upsertPrComment,
} from "./report.mjs";
import { buildReviewMessages, designExcerpt, issueContract, requestVerdict } from "./review.mjs";

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

async function reviewDifferences(pairs, before, after, description) {
  const reviews = new Map();
  const different = pairs.filter((pair) => pair.status !== "same");
  const apiKey = env.E2E_REVIEW_API_KEY?.trim();
  const model = env.E2E_REVIEW_MODEL?.trim();
  if (different.length === 0) {
    return reviews;
  }
  const sections = JSON.parse(
    readFileSync(join(REPO_ROOT, "apps/mobile/.maestro/design-sections.json"), "utf8"),
  );
  const designSystem = readFileSync(join(REPO_ROOT, "docs/design-system.md"), "utf8");
  for (const pair of different) {
    const key = stepKey(pair.flow, pair.step);
    if (!apiKey || !model) {
      reviews.set(key, { error: "E2E_REVIEW_API_KEY or E2E_REVIEW_MODEL is not set" });
      continue;
    }
    try {
      const verdict = await requestVerdict({
        apiKey,
        model,
        messages: buildReviewMessages({
          flow: pair.flow,
          step: pair.step,
          status: pair.status,
          contract: description
            ? issueContract(description)
            : "(no Linear issue found for this PR; treat every visible change as not asked for)",
          excerpt: designExcerpt(designSystem, [
            ...sections.always,
            ...(sections.flows[pair.flow] ?? []),
          ]),
          beforePng: before.get(key) ?? null,
          afterPng: after.get(key) ?? null,
        }),
      });
      reviews.set(key, { verdict });
    } catch (error) {
      reviews.set(key, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return reviews;
}

const after = await loadScreenshots(sha);
const flows = [...new Set([...after.keys()].map((key) => key.split("/")[0]))].sort();

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
  const linearKey = env.LINEAR_API_KEY?.trim();
  const issue = identifier && linearKey ? await fetchIssue(linearKey, identifier) : null;

  const beforeSha = await findBefore();
  const before = beforeSha ? await loadScreenshots(beforeSha) : new Map();
  const pairs = beforeSha ? compareRuns(before, after) : [];
  const reviews = await reviewDifferences(pairs, before, after, issue?.description ?? null);

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

  if (issue?.workpad && linearKey) {
    const body = replaceEvidenceSection(
      issue.workpad.body,
      evidenceLines({ evidenceBaseUrl, afterSha: sha, flows, commentUrl }),
    );
    if (body) {
      await updateComment(linearKey, issue.workpad.id, body);
      process.stdout.write(`updated ${identifier} workpad evidence\n`);
    }
  }
}
