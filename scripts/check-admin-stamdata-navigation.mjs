#!/usr/bin/env node
/**
 * Ratchet (KIT-39): fail CI when admin stamdata row navigation or drill routes
 * do not cover every entity type the list API can emit, or when Data table pages
 * drop the table header on loading/empty instead of replacing only the body.
 */
import { readFileSync } from "node:fs";

const violations = [];

const catalogSource = readFileSync("packages/api-contract/src/admin/catalog.ts", "utf8");
const stamdataSource = readFileSync("apps/admin/src/pages/StamdataPage.tsx", "utf8");
const appSource = readFileSync("apps/admin/src/App.tsx", "utf8");

const openRowStart = stamdataSource.indexOf("function openRow");
const openRowEnd = stamdataSource.indexOf("function handleRowKeyDown", openRowStart);
if (openRowStart === -1 || openRowEnd === -1) {
  violations.push("apps/admin/src/pages/StamdataPage.tsx: function openRow not found");
} else {
  const openRowBody = stamdataSource.slice(openRowStart, openRowEnd);

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
      const navigates = new RegExp(`entityType === "${entityType}"[\\s\\S]*?navigate\\(`).test(
        openRowBody,
      );
      if (!navigates) {
        violations.push(
          `apps/admin/src/pages/StamdataPage.tsx: openRow missing navigate() for "${entityType}"`,
        );
      }
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

const dataTablePages = ["apps/admin/src/pages/StamdataPage.tsx", "apps/admin/src/pages/CollectorsPage.tsx"];

for (const pagePath of dataTablePages) {
  const pageSource = readFileSync(pagePath, "utf8");
  if (!pageSource.includes("data-table")) {
    continue;
  }

  const dropsHeaderOnLoading = /\{loading\s*\?\s*\(\s*<div className="empty-state"/.test(
    pageSource,
  );
  if (dropsHeaderOnLoading) {
    violations.push(
      `${pagePath}: loading state replaces the whole Data table — keep <thead> and replace only <tbody>`,
    );
  }

  const dropsHeaderOnEmpty = /\)\s*:\s*!rows\s*\|\|\s*rows\.rows\.length\s*===\s*0\s*\?\s*\(\s*<div className="empty-state"/.test(
    pageSource,
  );
  if (dropsHeaderOnEmpty) {
    violations.push(
      `${pagePath}: empty state replaces the whole Data table — keep <thead> and replace only <tbody>`,
    );
  }

  if (!pageSource.includes("<thead>")) {
    violations.push(`${pagePath}: Data table page must render <thead>`);
  }

  if (pageSource.includes("loading") && !pageSource.includes("data-table-empty")) {
    violations.push(
      `${pagePath}: loading/empty states must use data-table-empty inside <tbody>, not a page-level empty-state`,
    );
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
