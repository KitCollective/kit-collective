/**
 * Names and R2 keys for device-flow evidence (KIT-267).
 *
 * A flow writes `kc__<flow>__<step>.png` per screenshot and `kc__<flow>.mp4`
 * per recording. In the evidence bucket they live at `e2e/<sha>/<flow>/<step>.png` and
 * `e2e/<sha>/<flow>/video.mp4`, next to `e2e/<sha>/run.json`.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const EVIDENCE_PREFIX = "e2e";
/** Maestro nests its output a few levels; this stops a walk that went astray. */
const MAX_DEPTH = 6;
const NAME = /^kc__([a-z0-9-]+)(?:__([a-z0-9-]+))?\.(png|mp4)$/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "Pods", "DerivedData"]);

/**
 * @param {string} fileName
 * @returns {{ flow: string, step: string | null, kind: "screenshot" | "video" } | null}
 */
export function parseArtifactName(fileName) {
  const match = NAME.exec(fileName);
  if (!match) {
    return null;
  }
  const [, flow, step, extension] = match;
  if (extension === "png") {
    return step ? { flow, step, kind: "screenshot" } : null;
  }
  return step ? null : { flow, step: null, kind: "video" };
}

/** @param {string} sha */
export function runPrefix(sha) {
  return `${EVIDENCE_PREFIX}/${sha}/`;
}

/** @param {string} sha */
export function runRecordKey(sha) {
  return `${runPrefix(sha)}run.json`;
}

/**
 * @param {string} sha
 * @param {{ flow: string, step: string | null, kind: "screenshot" | "video" }} artifact
 */
export function artifactKey(sha, artifact) {
  const file = artifact.kind === "video" ? "video.mp4" : `${artifact.step}.png`;
  return `${runPrefix(sha)}${artifact.flow}/${file}`;
}

/**
 * The reverse of `artifactKey` for a screenshot.
 * @param {string} sha
 * @param {string} key
 * @returns {{ flow: string, step: string } | null}
 */
export function screenshotFromKey(sha, key) {
  const prefix = runPrefix(sha);
  if (!key.startsWith(prefix) || !key.endsWith(".png")) {
    return null;
  }
  const [flow, file, ...rest] = key.slice(prefix.length).split("/");
  if (!flow || !file || rest.length > 0) {
    return null;
  }
  return { flow, step: file.slice(0, -".png".length) };
}

/**
 * Evidence files under the given directories. When the same name turns up
 * twice (a retried flow), the newest file wins.
 * @param {string[]} roots
 */
export function findArtifacts(roots) {
  /** @type {Map<string, { path: string, mtimeMs: number, flow: string, step: string | null, kind: "screenshot" | "video" }>} */
  const found = new Map();
  const walk = (directory, depth) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(path, depth + 1);
        }
        continue;
      }
      const parsed = parseArtifactName(entry.name);
      if (!parsed) {
        continue;
      }
      const { mtimeMs } = statSync(path);
      const known = found.get(entry.name);
      if (!known || known.mtimeMs < mtimeMs) {
        found.set(entry.name, { path, mtimeMs, ...parsed });
      }
    }
  };
  for (const root of roots) {
    walk(root, 0);
  }
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}
