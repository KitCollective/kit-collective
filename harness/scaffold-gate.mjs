/**
 * Scaffold diff-gate (P2.4).
 * After Draft (when not Skip Draft), at least one write-scope file must change
 * vs pre-Draft HEAD. Empty scaffold → re-draft once; still empty → feedback.
 */

import { matchesGlob } from "../scripts/lib/pr-write-scope.mjs";

/**
 * @param {string[] | undefined} files
 * @returns {Set<string>}
 */
export function fileSet(files) {
  return new Set((Array.isArray(files) ? files : []).filter((f) => typeof f === "string" && f.length > 0));
}

/**
 * Files present in `after` but not in `before` (new paths).
 *
 * @param {string[] | undefined} beforeFiles
 * @param {string[] | undefined} afterFiles
 * @returns {string[]}
 */
export function scaffoldAddedFiles(beforeFiles, afterFiles) {
  const before = fileSet(beforeFiles);
  return [...fileSet(afterFiles)].filter((file) => !before.has(file)).sort();
}

/**
 * Files that differ between before and after (adds + removals counted as touches).
 *
 * @param {string[] | undefined} beforeFiles
 * @param {string[] | undefined} afterFiles
 * @returns {string[]}
 */
export function scaffoldTouchedFiles(beforeFiles, afterFiles) {
  const before = fileSet(beforeFiles);
  const after = fileSet(afterFiles);
  const touched = new Set();
  for (const file of after) {
    if (!before.has(file)) {
      touched.add(file);
    }
  }
  for (const file of before) {
    if (!after.has(file)) {
      touched.add(file);
    }
  }
  return [...touched].sort();
}

/**
 * @param {string[]} files
 * @param {string[] | undefined} writeScopeGlobs
 * @returns {string[]}
 */
export function filesInWriteScope(files, writeScopeGlobs) {
  const globs = Array.isArray(writeScopeGlobs) ? writeScopeGlobs.filter(Boolean) : [];
  if (globs.length === 0) {
    // No write-scope declared — any touch counts as scaffold progress.
    return files;
  }
  return files.filter((file) => globs.some((glob) => matchesGlob(file, glob)));
}

/**
 * True when Draft produced at least one write-scope touch vs pre-Draft file list.
 *
 * @param {{
 *   beforeFiles?: string[],
 *   afterFiles?: string[],
 *   writeScopeGlobs?: string[],
 * }} input
 * @returns {boolean}
 */
export function scaffoldDiffOk({ beforeFiles, afterFiles, writeScopeGlobs } = {}) {
  const touched = scaffoldTouchedFiles(beforeFiles, afterFiles);
  const inScope = filesInWriteScope(touched, writeScopeGlobs);
  return inScope.length > 0;
}

/**
 * Feedback lines when scaffold is empty after Draft / re-draft.
 *
 * @param {{ reDraftAttempted?: boolean }} [opts]
 * @returns {string[]}
 */
export function formatScaffoldEmptyFeedback({ reDraftAttempted = false } = {}) {
  if (reDraftAttempted) {
    return [
      "- Scaffold: Draft produced no write-scope file touches after one re-draft — stay Implementing; fix Composition paths or scaffold under write-scope",
    ];
  }
  return [
    "- Scaffold: Draft produced no write-scope file touches — re-draft once before helpers",
  ];
}
