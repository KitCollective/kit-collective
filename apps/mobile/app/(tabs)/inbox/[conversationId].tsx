import { useLocalSearchParams, useRouter } from "expo-router";
import { ConversationView } from "@/components/conversation-view";

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();

  if (!conversationId) {
    router.back();
    return null;
  }

  return (
    <ConversationView
      conversationId={conversationId}
      onBack={() => router.back()}
      onOpenDetails={() => undefined}
    />
  );
}
