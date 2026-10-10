import assert from "node:assert/strict";
import { test } from "node:test";
import { flowOfKey, stepKey } from "../e2e/compare.mjs";
import { onlyFlows, sliceDesignSections, sliceFlowName } from "../e2e/slices.mjs";

test("the design sections come from the header comment of the slice flow", () => {
  const yaml = "# Device flow\n# design-sections: Sheet, Button dock ,Chip\nappId: x\n";
  assert.deepEqual(sliceDesignSections(yaml), ["Sheet", "Button dock", "Chip"]);
});

test("a slice flow without the comment, or with an empty list, asks for no extra sections", () => {
  assert.deepEqual(sliceDesignSections("appId: x\n"), []);
  assert.deepEqual(sliceDesignSections("# design-sections:\nappId: x\n"), []);
});

test("an issue key becomes the flow name in screenshot names", () => {
  assert.equal(sliceFlowName("KIT-279"), "kit-279");
});

test("a before run is cut to the flows of the after run, so other flows are not removed", () => {
  const before = new Map([
    [stepKey("collection", "01-collection"), "a"],
    [stepKey("kit-279", "01-sheet"), "b"],
  ]);
  const kept = onlyFlows(before, new Set(["kit-279"]), flowOfKey);
  assert.deepEqual([...kept.keys()], [stepKey("kit-279", "01-sheet")]);
});
