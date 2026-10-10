/**
 * Measures the flow from the run log (ADR-0051, ADR-0052): the answer to "does a Lead cost more
 * than it saves in review rounds?". Pure functions over parsed events.
 */

/** @param {Record<string, unknown>[]} events */
export function summariseIssues(events) {
  /** @type {Map<string, any>} */
  const issues = new Map();
  const get = (id) => {
    if (!issues.has(id)) {
      issues.set(id, {
        issue: id,
        lead: false,
        rounds: 0,
        firstAudit: null,
        redAudits: 0,
        landed: false,
        tokens: { total: 0, afterFirstRed: 0, unknown: 0, byStep: {} },
      });
    }
    return issues.get(id);
  };
  for (const e of events) {
    if (!e.issue) {
      continue;
    }
    const row = get(e.issue);
    if (e.event === "spawn" && e.step === "lead") {
      row.lead = true;
    } else if (e.event === "audit") {
      row.rounds += 1;
      row.firstAudit ??= e.verdict;
      row.redAudits += e.verdict === "red" ? 1 : 0;
    } else if (e.event === "result") {
      if (e.step === "lander" && ["landed", "merged"].includes(e.outcome)) {
        row.landed = true;
      }
      const known = Number.isInteger(e.tokensIn) || Number.isInteger(e.tokensOut);
      if (!known) {
        row.tokens.unknown += 1;
        continue;
      }
      const sum = (e.tokensIn ?? 0) + (e.tokensOut ?? 0);
      row.tokens.total += sum;
      row.tokens.byStep[e.step] = (row.tokens.byStep[e.step] ?? 0) + sum;
      if (row.redAudits > 0) {
        row.tokens.afterFirstRed += sum;
      }
    }
  }
  return [...issues.values()];
}

/** Groups below this many issues are printed as a small sample, not as a finding. */
export const SMALL_SAMPLE = 10;

const mean = (xs) =>
  xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
const share = (part, whole) => (whole === 0 ? null : Math.round((part / whole) * 100) / 100);

/** @param {ReturnType<typeof summariseIssues>} rows */
function cohort(rows) {
  const audited = rows.filter((r) => r.rounds > 0);
  const withTokens = rows.filter((r) => r.tokens.total > 0);
  const total = withTokens.reduce((a, r) => a + r.tokens.total, 0);
  const rework = withTokens.reduce((a, r) => a + r.tokens.afterFirstRed, 0);
  return {
    issues: rows.length,
    landed: rows.filter((r) => r.landed).length,
    meanRounds: mean(audited.map((r) => r.rounds)),
    firstAuditRedShare: share(audited.filter((r) => r.firstAudit === "red").length, audited.length),
    meanTokensPerIssue: mean(withTokens.map((r) => r.tokens.total)),
    reworkTokenShare: share(rework, total),
    issuesWithoutTokens: rows.length - withTokens.length,
  };
}

/** @param {Record<string, unknown>[]} events */
export function buildReport(events) {
  const issues = summariseIssues(events);
  const byStep = {};
  for (const row of issues) {
    for (const [step, n] of Object.entries(row.tokens.byStep)) {
      byStep[step] = (byStep[step] ?? 0) + n;
    }
  }
  return {
    withLead: cohort(issues.filter((r) => r.lead)),
    withoutLead: cohort(issues.filter((r) => !r.lead)),
    tokensByStep: byStep,
    issues,
  };
}

/** @param {ReturnType<typeof buildReport>} report */
export function renderReport(report) {
  const fmt = (v) => (v === null ? "n/a" : String(v));
  const lines = [];
  for (const [name, c] of [
    ["with Lead", report.withLead],
    ["without Lead", report.withoutLead],
  ]) {
    const sample =
      c.issues < SMALL_SAMPLE ? `, SMALL SAMPLE (under ${SMALL_SAMPLE}): not a result` : "";
    lines.push(
      `${name} (n=${c.issues}${sample}): ${c.issues} issues, ${c.landed} landed, rounds/issue ${fmt(c.meanRounds)}, first audit red ${fmt(c.firstAuditRedShare)}, tokens/issue ${fmt(c.meanTokensPerIssue)}, rework token share ${fmt(c.reworkTokenShare)}, no tokens recorded ${c.issuesWithoutTokens}`,
    );
  }
  lines.push(`tokens by step: ${JSON.stringify(report.tokensByStep)}`);
  return lines.join("\n");
}
