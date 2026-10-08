import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import {
  buildReviewPrompt,
  designExcerpt,
  isFinding,
  issueContract,
  parseVerdict,
  requestVerdict,
} from "../e2e/review.mjs";

const ISSUE = `write-scope: apps/mobile/app/(tabs)/wishlist/**

Design lock: docs/design-system.md

## Why

Because.

## What to build

1. A new empty state on Ønske.

## Acceptance criteria

- [ ] It shows.`;

const DESIGN = `# Design system

## Foundations

### Color

Ink on paper.

### Radius

Sharp.

## Components

### Chip

Chips are pills.

#### States

Selected is filled.

### Sheet

Sheets rise.

## Patterns

### Send bid

One field.`;

test("the issue contract is the write-scope line and What to build, nothing else", () => {
  assert.equal(
    issueContract(ISSUE),
    "write-scope: apps/mobile/app/(tabs)/wishlist/**\n\n## What to build\n\n1. A new empty state on Ønske.",
  );
});

test("an issue without the section is passed whole, with the scope noted as missing", () => {
  assert.equal(issueContract("Just do it."), "write-scope: (not declared)\n\nJust do it.");
});

test("the design excerpt is the named sections with their sub-headings", () => {
  assert.equal(
    designExcerpt(DESIGN, ["Chip", "Send bid", "Missing"]),
    "### Chip\n\nChips are pills.\n\n#### States\n\nSelected is filled.\n\n### Send bid\n\nOne field.",
  );
});

test("the review prompt names both screenshots for a changed step and one for a new step", () => {
  const base = { flow: "collection", step: "01-collection", contract: "c", excerpt: "e" };
  const changed = buildReviewPrompt({
    ...base,
    status: "changed",
    hasBefore: true,
    hasAfter: true,
  });
  assert.match(changed, /before\.png/);
  assert.match(changed, /after\.png/);
  const added = buildReviewPrompt({ ...base, status: "new", hasBefore: false, hasAfter: true });
  assert.doesNotMatch(added, /Read the image file before\.png/);
  assert.match(added, /Comparison: new/);
  assert.match(added, /There is no "before"/);
});

test("the verdict comes from a headless Claude run that may only read the two screenshots", async () => {
  const calls = [];
  process.env.ANTHROPIC_API_KEY = "would-bill-an-api-account";
  const verdict = await requestVerdict({
    prompt: "p",
    beforePng: Buffer.from("before"),
    afterPng: Buffer.from("after"),
    model: "sonnet",
    run: async (command, args, options) => {
      calls.push({ command, args, files: readdirSync(options.cwd).sort(), env: options.env });
      return JSON.stringify({
        is_error: false,
        result:
          '{"whatChanged":"x","askedFor":"yes","designLock":{"breaks":false,"rule":null},"suggestion":null}',
      });
    },
  });
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(verdict.askedFor, "yes");
  assert.equal(calls[0].command, "claude");
  // The subscription pays, never an API key that happens to be in the environment.
  assert.equal(calls[0].env.ANTHROPIC_API_KEY, undefined);
  assert.deepEqual(calls[0].files, ["after.png", "before.png"]);
  const args = calls[0].args;
  assert.deepEqual(args.slice(0, 2), ["-p", "p"]);
  assert.equal(args[args.indexOf("--tools") + 1], "Read");
  assert.equal(args[args.indexOf("--model") + 1], "sonnet");
  // No user or project settings, no MCP servers: the run cannot act on anything.
  assert.equal(args[args.indexOf("--setting-sources") + 1], "");
  assert.ok(args.includes("--strict-mcp-config"));
});

test("a Claude run that reports an error is a failed review, not a verdict", async () => {
  await assert.rejects(
    requestVerdict({
      prompt: "p",
      beforePng: null,
      afterPng: Buffer.from("a"),
      model: "sonnet",
      run: async () => JSON.stringify({ is_error: true, result: "Not logged in" }),
    }),
    /Not logged in/,
  );
});

test("a verdict is read out of a fenced reply", () => {
  const verdict = parseVerdict(
    'Here you go:\n```json\n{"whatChanged":"The chip row is taller.","askedFor":"no","designLock":{"breaks":true,"rule":"Chip: height 32"},"suggestion":null}\n```',
  );
  assert.deepEqual(verdict, {
    whatChanged: "The chip row is taller.",
    askedFor: "no",
    designLock: { breaks: true, rule: "Chip: height 32" },
    suggestion: null,
  });
});

test("a design-lock break without a named rule is not kept as a break", () => {
  const verdict = parseVerdict(
    '{"whatChanged":"x","askedFor":"yes","designLock":{"breaks":true,"rule":null},"suggestion":"Try less padding"}',
  );
  assert.deepEqual(verdict.designLock, { breaks: false, rule: null });
  assert.equal(verdict.suggestion, "Try less padding");
});

test("a reply that is not a verdict is refused", () => {
  assert.throws(() => parseVerdict("I cannot see images."), /JSON/);
  assert.throws(() => parseVerdict('{"whatChanged":"x","askedFor":"maybe"}'), /askedFor/);
});

test("an unasked change is a finding by itself; an asked, rule-abiding change is not", () => {
  const verdict = (askedFor, breaks) => ({
    whatChanged: "x",
    askedFor,
    designLock: { breaks, rule: breaks ? "r" : null },
    suggestion: "opinion",
  });
  assert.equal(isFinding(verdict("no", false)), true);
  assert.equal(isFinding(verdict("yes", true)), true);
  assert.equal(isFinding(verdict("yes", false)), false);
  assert.equal(isFinding(verdict("unclear", false)), false);
});
