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
 *
 * Ratchet (KIT-42 round 7): fail on named tab-bar pixel-reserve exports and
 * icon-only Pressable hit targets below 44×44.
 *
 * Ratchet (KIT-42 round 8): fail on exported composed pixel-reserve helpers
 * reused across multiple tab screens (shape-based, not name/path list).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const mobileRoot = "apps/mobile";
const tokenFile = "apps/mobile/src/theme/tokens.ts";
const tabBarLayoutFile = "apps/mobile/src/theme/tab-bar-layout.ts";

/** Icon-only button with hitSlop but no min 44×44 target (KIT-42 round 7). */
const iconButtonHitSlopOnlyPattern =
  /accessibilityRole="button"[\s\S]{0,400}?hitSlop=\{8\}[\s\S]{0,200}?<Ionicons/;

/** Closed allow-list from docs/design-system.md Tokens table (camelCase ThemeColors keys). */
const DOCUMENTED_SEMANTIC_COLOR_KEYS = new Set([
  "canvas",
  "surface",
  "surfaceRaised",
  "scrim",
  "contentPrimary",
  "contentSecondary",
  "contentMuted",
  "contentInverse",
  "borderSubtle",
  "fillPrimary",
  "fillSecondary",
  "danger",
  "warning",
  "success",
  "info",
  "identityWashStart",
  "identityWashEnd",
]);

function checkTabBarLayoutReserve() {
  const localViolations = [];

  if (existsSync(tabBarLayoutFile)) {
    localViolations.push(
      `${tabBarLayoutFile}: named pixel-reserve module forbidden — inline space.* at call sites per docs/design-system.md Layout constraints`,
    );
  }

  for (const entry of readdirSync(join(mobileRoot, "src/theme"), { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === "tokens.ts") continue;
    const rel = join("apps/mobile/src/theme", entry.name);
    const source = readFileSync(rel, "utf8");
    if (/export\s+(const|function)\s+(floatingTabBarLayout|tabBarReserve)/.test(source)) {
      localViolations.push(
        `${rel}: exports named tab-bar pixel-reserve constant — inline space.* tokens instead`,
      );
    }
  }

  return localViolations;
}

/** Extract exported function bodies from components/app sources. */
export function extractExportedFunctionBodies(source) {
  const functions = [];
  const patterns = [
    /export\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{/g,
    /export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>\s*\{/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      const name = match[1];
      const startIdx = match.index + match[0].length;
      let depth = 1;
      let i = startIdx;
      while (i < source.length && depth > 0) {
        if (source[i] === "{") depth++;
        if (source[i] === "}") depth--;
        i++;
      }
      functions.push({ name, body: source.slice(startIdx, i - 1) });
      match = pattern.exec(source);
    }
  }

  return functions;
}

/** True when a function composes multiple space.* tokens into a returned offset. */
export function isComposedPixelReserveExport(body) {
  const spaceRefs = (body.match(/space\.\w+/g) ?? []).length;
  if (spaceRefs < 3) {
    return false;
  }
  if (!/return\b/.test(body)) {
    return false;
  }
  return /\+/.test(body);
}

function listSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(fullPath, acc);
      continue;
    }
    if (/\.(tsx|ts)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function countTabScreenImporters(exportName, fromRelPath, fileSources) {
  const importPattern = new RegExp(
    `import\\s+\\{[^}]*\\b${exportName}\\b[^}]*\\}\\s+from\\s+["'][^"']+["']`,
  );
  const importers = new Set();

  for (const [rel, source] of fileSources) {
    if (rel === fromRelPath) continue;
    if (!rel.startsWith("apps/mobile/app/(tabs)/")) continue;
    if (importPattern.test(source)) {
      importers.add(rel);
    }
  }

  return importers.size;
}

function loadMobileFileSources(root = mobileRoot) {
  const fileSources = new Map();
  for (const fullPath of listSourceFiles(root)) {
    fileSources.set(relative(process.cwd(), fullPath), readFileSync(fullPath, "utf8"));
  }
  return fileSources;
}

export function findComposedPixelReserveViolations(fileSources) {
  const localViolations = [];
  const scanPrefixes = ["apps/mobile/src/components/", "apps/mobile/app/"];

  for (const [rel, source] of fileSources) {
    if (!scanPrefixes.some((prefix) => rel.startsWith(prefix))) {
      continue;
    }

    for (const { name, body } of extractExportedFunctionBodies(source)) {
      if (!isComposedPixelReserveExport(body)) {
        continue;
      }

      const importerCount = countTabScreenImporters(name, rel, fileSources);
      if (importerCount >= 2) {
        localViolations.push(
          `${rel}: exports "${name}" composing ${(body.match(/space\.\w+/g) ?? []).length} space.* tokens into a shared pixel reserve — inline at each tab screen instead`,
        );
      }
    }
  }

  return localViolations;
}

export function checkComposedPixelReserveExports(options = {}) {
  const fileSources = options.fileSources ?? loadMobileFileSources(options.mobileRoot);
  return findComposedPixelReserveViolations(fileSources);
}

function checkIconButtonHitTargets(dir) {
  const localViolations = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      localViolations.push(...checkIconButtonHitTargets(fullPath));
      continue;
    }

    if (!/\.tsx$/.test(entry.name)) continue;

    const source = readFileSync(fullPath, "utf8");
    const rel = relative(process.cwd(), fullPath);

    if (iconButtonHitSlopOnlyPattern.test(source)) {
      localViolations.push(
        `${rel}: icon-only Pressable uses hitSlop without minWidth/minHeight 44 — use IconButton or explicit 44×44 style`,
      );
    }
  }

  return localViolations;
}

function extractSemanticColorKeys(source, blockName) {
  const match = source.match(new RegExp(`const ${blockName} = \\{([\\s\\S]*?)\\} as const`, "m"));
  if (!match) {
    return [];
  }

  const keys = [];
  for (const line of match[1].split("\n")) {
    const keyMatch = line.match(/^\s+(\w+):/);
    if (keyMatch) {
      keys.push(keyMatch[1]);
    }
  }
  return keys;
}

function checkSemanticColorKeys() {
  const source = readFileSync(tokenFile, "utf8");
  const localViolations = [];

  for (const blockName of ["lightColor", "darkColor"]) {
    for (const key of extractSemanticColorKeys(source, blockName)) {
      if (!DOCUMENTED_SEMANTIC_COLOR_KEYS.has(key)) {
        localViolations.push(
          `${tokenFile}: ${blockName}.${key} is not in the locked Tokens table — do not invent semantic color keys`,
        );
      }
    }
  }

  return localViolations;
}

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

  // Capture flow moved out of (tabs)/add into its own modal group (2026-09-05).
  if (relPath.startsWith("apps/mobile/app/(capture)/")) {
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

  // Capture flow moved out of (tabs)/add into its own modal group (2026-09-05).
  if (relPath.startsWith("apps/mobile/app/(capture)/")) {
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
violations.push(...checkSemanticColorKeys());
violations.push(...checkTabBarLayoutReserve());
violations.push(...checkComposedPixelReserveExports());
violations.push(...checkIconButtonHitTargets(join(mobileRoot, "src/components")));

if (violations.length > 0) {
  console.error("Mobile design-token ratchet failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Mobile design-token check passed.");
