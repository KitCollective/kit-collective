#!/usr/bin/env node
/**
 * Ratchet (KIT-121): fail CI when ListPeerStubRow uses body instead of locked
 * heading-sm for collector handle and initial badge (docs/design-system.md Type
 * table — Thread row, conversation header, Detaljer stub parity).
 */
import { readFileSync } from "node:fs";

const profileUiPath = "apps/mobile/src/components/profile-ui.tsx";

const listPeerStubRowPattern =
  /export function ListPeerStubRow\([\s\S]*?\n\}/;

const headingSmInitialPattern =
  /<Text style=\{\[typography\.headingSm, \{ color: theme\.contentPrimary \}\]\}>\{initial\}<\/Text>/;

const headingSmHandlePattern =
  /<Text style=\{\[typography\.headingSm, \{ color: theme\.contentPrimary \}\]\}>\{handle\}<\/Text>/;

const bodyOnHandlePattern =
  /<Text style=\{\[typography\.body, \{ color: theme\.contentPrimary \}\]\}>\{handle\}<\/Text>/;

const bodyOnInitialPattern =
  /<Text style=\{\[typography\.body, \{ color: theme\.contentPrimary \}\]\}>\{initial\}<\/Text>/;

export function checkMobilePeerStubTypography(overrides = {}) {
  const violations = [];
  const source = overrides.profileUiSource ?? readFileSync(profileUiPath, "utf8");
  const rowMatch = source.match(listPeerStubRowPattern);

  if (!rowMatch) {
    violations.push(`${profileUiPath}: missing ListPeerStubRow export`);
    return violations;
  }

  const rowSource = rowMatch[0];

  if (bodyOnHandlePattern.test(rowSource) || bodyOnInitialPattern.test(rowSource)) {
    violations.push(
      `${profileUiPath}: ListPeerStubRow must use typography.headingSm for initial and handle (locked heading-sm per docs/design-system.md)`,
    );
  }

  if (!headingSmInitialPattern.test(rowSource)) {
    violations.push(
      `${profileUiPath}: ListPeerStubRow initial badge must use typography.headingSm`,
    );
  }

  if (!headingSmHandlePattern.test(rowSource)) {
    violations.push(
      `${profileUiPath}: ListPeerStubRow handle must use typography.headingSm`,
    );
  }

  return violations;
}

const violations = checkMobilePeerStubTypography();

if (violations.length > 0) {
  console.error("Mobile peer stub typography ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile peer stub typography check passed.");
