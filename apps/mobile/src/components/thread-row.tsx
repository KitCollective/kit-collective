import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * Thread row, Revision 2026-10-10 (docs/design-system.md → Thread row). `person` (under
 * Samtaler): 48px round initial or Avatar. `bid` (under Venter på dit svar): the jersey as a
 * 48 x 60 thumb and a `caption` jersey line. Unread is an 8px `fill.primary` dot plus snippet
 * weight 500, never a row fill.
 */
type ThreadRowProps = {
  variant: "person" | "bid";
  handle: string;
  /** The `bid` row's jersey line (club season · type). */
  jerseyLine?: string | null;
  snippet: string;
  timeLabel: string;
  unread: boolean;
  /** `person`: the initial shown when there is no photo. */
  initial: string;
  /** `person`: the peer photo, already resolved to a full URL. */
  avatarUri?: string | null;
  /** `bid`: the jersey thumb, already resolved to a full URL. */
  thumbUri?: string | null;
  imageHeaders?: Record<string, string>;
  /** Handle, snippet, time and "ulæst" when unread (built by the view-model). */
  accessibilityLabel: string;
  testID?: string;
  onPress: () => void;
};

/** The Avatar lock has no 48 size (design gap), so the 48px circle is drawn here. */
const LEADING_SIZE = 48;
const THUMB_WIDTH = 48;
const THUMB_HEIGHT = 60;
const UNREAD_DOT_SIZE = 8;

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)} min`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} t`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d`;
}

export function formatThreadTime(iso: string): string {
  return formatRelativeTime(iso);
}

export function ThreadRow({
  variant,
  handle,
  jerseyLine,
  snippet,
  timeLabel,
  unread,
  initial,
  avatarUri,
  thumbUri,
  imageHeaders,
  accessibilityLabel,
  testID,
  onPress,
}: ThreadRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  const leading =
    variant === "bid" ? (
      <View style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri, headers: imageHeaders }}
            style={styles.thumbImage}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
    ) : avatarUri ? (
      <Image
        source={{ uri: avatarUri, headers: imageHeaders }}
        style={[styles.circle, { backgroundColor: theme.fillSecondary }]}
        accessibilityIgnoresInvertColors
      />
    ) : (
      <View style={[styles.circle, styles.initial, { backgroundColor: theme.fillSecondary }]}>
        <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>{initial}</Text>
      </View>
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.canvas,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {leading}
      <View style={[styles.content, variant === "bid" && styles.contentBid]}>
        <View style={styles.topLine}>
          <Text
            style={[typography.headingSm, styles.handle, { color: theme.contentPrimary }]}
            numberOfLines={1}
          >
            {handle}
          </Text>
          <Text style={[typography.mono, { color: theme.contentMuted }]}>{timeLabel}</Text>
        </View>
        {variant === "bid" && jerseyLine ? (
          <Text style={[typography.caption, { color: theme.contentSecondary }]} numberOfLines={1}>
            {jerseyLine}
          </Text>
        ) : null}
        <Text
          style={[
            typography.body,
            {
              color: unread ? theme.contentPrimary : theme.contentSecondary,
              fontWeight: unread ? "500" : "400",
            },
          ]}
          numberOfLines={1}
        >
          {snippet}
        </Text>
      </View>
      {unread ? (
        <View
          testID={testID ? `${testID}-unread` : undefined}
          style={[styles.unreadDot, { backgroundColor: theme.fillPrimary }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetMd,
    paddingVertical: 14,
    minHeight: 72,
  },
  circle: {
    width: LEADING_SIZE,
    height: LEADING_SIZE,
    borderRadius: LEADING_SIZE / 2,
  },
  initial: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  content: {
    flex: 1,
    gap: space.gapSm,
  },
  /** Three lines against a 60px thumb: the line heights carry the spacing. */
  contentBid: {
    gap: 0,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapSm,
  },
  handle: {
    flexShrink: 1,
  },
  unreadDot: {
    width: UNREAD_DOT_SIZE,
    height: UNREAD_DOT_SIZE,
    borderRadius: UNREAD_DOT_SIZE / 2,
  },
});
