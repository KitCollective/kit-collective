#!/usr/bin/env node
/**
 * Ratchet (KIT-39): fail CI when admin stamdata row navigation or drill routes
 * do not cover every entity type the list API can emit.
 */
import { readFileSync } from "node:fs";

const violations = [];

const catalogSource = readFileSync("packages/api-contract/src/admin/catalog.ts", "utf8");
const stamdataSource = readFileSync("apps/admin/src/pages/StamdataPage.tsx", "utf8");
const appSource = readFileSync("apps/admin/src/App.tsx", "utf8");

const entityTypesMatch = catalogSource.match(
  /ADMIN_STAMDATA_LIST_ENTITY_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/,
);
if (!entityTypesMatch) {
  violations.push(
    "packages/api-contract/src/admin/catalog.ts: ADMIN_STAMDATA_LIST_ENTITY_TYPES not found",
  );
} else {
  const entityTypes = [...entityTypesMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  for (const entityType of entityTypes) {
    const navigates =
      (entityType === "kit" && stamdataSource.includes('entityType === "kit"')) ||
      (entityType === "club" && stamdataSource.includes('entityType === "club"')) ||
      (entityType === "season" && stamdataSource.includes('entityType === "season"')) ||
      (entityType === "club_season" && stamdataSource.includes('entityType === "club_season"'));
    if (!navigates) {
      violations.push(
        `apps/admin/src/pages/StamdataPage.tsx: openRow missing navigation for "${entityType}"`,
      );
    }
  }
}

const requiredRoutes = [
  { pattern: "/stamdata/clubs/:clubId", label: "club drill" },
  { pattern: "/stamdata/seasons/:seasonId", label: "season drill" },
  { pattern: "/stamdata/kits/:kitId", label: "kit drill" },
  { pattern: "/stamdata/club-seasons/:clubId/:seasonId", label: "club-season drill" },
];

for (const route of requiredRoutes) {
  if (!appSource.includes(route.pattern)) {
    violations.push(`apps/admin/src/App.tsx: missing ${route.label} route (${route.pattern})`);
  }
}

if (violations.length > 0) {
  console.error("Admin stamdata navigation ratchet failed:\n");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("Admin stamdata navigation check passed.");
