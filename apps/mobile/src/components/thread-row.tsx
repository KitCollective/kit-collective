import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ThreadRowProps = {
  handle: string;
  initial: string;
  snippet: string;
  timeLabel: string;
  unread: boolean;
  onPress: () => void;
};

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
  handle,
  initial,
  snippet,
  timeLabel,
  unread,
  onPress,
}: ThreadRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${handle}, ${snippet}, ${timeLabel}${unread ? ", ulæst" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: unread ? theme.fillSecondary : theme.canvas,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={[styles.initial, { backgroundColor: theme.fillSecondary }]}>
        <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>{initial}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={[typography.headingSm, { color: theme.contentPrimary }]} numberOfLines={1}>
            {handle}
          </Text>
          <Text style={[typography.mono, { color: theme.contentMuted }]}>{timeLabel}</Text>
        </View>
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
  initial: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: space.gapSm,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapSm,
  },
});
