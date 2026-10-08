import type { CollectionConversationMessage } from "@kit/api-contract";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ChatBubbleProps = {
  message: CollectionConversationMessage;
  imageHeaders?: Record<string, string>;
};

function formatBubbleTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

export function ChatBubble({ message, imageHeaders }: ChatBubbleProps) {
  const theme = useTheme();
  const typography = useTypography();
  const isOutgoing = message.role === "outgoing";

  const bubbleFill = isOutgoing ? theme.fillPrimary : theme.fillSecondary;
  const textColor = isOutgoing ? theme.contentInverse : theme.contentPrimary;
  const timeLabel = formatBubbleTime(message.createdAt);
  const accessibilityName = message.text ?? (message.imageUrl ? "Billede" : "Besked");

  return (
    <View
      style={[styles.row, isOutgoing ? styles.rowOutgoing : styles.rowIncoming]}
      accessibilityLabel={`${accessibilityName}, ${timeLabel}, ${isOutgoing ? "sendt" : "modtaget"}`}
    >
      <View style={[styles.bubble, { backgroundColor: bubbleFill, borderRadius: radius.md }]}>
        {message.imageUrl ? (
          <Image
            source={{ uri: message.imageUrl, headers: imageHeaders }}
            style={styles.image}
            accessibilityLabel={message.text ?? "Billede"}
          />
        ) : null}
        {message.text ? (
          <Text style={[typography.body, { color: textColor }]}>{message.text}</Text>
        ) : null}
        <Text style={[typography.mono, styles.time, { color: theme.contentMuted }]}>
          {timeLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.insetMd,
    marginBottom: space.gapSm,
  },
  rowIncoming: {
    alignItems: "flex-start",
  },
  rowOutgoing: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: 300,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
    gap: space.gapSm,
  },
  image: {
    width: 200,
    aspectRatio: 4 / 5,
    borderRadius: radius.md,
  },
  time: {
    marginTop: space.gapSm,
  },
});
