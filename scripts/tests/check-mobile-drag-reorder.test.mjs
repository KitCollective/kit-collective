import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileDragReorder } from "../check-mobile-drag-reorder.mjs";

const compliantSource = `
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
const styles = StyleSheet.create({
  dragHandle: {
    minWidth: 44,
    minHeight: 44,
  },
});
accessibilityLabel="Flyt"
`;

describe("checkMobileDragReorder", () => {
  it("passes compliant drag-reorder implementation", () => {
    assert.deepEqual(checkMobileDragReorder({ sheetSource: compliantSource }), []);
  });

  it("fails when PanResponder is used", () => {
    const violations = checkMobileDragReorder({
      sheetSource: `${compliantSource}\nPanResponder`,
    });
    assert.ok(violations.some((line) => line.includes("PanResponder")));
  });

  it("fails when drag handle is undersized", () => {
    const violations = checkMobileDragReorder({
      sheetSource: compliantSource.replace("minWidth: 44", "width: 20"),
    });
    assert.ok(violations.some((line) => line.includes("44×44")));
  });

  it("fails when onUpdate bridges to RN runtime every frame", () => {
    const violations = checkMobileDragReorder({
      sheetSource: `${compliantSource}
const pan = Gesture.Pan()
  .onUpdate((event) => {
    dragOffsetY.value = event.translationY;
    runOnJS(onDragMove)(event.translationY);
  });`,
    });
    assert.ok(violations.some((line) => line.includes("runOnJS/scheduleOnRN")));
  });
});
