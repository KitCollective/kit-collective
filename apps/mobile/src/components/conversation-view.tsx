import type { CollectionConversationDetail, CollectionConversationPeer } from "@kit/api-contract";
import * as ImagePicker from "expo-image-picker";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Toast from "react-native-toast-message";
import { respondBid } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import {
  blockConversation,
  fetchConversation,
  fetchConversationPeer,
  hideConversation,
  reportConversation,
  resolveConversationPhotoUrl,
  sendConversationMessage,
} from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { BidCard } from "@/components/bid-card";
import { Banner } from "@/components/catalog-ui";
import { ChatBubble } from "@/components/chat-bubble";
import { MessageComposer } from "@/components/message-composer";
import { IconButton } from "@/components/ui";
import { ConversationConfirmSheet, ConversationMoreSheet } from "@/inbox/conversation-more-sheets";
import {
  CONVERSATION_MORE_FAILURE,
  conversationMore,
  headerInitial,
  threadItems,
} from "@/inbox/thread-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConversationViewProps = {
  conversationId: string;
  onBack: () => void;
  /** Deprecated and ignored: More is a Sheet over the thread now, it no longer routes. The wide Indbakke (KIT-296) still passes it. */
  onOpenDetails?: () => void;
  onConversationOpened?: () => void;
  /** After Blokér or Slet samtale ran; the Collector goes back to Indbakke. Defaults to `onBack`. */
  onConversationHidden?: () => void;
};

type MoreAction = "profile" | "report" | "block" | "delete";
type ConfirmKind = "block" | "delete";

/** Conversation header: a 32px round initial. Not the Avatar primitive, which has no 32 size (lock contradiction, flagged in KIT-297). */
const HEADER_INITIAL_SIZE = 32;
/** System line: max 300 wide (Conversation, Composition 4). */
const SYSTEM_LINE_MAX_WIDTH = 300;

export function ConversationView({
  conversationId,
  onBack,
  onConversationOpened,
  onConversationHidden,
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
  const [peer, setPeer] = useState<CollectionConversationPeer | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Kept while the confirm Sheet animates out, so its copy does not change under the collector.
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>("delete");
  const [confirming, setConfirming] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const pendingMoreAction = useRef<MoreAction | null>(null);

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
  const more = useMemo(() => (peer ? conversationMore(peer) : null), [peer]);

  // The peer is fetched once; a failure here only matters when More is tapped.
  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let cancelled = false;
    fetchConversationPeer(accessToken, conversationId)
      .then((response) => {
        if (!cancelled) {
          setPeer(response);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, conversationId]);

  const handleOpenMore = async () => {
    setMoreError(null);
    if (peer) {
      setMoreOpen(true);
      return;
    }
    if (!accessToken) {
      return;
    }
    try {
      setPeer(await fetchConversationPeer(accessToken, conversationId));
      setMoreOpen(true);
    } catch {
      setMoreError(CONVERSATION_MORE_FAILURE);
    }
  };

  const hideThread = onConversationHidden ?? onBack;

  const runConfirmed = async () => {
    if (!accessToken) {
      return;
    }
    setConfirming(true);
    try {
      if (confirmKind === "block") {
        await blockConversation(accessToken, conversationId);
      } else {
        await hideConversation(accessToken, conversationId);
      }
      setConfirmOpen(false);
      hideThread();
    } catch {
      setConfirmOpen(false);
      setMoreError(CONVERSATION_MORE_FAILURE);
    } finally {
      setConfirming(false);
    }
  };

  const runReport = async () => {
    if (!accessToken || !more) {
      return;
    }
    try {
      await reportConversation(accessToken, conversationId);
      // Only an `error` Toast config exists, so this renders the library's default chrome (design gap).
      Toast.show({ type: "success", position: "bottom", text1: more.reportedToast });
    } catch {
      setMoreError(CONVERSATION_MORE_FAILURE);
    }
  };

  // The More Sheet closes first; on iOS the next surface (profile push, confirm Sheet, Toast)
  // waits for Modal.onDismiss so Sheets never nest or layer over a closing Modal.
  const runPendingMoreAction = () => {
    const next = pendingMoreAction.current;
    pendingMoreAction.current = null;
    if (next === "profile" && more) {
      // SAFETY: the view-model builds only routes that exist under app/(tabs).
      router.push(more.profile.href as Href);
    } else if (next === "report") {
      void runReport();
    } else if (next === "block" || next === "delete") {
      setConfirmKind(next);
      setConfirmOpen(true);
    }
  };

  const chooseMoreAction = (action: MoreAction) => {
    setMoreOpen(false);
    pendingMoreAction.current = action;
    if (Platform.OS !== "ios") {
      runPendingMoreAction();
    }
  };

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
          {/* The lock says `label` 16 / 600; there is no 600 Plex face, so `label` stays at 500 (design gap). */}
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
          onPress={() => void handleOpenMore()}
        />
      </View>

      {error ? (
        <Text style={[typography.caption, styles.error, { color: theme.contentSecondary }]}>
          {error}
        </Text>
      ) : null}

      {moreError ? (
        <View testID="conversation-more-error" style={styles.moreError}>
          <Banner tone="danger" message={moreError} />
        </View>
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
            const incomingPending = item.card.actions === "answer";
            const thumbPath = item.card.jersey?.thumbPath;
            return (
              <BidCard
                card={item.card}
                messageId={item.id}
                thumbUri={thumbPath ? resolvePhotoUrl(thumbPath, "grid") : null}
                imageHeaders={imageHeaders}
                responding={respondingBidId === item.id}
                incomingPending={incomingPending}
                onAccept={
                  incomingPending ? () => void handleRespondBid(item.id, "accept") : undefined
                }
                onDecline={
                  incomingPending ? () => void handleRespondBid(item.id, "decline") : undefined
                }
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

      {more ? (
        <>
          <ConversationMoreSheet
            visible={moreOpen}
            more={more}
            onDismiss={() => {
              pendingMoreAction.current = null;
              setMoreOpen(false);
            }}
            onModalHide={runPendingMoreAction}
            onOpenProfile={() => chooseMoreAction("profile")}
            onReport={() => chooseMoreAction("report")}
            onBlock={() => chooseMoreAction("block")}
            onDelete={() => chooseMoreAction("delete")}
          />
          <ConversationConfirmSheet
            visible={confirmOpen}
            copy={more.confirm[confirmKind]}
            loading={confirming}
            onConfirm={() => void runConfirmed()}
            onDismiss={() => setConfirmOpen(false)}
          />
        </>
      ) : null}
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
  moreError: {
    paddingHorizontal: space.insetMd,
    paddingTop: space.insetSm,
  },
});
