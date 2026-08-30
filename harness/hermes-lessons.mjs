/**
 * Read Worker memory failures.md (pi-hermes-memory) for implement append injection.
 * Fail-open: missing store → empty. Never dumps MEMORY.md. Cap top-3 ranked hits.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT_IDENTIFIER_PATTERN } from "./worker-memory.mjs";

/** Pinned to pi-hermes-memory ENTRY_DELIMITER. */
export const HERMES_ENTRY_DELIMITER = "\n§\n";
export const HERMES_FAILURES_FILE = "failures.md";
export const MAX_HERMES_LESSONS = 3;
export const MAX_HERMES_LESSON_CHARS = 800;

/**
 * @param {string} raw
 * @returns {string}
 */
export function stripHermesEntryMeta(raw = "") {
  return String(raw)
    .replace(/\s*<!--\s*created=[^>]+-->\s*$/i, "")
    .trim();
}

/**
 * @param {string} hermesDir
 * @param {{ readFile?: (path: string) => string, exists?: (path: string) => boolean }} [deps]
 * @returns {string[]}
 */
export function loadHermesFailureEntries(hermesDir, deps = {}) {
  if (typeof hermesDir !== "string" || hermesDir.length === 0) {
    return [];
  }
  const exists = deps.exists ?? existsSync;
  const read = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
  const path = join(hermesDir, HERMES_FAILURES_FILE);
  if (!exists(path)) {
    return [];
  }
  try {
    const raw = read(path);
    return raw
      .split(HERMES_ENTRY_DELIMITER)
      .map((entry) => stripHermesEntryMeta(entry))
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.replace(KIT_IDENTIFIER_PATTERN, "").replace(/\s+/g, " ").trim())
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function queryTokens(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

/**
 * Rank failure entries against review feedback / issue text.
 *
 * @param {{
 *   hermesDir?: string,
 *   query?: string,
 *   limit?: number,
 *   readFile?: (path: string) => string,
 *   exists?: (path: string) => boolean,
 * }} input
 * @returns {string[]}
 */
export function selectHermesLessons({
  hermesDir = "",
  query = "",
  limit = MAX_HERMES_LESSONS,
  readFile,
  exists,
} = {}) {
  const entries = loadHermesFailureEntries(hermesDir, { readFile, exists });
  if (entries.length === 0) {
    return [];
  }
  const tokens = new Set(queryTokens(query));
  /** @type {Array<{ score: number, text: string }>} */
  const scored = [];
  for (const text of entries) {
    const lower = text.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (lower.includes(token)) {
        score += 1;
      }
    }
    if (score === 0 && tokens.size === 0) {
      score = 1;
    }
    if (score > 0) {
      scored.push({ score, text });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  const out = [];
  let chars = 0;
  for (const row of scored) {
    if (out.length >= limit) {
      break;
    }
    const next = row.text.slice(0, 240);
    if (chars + next.length > MAX_HERMES_LESSON_CHARS) {
      break;
    }
    out.push(next);
    chars += next.length;
  }
  return out;
}

/**
 * @param {string[]} lessons
 */
export function formatHermesLessonsBrief(lessons = []) {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return "";
  }
  const lines = [
    "## Prior worker lessons",
    "",
    "From Worker memory (Hermes failures). Prefer git ratchets when they conflict. Fix the class.",
    "",
  ];
  for (const lesson of lessons) {
    lines.push(`- ${lesson}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
