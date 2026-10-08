import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMENT_MARKER,
  evidenceLines,
  renderComment,
  replaceEvidenceSection,
} from "../e2e/report.mjs";

const BASE = "https://evidence.example/e2e/";
const AFTER = "aaaaaaa111111111111111111111111111111111";
const BEFORE = "bbbbbbb222222222222222222222222222222222";

const pairs = [
  { flow: "collection", step: "01-collection", status: "same" },
  { flow: "collection", step: "02-shortcut-filter", status: "changed" },
  { flow: "wishlist-paywall", step: "03-extra", status: "new" },
];

const reviews = new Map([
  [
    "collection/02-shortcut-filter",
    {
      verdict: {
        whatChanged: "The chip row is taller | and darker.",
        askedFor: "no",
        designLock: { breaks: true, rule: "Chip height is 32" },
        suggestion: "Keep the old height",
      },
    },
  ],
  ["wishlist-paywall/03-extra", { error: "The Claude review run timed out" }],
]);

test("the comment lists exactly the steps that differ, with before, after and verdict", () => {
  const body = renderComment({
    evidenceBaseUrl: BASE,
    afterSha: AFTER,
    beforeSha: BEFORE,
    flowsStatus: "success",
    flows: ["collection", "wishlist-paywall"],
    pairs,
    reviews,
  });
  const rows = body.split("\n").filter((line) => /^\| [a-z]/.test(line));

  assert.ok(body.startsWith(COMMENT_MARKER));
  assert.equal(rows.length, 2);
  assert.match(body, /2 steps differ, 1 unchanged/);
  assert.ok(!body.includes("01-collection"));
  assert.match(
    rows[0],
    new RegExp(
      `^\\| collection / 02-shortcut-filter \\| changed \\| <a href="https://evidence.example/e2e/${BEFORE}/collection/02-shortcut-filter.png">.*${AFTER}/collection/02-shortcut-filter.png`,
    ),
  );
  assert.match(
    rows[0],
    /⚠️ The chip row is taller \\\| and darker\. \*\*Not asked for by the issue\*\*\./,
  );
  assert.match(rows[0], /\*\*Breaks the design lock:\*\* Chip height is 32/);
  assert.match(rows[0], /_Opinion:_ Keep the old height/);
  // A new step has no before image, and a failed review says so instead of passing silently.
  assert.match(rows[1], /\| new \| {2}\| <a href=/);
  assert.match(rows[1], /Review unavailable: The Claude review run timed out/);
  assert.match(
    body,
    /\[collection\]\(https:\/\/evidence\.example\/e2e\/a{7}1{33}\/collection\/video\.mp4\)/,
  );
});

test("the comment says so when flows failed or there is no before run", () => {
  const body = renderComment({
    evidenceBaseUrl: BASE,
    afterSha: AFTER,
    beforeSha: null,
    flowsStatus: "failure",
    flows: ["collection"],
    pairs: [],
    reviews: new Map(),
  });
  assert.match(body, /Flows did not pass \(failure\)/);
  assert.match(body, /nothing to compare against/);
  assert.ok(!body.includes("| Step |"));
});

test("workpad evidence lines link every recording and the PR comment", () => {
  assert.deepEqual(
    evidenceLines({
      evidenceBaseUrl: BASE,
      afterSha: AFTER,
      flows: ["collection"],
      commentUrl: "https://github.com/o/r/pull/1#issuecomment-2",
    }),
    [
      `- Device flow collection (\`aaaaaaa\`): [recording](https://evidence.example/e2e/${AFTER}/collection/video.mp4)`,
      "- Before/after comparison: [PR comment](https://github.com/o/r/pull/1#issuecomment-2)",
    ],
  );
});

test("only the Evidence section of the workpad is replaced", () => {
  const workpad =
    "## Agent Workpad\n\n### Notes\n\n- kept\n\n### Evidence\n\n- (none)\n\n### Signal-up\n\n- (none)";
  assert.equal(
    replaceEvidenceSection(workpad, ["- new link"]),
    "## Agent Workpad\n\n### Notes\n\n- kept\n\n### Evidence\n\n- new link\n\n### Signal-up\n\n- (none)",
  );
  assert.equal(replaceEvidenceSection("## Agent Workpad\n\n### Notes", ["- x"]), null);
});
