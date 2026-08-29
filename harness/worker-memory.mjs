/**
 * Worker memory class → lesson schema (ADR-0026, KIT-128).
 * Hermes staging only — git ratchets win. factory-checker writes; implement searches.
 */

/** Hermes `memory_add` target for recurring factory lesson classes. */
export const WORKER_MEMORY_TARGET = "failure";

/** Review axes whose hard findings may become Worker memory (never Spec). */
export const WORKER_MEMORY_WRITABLE_AXES = ["standards", "slop"];

/** @readonly */
export const KIT_IDENTIFIER_PATTERN = /\bKIT-\d+\b/i;

/** Diff hunk markers or file:line citations — not valid lesson bodies. */
export const HUNK_LIKE_PATTERN = /(?:^|\n)(?:@@|\+\+\+|---)|(?:^|\s)\d+:\d+|(?:^|\s)[\w./-]+:\d+/m;

/** Pi roles that must not call memory_add/replace/remove (KIT-128 AC). */
export const WORKER_MEMORY_NON_WRITER_ROLES = [
  "implement",
  "scout",
  "gate",
  "land",
  "planner",
  "intake",
  "ci-retry",
];

/** Paths whose landing promotes a class from Hermes staging into git law. */
export const RATCHET_PATH_MARKERS = [".cursor/hooks/", ".cursor/rules/", "scripts/check-"];

/**
 * @param {unknown} axis
 * @returns {string}
 */
export function normalizeReviewAxis(axis) {
  return String(axis ?? "")
    .trim()
    .toLowerCase()
    .replace(/^slop\//, "slop");
}

/**
 * @param {unknown} axis
 * @returns {boolean}
 */
export function isWorkerMemoryWritableAxis(axis) {
  return WORKER_MEMORY_WRITABLE_AXES.includes(normalizeReviewAxis(axis));
}

/**
 * @param {unknown} text
 * @returns {"empty" | "kit-id" | "hunk" | null}
 */
function rejectsWorkerMemoryText(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "empty";
  }
  const normalized = text.trim();
  if (KIT_IDENTIFIER_PATTERN.test(normalized)) {
    return "kit-id";
  }
  if (HUNK_LIKE_PATTERN.test(normalized)) {
    return "hunk";
  }
  return null;
}

/**
 * @param {unknown} className
 * @returns {"empty" | "kit-id" | "hunk" | null}
 */
export function rejectsWorkerMemoryClass(className) {
  return rejectsWorkerMemoryText(className);
}

/**
 * @param {unknown} lesson
 * @returns {"empty" | "kit-id" | "hunk" | null}
 */
export function rejectsWorkerMemoryLesson(lesson) {
  return rejectsWorkerMemoryText(lesson);
}

/**
 * @param {unknown} lesson
 * @returns {boolean}
 */
export function isValidWorkerMemoryLesson(lesson) {
  return rejectsWorkerMemoryLesson(lesson) === null;
}

/**
 * @param {{ axis?: unknown, finding?: unknown }} input
 * @returns {boolean}
 */
export function shouldRecordWorkerMemoryFinding({ axis, finding }) {
  if (!isWorkerMemoryWritableAxis(axis)) {
    return false;
  }
  if (typeof finding !== "string" || finding.trim().length === 0) {
    return false;
  }
  const trimmed = finding.trim();
  if (/^\(none\)$/i.test(trimmed)) {
    return false;
  }
  return isValidWorkerMemoryLesson(trimmed);
}

/**
 * One schema for Slop and Standards: `className → lesson`.
 *
 * @param {{ className: unknown, lesson: unknown }} input
 * @returns {{ className: string, lesson: string, text: string, target: string }}
 */
export function formatWorkerMemoryEntry({ className, lesson }) {
  const cls = String(className ?? "").trim();
  const body = String(lesson ?? "").trim();
  const classReject = rejectsWorkerMemoryClass(cls);
  const lessonReject = rejectsWorkerMemoryLesson(body);
  if (classReject) {
    throw new Error(`worker memory class rejected: ${classReject}`);
  }
  if (lessonReject) {
    throw new Error(`worker memory lesson rejected: ${lessonReject}`);
  }
  return {
    className: cls,
    lesson: body,
    text: `${cls} → ${body}`,
    target: WORKER_MEMORY_TARGET,
  };
}

/**
 * @param {unknown} filePath
 * @returns {boolean}
 */
export function isRatchetPath(filePath) {
  const normalized = String(filePath ?? "").replace(/\\/g, "/");
  return RATCHET_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * @param {unknown} changedFiles
 * @returns {string[]}
 */
export function listRatchetPaths(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    return [];
  }
  return changedFiles.filter((file) => isRatchetPath(file));
}

/**
 * @param {unknown} role
 * @returns {boolean}
 */
export function roleMayWriteWorkerMemory(role) {
  return String(role ?? "").trim() === "factory-checker";
}
