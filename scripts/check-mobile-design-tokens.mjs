#!/usr/bin/env node
/**
 * Ratchet (KIT-24): fail CI when mobile components invent raw hex/rgba colors
 * instead of semantic tokens from apps/mobile/src/theme/tokens.ts.
 *
 * Ratchet (KIT-42): fail when collection-chrome components/screens import the
 * static light-only `color` export instead of useTheme()/getThemeColors().
 *
 * Ratchet (KIT-42 round 5): separate color-migration allowlist from typography
 * checks so a file cannot dodge font-fallback enforcement via the color carve-out.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const mobileRoot = "apps/mobile";
const tokenFile = "apps/mobile/src/theme/tokens.ts";
const hexPattern = /#[0-9A-Fa-f]{3,8}\b/g;
const rgbPattern = /rgba?\([^)]+\)/g;
const staticColorImportPattern =
  /import\s+\{[^}]*\bcolor\b[^}]*\}\s+from\s+["']@\/theme\/tokens["']/;

/** Direct brand fontFamily from static type roles bypasses webfont fallback. */
const staticTypeFontFamilyPattern = /fontFamily:\s*type\.\w+\.fontFamily/;

/** Static type font metrics in StyleSheet without useTypography() bypass brand fonts. */
const staticTypeFontSizePattern = /fontSize:\s*type\.\w+\.fontSize/;

/** Legacy capture surfaces not yet migrated to useTheme(); tighten only by removing entries. */
const STATIC_COLOR_IMPORT_ALLOWLIST = new Set(["apps/mobile/src/capture/CaptureCameraSession.tsx"]);

/** Typography checks use a separate allowlist — never reuse the color carve-out. */
const STATIC_TYPOGRAPHY_ALLOWLIST = new Set(["apps/mobile/src/capture/CaptureCameraSession.tsx"]);

const violations = [];

function isThemeAwareScope(relPath) {
  if (relPath.startsWith("apps/mobile/src/components/")) {
    return true;
  }

  if (relPath.startsWith("apps/mobile/app/(auth)/")) {
    return true;
  }

  if (relPath.startsWith("apps/mobile/app/(tabs)/")) {
    return true;
  }

  return false;
}

function isTypographyScope(relPath) {
  return isThemeAwareScope(relPath) && !STATIC_TYPOGRAPHY_ALLOWLIST.has(relPath);
}

function isColorScope(relPath) {
  if (relPath.startsWith("apps/mobile/src/components/")) {
    return !STATIC_COLOR_IMPORT_ALLOWLIST.has(relPath);
  }

  if (relPath.startsWith("apps/mobile/app/(auth)/")) {
    return true;
  }

  if (relPath.startsWith("apps/mobile/app/(tabs)/")) {
    return true;
  }

  return false;
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    if (fullPath === tokenFile) continue;

    const source = readFileSync(fullPath, "utf8");
    const rel = relative(process.cwd(), fullPath);

    for (const match of source.matchAll(hexPattern)) {
      violations.push(
        `${rel}: raw hex color "${match[0]}" — use semantic tokens from theme/tokens.ts`,
      );
    }

    for (const match of source.matchAll(rgbPattern)) {
      violations.push(
        `${rel}: raw rgb/rgba color "${match[0]}" — use semantic tokens from theme/tokens.ts`,
      );
    }

    if (isColorScope(rel) && staticColorImportPattern.test(source)) {
      violations.push(
        `${rel}: imports static light-only 'color' export from theme/tokens — use useTheme() or getThemeColors()`,
      );
    }

    if (isTypographyScope(rel) && staticTypeFontFamilyPattern.test(source)) {
      violations.push(
        `${rel}: uses static type.*.fontFamily — use useTypography() from @/theme/brand-fonts for webfont fallback`,
      );
    }

    if (isTypographyScope(rel) && staticTypeFontSizePattern.test(source)) {
      violations.push(
        `${rel}: uses static type.*.fontSize in StyleSheet — use useTypography() role objects for webfont fallback`,
      );
    }
  }
}

const brandFontsPath = "apps/mobile/src/theme/brand-fonts.tsx";
const brandFontsResolvePath = "apps/mobile/src/theme/brand-fonts-resolve.ts";
const brandFontsSource = readFileSync(brandFontsPath, "utf8");
const brandFontsResolveSource = readFileSync(brandFontsResolvePath, "utf8");
if (!brandFontsSource.includes("useTypography")) {
  violations.push(`${brandFontsPath}: must export useTypography for webfont fallback`);
}
if (
  !brandFontsResolveSource.includes("resolveTypeRoles") ||
  !brandFontsResolveSource.includes("resolveFontFamily")
) {
  violations.push(
    `${brandFontsResolvePath}: must export resolveTypeRoles and resolveFontFamily for webfont fallback`,
  );
}

walk(mobileRoot);

if (violations.length > 0) {
  console.error("Mobile design-token ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile design-token check passed.");
