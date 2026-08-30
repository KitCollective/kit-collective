import type { CollectionActivityItem, CollectionConversation } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchActivity } from "@/api/activity";
import { fetchConversations } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { ActivityCard } from "@/components/activity-card";
import { ConversationView } from "@/components/conversation-view";
import { ScreenHeader } from "@/components/screen-header";
import { formatThreadTime, ThreadRow } from "@/components/thread-row";
import { TopTabs } from "@/components/top-tabs";
import { EmptyState } from "@/components/ui";
import { useInboxChrome } from "@/inbox/inbox-chrome";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const INBOX_TABS = ["Beskeder", "Aktivitet"] as const;
type InboxTab = (typeof INBOX_TABS)[number];

const WIDE_BREAKPOINT = 1024;
const LIST_COLUMN_WIDTH = 360;

export default function InboxScreen() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setConversationVisible, refreshUnreadCount } = useInboxChrome();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
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
  const [activityItems, setActivityItems] = useState<CollectionActivityItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    try {
      const [conversationResponse, activityResponse] = await Promise.all([
        fetchConversations(accessToken),
        fetchActivity(accessToken),
      ]);
      setConversations(conversationResponse.conversations);
      setActivityItems(activityResponse.items);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!isWide) {
      setConversationVisible(false);
      return;
    }

    setConversationVisible(Boolean(selectedConversationId));
    return () => setConversationVisible(false);
  }, [isWide, selectedConversationId, setConversationVisible]);

  const handleConversationOpened = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const [conversationResponse, activityResponse] = await Promise.all([
      fetchConversations(accessToken),
      fetchActivity(accessToken),
    ]);
    setConversations(conversationResponse.conversations);
    setActivityItems(activityResponse.items);
    await refreshUnreadCount();
  }, [accessToken, refreshUnreadCount]);

  const openConversation = (conversationId: string) => {
    if (isWide) {
      setSelectedConversationId(conversationId);
      return;
    }
    router.push(`/(tabs)/inbox/${conversationId}`);
  };

  const listPanel = (
    <View
      style={[
        styles.listColumn,
        isWide && {
          width: LIST_COLUMN_WIDTH,
          borderRightWidth: 1,
          borderRightColor: theme.borderSubtle,
        },
        !isWide && { flex: 1, paddingBottom: tabBarPadding },
      ]}
    >
      <ScreenHeader title="Indbakke" />
      <TopTabs items={INBOX_TABS} active={activeTab} onChange={setActiveTab} />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.contentPrimary} />
        </View>
      ) : activeTab === "Aktivitet" ? (
        activityItems.length === 0 ? (
          <EmptyState
            title="Ingen aktivitet endnu"
            body="Bud og svar vises her, når samtaler kommer i gang."
          />
        ) : (
          <FlatList
            data={activityItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: tabBarPadding }}
            renderItem={({ item }) => (
              <ActivityCard item={item} onPress={() => openConversation(item.conversationId)} />
            )}
          />
        )
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
            <View
              style={
                isWide && selectedConversationId === item.id
                  ? [
                      styles.selectedRow,
                      {
                        backgroundColor: theme.fillSecondary,
                        borderLeftColor: theme.fillPrimary,
                      },
                    ]
                  : undefined
              }
            >
              <ThreadRow
                handle={item.peerHandle}
                initial={item.peerInitial}
                snippet={item.snippet}
                timeLabel={formatThreadTime(item.updatedAt)}
                unread={item.unread}
                onPress={() => openConversation(item.id)}
              />
            </View>
          )}
        />
      )}
    </View>
  );

  if (isWide) {
    return (
      <View style={[styles.wideRoot, { backgroundColor: theme.canvas }]}>
        {listPanel}
        <View style={styles.conversationColumn}>
          {selectedConversationId ? (
            <ConversationView
              conversationId={selectedConversationId}
              onBack={() => setSelectedConversationId(null)}
              onOpenDetails={() => undefined}
              onConversationOpened={() => void handleConversationOpened()}
            />
          ) : (
            <EmptyState
              title="Vælg en samtale"
              body="Tråde vises her, når du vælger en fra listen."
            />
          )}
        </View>
      </View>
    );
  }

  return <View style={[styles.container, { backgroundColor: theme.canvas }]}>{listPanel}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wideRoot: {
    flex: 1,
    flexDirection: "row",
  },
  listColumn: {
    flex: 1,
  },
  conversationColumn: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedRow: {
    borderLeftWidth: 2,
  },
});
