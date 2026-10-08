import { useLocalSearchParams, useRouter } from "expo-router";
import { ConversationDetailsView } from "@/components/conversation-details-view";

export default function ConversationDetailsScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();

  if (!conversationId) {
    router.back();
    return null;
  }

  return (
    <ConversationDetailsView
      conversationId={conversationId}
      onBack={() => router.back()}
      onConversationHidden={() => router.replace("/(tabs)/inbox")}
    />
  );
}
