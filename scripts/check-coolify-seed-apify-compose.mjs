#!/usr/bin/env node
/**
 * KIT-30: Apify seed Coolify job must run from a prebuilt image with mem_limit,
 * not a runtime clone + pnpm install + tsc inside the job cgroup.
 */
import { readFileSync } from "node:fs";

const composePath = "seed/coolify/docker-compose.apify-job.yml";
const wirePath = "scripts/wire-coolify-seed-apify-job.sh";
const violations = [];

const compose = readFileSync(composePath, "utf8");
const wire = readFileSync(wirePath, "utf8");
const wireComposeSection = wire.slice(wire.indexOf("COMPOSE_BODY="));

if (!compose.includes("mem_limit:")) {
  violations.push(`${composePath}: must set mem_limit (Coolify-enforced cgroup cap)`);
}
if (compose.includes("deploy:") && compose.includes("resources:")) {
  violations.push(
    `${composePath}: must not rely on deploy.resources for memory (Swarm-only on this Coolify parser)`,
  );
}
if (!compose.includes("seed/apify/dist/cli.js")) {
  violations.push(`${composePath}: command must run prebuilt seed/apify/dist/cli.js`);
}
if (compose.includes("pnpm install") || compose.includes("tsc")) {
  violations.push(`${composePath}: must not install or compile in the running container`);
}

if (wireComposeSection.includes("node:22-bookworm-slim")) {
  violations.push(`${wirePath}: must not use stock Node image with runtime clone`);
}
if (
  wireComposeSection.includes("git clone") ||
  wireComposeSection.includes("pnpm install") ||
  wireComposeSection.includes("tsc")
) {
  violations.push(`${wirePath}: must not clone, install, or compile in the job command`);
}
if (!wireComposeSection.includes("mem_limit")) {
  violations.push(`${wirePath}: compose payload must include mem_limit`);
}
if (!wireComposeSection.includes("seed/apify/dist/cli.js")) {
  violations.push(`${wirePath}: command must run prebuilt seed/apify/dist/cli.js`);
}
if (
  !wireComposeSection.includes("seed/coolify/Dockerfile.remote") &&
  !wireComposeSection.includes("dockerfile_inline")
) {
  violations.push(
    `${wirePath}: must build from seed/coolify/Dockerfile.remote (dockerfile_inline) at deploy time`,
  );
}

if (violations.length > 0) {
  console.error("Coolify seed Apify compose check failed:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Coolify seed Apify compose check passed.");
