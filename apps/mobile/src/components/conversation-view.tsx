import type { CollectionConversationDetail } from "@kit/api-contract";
import * as ImagePicker from "expo-image-picker";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { respondBid } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
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
import { headerInitial, threadItems } from "@/inbox/thread-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConversationViewProps = {
  conversationId: string;
  onBack: () => void;
  onOpenDetails?: () => void;
  onConversationOpened?: () => void;
};

/** Conversation header: a 32px round initial. Not the Avatar primitive, which has no 32 size (lock contradiction, flagged in KIT-297). */
const HEADER_INITIAL_SIZE = 32;
/** System line: max 300 wide (Conversation, Composition 4). */
const SYSTEM_LINE_MAX_WIDTH = 300;

export function ConversationView({
  conversationId,
  onBack,
  onOpenDetails,
  onConversationOpened,
}: ConversationViewProps) {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<CollectionConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null);
  const [respondingBidId, setRespondingBidId] = useState<string | null>(null);
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
      onConversationOpened?.();
    } catch {
      setError("Samtalen kunne ikke hentes.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, conversationId, onConversationOpened]);

  // On focus, not only on mount: a Bud sent from Send nyt bud shows when the thread is back.
  useFocusEffect(
    useCallback(() => {
      void loadConversation();
    }, [loadConversation]),
  );

  const items = useMemo(() => (detail ? threadItems(detail) : []), [detail]);

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

  const handleRespondBid = async (messageId: string, decision: "accept" | "decline") => {
    if (!accessToken) {
      return;
    }

    setRespondingBidId(messageId);
    setError(null);
    try {
      await respondBid(accessToken, conversationId, messageId, decision);
      await loadConversation();
    } catch {
      setError("Buddet kunne ikke opdateres.");
    } finally {
      setRespondingBidId(null);
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.canvas }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View
        testID="conversation-header"
        style={[
          styles.header,
          { paddingTop: insets.top + space.insetSm, borderBottomColor: theme.borderSubtle },
        ]}
      >
        <IconButton name="Tilbage" icon="arrow-back" onPress={onBack} />
        <View style={styles.headerCenter}>
          <View
            style={[styles.headerInitial, { backgroundColor: theme.fillSecondary }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>
              {headerInitial(detail.peerHandle)}
            </Text>
          </View>
          <Text
            style={[typography.label, styles.headerHandle, { color: theme.contentPrimary }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {detail.peerHandle}
          </Text>
        </View>
        <IconButton
          testID="conversation-more"
          name="Mere"
          icon="ellipsis-horizontal"
          onPress={onOpenDetails ?? onBack}
        />
      </View>

      {error ? (
        <Text style={[typography.caption, styles.error, { color: theme.contentSecondary }]}>
          {error}
        </Text>
      ) : null}

      <FlatList
        data={items}
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

          if (item.type === "system") {
            return (
              <Text
                testID="thread-system-line"
                style={[typography.caption, styles.systemLine, { color: theme.contentSecondary }]}
              >
                {item.text}
              </Text>
            );
          }

          if (item.type === "bid") {
            const answer = item.card.actions === "answer";
            const thumbPath = item.card.jersey?.thumbPath;
            return (
              <BidCard
                card={item.card}
                messageId={item.id}
                thumbUri={thumbPath ? resolvePhotoUrl(thumbPath, "grid") : null}
                imageHeaders={imageHeaders}
                responding={respondingBidId === item.id}
                onAccept={answer ? () => void handleRespondBid(item.id, "accept") : undefined}
                onDecline={answer ? () => void handleRespondBid(item.id, "decline") : undefined}
                // SAFETY: the view-model builds only routes that exist under app/(tabs).
                onNavigate={(href) => router.push(href as Href)}
              />
            );
          }

          const message = {
            ...item.message,
            imageUrl: item.message.imageUrl
              ? resolveConversationPhotoUrl(item.message.imageUrl)
              : undefined,
          };

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
    paddingBottom: space.insetSm,
    gap: space.gapSm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  headerInitial: {
    width: HEADER_INITIAL_SIZE,
    height: HEADER_INITIAL_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerHandle: {
    flexShrink: 1,
  },
  listContent: {
    paddingVertical: space.insetMd,
    gap: space.gapSm,
  },
  dateLabel: {
    textAlign: "center",
    marginVertical: space.gapMd,
  },
  systemLine: {
    alignSelf: "center",
    textAlign: "center",
    maxWidth: SYSTEM_LINE_MAX_WIDTH,
    marginVertical: space.gapSm,
    paddingHorizontal: space.insetMd,
  },
  error: {
    paddingHorizontal: space.insetMd,
  },
});
