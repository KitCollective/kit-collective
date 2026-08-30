/**
 * Durable SQLite token runs + Cursor cost aliases.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { logTokenRun, publicTokenSnapshot } from "../pi-job.mjs";
import {
  estimateLineCostUsd,
  formatCostUsd,
  MODEL_PRICING_USD_PER_MTOK,
  readReportedCostUsd,
  sumCostUsd,
} from "../token-cost.mjs";
import { createTokenStore, setDefaultTokenStoreForTests } from "../token-store.mjs";

test("Cursor Composer slug variants resolve to the same list rate", () => {
  const a = estimateLineCostUsd({
    model: "cursor/composer-2.5",
    input: 1_000_000,
    output: 1_000_000,
  });
  const b = estimateLineCostUsd({
    model: "Composer 2.5",
    input: 1_000_000,
    output: 1_000_000,
  });
  const c = estimateLineCostUsd({
    model: "composer-2",
    input: 1_000_000,
    output: 1_000_000,
  });
  assert.equal(a.costUsd, 0.5 + 2.5);
  assert.equal(b.costUsd, a.costUsd);
  assert.equal(c.costUsd, a.costUsd);
  assert.equal(a.estimate, true);
  assert.equal(MODEL_PRICING_USD_PER_MTOK.Grok.input, 2);
});

test("Cursor Grok slug variants resolve", () => {
  const a = estimateLineCostUsd({
    model: "cursor/grok-4.6",
    input: 1_000_000,
    output: 0,
  });
  const b = estimateLineCostUsd({
    model: "grok-4.6",
    input: 1_000_000,
    output: 0,
  });
  assert.equal(a.costUsd, 2);
  assert.equal(b.costUsd, 2);
});

test("reported usage.cost from Cursor/Pi wins over list rate", () => {
  assert.equal(readReportedCostUsd({ cost: 0.42 }), 0.42);
  const { costUsd, estimate } = estimateLineCostUsd({
    model: "cursor/composer-2.5",
    input: 1_000_000,
    output: 1_000_000,
    reportedCostUsd: 0.12,
  });
  assert.equal(costUsd, 0.12);
  assert.equal(estimate, false);
});

test("sumCostUsd ignores unknown lines", () => {
  assert.equal(sumCostUsd([{ costUsd: 0.01 }, { costUsd: null }, { costUsd: 0.02 }]), 0.03);
  assert.equal(sumCostUsd([{ costUsd: null }]), null);
  assert.match(formatCostUsd(0.0021), /0\.0021/);
});

test("token store persists issue, session, models, and cost", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-token-"));
  const dbPath = join(dir, "token-runs.sqlite");
  const store = createTokenStore({ dbPath });
  try {
    const snap = publicTokenSnapshot({
      role: "implement",
      identifier: "KIT-93",
      issueId: "issue-uuid-1",
      sessionId: "session-uuid-9",
      endedAt: "2026-08-30T12:00:00.000Z",
      lines: [
        {
          role: "implement",
          model: "Composer",
          modelId: "cursor/composer-2.5",
          input: 1000,
          output: 200,
        },
        {
          role: "helper",
          model: "Composer",
          modelId: "composer-2.5",
          input: 100,
          output: 20,
          reportedCostUsd: 0.001,
        },
      ],
    });
    const written = store.recordTokenRun(snap);
    assert.ok(written?.id);
    const rows = store.listByIdentifier("KIT-93");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].issueId, "issue-uuid-1");
    assert.equal(rows[0].sessionId, "session-uuid-9");
    assert.equal(typeof rows[0].costUsd, "number");
    assert.ok(rows[0].lines.some((line) => line.modelId === "cursor/composer-2.5"));
    assert.ok(rows[0].lines.some((line) => line.costEstimate === false));
    const summary = store.summarizeIdentifier("KIT-93");
    assert.equal(summary.runCount, 1);
    assert.equal(typeof summary.costUsd, "number");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("logTokenRun writes through an injected store", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-token-"));
  const dbPath = join(dir, "token-runs.sqlite");
  const store = createTokenStore({ dbPath });
  setDefaultTokenStoreForTests(store);
  try {
    logTokenRun(
      publicTokenSnapshot({
        role: "factory-checker",
        identifier: "KIT-7",
        sessionId: "sess-7",
        lines: [
          {
            role: "factory-checker",
            model: "Grok",
            modelId: "cursor/grok-4.6",
            input: 500,
            output: 80,
          },
        ],
      }),
      { store },
    );
    const rows = store.listByIdentifier("KIT-7");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, "factory-checker");
    assert.equal(rows[0].sessionId, "sess-7");
    assert.equal(typeof rows[0].costUsd, "number");
  } finally {
    setDefaultTokenStoreForTests(null);
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
