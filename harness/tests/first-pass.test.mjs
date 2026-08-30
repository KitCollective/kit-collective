import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bumpFirstPassCandidates,
  collectFirstPassViolations,
  extractIssueConstraints,
  extractIssuePaths,
  extractPriorFailLines,
  extractWorkpadCompositionPaths,
  formatFirstPassFeedback,
  formatRegistryForChecker,
  formatSliceBrief,
  reviewFeedbackIsFirstPassOnly,
  scanFirstPassFile,
} from "../first-pass.mjs";
import { formatHermesLessonsBrief, selectHermesLessons } from "../hermes-lessons.mjs";
import { completeImplementAdw, IMPLEMENTING, IN_REVIEW } from "../implement-exit.mjs";
import { isCheapImplementRetry } from "../job-queue.mjs";
import { implementPrompt } from "../pi-job.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SAMPLE_CLASS = {
  id: "empty-state-body",
  feedbackTag: "first-pass:empty-state-body",
  scan: {
    glob: "apps/mobile/**",
    regex: "<EmptyState[^>]*\\bbody\\s*=\\s*[\"']\\s*[\"']",
    flags: "m",
    message: "EmptyState body must not be empty",
  },
};

test("extractIssuePaths and constraints are ticket-derived", () => {
  const paths = extractIssuePaths(
    "Mirror `apps/mobile/src/components/facet-picker-overlay.tsx` and packages/domain/src/foo.ts.",
  );
  assert.ok(paths.includes("apps/mobile/src/components/facet-picker-overlay.tsx"));
  assert.ok(paths.includes("packages/domain/src/foo.ts"));
  assert.deepEqual(
    extractIssueConstraints("- Do not invent a sixth tab\n- Do not nest Sheets"),
    ["Do not invent a sixth tab", "Do not nest Sheets"],
  );
});

test("formatSliceBrief includes paths, Do not lines, and prior fails", () => {
  const text = formatSliceBrief({
    paths: ["apps/mobile/src/a.tsx"],
    constraints: ["Do not nest Sheets"],
    priorFails: ["Spec: EmptyState body empty"],
  });
  assert.match(text, /Slice brief/);
  assert.match(text, /apps\/mobile\/src\/a\.tsx/);
  assert.match(text, /Do not nest Sheets/);
  assert.match(text, /Prior checker findings/);
  assert.match(text, /EmptyState body empty/);
});

test("extractWorkpadCompositionPaths reads ### Composition only", () => {
  const paths = extractWorkpadCompositionPaths(`## Agent Workpad

### Composition

- apps/mobile/src/components/genveje-sheet.tsx
- see also apps/mobile/src/components/facet-picker-overlay.tsx

### Review feedback

- Spec: (none)
`);
  assert.deepEqual(paths.sort(), [
    "apps/mobile/src/components/facet-picker-overlay.tsx",
    "apps/mobile/src/components/genveje-sheet.tsx",
  ]);
});

test("scanFirstPassFile runs only registry scanners", () => {
  assert.deepEqual(
    scanFirstPassFile(
      "apps/mobile/src/components/wishlist-sheet.tsx",
      `<Sheet><EmptyState title="x" body="" /></Sheet>`,
      [],
    ),
    [],
  );
  assert.deepEqual(
    scanFirstPassFile(
      "apps/mobile/src/components/wishlist-sheet.tsx",
      `<Sheet><EmptyState title="x" body="" /></Sheet>`,
      [SAMPLE_CLASS],
    ),
    [
      "apps/mobile/src/components/wishlist-sheet.tsx: [first-pass:empty-state-body] EmptyState body must not be empty",
    ],
  );
  assert.deepEqual(
    scanFirstPassFile(
      "apps/mobile/src/components/wishlist-sheet.tsx",
      `<Sheet><EmptyState title="Ønske" body="Tilføj den første række." /></Sheet>`,
      [SAMPLE_CLASS],
    ),
    [],
  );
});

test("collectFirstPassViolations uses registry; empty registry is a no-op", () => {
  const files = {
    "apps/mobile/src/components/wishlist-sheet.tsx": `<EmptyState title="x" body="" />`,
  };
  assert.deepEqual(
    collectFirstPassViolations({
      cwd: "/wt",
      files: Object.keys(files),
      readFile: (rel) => files[rel],
      registry: { classes: [] },
    }),
    [],
  );
  assert.equal(
    collectFirstPassViolations({
      cwd: "/wt",
      files: Object.keys(files),
      readFile: (rel) => files[rel],
      registry: { classes: [SAMPLE_CLASS] },
    }).length,
    1,
  );
});

test("reviewFeedbackIsFirstPassOnly requires First-pass or registered tags", () => {
  assert.equal(
    reviewFeedbackIsFirstPassOnly(
      [
        "- First-pass: EmptyState body empty",
        "- Spec: [first-pass:empty-state-body] EmptyState body must not be empty",
      ].join("\n"),
      [SAMPLE_CLASS],
    ),
    true,
  );
  assert.equal(
    reviewFeedbackIsFirstPassOnly(
      [
        '- Spec: Empty Wishlist EmptyState uses `body=""` — lock requires one-sentence body.',
        "- Standards: Nested Sheets — facet pick is overlay + List row.",
      ].join("\n"),
    ),
    false,
  );
  assert.equal(
    reviewFeedbackIsFirstPassOnly(
      ["- Spec: Missing react-native-iap in package.json.", '- Standards: EmptyState body="".'].join(
        "\n",
      ),
      [SAMPLE_CLASS],
    ),
    false,
  );
  assert.equal(reviewFeedbackIsFirstPassOnly("- Spec: (none)\n- Standards: (none)"), false);
});

test("formatFirstPassFeedback prefixes First-pass cheap retry lines", () => {
  const lines = formatFirstPassFeedback([
    "apps/mobile/src/x.tsx: [first-pass:empty-state-body] EmptyState body must not be empty",
  ]);
  assert.match(lines[0], /First-pass/);
  assert.match(lines[1], /empty-state-body/);
});

test("first-pass-only checker feedback uses Skip Scout prompt when tagged", () => {
  const prompt = implementPrompt("implement", "KIT-133", ".pi/adw/feature.yaml", {
    reviewFeedback: [
      "- First-pass: registry class matched",
      "- Spec: [first-pass:empty-state-body] EmptyState body must not be empty",
    ].join("\n"),
    writeScope: "apps/mobile/**",
    firstPassClasses: [SAMPLE_CLASS],
  });
  assert.match(prompt, /First-pass resume/i);
  assert.match(prompt, /Skip Scout/i);
  assert.match(prompt, /Skip helpers/i);
  assert.equal(/Required helpers:/i.test(prompt), false);
});

test("first-run prompt asks for ### Composition and serial helpers without Gate", () => {
  const prompt = implementPrompt("implement", "KIT-1", ".pi/adw/feature.yaml", {
    writeScope: "apps/mobile/**",
    implementContext: { requiredHelpers: ["expo"], skills: [], rules: [], appendOverlay: "" },
  });
  assert.match(prompt, /### Composition/);
  assert.match(prompt, /Spawn Scout/i);
  assert.match(prompt, /one at a time/i);
  assert.match(prompt, /Do not spawn Gate/i);
  assert.equal(/Then spawn Gate/i.test(prompt), false);
});

test("bumpFirstPassCandidates requires ratchet on second Standards fail", () => {
  const line = "- Standards: Nested Sheet for season pick — use facet overlay";
  const first = bumpFirstPassCandidates("## Agent Workpad\n\n### Review feedback\n\n- old\n", [
    line,
  ]);
  assert.match(first.workpad, /First-pass candidates/);
  assert.equal(first.ratchetLines.length, 0);
  const second = bumpFirstPassCandidates(first.workpad, [line]);
  assert.equal(second.ratchetLines.length, 1);
  assert.match(second.ratchetLines[0], /first-pass-classes\.json/);
  assert.match(second.ratchetLines[0], /\[first-pass:/);
});

test("selectHermesLessons ranks failures and formats brief", () => {
  const hermesDir = "/fake-hermes";
  const files = {
    "/fake-hermes/failures.md": [
      "empty state body must be one sentence → fill EmptyState body from the lock <!-- created=2026-08-01, last=2026-08-01 -->",
      "§",
      "unused import in badge → delete unused exports",
    ].join("\n"),
  };
  const lessons = selectHermesLessons({
    hermesDir,
    query: "EmptyState body empty Standards",
    exists: (path) => path in files || path === "/fake-hermes/failures.md",
    readFile: (path) => files[path] ?? files["/fake-hermes/failures.md"],
  });
  assert.ok(lessons.length >= 1);
  assert.match(lessons[0], /empty state body/i);
  assert.match(formatHermesLessonsBrief(lessons), /Prior worker lessons/);
  assert.equal(formatHermesLessonsBrief([]), "");
});

test("formatRegistryForChecker lists ids for checker append", () => {
  assert.match(formatRegistryForChecker([]), /empty/);
  assert.match(
    formatRegistryForChecker([SAMPLE_CLASS]),
    /first-pass:empty-state-body/,
  );
});

test("isCheapImplementRetry includes firstPassRetryAttempt", () => {
  assert.equal(isCheapImplementRetry({ role: "implement", firstPassRetryAttempt: 2 }), true);
  assert.equal(isCheapImplementRetry({ role: "implement", firstPassRetryAttempt: 1 }), false);
});

test("extractPriorFailLines skips (none) and First-pass bullets", () => {
  assert.deepEqual(
    extractPriorFailLines(
      "- Spec: (none)\n- Standards: Nested Sheet\n- First-pass: ignore\n- Slop: dummy ids",
    ),
    ["Standards: Nested Sheet", "Slop: dummy ids"],
  );
});

test("completeImplementAdw firstPassRetry when registry scan hits", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "kit-first-pass-"));
  const rel = "apps/mobile/src/components/wishlist-sheet.tsx";
  mkdirSync(dirname(join(cwd, rel)), { recursive: true });
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi/first-pass-classes.json"),
    JSON.stringify({ classes: [SAMPLE_CLASS] }, null, 2),
  );
  writeFileSync(
    join(cwd, rel),
    `export function Wishlist() { return <Sheet><EmptyState title="x" body="" /></Sheet>; }\n`,
  );
  const comments = [
    {
      id: "c1",
      body: "## Agent Workpad\n\n### Review feedback\n\n- Spec: (none)\n",
    },
  ];
  let opened = false;
  const result = await completeImplementAdw({
    job: { identifier: "KIT-133", issueId: "issue-133", adwFile: ".pi/adw/feature.yaml" },
    checkout: { path: cwd, branch: "kit-133" },
    gh: {
      async rebase() {},
      async viewPr() {
        if (!opened) {
          return { url: undefined, mergeable: "UNKNOWN", checks: [] };
        }
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/153",
          mergeable: "MERGEABLE",
          checks: [{ name: "test", conclusion: "success", isRequired: true }],
        };
      },
      async findOpenIssuePr() {
        return null;
      },
      async createPr() {
        opened = true;
        return {
          url: "https://github.com/KitCollective/kit-collective/pull/153",
          mergeable: "MERGEABLE",
          checks: [{ name: "test", conclusion: "success", isRequired: true }],
        };
      },
    },
    linear: {
      async listComments() {
        return comments;
      },
      async updateWorkpad(input) {
        comments[0].body = input.body;
      },
      async setStatus() {},
    },
    typecheckTouched: async () => undefined,
    formatCheck: async () => undefined,
    listChangedFiles: async () => [rel],
    adwText: readFileSync(join(ROOT, ".pi/adw/feature.yaml"), "utf8"),
    sleep: async () => undefined,
    waitIntervalMs: 0,
    waitTimeoutMs: 60_000,
  });

  assert.equal(result.status, IMPLEMENTING);
  assert.equal(result.firstPassRetry, true);
  assert.match(comments[0].body, /First-pass/);
  assert.match(comments[0].body, /empty-state-body/);
  assert.equal(result.status === IN_REVIEW, false);
});
