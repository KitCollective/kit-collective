import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const floatingBarPath = "apps/mobile/src/components/floating-tab-bar.tsx";

function countIconRenderSites(source) {
  const renderSlotCount = (source.match(/renderSlot\(/g) ?? []).length;
  const plusIconCount = (source.match(/<Ionicons[^>]*\bname="add"/g) ?? []).length;
  return renderSlotCount + plusIconCount;
}

test("floating tab bar has five icon render sites", () => {
  const source = readFileSync(floatingBarPath, "utf8");
  assert.equal(countIconRenderSites(source), 5);
});

test("icon render site count fails when a renderSlot call is removed", () => {
  const source = readFileSync(floatingBarPath, "utf8");
  const mutated = source.replace('{renderSlot("profile")}', "");
  assert.equal(countIconRenderSites(mutated), 4);
});
