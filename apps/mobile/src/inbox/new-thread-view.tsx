import type { CollectionConversationPeer } from "@kit/api-contract";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolvePhotoUrl } from "@/api/collection";
import { sendPeerMessage } from "@/api/conversations";
import { resolvePeerAvatarUrl } from "@/api/peer-profile";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/avatar";
import { ConversationHeader } from "@/components/conversation-view";
import { MessageComposer } from "@/components/message-composer";
import { pickMessageImage } from "@/inbox/pick-message-image";
import { type JerseyReference, sendMessageBody, threadStart } from "@/inbox/thread-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type NewThreadViewProps = {
  peer: CollectionConversationPeer;
  /** The jersey the thread was opened from; sent with the first message unless dismissed. */
  reference?: JerseyReference | null;
  onBack: () => void;
  /** The first message was sent: the API created the Conversation. */
  onSent: (conversationId: string) => void;
};

/**
 * The thread with a Collector who has no Conversation with this Collector yet (docs/design-system.md
 * → Conversation, composition 5 and "Starting a conversation without a bid"): the header, the
 * thread start (a centred 64px Avatar or initial, the Handle, city · n trøjer) and the Message
 * composer. Nothing exists until the first message is sent.
 */
export function NewThreadView({
  peer,
  reference: initialReference = null,
  onBack,
  onSent,
}: NewThreadViewProps) {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [reference, setReference] = useState<JerseyReference | null>(initialReference);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useMemo(() => threadStart(peer), [peer]);
  const imageHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

  const handleAttach = async () => {
    const base64 = await pickMessageImage();
    if (base64) {
      setPendingImageBase64(base64);
    }
  };

  const handleSend = async () => {
    if (!accessToken || sending) {
      return;
    }
    const body = sendMessageBody({ text: draft, imageBase64: pendingImageBase64, reference });
    if (!body.text && !body.contentBase64) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      const sent = await sendPeerMessage(accessToken, peer.peerId, body);
      onSent(sent.conversationId);
    } catch {
      setError("Beskeden kunne ikke sendes.");
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      testID="new-thread"
      style={[styles.container, { backgroundColor: theme.canvas }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <ConversationHeader handle={start.handle} onBack={onBack} />

      <View testID="thread-start" style={styles.start}>
        <Avatar
          handle={start.handle}
          uri={resolvePeerAvatarUrl(start.avatarPath)}
          uriHeaders={start.avatarPath ? imageHeaders : undefined}
          size="lg"
        />
        <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>{start.handle}</Text>
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>{start.meta}</Text>
      </View>

      {error ? (
        <Text style={[typography.caption, styles.error, { color: theme.contentSecondary }]}>
          {error}
        </Text>
      ) : null}

      <MessageComposer
        value={draft}
        onChangeText={setDraft}
        reference={reference}
        referenceThumbUri={
          reference?.thumbPath ? resolvePhotoUrl(reference.thumbPath, "grid") : null
        }
        referenceImageHeaders={imageHeaders}
        onDismissReference={() => setReference(null)}
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
  start: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapSm,
    paddingHorizontal: space.insetLg,
  },
  error: {
    paddingHorizontal: space.insetMd,
  },
});
