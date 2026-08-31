/**
 * Composition fail-close gate unit tests (P2.1).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateCompositionGate,
  parseCompositionSection,
} from "../composition-gate.mjs";

const BASE = `## Agent Workpad

### Composition

- apps/mobile/src/components/empty-state.tsx
- Skip Draft: no

### Review feedback

- (none)
`;

test("parseCompositionSection reads paths and Skip Draft", () => {
  const parsed = parseCompositionSection(BASE);
  assert.equal(parsed.hasSection, true);
  assert.ok(parsed.paths.includes("apps/mobile/src/components/empty-state.tsx"));
  assert.equal(parsed.skipDraft, false);
  assert.equal(parsed.packageJsonMentioned, false);
});

test("evaluateCompositionGate fails when Composition is missing", () => {
  const result = evaluateCompositionGate({
    workpadBody: "## Agent Workpad\n\n### Review feedback\n\n- (none)\n",
  });
  assert.equal(result.ok, false);
  assert.ok(result.feedback.some((line) => /missing ### Composition/i.test(line)));
});

test("evaluateCompositionGate fails without paths", () => {
  const result = evaluateCompositionGate({
    workpadBody: `## Agent Workpad

### Composition

- Skip Draft: yes
`,
  });
  assert.equal(result.ok, false);
  assert.ok(result.feedback.some((line) => /at least one repo-relative path/i.test(line)));
});

test("evaluateCompositionGate allows missing Skip Draft when skipDraftAllowed", () => {
  const result = evaluateCompositionGate({
    workpadBody: `## Agent Workpad

### Composition

- apps/api/src/auth/session.ts
`,
    skipDraftAllowed: true,
  });
  assert.equal(result.ok, true);
});

test("evaluateCompositionGate requires lockfile-need when package.json listed", () => {
  const missing = evaluateCompositionGate({
    workpadBody: `## Agent Workpad

### Composition

- apps/api/package.json
- Skip Draft: no
`,
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.feedback.some((line) => /Lockfile need/i.test(line)));

  const noted = evaluateCompositionGate({
    workpadBody: `## Agent Workpad

### Composition

- apps/api/package.json
- Skip Draft: no
- Lockfile need: yes
`,
  });
  assert.equal(noted.ok, true);
  assert.equal(noted.parsed.lockfileNeed, true);
});
