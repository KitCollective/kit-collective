import type { CollectionActivityItem, CollectionConversation } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import { fetchActivity } from "@/api/activity";
import { fetchConversations } from "@/api/conversations";
import { useAuth } from "@/auth/AuthProvider";
import { ActivityCard } from "@/components/activity-card";
import { ConversationView } from "@/components/conversation-view";
import { ScreenHeader } from "@/components/screen-header";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { formatThreadTime, ThreadRow } from "@/components/thread-row";
import { TopTabs } from "@/components/top-tabs";
import { EmptyState } from "@/components/ui";
import { useInboxChrome } from "@/inbox/inbox-chrome";
import { InboxInnerPager } from "@/navigation/inbox-inner-pager";
import { registerPlaceHome, useIsPlaceHomeLive } from "@/navigation/place-homes";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";
import { INBOX_TABS, type InboxTab } from "@/navigation/place-swipe";
import { usePlaceSwipe } from "@/navigation/place-swipe-context";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

const WIDE_BREAKPOINT = 1024;
const LIST_COLUMN_WIDTH = 360;

export default function InboxScreen() {
  return <PlacePagerScreen place="inbox" />;
}

function InboxHome() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useStableSafeAreaInsets();
  const { setConversationVisible, refreshUnreadCount } = useInboxChrome();
  const swipe = usePlaceSwipe();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const tabBarPadding = tabBarContentInset(insets.bottom);
  const cachedInbox = usePlaceOverview("inbox");
  const isLive = useIsPlaceHomeLive("inbox");
  const [loading, setLoading] = useState(cachedInbox == null);
  const [conversations, setConversations] = useState<CollectionConversation[]>(
    cachedInbox?.conversations ?? [],
  );
  const [activityItems, setActivityItems] = useState<CollectionActivityItem[]>(
    cachedInbox?.activityItems ?? [],
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const activeTab = swipe.inboxTab;
  const swipeInnerTabs = !isWide && !reduceMotion;

  useEffect(() => {
    if (!isLive) {
      return;
    }
    swipe.inboxInnerConsumesSwipe.set(swipeInnerTabs && !loading);
    return () => {
      swipe.inboxInnerConsumesSwipe.set(false);
    };
  }, [isLive, loading, swipe.inboxInnerConsumesSwipe, swipeInnerTabs]);

  useEffect(() => {
    if (!cachedInbox) {
      return;
    }
    setConversations(cachedInbox.conversations);
    setActivityItems(cachedInbox.activityItems);
    setLoading(false);
  }, [cachedInbox]);

  const loadInbox = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    if (!readPlaceOverview("inbox")) {
      setLoading(true);
    }
    try {
      const [conversationResponse, activityResponse] = await Promise.all([
        fetchConversations(accessToken),
        fetchActivity(accessToken),
      ]);
      setConversations(conversationResponse.conversations);
      setActivityItems(activityResponse.items);
      writePlaceOverview("inbox", {
        conversations: conversationResponse.conversations,
        activityItems: activityResponse.items,
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isLive) {
      return;
    }
    void loadInbox();
  }, [isLive, loadInbox]);

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
    writePlaceOverview("inbox", {
      conversations: conversationResponse.conversations,
      activityItems: activityResponse.items,
    });
    await refreshUnreadCount();
  }, [accessToken, refreshUnreadCount]);

  const openConversation = (conversationId: string) => {
    if (isWide) {
      setSelectedConversationId(conversationId);
      return;
    }
    router.push(`/(tabs)/inbox/${conversationId}`);
  };

  const selectTab = (tab: InboxTab) => {
    swipe.setInboxTab(tab);
  };

  const messagesList =
    conversations.length === 0 ? (
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
    );

  const activityList =
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
    );

  const chrome = (
    <>
      <ScreenHeader title="Indbakke" />
      <TopTabs items={INBOX_TABS} active={activeTab} onChange={selectTab} />
    </>
  );

  const tabBody = loading ? (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.contentPrimary} />
    </View>
  ) : swipeInnerTabs ? (
    <InboxInnerPager
      enabled={isLive}
      pageWidth={width}
      header={chrome}
      messages={messagesList}
      activity={activityList}
    />
  ) : activeTab === "Aktivitet" ? (
    activityList
  ) : (
    messagesList
  );

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
      {swipeInnerTabs && !loading ? (
        tabBody
      ) : (
        <>
          {chrome}
          {tabBody}
        </>
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
              onOpenDetails={() => router.push(`/(tabs)/inbox/${selectedConversationId}/details`)}
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

registerPlaceHome("inbox", InboxHome);

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
