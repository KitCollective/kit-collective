import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const CLIENT_FORBIDDEN_PATTERNS = [
  /@kit\/db/,
  /packages\/db/,
  /from ['"]@kit\/api/,
  /from ['"]apps\/api/,
  /from ['"]\.\.\/\.\.\/api/,
];

function collectSourceFiles(dir: string): string[] {
  try {
    statSync(dir);
  } catch {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function findForbiddenImports(files: string[], patterns: RegExp[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        violations.push(`${file}: matches ${pattern}`);
      }
    }
  }
  return violations;
}

describe("import boundaries", () => {
  it("client apps do not import @kit/db or apps/api", () => {
    const clientApps = ["apps/mobile", "apps/web", "apps/admin"].map((p) =>
      path.join(ROOT, p),
    );
    const files = clientApps.flatMap((dir) => collectSourceFiles(dir));
    const violations = findForbiddenImports(files, CLIENT_FORBIDDEN_PATTERNS);
    expect(violations).toEqual([]);
  });

  it("detects forbidden client imports from apps/api (fixture)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kit-boundary-"));
    const badFile = path.join(dir, "bad.ts");
    writeFileSync(badFile, `import { x } from 'apps/api/foo';\n`);

    const violations = findForbiddenImports([badFile], CLIENT_FORBIDDEN_PATTERNS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("bad.ts");
  });

  it("Nest API does not import seed/", () => {
    const apiDir = path.join(ROOT, "apps/api");
    const files = collectSourceFiles(apiDir);
    const violations = findForbiddenImports(files, [
      /from ['"]seed\//,
      /from ['"]\.\.\/\.\.\/seed\//,
      /import ['"]seed\//,
    ]);
    expect(violations).toEqual([]);
  });
});
