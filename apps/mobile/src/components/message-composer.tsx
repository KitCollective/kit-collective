import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type MessageComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  replyTo?: string;
  onDismissReply?: () => void;
  onAttach: () => void;
  onSend: () => void;
  disabledSend: boolean;
  pendingImage?: boolean;
};

export function MessageComposer({
  value,
  onChangeText,
  replyTo,
  onDismissReply,
  onAttach,
  onSend,
  disabledSend,
  pendingImage = false,
}: MessageComposerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, space.insetMd),
          borderTopColor: theme.borderSubtle,
          backgroundColor: theme.canvas,
        },
      ]}
    >
      {replyTo ? (
        <View style={styles.replyRow}>
          <Text
            style={[typography.caption, styles.replyText, { color: theme.contentSecondary }]}
            numberOfLines={1}
          >
            {replyTo}
          </Text>
          <IconButton name="Luk svar" icon="close" onPress={onDismissReply} iconSize={20} />
        </View>
      ) : null}
      <View style={styles.row}>
        <IconButton name="Tilføj billede" icon="image-outline" onPress={onAttach} />
        <TextInput
          accessibilityLabel="Besked"
          placeholder="Skriv en besked"
          placeholderTextColor={theme.contentMuted}
          value={value}
          onChangeText={onChangeText}
          multiline
          style={[
            typography.body,
            styles.input,
            {
              backgroundColor: theme.fillSecondary,
              color: theme.contentPrimary,
              borderColor: theme.borderSubtle,
              borderRadius: radius.sm,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={onSend}
          disabled={disabledSend}
          style={[
            styles.send,
            {
              backgroundColor: disabledSend ? theme.fillSecondary : theme.fillPrimary,
              borderRadius: radius.sm,
            },
          ]}
        >
          <Ionicons
            name="send"
            size={22}
            color={disabledSend ? theme.contentMuted : theme.contentInverse}
          />
        </Pressable>
      </View>
      {pendingImage ? (
        <Text style={[typography.caption, { color: theme.contentSecondary, paddingHorizontal: 4 }]}>
          Billede klar til afsendelse
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingHorizontal: space.insetMd,
    paddingTop: space.insetSm,
    gap: space.gapSm,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  replyText: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.gapSm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
    borderWidth: 1,
  },
  send: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
