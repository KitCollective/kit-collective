#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when capture refactor leaves dead exports in captureFlow.ts
 * (second occurrence of "dead code left after refactor" class).
 */
import { readFileSync } from "node:fs";

const CAPTURE_FLOW_PATH = "apps/mobile/src/capture/captureFlow.ts";

/**
 * @param {{ captureFlowSource: string }} input
 * @returns {string[]}
 */
export function checkMobileCaptureDeadExports({ captureFlowSource }) {
  const violations = [];

  if (captureFlowSource.includes("createPersistedCaptureSessionFromPhotos")) {
    violations.push(
      `${CAPTURE_FLOW_PATH}: must not keep dead createPersistedCaptureSessionFromPhotos after persistence refactor`,
    );
  }

  const exportFromMidFile =
    /export\s+type\s+\{[^}]+\}\s+from\s+["'][^"']+["'];\s*\nexport\s+\{[^}]+\}\s+from/;
  if (exportFromMidFile.test(captureFlowSource)) {
    violations.push(
      `${CAPTURE_FLOW_PATH}: re-exports must not sit between import blocks — keep imports at top`,
    );
  }

  if (
    /export\s+type\s+\{[^}]+\}\s+from\s+["']\.\/captureSessionPersistence["']/.test(
      captureFlowSource,
    ) &&
    !/^import type \{ PrefilledClub \} from "\.\/captureSessionPersistence";/m.test(
      captureFlowSource,
    )
  ) {
    violations.push(
      `${CAPTURE_FLOW_PATH}: PrefilledClub must be imported at the top import block, not only re-exported mid-file`,
    );
  }

  return violations;
}

export function checkMobileCaptureDeadExportsFromDisk() {
  return checkMobileCaptureDeadExports({
    captureFlowSource: readFileSync(CAPTURE_FLOW_PATH, "utf8"),
  });
}

function main() {
  const violations = checkMobileCaptureDeadExportsFromDisk();
  if (violations.length > 0) {
    console.error("Mobile capture dead-export ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile capture dead-export check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
