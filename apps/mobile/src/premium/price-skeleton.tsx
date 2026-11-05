import { StyleSheet, View } from "react-native";
import { ConfirmAnalyzingPulse, SKELETON_BONE_ALPHA } from "@/components/confirm-analyzing-pulse";
import { radius, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** A price the store has not answered yet. The lock bars "…" here: a pulsing bone holds the line's place. */
export function PriceSkeleton({
  width,
  height,
  testID,
}: {
  width: number | `${number}%`;
  height: number;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.bone, { width, height }]}
    >
      <ConfirmAnalyzingPulse color={withAlpha(theme.fillPrimary, SKELETON_BONE_ALPHA)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    borderRadius: radius.sm,
    overflow: "hidden",
  },
});
