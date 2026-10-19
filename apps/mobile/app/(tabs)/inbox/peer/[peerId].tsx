import type { CollectionConversationPeer } from "@kit/api-contract";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { fetchPeerJersey } from "@/api/bidding";
import { fetchConversations, fetchPeerConversation } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { ConversationView } from "@/components/conversation-view";
import { IconButton } from "@/components/ui";
import { useInboxChrome } from "@/inbox/inbox-chrome";
import { NewThreadView } from "@/inbox/new-thread-view";
import { type JerseyReference, jerseyReference } from "@/inbox/thread-view-model";
import { writePlaceOverview } from "@/navigation/place-overview-cache";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type Loaded = { peer: CollectionConversationPeer; reference: JerseyReference | null };

/**
 * The thread with one Collector, opened from a foreign jersey (optionally about that jersey) or
 * from Peer Profil: the Conversation if there is one, else an empty thread whose first message
 * creates it (docs/design-system.md → Conversation, "Starting a conversation without a bid").
 */
export default function PeerThreadScreen() {
  const { peerId, jerseyId } = useLocalSearchParams<{ peerId: string; jerseyId?: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const { refreshUnreadCount } = useInboxChrome();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken || !peerId) {
      return;
    }
    let active = true;

    async function load(token: string, peer: string) {
      try {
        const found = await fetchPeerConversation(token, peer);
        // The reference is the jersey the thread was opened from. A jersey that is gone, private
        // or another Collector's leaves the thread without one; it is not a failure.
        let reference: JerseyReference | null = null;
        if (jerseyId) {
          try {
            const peerJersey = await fetchPeerJersey(token, jerseyId);
            reference = peerJersey.ownerId === peer ? jerseyReference(peerJersey) : null;
          } catch {
            reference = null;
          }
        }
        if (active) {
          setLoaded({ peer: found, reference });
        }
      } catch {
        if (active) {
          setFailed(true);
        }
      }
    }

    void load(accessToken, peerId);
    return () => {
      active = false;
    };
  }, [accessToken, peerId, jerseyId]);

  const handleSent = useCallback(
    async (conversationId: string) => {
      // The new thread is under Samtaler when Indbakke shows: hand it the fresh list, then open the thread.
      if (accessToken) {
        try {
          writePlaceOverview("inbox", await fetchConversations(accessToken));
        } catch {
          // The list loads again when Indbakke opens.
        }
      }
      void refreshUnreadCount();
      router.replace(`/(tabs)/inbox/${conversationId}`);
    },
    [accessToken, refreshUnreadCount, router],
  );

  if (failed || !peerId) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Samtalen kunne ikke hentes.
        </Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (loaded.peer.conversationId) {
    return (
      <ConversationView
        conversationId={loaded.peer.conversationId}
        reference={loaded.reference}
        onBack={() => router.back()}
        onConversationOpened={() => void refreshUnreadCount()}
        onConversationHidden={() => router.replace("/(tabs)/inbox")}
      />
    );
  }

  return (
    <NewThreadView
      peer={loaded.peer}
      reference={loaded.reference}
      onBack={() => router.back()}
      onSent={(conversationId) => void handleSent(conversationId)}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
});
