import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { OverviewRow } from "@/capture/captureOverview";
import { ConfirmAnalyzingPulse, SKELETON_BONE_ALPHA } from "@/components/confirm-analyzing-pulse";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, type, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = space.insetLg * 2;
const THUMB_HEIGHT = (THUMB_WIDTH * 5) / 4;
/** One fixed width so the trailing status of every row starts on the same x. */
const STATUS_WIDTH = space.insetLg * 4;
const DOT_SIZE = space.insetSm;

type CaptureOverviewRowProps = {
  row: OverviewRow;
  testID: string;
  onPress: () => void;
};

/**
 * One jersey of the bulk overview: 4:5 thumb, club (`heading-sm`), season · type (`mono`) and a
 * fixed-width trailing status (docs/design-system.md, Capture session, Revision 2026-10-09, item 3).
 */
export function CaptureOverviewRow({ row, testID, onPress }: CaptureOverviewRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const saved = row.kind === "saved";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        row.statusLabel
          ? `${row.title}, ${row.meta}. ${row.statusLabel}`
          : `${row.title}, ${row.meta}`
      }
      accessibilityState={{ disabled: saved }}
      disabled={saved}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {row.thumbUri ? (
        <Image
          source={{ uri: row.thumbUri }}
          accessibilityIgnoresInvertColors
          style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}
        />
      ) : (
        <View style={[styles.thumb, { backgroundColor: theme.fillSecondary }]} />
      )}
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[typography.headingSm, { color: theme.contentPrimary }]}>
          {row.title}
        </Text>
        <Text numberOfLines={1} style={[typography.mono, { color: theme.contentSecondary }]}>
          {row.meta}
        </Text>
      </View>
      <View style={styles.status} testID={`${testID}-status`}>
        {row.status === "check" ? (
          <View style={[styles.dot, { backgroundColor: theme.warning }]} />
        ) : null}
        {saved ? (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={theme.success}
            accessibilityElementsHidden
          />
        ) : null}
        {row.statusLabel ? (
          <Text
            numberOfLines={1}
            style={[
              typography.labelSm,
              {
                color: row.status === "check" ? theme.contentPrimary : theme.contentSecondary,
              },
            ]}
          >
            {row.statusLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Bone({ width, height }: { width: number | `${number}%`; height: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.bone, { width, height }]}>
      <ConfirmAnalyzingPulse color={withAlpha(theme.fillPrimary, SKELETON_BONE_ALPHA)} />
    </View>
  );
}

/** A jersey Vision has not placed yet: the row shape in `fill.secondary`, pulsing like every skeleton. */
export function CaptureOverviewSkeletonRow({ testID }: { testID: string }) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, styles.skeleton, { backgroundColor: theme.fillSecondary }]}
    >
      <Bone width={THUMB_WIDTH} height={THUMB_HEIGHT} />
      <View style={styles.copy}>
        <Bone width="60%" height={type.headingSm.lineHeight} />
        <Bone width="40%" height={type.mono.lineHeight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: THUMB_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  pressed: {
    opacity: 0.9,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  status: {
    width: STATUS_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.gapSm,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill,
  },
  skeleton: {
    padding: space.insetSm,
    borderRadius: radius.md,
  },
  bone: {
    borderRadius: radius.sm,
    overflow: "hidden",
    marginVertical: space.gapSm / 4,
  },
});
