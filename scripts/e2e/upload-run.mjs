#!/usr/bin/env node
/**
 * Uploads a device-flow run's screenshots and recordings to lane R2 (KIT-267).
 * Runs right after the flows, pass or fail.
 *
 *   node scripts/e2e/upload-run.mjs <sha> <directory> [<directory> ...]
 */
import { readFileSync } from "node:fs";
import { artifactKey, findArtifacts } from "./artifacts.mjs";
import { createR2Client, evidenceBucketEnv } from "./r2.mjs";

const CONTENT_TYPES = { screenshot: "image/png", video: "video/mp4" };

const [sha, ...roots] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(sha ?? "") || roots.length === 0) {
  console.error("usage: upload-run.mjs <40-char commit sha> <directory> [<directory> ...]");
  process.exit(2);
}

const r2 = createR2Client(evidenceBucketEnv(process.env));
const artifacts = findArtifacts(roots);
for (const artifact of artifacts) {
  const key = artifactKey(sha, artifact);
  await r2.putObject(key, readFileSync(artifact.path), CONTENT_TYPES[artifact.kind]);
  process.stdout.write(`uploaded ${key}\n`);
}
if (artifacts.length === 0) {
  console.error(`No kc__*.png or kc__*.mp4 found under: ${roots.join(", ")}`);
  process.exit(1);
}
