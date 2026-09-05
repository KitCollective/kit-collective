import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkMobileTabBar, tabTriggerNames } from "../check-mobile-tab-bar.mjs";

const tabLayoutPath = "apps/mobile/app/(tabs)/_layout.tsx";

test("native tab layout declares five triggers in the locked order", () => {
  const source = readFileSync(tabLayoutPath, "utf8");
  assert.deepEqual(tabTriggerNames(source), [
    "collection",
    "inbox",
    "search",
    "wishlist",
    "profile",
  ]);
});

const PROFILE_TRIGGER = /<NativeTabs\.Trigger\s+name="profile"[\s\S]*?<\/NativeTabs\.Trigger>/;

test("trigger name count drops when a trigger is removed", () => {
  const source = readFileSync(tabLayoutPath, "utf8");
  const mutated = source.replace(PROFILE_TRIGGER, "");
  assert.deepEqual(tabTriggerNames(mutated), ["collection", "inbox", "search", "wishlist"]);
});

test("checkMobileTabBar fails when the tab order is broken", () => {
  const source = readFileSync(tabLayoutPath, "utf8");
  const mutated = source.replace(PROFILE_TRIGGER, "");
  const violations = checkMobileTabBar({ layoutSource: mutated });
  assert.ok(violations.some((violation) => violation.includes("expected five tabs in order")));
});

test("checkMobileTabBar fails when capture is reintroduced as a tab", () => {
  const source = readFileSync(tabLayoutPath, "utf8");
  const mutated = source.replace(
    /<NativeTabs\.Trigger(\s+)name="search"/,
    '<NativeTabs.Trigger name="add"></NativeTabs.Trigger>$&',
  );
  const violations = checkMobileTabBar({ layoutSource: mutated });
  assert.ok(violations.some((violation) => violation.includes("capture must not be a tab")));
});
