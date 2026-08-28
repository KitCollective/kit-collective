/**
 * KIT-114 — role transition comments and description AC helpers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AC_REWRITES_HEADING,
  applyCheckerPassDescription,
  autoMergeFlipComment,
  autoMergeRefuseComment,
  buildCheckerPassVerdicts,
  checkerFailComment,
  checkerPassComment,
  descriptionAcceptanceCriteriaTicked,
  implementInReviewComment,
  landFailComment,
  landSuccessComment,
  parseAcceptanceCriteria,
  parseDescriptionAcRewrites,
  plannerClaimComment,
} from "../role-comments.mjs";

const DESCRIPTION = `## What to build

Do the thing.

## Acceptance criteria

- [ ] First criterion
- [ ] Second criterion
`;

test("plannerClaimComment names the claim transition", () => {
  assert.match(plannerClaimComment("KIT-114"), /KIT-114: claimed/);
  assert.match(plannerClaimComment("KIT-114"), /Linear Agent left empty/);
});

test("implementInReviewComment includes PR URL and summary", () => {
  const body = implementInReviewComment("KIT-99", {
    prUrl: "https://github.com/KitCollective/kit-collective/pull/52",
    summary: "Role comments wired",
  });
  assert.match(body, /In Review/);
  assert.match(body, /pull\/52/);
  assert.match(body, /Role comments wired/);
});

test("checker pass ticks description Acceptance criteria and builds verdicts", () => {
  const updated = applyCheckerPassDescription(DESCRIPTION);
  assert.match(updated, /- \[x\] First criterion/);
  assert.match(updated, /- \[x\] Second criterion/);
  assert.equal(descriptionAcceptanceCriteriaTicked(updated), true);
  const verdicts = buildCheckerPassVerdicts(DESCRIPTION);
  assert.equal(verdicts.length, 2);
  assert.match(checkerPassComment("KIT-56", verdicts), /checker pass/);
  assert.match(checkerPassComment("KIT-56", verdicts), /✓ First criterion/);
});

test("checker pass applies description rewrites from workpad and comments why", () => {
  const workpad = `${AC_REWRITES_HEADING}

- First criterion → Renamed criterion | contract changed in PR
`;
  const rewrites = parseDescriptionAcRewrites(workpad);
  assert.equal(rewrites.length, 1);
  const updated = applyCheckerPassDescription(DESCRIPTION, { rewrites });
  assert.match(updated, /Renamed criterion/);
  assert.doesNotMatch(updated, /First criterion/);
  const verdicts = buildCheckerPassVerdicts(DESCRIPTION, { rewrites });
  assert.equal(verdicts[0].rewriteReason, "contract changed in PR");
});

test("checker fail comment stays short and points at workpad Review feedback", () => {
  assert.match(checkerFailComment("KIT-56"), /returned to Implementing/);
  assert.match(checkerFailComment("KIT-56"), /Review feedback/);
});

test("auto-merge and land role comments name the transition", () => {
  assert.match(autoMergeFlipComment("KIT-90"), /Auto-merge → Merging/);
  assert.match(autoMergeRefuseComment("KIT-90", "loop cap"), /Auto-merge refused/);
  assert.match(landSuccessComment("KIT-57", "abc123"), /merged to development — abc123/);
  assert.match(landFailComment("KIT-57", "hook declined"), /merge failed/);
});

test("parseAcceptanceCriteria reads unchecked boxes only from the AC section", () => {
  assert.deepEqual(parseAcceptanceCriteria(DESCRIPTION), [
    { checked: false, text: "First criterion" },
    { checked: false, text: "Second criterion" },
  ]);
});
