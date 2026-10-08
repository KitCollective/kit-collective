import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { ConversationView } from "@/components/conversation-view";
import { useInboxChrome } from "@/inbox/inbox-chrome";

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
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
      onBack={() => router.back()}
      onOpenDetails={() => router.push(`/(tabs)/inbox/${conversationId}/details`)}
      onConversationOpened={() => void handleConversationOpened()}
    />
  );
}
