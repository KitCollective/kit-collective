/**
 * PI implement context selector — first-run hard loop injection.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALWAYS_RULES,
  ALWAYS_SKILLS,
  buildImplementAppendOverlay,
  detectRequiredHelpers,
  GENERATED_APPEND_REL,
  GENERATED_CONTEXT_REL,
  parseWriteScopeGlobs,
  selectImplementContext,
  shouldInjectImplementContext,
} from "../implement-context.mjs";
import { createPiJobRunner, implementPrompt, piArgsForRole } from "../pi-job.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const KIT116_REVIEW_FEEDBACK = [
  "- Spec: Collection tab missing badge count",
  "- Standards: unused Badge export in apps/mobile/src/components/badge.tsx",
  "- Slop: unused import in apps/mobile/src/components/badge.tsx",
].join("\n");

test("parseWriteScopeGlobs splits comma-separated globs", () => {
  assert.deepEqual(parseWriteScopeGlobs("apps/mobile/**, apps/api/**"), [
    "apps/mobile/**",
    "apps/api/**",
  ]);
  assert.deepEqual(parseWriteScopeGlobs(""), []);
});

test("mobile write-scope selects ui-ux and expo helpers with tdd skills and design-system rule", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/mobile/**",
    labels: ["mobile"],
    body: "",
    cheapRetry: false,
  });
  assert.deepEqual(ctx.requiredHelpers, ["expo", "ui-ux"]);
  assert.ok(ctx.skills.includes(".cursor/skills/tdd/SKILL.md"));
  assert.ok(ctx.skills.includes(".cursor/skills/implement/SKILL.md"));
  assert.ok(ctx.skills.includes(".cursor/skills/signal-up/SKILL.md"));
  assert.ok(ctx.skills.includes(".cursor/skills/expo/expo-overview/SKILL.md"));
  assert.ok(ctx.rules.includes(".cursor/rules/write-scope.mdc"));
  assert.ok(ctx.rules.includes(".cursor/rules/design-system.mdc"));
  for (const rule of ALWAYS_RULES) {
    assert.ok(ctx.rules.includes(rule), rule);
  }
  for (const skill of ALWAYS_SKILLS) {
    assert.ok(ctx.skills.includes(skill), skill);
  }
  assert.match(ctx.appendOverlay, /GitHub Actions only/);
  assert.match(ctx.appendOverlay, /LINEAR_CLI_API_KEY/);
});

test("api scope selects nest not ui-ux", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/api/**",
    labels: [],
    body: "Nest auth module",
    cheapRetry: false,
  });
  assert.deepEqual(ctx.requiredHelpers, ["nest"]);
  assert.equal(ctx.requiredHelpers.includes("ui-ux"), false);
  assert.ok(ctx.skills.includes(".cursor/skills/codebase-design/SKILL.md"));
  assert.equal(ctx.rules.includes(".cursor/rules/design-system.mdc"), false);
});

test("db scope selects drizzle not ui-ux", () => {
  const ctx = selectImplementContext({
    writeScope: "packages/db/**",
    labels: [],
    body: "schema migration",
    cheapRetry: false,
  });
  assert.deepEqual(ctx.requiredHelpers, ["drizzle"]);
  assert.equal(ctx.requiredHelpers.includes("ui-ux"), false);
});

test("combined mobile+api+db scope selects expo, nest, drizzle, and ui-ux", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/mobile/**, apps/api/**, packages/db/**",
    labels: ["mobile"],
    body: "Nest /v1 auth with Drizzle schema",
    cheapRetry: false,
  });
  assert.deepEqual(ctx.requiredHelpers, ["drizzle", "expo", "nest", "ui-ux"]);
  assert.ok(ctx.skills.includes(".cursor/skills/expo/expo-overview/SKILL.md"));
  assert.ok(ctx.skills.includes(".cursor/skills/codebase-design/SKILL.md"));
  assert.ok(ctx.rules.includes(".cursor/rules/design-system.mdc"));
});

test("cheap retry returns empty selector context", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/mobile/**",
    labels: ["mobile"],
    cheapRetry: true,
  });
  assert.deepEqual(ctx.requiredHelpers, []);
  assert.deepEqual(ctx.skills, []);
  assert.deepEqual(ctx.rules, []);
  assert.equal(ctx.appendOverlay, "");
  assert.equal(shouldInjectImplementContext({ cheapRetry: true }), false);
  assert.equal(shouldInjectImplementContext({ cheapRetry: false }), true);
});

test("first-run implementPrompt includes Scout, helpers, tdd, write-scope; not Skip helpers", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/mobile/**",
    labels: ["mobile"],
    cheapRetry: false,
  });
  const prompt = implementPrompt("implement", "KIT-42", ".pi/adw/feature.yaml", {
    writeScope: "apps/mobile/**",
    implementContext: ctx,
  });
  assert.match(prompt, /First run/i);
  assert.match(prompt, /Spawn Scout/i);
  assert.match(prompt, /Required helpers: expo, ui-ux/);
  assert.match(prompt, /Do not Skip helpers/i);
  assert.match(prompt, /TDD:/i);
  assert.match(prompt, /not `pnpm test`/i);
  assert.match(prompt, /Write-scope: apps\/mobile/);
  assert.equal(/Skip helpers/i.test(prompt) && !/Do not Skip helpers/i.test(prompt), false);
});

test("cheap retry implementPrompt still Skip helpers", () => {
  const prompt = implementPrompt("implement", "KIT-99", ".pi/adw/feature.yaml", {
    cheapRetry: true,
    reviewFeedback: "- CI: required check `test` failed",
  });
  assert.match(prompt, /Skip Scout/i);
  assert.match(prompt, /Skip helpers/i);
  assert.equal(/Required helpers:/i.test(prompt), false);
});

test("checker-fail uses full selector helper list in prompt", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/api/**, apps/mobile/**",
    labels: ["mobile"],
    body: "Nest /v1 auth",
    cheapRetry: false,
  });
  assert.deepEqual(ctx.requiredHelpers, ["expo", "nest", "ui-ux"]);
  const prompt = implementPrompt("implement", "KIT-116", ".pi/adw/feature.yaml", {
    reviewFeedback: KIT116_REVIEW_FEEDBACK,
    writeScope: "apps/api/**, apps/mobile/**",
    implementContext: ctx,
  });
  assert.match(prompt, /Checker-fail resume/i);
  assert.match(prompt, /Required helpers: expo, nest, ui-ux/);
  assert.match(prompt, /Do not Skip Scout/i);
  assert.match(prompt, /Do not Skip helpers/i);
  assert.match(prompt, /### Review feedback/);
});

test("piArgsForRole passes multiple --skill paths and generated append on first run", () => {
  const ctx = selectImplementContext({
    writeScope: "apps/mobile/**",
    labels: ["mobile"],
    cheapRetry: false,
  });
  const args = piArgsForRole(
    "implement",
    ROOT,
    ".pi/roles/implement.md",
    "cursor/composer-2.5",
    "prompt",
    { implementContext: ctx },
  );
  const skills = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--skill" && typeof args[i + 1] === "string") {
      skills.push(args[i + 1]);
    }
  }
  assert.ok(skills.some((path) => path.includes("tdd/SKILL.md")));
  assert.ok(skills.some((path) => path.includes("expo-overview/SKILL.md")));
  const appendIdx = args.indexOf("--append-system-prompt");
  assert.ok(appendIdx >= 0);
  const appendPath = args[appendIdx + 1];
  assert.match(String(appendPath), new RegExp(GENERATED_APPEND_REL.replace(/\./g, "\\.")));
  const generated = readFileSync(String(appendPath), "utf8");
  assert.match(generated, /write-scope/);
  assert.match(generated, /GitHub Actions only/);
  assert.match(generated, /Do not sleep/);
  assert.match(generated, /## Unattended run/);
  const base = readFileSync(join(ROOT, GENERATED_CONTEXT_REL), "utf8");
  assert.match(base, /sources-sha256:/);
});

test("detectRequiredHelpers is exported for ratchet tests", () => {
  assert.deepEqual(
    detectRequiredHelpers({
      writeScopeGlobs: parseWriteScopeGlobs("apps/api/**"),
      body: "Nest",
    }),
    ["nest"],
  );
  assert.match(buildImplementAppendOverlay(), /bootstrap-linear/);
});

test("implement runner injects context on first run with mobile slice", async () => {
  const spawned = [];
  const runner = createPiJobRunner({
    env: {
      CURSOR_API_KEY: "cursor_test",
      LINEAR_CLI_API_KEY: "lin_cli_test",
      GH_TOKEN: "ghp_test",
      PI_MODEL: "cursor/composer-2.5",
      PI_MODEL_FAST: "cursor/grok-4.6",
      OPENROUTER_API_KEY: "or_test",
    },
    workspace: ROOT,
    worktree: {
      async checkout() {
        return { path: "/tmp/wt", branch: "kit-42", lane: "development" };
      },
    },
    gh: {
      async rebase() {},
      async viewPr() {
        return {
          url: "https://github.com/x/y/pull/1",
          mergeable: "MERGEABLE",
          checks: [{ name: "test", conclusion: "success", isRequired: true }],
        };
      },
      async createPr() {
        return {
          url: "https://github.com/x/y/pull/1",
          mergeable: "MERGEABLE",
          checks: [{ name: "test", conclusion: "success", isRequired: true }],
        };
      },
      async fetchCheckLog() {
        return "";
      },
    },
    linear: {
      comments: [{ id: "c1", body: "## Agent Workpad\n\n### Review feedback\n\n- (none)\n" }],
      async listComments() {
        return this.comments;
      },
      async updateWorkpad(input) {
        this.comments[0].body = input.body;
      },
      async setStatus() {},
      async getIssue() {
        return {
          description: "write-scope: apps/mobile/**",
          labels: ["mobile"],
          attachments: [],
        };
      },
    },
    typecheckTouched: async () => undefined,
    waitTimeoutMs: 0,
    waitIntervalMs: 0,
    spawnProcess(_command, args) {
      spawned.push({ args });
      return Promise.resolve({ status: 0 });
    },
  });

  await runner.run({
    role: "implement",
    identifier: "KIT-42",
    issueId: "issue-42",
    adwFile: ".pi/adw/feature.yaml",
  });

  assert.equal(spawned.length, 1);
  const args = spawned[0].args;
  const dash = args.indexOf("--");
  const prompt = String(args[dash + 1] ?? "");
  assert.match(prompt, /First run/i);
  assert.match(prompt, /Required helpers: expo, ui-ux/);
  assert.match(prompt, /Spawn Scout/i);
  assert.ok(args.filter((arg) => arg === "--skill").length >= 2);
});
