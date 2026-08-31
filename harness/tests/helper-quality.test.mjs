/**
 * Helper quality gate unit tests (P1.3).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateHelperQuality, MIN_HELPER_DURATION_MS } from "../helper-quality.mjs";

test("MIN_HELPER_DURATION_MS is 500", () => {
  assert.equal(MIN_HELPER_DURATION_MS, 500);
});

test("evaluateHelperQuality ok on duration floor", () => {
  const result = evaluateHelperQuality({
    durationMs: MIN_HELPER_DURATION_MS,
    changedFilesCount: 0,
    reviewFeedbackOpen: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "duration");
});

test("evaluateHelperQuality ok on write-scope diff even when fast", () => {
  const result = evaluateHelperQuality({
    durationMs: 50,
    changedFilesCount: 2,
    reviewFeedbackOpen: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "diff");
});

test("evaluateHelperQuality rejects fast empty helper when feedback is open", () => {
  const result = evaluateHelperQuality({
    durationMs: 100,
    changedFilesCount: 0,
    reviewFeedbackOpen: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Review feedback is open/);
});

test("evaluateHelperQuality allows fast empty when feedback is closed", () => {
  const result = evaluateHelperQuality({
    durationMs: 80,
    changedFilesCount: 0,
    reviewFeedbackOpen: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "no-open-feedback");
});
