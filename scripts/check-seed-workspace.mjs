#!/usr/bin/env node
/**
 * Ratchet (KIT-12): seed packages must stay in the pnpm workspace, expose a test
 * script, and remain covered by root `pnpm test` / CI. Coolify job compose files
 * must reference the same @kit/seed-* CLIs as Seed MCP.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Seed packages that must be workspace members with a test script. */
const REQUIRED_SEED_PACKAGES = ["seed/mcp", "seed/apify", "seed/fkapi", "seed/shared"];

/** Coolify one-shot jobs — not pnpm packages; validated by compose + Dockerfile. */
const COOLIFY_COMPOSE_FILES = [
  {
    file: "seed/coolify/docker-compose.apify-job.yml",
    filter: "@kit/seed-apify",
  },
  {
    file: "seed/coolify/docker-compose.fkapi-job.yml",
    filter: "@kit/seed-fkapi",
  },
];

const violations = [];

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listWorkspaceGlobs() {
  const raw = readText("pnpm-workspace.yaml");
  const globs = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
    if (match) globs.push(match[1]);
  }
  if (globs.length === 0) {
    violations.push("pnpm-workspace.yaml: no workspace package globs found");
  }
  return globs;
}

function globMatchesPackage(glob, packageDir) {
  if (glob === packageDir) return true;
  if (!glob.endsWith("/*")) return false;
  const prefix = glob.slice(0, -2);
  return packageDir === prefix || packageDir.startsWith(`${prefix}/`);
}

function discoverSeedPackages() {
  const seedRoot = path.join(ROOT, "seed");
  const packages = [];
  for (const entry of readdirSync(seedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(seedRoot, entry.name);
    if (existsSync(path.join(dir, "package.json"))) {
      packages.push(`seed/${entry.name}`);
    }
  }
  return packages.sort();
}

function checkWorkspaceMembership(workspaceGlobs, packageDirs) {
  for (const pkg of packageDirs) {
    const covered = workspaceGlobs.some((glob) => globMatchesPackage(glob, pkg));
    if (!covered) {
      violations.push(`${pkg}: not covered by any pnpm-workspace.yaml glob`);
    }
  }

  for (const required of REQUIRED_SEED_PACKAGES) {
    if (!packageDirs.includes(required)) {
      violations.push(`${required}: missing package.json (required seed package)`);
      continue;
    }
    const pkgJson = JSON.parse(readText(path.join(required, "package.json")));
    if (!pkgJson.scripts?.test) {
      violations.push(`${required}/package.json: missing scripts.test`);
    }
  }
}

function checkRootTestWiring() {
  const rootPkg = JSON.parse(readText("package.json"));
  if (!rootPkg.scripts?.test?.includes("turbo")) {
    violations.push('package.json: scripts.test must invoke turbo so seed packages run in CI');
  }

  const turbo = JSON.parse(readText("turbo.json"));
  if (!turbo.tasks?.test) {
    violations.push("turbo.json: missing tasks.test");
  }

  const ci = readText(".github/workflows/ci.yml");
  if (!/pnpm test/.test(ci)) {
    violations.push(".github/workflows/ci.yml: must run pnpm test");
  }
  if (!/pnpm check:imports/.test(ci)) {
    violations.push(".github/workflows/ci.yml: must run pnpm check:imports (Nest → seed/ boundary)");
  }
}

function checkCoolifyJobs() {
  const dockerfile = path.join(ROOT, "seed/coolify/Dockerfile");
  if (!existsSync(dockerfile)) {
    violations.push("seed/coolify/Dockerfile: missing");
    return;
  }

  const dockerfileBody = readFileSync(dockerfile, "utf8");
  for (const filter of ["@kit/seed-apify", "@kit/seed-fkapi", "@kit/seed-mcp", "@kit/seed-shared"]) {
    if (!dockerfileBody.includes(filter)) {
      violations.push(`seed/coolify/Dockerfile: must build ${filter} for Coolify jobs`);
    }
  }

  for (const { file, filter } of COOLIFY_COMPOSE_FILES) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) {
      violations.push(`${file}: missing`);
      continue;
    }
    const body = readFileSync(full, "utf8");
    if (!body.includes(filter)) {
      violations.push(`${file}: must invoke pnpm --filter ${filter}`);
    }
    if (!body.includes("seed/coolify/Dockerfile")) {
      violations.push(`${file}: must build from seed/coolify/Dockerfile`);
    }
  }
}

function checkNestSeedBoundary() {
  const script = readText("scripts/check-import-boundaries.mjs");
  if (!/apps\/api must not import seed\//.test(script)) {
    violations.push("scripts/check-import-boundaries.mjs: must document Nest → seed/ boundary");
  }
  if (!/from \['"]seed\\\//.test(script)) {
    violations.push("scripts/check-import-boundaries.mjs: must reject seed/ imports in apps/api");
  }
}

const workspaceGlobs = listWorkspaceGlobs();
const seedPackages = discoverSeedPackages();
checkWorkspaceMembership(workspaceGlobs, seedPackages);
checkRootTestWiring();
checkCoolifyJobs();
checkNestSeedBoundary();

if (violations.length > 0) {
  console.error("Seed workspace / CI ratchet violations:");
  for (const v of violations) console.error(`- ${v}`);
  process.exit(1);
}

console.log(
  `Seed workspace OK (${seedPackages.length} packages in workspace; Coolify jobs wired to MCP CLIs)`,
);
