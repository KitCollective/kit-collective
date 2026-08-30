#!/usr/bin/env node
/**
 * CLI: summarize durable token runs from SQLite.
 *
 *   node harness/token-report.mjs KIT-93
 *   node harness/token-report.mjs --recent 20
 *   KIT_TOKEN_DB_PATH=./tmp/tokens.sqlite node harness/token-report.mjs KIT-93
 */
import { formatCostUsd } from "./token-cost.mjs";
import { createTokenStore, resolveTokenDbPath } from "./token-store.mjs";

/**
 * @param {string} line
 */
function writeOut(line) {
  process.stdout.write(`${line}\n`);
}

/**
 * @param {string} line
 */
function writeErr(line) {
  process.stderr.write(`${line}\n`);
}

/**
 * @param {{
 *   id: number,
 *   endedAt: string,
 *   identifier: string,
 *   role: string,
 *   issueId?: string,
 *   sessionId?: string,
 *   tokensIn: number,
 *   tokensOut: number,
 *   costUsd?: number | null,
 *   costEstimate?: boolean,
 *   lines?: Array<{ role?: string, model?: string, modelId?: string, input?: unknown, output?: unknown, costUsd?: number | null }>,
 * }} run
 */
function printRun(run) {
  const cost = formatCostUsd(run.costUsd);
  const session = run.sessionId ? ` session=${run.sessionId}` : "";
  const issue = run.issueId ? ` issue=${run.issueId}` : "";
  writeOut(
    `#${run.id} ${run.endedAt} ${run.identifier} ${run.role}${issue}${session} in=${run.tokensIn} out=${run.tokensOut} ${cost}${run.costEstimate ? " (est.)" : ""}`,
  );
  for (const line of run.lines ?? []) {
    writeOut(
      `  - ${line.role} ${line.modelId ?? line.model}: in=${line.input} out=${line.output} ${formatCostUsd(line.costUsd)}`,
    );
  }
}

/**
 * @param {string[]} argv
 */
function main(argv) {
  const args = argv.slice(2);
  const recentIdx = args.indexOf("--recent");
  const recent = recentIdx >= 0 ? Number(args[recentIdx + 1] ?? 20) : undefined;
  const identifier = args.find((arg) => !arg.startsWith("--") && arg !== String(recent));
  const dbPath = resolveTokenDbPath(process.env);
  const store = createTokenStore({ dbPath });
  try {
    const routesIdx = args.indexOf("--routes");
    if (routesIdx >= 0) {
      const routeId = args[routesIdx + 1];
      writeOut(`db=${dbPath}`);
      const key = typeof routeId === "string" && !routeId.startsWith("--") ? routeId : "";
      for (const row of store.summarizeRoutes(key)) {
        const avg = typeof row.avgReviewLoops === "number" ? row.avgReviewLoops.toFixed(2) : "n/a";
        writeOut(
          `${row.complexity}: runs=${row.runCount} success=${row.successCount} avgReviewLoops=${avg} ${formatCostUsd(row.costUsd)}`,
        );
      }
      return;
    }
    if (typeof recent === "number" && Number.isFinite(recent)) {
      writeOut(`db=${dbPath}`);
      for (const run of store.listRecent(recent)) {
        printRun(run);
      }
      return;
    }
    if (typeof identifier !== "string" || identifier.length === 0) {
      writeErr("Usage: node harness/token-report.mjs <KIT-n> | --recent <n> | --routes [KIT-n]");
      process.exitCode = 1;
      return;
    }
    writeOut(`db=${dbPath}`);
    const summary = store.summarizeIdentifier(identifier);
    writeOut(
      `summary ${summary.identifier} runs=${summary.runCount} in=${summary.tokensIn} out=${summary.tokensOut} ${formatCostUsd(summary.costUsd)}`,
    );
    for (const run of store.listByIdentifier(identifier, 50)) {
      printRun(run);
    }
  } finally {
    store.close();
  }
}

main(process.argv);
