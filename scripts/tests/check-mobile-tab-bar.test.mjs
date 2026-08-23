import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkMobileTabBar, countIconRenderSites } from "../check-mobile-tab-bar.mjs";

const floatingBarPath = "apps/mobile/src/components/floating-tab-bar.tsx";

test("floating tab bar has five icon render sites", () => {
  const source = readFileSync(floatingBarPath, "utf8");
  assert.equal(countIconRenderSites(source), 5);
});

test("icon render site count fails when a renderSlot call is removed", () => {
  const source = readFileSync(floatingBarPath, "utf8");
  const mutated = source.replace('{renderSlot("profile")}', "");
  assert.equal(countIconRenderSites(mutated), 4);
});

test("checkMobileTabBar fails when a renderSlot call is removed from the bar source", () => {
  const source = readFileSync(floatingBarPath, "utf8");
  const mutated = source.replace('{renderSlot("profile")}', "");
  const violations = checkMobileTabBar({ barSource: mutated });
  assert.ok(
    violations.some((violation) => violation.includes("expected five icon render sites")),
  );
});
