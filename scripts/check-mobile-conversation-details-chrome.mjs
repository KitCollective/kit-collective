#!/usr/bin/env node
/**
 * Ratchet (KIT-121): fail CI when Conversation details grouped lists omit navigate
 * chevron on ListPeerStubRow or hairline border.subtle between ProfileSurfaceGroup rows
 * (docs/design-system.md §Conversation details).
 */
import { readFileSync } from "node:fs";

const profileUiPath = "apps/mobile/src/components/profile-ui.tsx";
const detailsViewPath = "apps/mobile/src/components/conversation-details-view.tsx";

const listPeerStubRowPattern = /export function ListPeerStubRow\([\s\S]*?\n\}/;
const profileSurfaceGroupPattern = /export function ProfileSurfaceGroup\([\s\S]*?\n\}/;

export function checkMobileConversationDetailsChrome(overrides = {}) {
  const violations = [];
  const profileSource = overrides.profileUiSource ?? readFileSync(profileUiPath, "utf8");
  const detailsSource = overrides.detailsViewSource ?? readFileSync(detailsViewPath, "utf8");

  const stubMatch = profileSource.match(listPeerStubRowPattern);
  if (!stubMatch) {
    violations.push(`${profileUiPath}: missing ListPeerStubRow export`);
  } else {
    const stubSource = stubMatch[0];
    if (!stubSource.includes("chevron-forward")) {
      violations.push(
        `${profileUiPath}: ListPeerStubRow must always render chevron-forward (navigate chrome per docs/design-system.md Conversation details)`,
      );
    }
    if (/\{onPress \? \([\s\S]*chevron-forward/.test(stubSource)) {
      violations.push(
        `${profileUiPath}: ListPeerStubRow chevron must not be conditional on onPress`,
      );
    }
  }

  const groupMatch = profileSource.match(profileSurfaceGroupPattern);
  if (!groupMatch) {
    violations.push(`${profileUiPath}: missing ProfileSurfaceGroup export`);
  }

  if (!profileSource.includes("showHairline")) {
    violations.push(
      `${profileUiPath}: ListDangerRow must support showHairline for grouped row separators`,
    );
  }

  if (!detailsSource.includes("showHairline")) {
    violations.push(
      `${detailsViewPath}: grouped danger rows must use showHairline between Rapportér and Blokér`,
    );
  }

  if (detailsSource.includes("useMemo")) {
    violations.push(
      `${detailsViewPath}: static helper copy must be a module constant, not useMemo`,
    );
  }

  if (!detailsSource.includes("CONVERSATION_DETAILS_HELPER_COPY")) {
    violations.push(`${detailsViewPath}: missing CONVERSATION_DETAILS_HELPER_COPY module constant`);
  }

  return violations;
}

const violations = checkMobileConversationDetailsChrome();

if (violations.length > 0) {
  console.error("Mobile conversation details chrome ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile conversation details chrome check passed.");
