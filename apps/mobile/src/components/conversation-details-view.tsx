import type { CollectionConversationPeer } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  blockConversation,
  fetchConversationPeer,
  hideConversation,
  reportConversation,
} from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import {
  DrillHeader,
  ListDangerRow,
  ListPeerStubRow,
  ProfileSurfaceGroup,
} from "@/components/profile-ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConversationDetailsViewProps = {
  conversationId: string;
  onBack: () => void;
  onConversationHidden: () => void;
};

const CONVERSATION_DETAILS_HELPER_COPY =
  "Blokering skjuler samtalen for jer begge. Slet samtale fjerner den kun for dig — den anden kan stadig se tråden.";

function peerMeta(peer: CollectionConversationPeer): string {
  const jerseyLabel = peer.jerseyCount === 1 ? "1 trøje" : `${peer.jerseyCount} trøjer`;
  return peer.city ? `${jerseyLabel} · ${peer.city}` : jerseyLabel;
}

export function ConversationDetailsView({
  conversationId,
  onBack,
  onConversationHidden,
}: ConversationDetailsViewProps) {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [peer, setPeer] = useState<CollectionConversationPeer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPeer = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchConversationPeer(accessToken, conversationId);
      setPeer(response);
    } catch {
      setError("Kunne ikke hente detaljer");
      setPeer(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, conversationId]);

  useEffect(() => {
    void loadPeer();
  }, [loadPeer]);

  const runAction = useCallback(
    async (label: string, action: (token: string) => Promise<void>) => {
      if (!accessToken) {
        return;
      }

      try {
        await action(accessToken);
        Alert.alert(label, "Handlingen er gennemført.");
        if (label === "Slet samtale" || label === "Blokér") {
          onConversationHidden();
        }
      } catch {
        Alert.alert(label, "Noget gik galt. Prøv igen.");
      }
    },
    [accessToken, onConversationHidden],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.fillSecondary }]}>
      <View style={{ paddingTop: insets.top }}>
        <DrillHeader title="Detaljer" onBack={onBack} />
      </View>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.contentPrimary} />
        </View>
      ) : error || !peer ? (
        <View style={styles.loading}>
          <Text style={[typography.body, { color: theme.contentSecondary }]}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileSurfaceGroup>
            <ListPeerStubRow
              handle={peer.handle}
              meta={peerMeta(peer)}
              onPress={() => router.push(`/(tabs)/search/peer/${peer.handle}`)}
            />
          </ProfileSurfaceGroup>

          <ProfileSurfaceGroup>
            <ListDangerRow
              title="Rapportér"
              icon="flag-outline"
              showHairline
              onPress={() =>
                void runAction("Rapportér", (token) => reportConversation(token, conversationId))
              }
            />
            <ListDangerRow
              title="Blokér"
              icon="ban-outline"
              onPress={() =>
                void runAction("Blokér", (token) => blockConversation(token, conversationId))
              }
            />
          </ProfileSurfaceGroup>

          <ProfileSurfaceGroup>
            <ListDangerRow
              title="Slet samtale"
              icon="trash-outline"
              onPress={() =>
                void runAction("Slet samtale", (token) => hideConversation(token, conversationId))
              }
            />
          </ProfileSurfaceGroup>

          <Text style={[typography.caption, styles.helper, { color: theme.contentSecondary }]}>
            {CONVERSATION_DETAILS_HELPER_COPY}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  content: {
    gap: space.gapLg,
    paddingBottom: space.insetLg,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: {
    paddingHorizontal: space.insetSm,
  },
});
