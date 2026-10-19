import { Image, StyleSheet, Text, View } from "react-native";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** docs/design-system.md → Message composer, Revision 2026-10-10: a 32 × 40 thumb. */
const REFERENCE_THUMB_WIDTH = 32;
const REFERENCE_THUMB_HEIGHT = 40;
/** The jersey in `label` 15 / 500: the type scale has no 15 step (design gap, as on the Bid card). */
const REFERENCE_LABEL_SIZE = 15;
const DISMISS_ICON_SIZE = 20;

type JerseyReferenceRowProps = {
  caption: string;
  label: string;
  /** The jersey thumb, already resolved to a full URL; null shows the empty slot. */
  thumbUri: string | null;
  imageHeaders?: Record<string, string>;
  /** With a dismiss name and handler the row is the composer's; without, it is read-only (above a bubble). */
  dismissName?: string;
  onDismiss?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * The jersey a thread was opened from, or a message is about: a thumb, `caption` **Om trøjen**,
 * the jersey in `label`, and, in the composer, a dismiss Icon button.
 */
export function JerseyReferenceRow({
  caption,
  label,
  thumbUri,
  imageHeaders,
  dismissName,
  onDismiss,
  accessibilityLabel,
  testID,
}: JerseyReferenceRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View testID={testID} style={styles.row}>
      <View
        style={styles.summary}
        accessible
        accessibilityLabel={accessibilityLabel ?? `${caption}, ${label}`}
      >
        <View style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}>
          {thumbUri ? (
            <Image
              source={{ uri: thumbUri, headers: imageHeaders }}
              style={styles.thumbImage}
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>
        <View style={styles.text}>
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>{caption}</Text>
          <Text
            style={[
              typography.label,
              { fontSize: REFERENCE_LABEL_SIZE, color: theme.contentPrimary },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      </View>
      {dismissName && onDismiss ? (
        <IconButton
          testID={testID ? `${testID}-dismiss` : undefined}
          name={dismissName}
          icon="close"
          onPress={onDismiss}
          iconSize={DISMISS_ICON_SIZE}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  summary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  thumb: {
    width: REFERENCE_THUMB_WIDTH,
    height: REFERENCE_THUMB_HEIGHT,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  text: {
    flex: 1,
  },
});
