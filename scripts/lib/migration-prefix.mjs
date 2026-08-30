/**
 * Detect Drizzle migration prefix collisions (KIT-125).
 * Two parallel issues must not ship the same NNNN_ prefix.
 */

export const MIGRATION_PATH_RE = /^packages\/db\/migrations\/(\d{4})_[^/]+\.sql$/;

/**
 * @param {string} filePath
 * @returns {string | null}
 */
export function migrationPrefix(filePath) {
  const match = String(filePath).match(MIGRATION_PATH_RE);
  return match ? match[1] : null;
}

/**
 * Same numeric prefix, different filename — the KIT-125 class.
 *
 * @param {string[]} addedFiles
 * @param {string[]} baseFiles
 * @returns {Array<{ prefix: string, added: string, base: string }>}
 */
export function findMigrationPrefixCollisions(addedFiles, baseFiles) {
  /** @type {Map<string, string>} */
  const baseByPrefix = new Map();
  for (const file of Array.isArray(baseFiles) ? baseFiles : []) {
    const prefix = migrationPrefix(file);
    if (prefix) {
      baseByPrefix.set(prefix, file);
    }
  }
  /** @type {Array<{ prefix: string, added: string, base: string }>} */
  const collisions = [];
  for (const file of Array.isArray(addedFiles) ? addedFiles : []) {
    const prefix = migrationPrefix(file);
    if (!prefix) {
      continue;
    }
    const base = baseByPrefix.get(prefix);
    if (base && base !== file) {
      collisions.push({ prefix, added: file, base });
    }
  }
  return collisions;
}

/**
 * @param {string[]} baseFiles
 * @returns {string}
 */
/**
 * Added migrations with an empty lane listing — origin/development was not readable.
 *
 * @param {string[]} addedFiles
 * @param {string[]} baseFiles
 * @returns {boolean}
 */
export function missingBaseMigrations(addedFiles, baseFiles) {
  const added = (Array.isArray(addedFiles) ? addedFiles : []).filter((file) =>
    Boolean(migrationPrefix(file)),
  );
  if (added.length === 0) {
    return false;
  }
  const base = (Array.isArray(baseFiles) ? baseFiles : []).filter((file) =>
    Boolean(migrationPrefix(file)),
  );
  return base.length === 0;
}

export function nextMigrationPrefix(baseFiles) {
  let max = -1;
  for (const file of Array.isArray(baseFiles) ? baseFiles : []) {
    const prefix = migrationPrefix(file);
    if (prefix) {
      max = Math.max(max, Number(prefix));
    }
  }
  return String(max + 1).padStart(4, "0");
}

/**
 * @param {Array<{ prefix: string, added: string, base: string }>} collisions
 * @param {string} nextPrefix
 * @returns {string[]}
 */
export function formatMigrationCollisionFeedback(collisions, nextPrefix) {
  return (Array.isArray(collisions) ? collisions : []).map(
    (row) =>
      `- Migration: prefix ${row.prefix} collides with origin/development \`${row.base}\`. Rename \`${row.added}\` to \`${nextPrefix}_…\`, update \`packages/db/migrations/meta/_journal.json\`, and commit. implement-exit pushes the worktree — do not wait for the harness to push an uncommitted rename.`,
  );
}
