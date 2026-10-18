import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { ConversationView } from "@/components/conversation-view";
import { useInboxChrome } from "@/inbox/inbox-chrome";

export default function ConversationScreen() {
  const { conversationId, messageId } = useLocalSearchParams<{
    conversationId: string;
    messageId?: string;
  }>();
  const router = useRouter();
  const { refreshUnreadCount } = useInboxChrome();

  const handleConversationOpened = useCallback(async () => {
    await refreshUnreadCount();
  }, [refreshUnreadCount]);

  if (!conversationId) {
    router.back();
    return null;
  }

  return (
    <ConversationView
      conversationId={conversationId}
      focusMessageId={messageId ?? null}
      onBack={() => router.back()}
      onConversationOpened={() => void handleConversationOpened()}
      onConversationHidden={() => router.replace("/(tabs)/inbox")}
    />
  );
}
