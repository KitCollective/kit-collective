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

function printRun(run) {
  const cost = formatCostUsd(run.costUsd);
  const session = run.sessionId ? ` session=${run.sessionId}` : "";
  const issue = run.issueId ? ` issue=${run.issueId}` : "";
  console.log(
    `#${run.id} ${run.endedAt} ${run.identifier} ${run.role}${issue}${session} in=${run.tokensIn} out=${run.tokensOut} ${cost}${run.costEstimate ? " (est.)" : ""}`,
  );
  for (const line of run.lines ?? []) {
    console.log(
      `  - ${line.role} ${line.modelId ?? line.model}: in=${line.input} out=${line.output} ${formatCostUsd(line.costUsd)}`,
    );
  }
}

function main(argv) {
  const args = argv.slice(2);
  const recentIdx = args.indexOf("--recent");
  const recent =
    recentIdx >= 0 ? Number(args[recentIdx + 1] ?? 20) : undefined;
  const identifier = args.find((arg) => !arg.startsWith("--") && arg !== String(recent));
  const dbPath = resolveTokenDbPath(process.env);
  const store = createTokenStore({ dbPath });
  try {
    if (typeof recent === "number" && Number.isFinite(recent)) {
      console.log(`db=${dbPath}`);
      for (const run of store.listRecent(recent)) {
        printRun(run);
      }
      return;
    }
    if (typeof identifier !== "string" || identifier.length === 0) {
      console.error("Usage: node harness/token-report.mjs <KIT-n> | --recent <n>");
      process.exitCode = 1;
      return;
    }
    console.log(`db=${dbPath}`);
    const summary = store.summarizeIdentifier(identifier);
    console.log(
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
