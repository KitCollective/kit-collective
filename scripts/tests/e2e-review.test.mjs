import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReviewMessages,
  designExcerpt,
  isFinding,
  issueContract,
  parseVerdict,
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

test("the review request carries both images for a changed step and one for a new step", () => {
  const base = { flow: "collection", step: "01-collection", contract: "c", excerpt: "e" };
  const images = (messages) => messages[1].content.filter((part) => part.type === "image_url");
  const changed = buildReviewMessages({
    ...base,
    status: "changed",
    beforePng: Buffer.from("before"),
    afterPng: Buffer.from("after"),
  });
  assert.equal(images(changed).length, 2);
  assert.equal(
    images(changed)[0].image_url.url,
    `data:image/png;base64,${Buffer.from("before").toString("base64")}`,
  );
  const added = buildReviewMessages({
    ...base,
    status: "new",
    beforePng: null,
    afterPng: Buffer.from("a"),
  });
  assert.equal(images(added).length, 1);
  assert.match(added[1].content[0].text, /Comparison: new/);
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
