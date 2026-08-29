import type { CollectionConversation } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchConversations } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { ScreenHeader } from "@/components/screen-header";
import { formatThreadTime, ThreadRow } from "@/components/thread-row";
import { TopTabs } from "@/components/top-tabs";
import { EmptyState } from "@/components/ui";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const INBOX_TABS = ["Beskeder", "Aktivitet"] as const;
type InboxTab = (typeof INBOX_TABS)[number];

export default function InboxScreen() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;
  const [activeTab, setActiveTab] = useState<InboxTab>("Beskeder");
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<CollectionConversation[]>([]);

  const loadConversations = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetchConversations(accessToken);
      setConversations(response.conversations);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.canvas, paddingBottom: tabBarPadding }]}
    >
      <ScreenHeader title="Indbakke" />
      <TopTabs items={INBOX_TABS} active={activeTab} onChange={setActiveTab} />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.contentPrimary} />
        </View>
      ) : activeTab === "Aktivitet" ? (
        <EmptyState
          title="Ingen aktivitet endnu"
          body="Bud og svar vises her, når samtaler kommer i gang."
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          title="Ingen beskeder endnu"
          body="Når en anden samler byder på en af dine trøjer, starter samtalen her."
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ThreadRow
              handle={item.peerHandle}
              initial={item.peerInitial}
              snippet={item.snippet}
              timeLabel={formatThreadTime(item.updatedAt)}
              unread={item.unread}
              onPress={() => undefined}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
