/**
 * KIT-127 — Slop inline GitHub review threads (comment-only gh seam).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertGhCliActionAllowed,
  createSlopReviewGh,
  isSlopReviewComment,
  parseSlopFindingLine,
  parseSlopFindings,
  slopCommentBody,
  slopThreadFingerprint,
  SLOP_REVIEW_MARKER,
} from "../slop-review.mjs";

test("parseSlopFindingLine reads path:line and in-path hunks", () => {
  assert.deepEqual(parseSlopFindingLine("- Slop/ narrating comment in harness/bar.mjs"), {
    raw: "- Slop/ narrating comment in harness/bar.mjs",
    path: "harness/bar.mjs",
    lineNumber: 1,
    message: "narrating comment in harness/bar.mjs",
  });
  assert.deepEqual(parseSlopFindingLine("- Slop/ dead code at harness/foo.mjs:42"), {
    raw: "- Slop/ dead code at harness/foo.mjs:42",
    path: "harness/foo.mjs",
    lineNumber: 42,
    message: "dead code at harness/foo.mjs:42",
  });
});

test("parseSlopFindings ignores clean Slop axis line", () => {
  const body = `## Agent Workpad

### Review feedback

- Spec: (none)
- Standards: (none)
- Slop: (none)
`;
  assert.deepEqual(parseSlopFindings(body), []);
  const failBody = `${body.replace("- Slop: (none)", "- Slop/ filler in docs/readme.md")}`;
  assert.equal(parseSlopFindings(failBody).length, 1);
});

test("slopCommentBody marks factory-checker threads", () => {
  const body = slopCommentBody({
    path: "harness/bar.mjs",
    lineNumber: 3,
    message: "narrating comment",
  });
  assert.match(body, /\[factory-checker\/slop\]/);
  assert.match(body, /narrating comment/);
  assert.equal(isSlopReviewComment(body), true);
});

test("assertGhCliActionAllowed denies merge and approve", () => {
  assert.throws(() => assertGhCliActionAllowed("merge"), /cannot merge or approve/);
  assert.throws(() => assertGhCliActionAllowed("approve"), /cannot merge or approve/);
  assert.doesNotThrow(() => assertGhCliActionAllowed("comment"));
});

test("createSlopReviewGh posts inline comments on fail sync", async () => {
  const calls = [];
  const gh = createSlopReviewGh({
    repo: "KitCollective/kit-collective",
    async runCommand(command, args) {
      calls.push([command, ...args]);
      if (args.includes("graphql") && args.some((part) => String(part).includes("SlopReviewThreads"))) {
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                headRefOid: "abc123",
                reviewThreads: { nodes: [] },
              },
            },
          },
        });
      }
      if (args.includes("POST") && args.some((part) => String(part).includes("/comments"))) {
        return JSON.stringify({ id: 99 });
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });

  const workpad = `## Agent Workpad

### Review feedback

- Spec: (none)
- Standards: (none)
- Slop/ narrating comment in harness/bar.mjs:12
`;
  const result = await gh.syncSlopReviewThreads({ number: 127, workpadBody: workpad });
  assert.deepEqual(result.posted, ["harness/bar.mjs:12"]);
  assert.deepEqual(result.resolved, []);
  assert.equal(
    calls.some(
      (call) =>
        call.includes("POST") &&
        call.some((part) => String(part).includes("/pulls/127/comments")),
    ),
    true,
  );
});

test("createSlopReviewGh resolves stale threads on second pass", async () => {
  let threads = [
    {
      id: "thread-1",
      isResolved: false,
      comments: {
        nodes: [
          {
            body: `${SLOP_REVIEW_MARKER}\nold finding`,
            path: "harness/old.mjs",
            line: 4,
          },
        ],
      },
    },
  ];
  const calls = [];
  const gh = createSlopReviewGh({
    repo: "KitCollective/kit-collective",
    async runCommand(command, args) {
      calls.push([command, ...args]);
      if (args.includes("graphql") && args.some((part) => String(part).includes("SlopReviewThreads"))) {
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                headRefOid: "abc123",
                reviewThreads: { nodes: threads },
              },
            },
          },
        });
      }
      if (args.some((part) => String(part).includes("ResolveSlopThread"))) {
        threads = threads.map((thread) =>
          thread.id === "thread-1" ? { ...thread, isResolved: true } : thread,
        );
        return JSON.stringify({
          data: { resolveReviewThread: { thread: { id: "thread-1", isResolved: true } } },
        });
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });

  const result = await gh.syncSlopReviewThreads({ number: 127, findings: [] });
  assert.deepEqual(result.posted, []);
  assert.deepEqual(result.resolved, ["harness/old.mjs:4"]);
  assert.equal(slopThreadFingerprint({ path: "harness/old.mjs", line: 4 }), "harness/old.mjs:4");
});

test("createSlopReviewGh merge and approve throw", () => {
  const gh = createSlopReviewGh();
  assert.throws(() => gh.merge(), /cannot merge/);
  assert.throws(() => gh.approve(), /cannot approve/);
});
