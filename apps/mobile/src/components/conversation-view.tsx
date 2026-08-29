import type { CollectionConversationDetail } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchConversation,
  resolveConversationPhotoUrl,
  sendConversationMessage,
} from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { BidCard } from "@/components/bid-card";
import { ChatBubble } from "@/components/chat-bubble";
import { MessageComposer } from "@/components/message-composer";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConversationViewProps = {
  conversationId: string;
  onBack: () => void;
  onOpenDetails?: () => void;
};

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type TimelineItem =
  | { type: "date"; id: string; label: string }
  | { type: "message"; id: string; message: CollectionConversationDetail["messages"][number] };

function buildTimeline(messages: CollectionConversationDetail["messages"]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDateKey: string | null = null;

  for (const message of messages) {
    const dateKey = message.createdAt.slice(0, 10);
    if (dateKey !== lastDateKey) {
      items.push({
        type: "date",
        id: `date-${dateKey}`,
        label: formatDateLabel(message.createdAt),
      });
      lastDateKey = dateKey;
    }
    items.push({ type: "message", id: message.id, message });
  }

  return items;
}

export function ConversationView({ conversationId, onBack, onOpenDetails }: ConversationViewProps) {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<CollectionConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imageHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

  const loadConversation = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchConversation(accessToken, conversationId);
      setDetail(response);
    } catch {
      setError("Samtalen kunne ikke hentes.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, conversationId]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  const jerseyContext = detail?.jerseyContext
    ? {
        clubLabel: detail.jerseyContext.clubLabel,
        seasonLabel: detail.jerseyContext.seasonLabel,
        typeLabel: KIT_TYPE_LABELS_DA[detail.jerseyContext.type],
      }
    : undefined;

  const timeline = detail ? buildTimeline(detail.messages) : [];

  const handleAttach = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.base64) {
      return;
    }

    setPendingImageBase64(result.assets[0].base64);
  };

  const handleSend = async () => {
    if (!accessToken || !detail) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed && !pendingImageBase64) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      await sendConversationMessage(accessToken, conversationId, {
        text: trimmed || undefined,
        contentBase64: pendingImageBase64 ?? undefined,
        replyToMessageId: replyTo?.id,
      });
      setDraft("");
      setPendingImageBase64(null);
      setReplyTo(null);
      await loadConversation();
    } catch {
      setError("Beskeden kunne ikke sendes.");
    } finally {
      setSending(false);
    }
  };

  if (loading && !detail) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          {error ?? "Samtalen findes ikke"}
        </Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={onBack} />
      </View>
    );
  }

  const contextLine = jerseyContext
    ? `${jerseyContext.clubLabel} · ${jerseyContext.seasonLabel} · ${jerseyContext.typeLabel}`
    : undefined;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.canvas }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.insetSm }]}>
        <IconButton name="Tilbage" icon="arrow-back" onPress={onBack} />
        <View style={styles.headerCenter}>
          <Text style={[typography.headingSm, { color: theme.contentPrimary }]} numberOfLines={1}>
            {detail.peerHandle}
          </Text>
          {contextLine ? (
            <Text style={[typography.mono, { color: theme.contentMuted }]} numberOfLines={1}>
              {contextLine}
            </Text>
          ) : null}
        </View>
        <IconButton name="Detaljer" icon="ellipsis-horizontal" onPress={onOpenDetails ?? onBack} />
      </View>

      {error ? (
        <Text style={[typography.caption, styles.error, { color: theme.contentSecondary }]}>
          {error}
        </Text>
      ) : null}

      <FlatList
        data={timeline}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (item.type === "date") {
            return (
              <Text style={[typography.mono, styles.dateLabel, { color: theme.contentMuted }]}>
                {item.label}
              </Text>
            );
          }

          const message = {
            ...item.message,
            imageUrl: item.message.imageUrl
              ? resolveConversationPhotoUrl(item.message.imageUrl)
              : undefined,
          };

          if (message.kind === "bid") {
            return (
              <BidCard
                message={message}
                peerHandle={detail.peerHandle}
                jerseyContext={jerseyContext}
              />
            );
          }

          return (
            <Pressable
              onLongPress={() => {
                if (message.text) {
                  setReplyTo({ id: message.id, text: message.text });
                }
              }}
            >
              <ChatBubble message={message} imageHeaders={imageHeaders} />
            </Pressable>
          );
        }}
      />

      <MessageComposer
        value={draft}
        onChangeText={setDraft}
        replyTo={replyTo?.text}
        onDismissReply={() => setReplyTo(null)}
        onAttach={() => void handleAttach()}
        onSend={() => void handleSend()}
        disabledSend={sending || (!draft.trim() && !pendingImageBase64)}
        pendingImage={Boolean(pendingImageBase64)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetMd,
    gap: space.gapSm,
  },
  headerCenter: {
    flex: 1,
    gap: 2,
  },
  listContent: {
    paddingVertical: space.insetMd,
    gap: space.gapSm,
  },
  dateLabel: {
    textAlign: "center",
    marginVertical: space.gapMd,
  },
  error: {
    paddingHorizontal: space.insetMd,
  },
});
