#!/usr/bin/env node
/**
 * Ratchet (KIT-27): fail CI when the mobile Save screen does not use the shared
 * resolveVisionSaveAction helper — every VisionJobStatus must log a userAction.
 */
import { readFileSync } from "node:fs";

const addScreenPath = "apps/mobile/app/(tabs)/add.tsx";
const violations = [];

const source = readFileSync(addScreenPath, "utf8");

if (!source.includes("resolveVisionSaveAction")) {
  violations.push(
    `${addScreenPath}: must import and call resolveVisionSaveAction from @kit/api-contract so every VisionJobStatus logs a userAction at Save`,
  );
}

const forbiddenPatterns = ["fullyMatches", "matchesClub && matchesSeason"];
for (const pattern of forbiddenPatterns) {
  if (source.includes(pattern)) {
    violations.push(
      `${addScreenPath}: inline vision save-action branching (${pattern}) is forbidden — use resolveVisionSaveAction`,
    );
  }
}

if (violations.length > 0) {
  console.error("Vision log save-action ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Vision log save-action check passed.");
