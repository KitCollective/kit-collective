#!/usr/bin/env node
/**
 * Ratchet (KIT-27): fail CI when Confirm save does not use the shared
 * resolveVisionSaveAction helper — every VisionJobStatus must log a userAction.
 *
 * Integration coverage: apps/api/tests/collection.test.ts case
 * "sets VisionLog userAction when Save enqueues vision without client visionJobId"
 * guards the server-side fallback enqueue path (lost/never-sent visionJobId).
 */
import { readFileSync } from "node:fs";

const savePath = "apps/mobile/src/capture/saveConfirmJersey.ts";
const confirmPath = "apps/mobile/app/(capture)/confirm.tsx";
const collectionTestPath = "apps/api/tests/collection.test.ts";
const violations = [];

const source = readFileSync(savePath, "utf8");
const confirmSource = readFileSync(confirmPath, "utf8");

if (!source.includes("resolveVisionSaveAction")) {
  violations.push(
    `${savePath}: must import and call resolveVisionSaveAction from @kit/api-contract so every VisionJobStatus logs a userAction at Save`,
  );
}

if (!source.includes("response.visionJobId")) {
  violations.push(
    `${savePath}: must reconcile using response.visionJobId from Save when the client never learned the job id`,
  );
}

const forbiddenPatterns = ["fullyMatches", "matchesClub && matchesSeason"];
for (const pattern of forbiddenPatterns) {
  for (const [path, body] of [
    [savePath, source],
    [confirmPath, confirmSource],
  ]) {
    if (body.includes(pattern)) {
      violations.push(
        `${path}: inline vision save-action branching (${pattern}) is forbidden — use resolveVisionSaveAction`,
      );
    }
  }
}

const collectionTest = readFileSync(collectionTestPath, "utf8");
if (
  !collectionTest.includes(
    "sets VisionLog userAction when Save enqueues vision without client visionJobId",
  )
) {
  violations.push(
    `${collectionTestPath}: must include the integration test that asserts vision_log.user_action is set when Save enqueues without client visionJobId`,
  );
}

if (violations.length > 0) {
  console.error("Vision log save-action ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Vision log save-action check passed.");
