// How a setting's value reads on the Loops page and in `bb optio loops`.

/** `value` is one of: a boolean, a number, null, or a schedule window. */
export function formatSetting(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (value === null) return key === "schedule" ? "any time" : "no cap";
  if (typeof value === "object" && "from" in value && "to" in value) {
    return `${String(value.from)}–${String(value.to)} UTC`;
  }
  return String(value);
}

/**
 * `scripts/session-check.mjs` reads `flow.maxRunsPerDay` from the file itself (ADR-0065), so a
 * starts-per-day override changes the Board and Max's tick but not that check at run start.
 */
export const STARTS_PER_DAY_NOTE =
  "an override above the file's value is still refused when a run starts: scripts/session-check.mjs reads flow.maxRunsPerDay from factory.config.json.";
