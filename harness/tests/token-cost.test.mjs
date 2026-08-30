/**
 * Token cost estimates and Spec-only / token-run logging.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reviewFeedbackIsSpecOnly } from "../first-pass.mjs";
import { WORKPAD_HEADING } from "../linear-cli.mjs";
import {
  applyTokenUseWorkpad,
  createTokenUseCollector,
  formatTokenUseRun,
  implementPrompt,
  MAX_TOKEN_USE_RUNS_ON_WORKPAD,
  piArgsForRole,
  publicTokenSnapshot,
  TOKEN_USE_HEADING,
  tokenSnapshotFromCollected,
} from "../pi-job.mjs";
import {
  estimateLineCostUsd,
  formatCostUsd,
  MODEL_PRICING_USD_PER_MTOK,
  sumCostUsd,
} from "../token-cost.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("estimateLineCostUsd uses Composer list rates", () => {
  const { costUsd } = estimateLineCostUsd({
    model: "cursor/composer-2.5",
    input: 1_000_000,
    output: 1_000_000,
  });
  assert.equal(costUsd, 0.5 + 2.5);
  assert.equal(MODEL_PRICING_USD_PER_MTOK.Grok.input, 2);
  assert.match(formatCostUsd(0.0021), /\$0\.0021/);
});

test("sumCostUsd ignores unknown lines", () => {
  assert.equal(sumCostUsd([{ costUsd: 0.01 }, { costUsd: null }, { costUsd: 0.02 }]), 0.03);
  assert.equal(sumCostUsd([{ costUsd: null }]), null);
});

test("reviewFeedbackIsSpecOnly when only Spec has findings", () => {
  assert.equal(
    reviewFeedbackIsSpecOnly("- Spec: missing badge\n- Standards: (none)\n- Slop: (none)\n"),
    true,
  );
  assert.equal(
    reviewFeedbackIsSpecOnly("- Spec: missing badge\n- Standards: lint\n- Slop: (none)\n"),
    false,
  );
  assert.equal(reviewFeedbackIsSpecOnly("- Standards: lint\n- Slop: (none)\n"), false);
});

test("implementPrompt Spec-only resume skips Scout, Draft, and helpers", () => {
  const prompt = implementPrompt("implement", "KIT-200", ".pi/adw/feature.yaml", {
    reviewFeedback: "- Spec: AC evidence missing\n- Standards: (none)\n- Slop: (none)\n",
    writeScope: "harness/**",
  });
  assert.match(prompt, /Spec-only resume/i);
  assert.match(prompt, /Skip Scout/);
  assert.match(prompt, /Skip Draft/);
  assert.match(prompt, /Skip helpers/);
});

test("estimateLineCostUsd prices Laguna list rate and free Draft models at zero", () => {
  const { costUsd, estimate } = estimateLineCostUsd({
    model: "openrouter/poolside/laguna-s-2.1",
    input: 2_000_000,
    output: 500_000,
  });
  // 2M * $0.09 + 0.5M * $0.18 = $0.18 + $0.09 = $0.27
  assert.equal(costUsd, 0.27);
  assert.equal(estimate, true);
  assert.equal(MODEL_PRICING_USD_PER_MTOK["minimax/minimax-m3:free"].input, 0);
  assert.equal(MODEL_PRICING_USD_PER_MTOK["z-ai/glm-5.2:free"].output, 0);
});

test("piArgsForRole sets --no-context-files for implement and checker", () => {
  const implement = piArgsForRole(
    "implement",
    ROOT,
    ".pi/roles/implement.md",
    "cursor/composer-2.5",
    "hi",
    {
      implementContext: { requiredHelpers: [], skills: [], rules: [], slimOnly: true },
    },
  );
  assert.equal(implement.includes("--no-context-files"), true);
  const checker = piArgsForRole(
    "factory-checker",
    ROOT,
    ".pi/roles/factory-checker.md",
    "cursor/grok-4.6",
    "hi",
  );
  assert.equal(checker.includes("--no-context-files"), true);
});

test("tokenSnapshotFromCollected adds costUsd and helper lines", async () => {
  const collector = createTokenUseCollector();
  await collector.consumeLine(
    JSON.stringify({ type: "message_update", usage: { input: 1000, output: 100 } }),
  );
  await collector.consumeLine(
    JSON.stringify({
      type: "tool_execution_end",
      toolName: "subagent",
      args: { agent: "expo" },
      result: { agent: "expo", usage: { input: 200, output: 40 } },
    }),
  );
  const snap = tokenSnapshotFromCollected("implement", collector.snapshot(), "KIT-1");
  assert.equal(snap.lines.length, 2);
  assert.equal(typeof snap.costUsd, "number");
  assert.ok(snap.lines.some((line) => line.role === "expo" && line.model === "Composer"));
  assert.match(formatTokenUseRun(snap), /Total ~/);
});

test("applyTokenUseWorkpad keeps a ring of runs", () => {
  let body = `${WORKPAD_HEADING}\n`;
  for (let i = 0; i < MAX_TOKEN_USE_RUNS_ON_WORKPAD + 2; i += 1) {
    body = applyTokenUseWorkpad(
      body,
      publicTokenSnapshot({
        role: "implement",
        identifier: `KIT-${i}`,
        endedAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
        lines: [{ role: "implement", model: "Composer", input: 10, output: 1 }],
      }),
    );
  }
  assert.match(body, new RegExp(TOKEN_USE_HEADING));
  const runs = body.match(/#### Run /g) ?? [];
  assert.equal(runs.length, MAX_TOKEN_USE_RUNS_ON_WORKPAD);
});
