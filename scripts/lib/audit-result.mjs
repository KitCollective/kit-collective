/**
 * The audit result line, as an exact grammar (ADR-0056). One definition for the receipt and the
 * run log, so they cannot disagree about what a valid result or a valid row is.
 *
 *   AUDIT-RESULT <KIT-n> <green|amber|red> <sha 7-40 hex>( <row>(,<row>)*)?
 *
 * It must be the LAST non-empty line of the output, alone on that line (optionally wrapped whole in
 * `**` or backticks). Rows are lock-row ids (LOCK_ROWS) and only appear on amber and red. Anything
 * else on the line, or after it, is no result. LEAD-RESULT and ENGINEER-RESULT keep the generic
 * parser: their trailing sentence is free text.
 */
import { LOCK_ROWS } from "./review-matrix.mjs";

export const ROW_IDS = LOCK_ROWS.map((row) => row.id);
export const AUDIT_VERDICTS = ["green", "amber", "red"];

/** Every Unicode line or paragraph separator, plus form feed, vertical tab and NEL, is a line break. */
const LINE_BREAKS = /[\n\r\f\v\u0085\u2028\u2029]/;
const LINE = /^AUDIT-RESULT ([A-Z][A-Z0-9]*-\d+) (green|amber|red) ([0-9a-fA-F]{7,40})(?: (\S+))?$/;

/** The last non-empty line of a text, with the whole-line markdown wrapper removed. */
export function lastLine(text) {
  const lines = String(text ?? "")
    .split(LINE_BREAKS)
    .map((line) => line.trim())
    .filter(Boolean);
  let last = lines.at(-1) ?? "";
  for (const wrap of ["**", "`"]) {
    if (last.length > 2 * wrap.length && last.startsWith(wrap) && last.endsWith(wrap)) {
      last = last.slice(wrap.length, -wrap.length).trim();
    }
  }
  return last;
}

/**
 * @param {string} text the reviewer's final output
 * @returns {{ issue: string, verdict: string, sha: string, rows: string[] } | null}
 */
export function parseAuditResult(text) {
  const m = LINE.exec(lastLine(text));
  if (!m) {
    return null;
  }
  const rows = m[4] === undefined ? [] : m[4].split(",");
  if (rows.length > 0 && (m[2] === "green" || !rows.every((row) => ROW_IDS.includes(row)))) {
    return null;
  }
  if (new Set(rows).size !== rows.length) {
    return null;
  }
  return { issue: m[1], verdict: m[2], sha: m[3].toLowerCase(), rows };
}
