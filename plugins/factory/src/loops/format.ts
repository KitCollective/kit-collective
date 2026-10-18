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
