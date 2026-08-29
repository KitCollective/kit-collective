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
  commentsHoldImplementRetryCap,
  descriptionAcceptanceCriteriaTicked,
  implementInReviewComment,
  implementRetryCapComment,
  implementSummaryFromWorkpad,
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

test("implementRetryCapComment holds Implementing with empty Linear Agent", () => {
  const body = implementRetryCapComment("KIT-99");
  assert.match(body, /KIT-99: implement retry cap/);
  assert.match(body, /after 5 in-slot retries/);
  assert.match(body, /Linear Agent left empty/);
  assert.match(body, /No Cursor Cloud Agent/i);
  assert.equal(commentsHoldImplementRetryCap([{ body }]), true);
  assert.equal(commentsHoldImplementRetryCap([{ body: "## Agent Workpad\n\n- (none)\n" }]), false);
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
  const description = `## What to build

First criterion in prose.

## Acceptance criteria

- [ ] First criterion
- [ ] Second criterion
`;
  const workpad = `${AC_REWRITES_HEADING}

- First criterion → Renamed criterion | contract changed in PR
`;
  const rewrites = parseDescriptionAcRewrites(workpad);
  assert.equal(rewrites.length, 1);
  const updated = applyCheckerPassDescription(description, { rewrites });
  assert.match(updated, /First criterion in prose/);
  assert.match(updated, /- \[x\] Renamed criterion/);
  assert.match(updated, /- \[x\] Second criterion/);
  assert.doesNotMatch(updated, /- \[x\] First criterion/);
  const verdicts = buildCheckerPassVerdicts(description, { rewrites });
  assert.equal(verdicts[0].text, "Renamed criterion");
  assert.equal(verdicts[0].rewriteReason, "contract changed in PR");
  assert.equal(verdicts[1].text, "Second criterion");
  assert.equal(verdicts[1].rewriteReason, undefined);
  assert.match(
    checkerPassComment("KIT-56", verdicts),
    /✓ Renamed criterion \(rewrote: contract changed in PR\)/,
  );
  assert.doesNotMatch(checkerPassComment("KIT-56", verdicts), /Second criterion \(rewrote/);
});

test("implementSummaryFromWorkpad uses Notes then checked Plan", () => {
  assert.equal(
    implementSummaryFromWorkpad("## Agent Workpad\n\n### Notes\n\n- Role comments wired\n"),
    "Role comments wired",
  );
  assert.equal(
    implementSummaryFromWorkpad(
      "## Agent Workpad\n\n### Plan\n\n- [x] Wire role comments\n- [ ] Open PR\n",
    ),
    "Wire role comments",
  );
  assert.equal(implementSummaryFromWorkpad("## Agent Workpad\n\n### Notes\n\n- (none)\n"), "");
});

test("checker fail comment stays short and points at workpad Review feedback", () => {
  assert.match(checkerFailComment("KIT-56"), /returned to Implementing/);
  assert.match(checkerFailComment("KIT-56"), /Review feedback/);
});

test("checker fail comment inlines KIT-116-class findings under axis headings", () => {
  const findings = [
    "- Spec: Collection tab missing badge count",
    "- Standards: unused Badge export in apps/mobile/src/components/badge.tsx",
    "- Slop: unused import in apps/mobile/src/components/badge.tsx",
  ].join("\n");
  const body = checkerFailComment("KIT-116", findings);
  assert.match(body, /KIT-116: returned to Implementing/);
  assert.match(body, /### Spec/i);
  assert.match(body, /Collection tab missing badge count/);
  assert.match(body, /### Standards/i);
  assert.match(body, /unused Badge export/);
  assert.match(body, /### Slop/i);
  assert.match(body, /unused import/);
  assert.equal(body.includes("Collection tab missing badge count"), true);
});

test("checker fail comment truncates a huge dump but keeps the first findings verbatim", () => {
  const first = [
    "- Spec: Collection tab missing badge count",
    "- Standards: unused Badge export in apps/mobile/src/components/badge.tsx",
    "- Tests: no regression for badge count",
    "- Slop: unused import in apps/mobile/src/components/badge.tsx",
    "- Standards: invented token on Collection screen",
  ];
  const padding = Array.from(
    { length: 80 },
    (_, index) => `- Standards: filler finding ${index} ${"x".repeat(120)}`,
  );
  const body = checkerFailComment("KIT-116", [...first, ...padding].join("\n"));
  assert.match(body, /Collection tab missing badge count/);
  assert.match(body, /unused Badge export/);
  assert.match(body, /no regression for badge count/);
  assert.match(body, /unused import/);
  assert.match(body, /invented token on Collection screen/);
  assert.match(body, /truncated|workpad/i);
  assert.equal(body.includes("filler finding 79"), false);
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
