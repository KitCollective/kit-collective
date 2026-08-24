#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when camera-shot persistence is written but not recoverable
 * on CaptureScreen remount (second occurrence of "shots lost on kill" class).
 */
import { readFileSync } from "node:fs";

const CAPTURE_PATH = "apps/mobile/app/(tabs)/add/capture.tsx";
const PERSISTENCE_PATH = "apps/mobile/src/capture/captureSessionPersistence.ts";
const POINTER_PATH = "apps/mobile/src/capture/captureSessionActivePointer.ts";
const CAMERA_SESSION_PATH = "apps/mobile/src/capture/CaptureCameraSession.tsx";
const PERSISTENCE_TEST_PATH = "apps/mobile/tests/capture-session-persistence.test.ts";

/**
 * @param {{ captureSource: string, persistenceSource: string, pointerSource: string, cameraSessionSource: string, persistenceTestSource: string }} input
 * @returns {string[]}
 */
export function checkMobileAddCameraResume({
  captureSource,
  persistenceSource,
  pointerSource,
  cameraSessionSource,
  persistenceTestSource,
}) {
  const violations = [];

  if (!captureSource.includes("resolveResumableCameraSession")) {
    violations.push(
      `${CAPTURE_PATH}: must resolve a resumable camera session on mount after app kill`,
    );
  }

  if (!captureSource.includes("initialCameraPhotos") || !captureSource.includes("initialPhotos")) {
    violations.push(
      `${CAPTURE_PATH}: must pass resumed photos into CaptureCameraSession initialPhotos`,
    );
  }

  if (!captureSource.includes("clearActiveCameraCaptureSessionId")) {
    violations.push(
      `${CAPTURE_PATH}: must clear the active camera pointer when navigating to Confirm`,
    );
  }

  if (!persistenceSource.includes("resolveResumableCameraSession")) {
    violations.push(
      `${PERSISTENCE_PATH}: must expose resolveResumableCameraSession for camera resume`,
    );
  }

  if (!persistenceSource.includes("setActiveCameraCaptureSessionId")) {
    violations.push(
      `${PERSISTENCE_PATH}: must mark the active in-progress session when persisting camera shots`,
    );
  }

  if (!pointerSource.includes("getActiveCameraCaptureSessionId")) {
    violations.push(`${POINTER_PATH}: must persist an active camera session pointer for resume`);
  }

  if (!cameraSessionSource.includes("initialPhotos")) {
    violations.push(
      `${CAMERA_SESSION_PATH}: must accept initialPhotos to restore slots after remount`,
    );
  }

  if (!persistenceTestSource.includes("resolves an active in-progress session for camera resume")) {
    violations.push(
      `${PERSISTENCE_TEST_PATH}: must regression-test camera session resume after persistence`,
    );
  }

  if (!persistenceTestSource.includes("keeps the prior session when replace save fails")) {
    violations.push(
      `${PERSISTENCE_TEST_PATH}: must regression-test atomic replace when save fails mid-operation`,
    );
  }

  return violations;
}

export function checkMobileAddCameraResumeFromDisk() {
  return checkMobileAddCameraResume({
    captureSource: readFileSync(CAPTURE_PATH, "utf8"),
    persistenceSource: readFileSync(PERSISTENCE_PATH, "utf8"),
    pointerSource: readFileSync(POINTER_PATH, "utf8"),
    cameraSessionSource: readFileSync(CAMERA_SESSION_PATH, "utf8"),
    persistenceTestSource: readFileSync(PERSISTENCE_TEST_PATH, "utf8"),
  });
}

function main() {
  const violations = checkMobileAddCameraResumeFromDisk();
  if (violations.length > 0) {
    console.error("Mobile add camera-resume ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile add camera-resume check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
