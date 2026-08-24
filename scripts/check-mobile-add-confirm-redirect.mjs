#!/usr/bin/env node
/**
 * Ratchet (KIT-48): fail CI when Confirm redirects before the persisted session
 * lookup has resolved (stale-closure race on mount).
 */
import { readFileSync } from "node:fs";

const CONFIRM_PATH = "apps/mobile/app/(tabs)/add/confirm.tsx";
const HOOK_PATH = "apps/mobile/src/capture/usePersistedCaptureSession.ts";
const REDIRECT_HELPER_PATH = "apps/mobile/src/capture/confirmRedirect.ts";
const REDIRECT_TEST_PATH = "apps/mobile/tests/confirm-redirect.test.ts";

/**
 * @param {{ confirmSource: string, hookSource: string, redirectHelperSource: string, redirectTestSource: string }} input
 * @returns {string[]}
 */
export function checkMobileAddConfirmRedirect({
  confirmSource,
  hookSource,
  redirectHelperSource,
  redirectTestSource,
}) {
  const violations = [];

  if (!confirmSource.includes("shouldConfirmRedirectAway")) {
    violations.push(
      `${CONFIRM_PATH}: must gate redirect with shouldConfirmRedirectAway instead of raw !state`,
    );
  }

  if (!confirmSource.includes("isSessionResolved")) {
    violations.push(
      `${CONFIRM_PATH}: must wait for isSessionResolved before redirecting away from Confirm`,
    );
  }

  if (
    /if\s*\(\s*!sessionId\s*\|\|\s*!state\s*\)/.test(confirmSource) &&
    !confirmSource.includes("shouldConfirmRedirectAway")
  ) {
    violations.push(
      `${CONFIRM_PATH}: must not redirect on !state before the session load has resolved`,
    );
  }

  if (!hookSource.includes("isSessionResolved")) {
    violations.push(
      `${HOOK_PATH}: must expose isSessionResolved so Confirm can defer redirect until load completes`,
    );
  }

  if (!hookSource.includes("loadPersistedCaptureSession")) {
    violations.push(`${HOOK_PATH}: must load the persisted session synchronously on first render`);
  }

  if (!redirectHelperSource.includes("isSessionResolved")) {
    violations.push(
      `${REDIRECT_HELPER_PATH}: shouldConfirmRedirectAway must accept isSessionResolved`,
    );
  }

  if (!redirectTestSource.includes("does not redirect before the session lookup has resolved")) {
    violations.push(
      `${REDIRECT_TEST_PATH}: must regression-test redirect deferred until session lookup resolves`,
    );
  }

  return violations;
}

export function checkMobileAddConfirmRedirectFromDisk() {
  return checkMobileAddConfirmRedirect({
    confirmSource: readFileSync(CONFIRM_PATH, "utf8"),
    hookSource: readFileSync(HOOK_PATH, "utf8"),
    redirectHelperSource: readFileSync(REDIRECT_HELPER_PATH, "utf8"),
    redirectTestSource: readFileSync(REDIRECT_TEST_PATH, "utf8"),
  });
}

function main() {
  const violations = checkMobileAddConfirmRedirectFromDisk();
  if (violations.length > 0) {
    console.error("Mobile add confirm-redirect ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile add confirm-redirect check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
