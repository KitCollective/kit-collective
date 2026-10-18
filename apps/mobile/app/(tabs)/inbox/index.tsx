import type { CollectionConversations } from "@kit/api-contract";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { resolvePhotoUrl } from "@/api/collection";
import { fetchConversations } from "@/api/conversations";
import { resolvePeerAvatarUrl } from "@/api/peer-profile";
import { useAuth } from "@/auth/AuthProvider";
import { ConversationView } from "@/components/conversation-view";
import { ScreenHeader } from "@/components/screen-header";
import { tabBarContentInset } from "@/components/tab-bar-metrics";
import { formatThreadTime, ThreadRow } from "@/components/thread-row";
import { Button, EmptyState } from "@/components/ui";
import { useInboxChrome } from "@/inbox/inbox-chrome";
import { filterInboxByJersey } from "@/inbox/inbox-jersey-filter";
import { InboxJerseyFilterChip } from "@/inbox/inbox-jersey-filter-chip";
import { buildInbox, type InboxRow, type InboxSection } from "@/inbox/inbox-view-model";
import { registerPlaceHome, useIsPlaceHomeLive } from "@/navigation/place-homes";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { PlacePagerScreen } from "@/navigation/place-pager-screen";
import { PLACE_HREFS } from "@/navigation/place-swipe";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

const WIDE_BREAKPOINT = 1024;
const LIST_COLUMN_WIDTH = 360;

const NO_INBOX: CollectionConversations = { waiting: [], conversations: [], unreadCount: 0 };

type InboxListSection = InboxSection & { key: string; data: InboxRow[] };

export default function InboxScreen() {
  return <PlacePagerScreen place="inbox" />;
}

function InboxHome() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const router = useRouter();
  const { jerseyId: routeJerseyId } = useLocalSearchParams<{ jerseyId?: string }>();
  const insets = useStableSafeAreaInsets();
  const { setConversationVisible, refreshUnreadCount } = useInboxChrome();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const tabBarPadding = tabBarContentInset(insets.bottom);
  const cachedInbox = usePlaceOverview("inbox");
  const isLive = useIsPlaceHomeLive("inbox");
  const [loading, setLoading] = useState(cachedInbox == null);
  const [inbox, setInbox] = useState<CollectionConversations>(cachedInbox ?? NO_INBOX);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  // The jersey this Indbakke is filtered to (the own jersey detail's bid row). PlacePager also
  // renders this home as a neighbour page, so only the live copy reads the route param; it keeps
  // the value while blurred (a thread on top of Indbakke must not flash the unfiltered lists).
  const [jerseyFilterId, setJerseyFilterId] = useState<string | null>(null);
  const imageHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined),
    [accessToken],
  );

  useEffect(() => {
    if (!cachedInbox) {
      return;
    }
    setInbox(cachedInbox);
    setLoading(false);
  }, [cachedInbox]);

  // One request feeds the screen: the Indbakke response holds both sections.
  const refreshInbox = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const response = await fetchConversations(accessToken);
    setInbox(response);
    writePlaceOverview("inbox", response);
  }, [accessToken]);

  const loadInbox = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    if (!readPlaceOverview("inbox")) {
      setLoading(true);
    }
    try {
      await refreshInbox();
    } finally {
      setLoading(false);
    }
  }, [accessToken, refreshInbox]);

  useEffect(() => {
    if (!isLive) {
      return;
    }
    setJerseyFilterId(routeJerseyId ?? null);
  }, [isLive, routeJerseyId]);

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
    await refreshInbox();
    await refreshUnreadCount();
  }, [refreshInbox, refreshUnreadCount]);

  // A waiting row passes the Bud's message id; the thread opens at that Bud.
  const openConversation = (conversationId: string, messageId: string | null) => {
    if (isWide) {
      setSelectedConversationId(conversationId);
      setSelectedMessageId(messageId);
      return;
    }
    router.push(
      messageId
        ? `/(tabs)/inbox/${conversationId}?messageId=${messageId}`
        : `/(tabs)/inbox/${conversationId}`,
    );
  };

  const filtered = useMemo(
    () => filterInboxByJersey(inbox, jerseyFilterId),
    [inbox, jerseyFilterId],
  );
  const view = useMemo(() => buildInbox(filtered, formatThreadTime), [filtered]);
  const filterActive = jerseyFilterId !== null;

  const sections = useMemo(() => {
    const list: InboxListSection[] = [];
    if (view.waiting) {
      list.push({ ...view.waiting, key: "waiting", data: view.waiting.rows });
    }
    if (view.conversations.rows.length > 0) {
      list.push({ ...view.conversations, key: "conversations", data: view.conversations.rows });
    }
    return list;
  }, [view]);

  const renderRow = (row: InboxRow) => {
    const selected = isWide && selectedConversationId === row.conversationId;

    return (
      <View
        style={
          selected
            ? [
                styles.selectedRow,
                { backgroundColor: theme.fillSecondary, borderLeftColor: theme.fillPrimary },
              ]
            : undefined
        }
      >
        <ThreadRow
          variant={row.variant}
          handle={row.handle}
          jerseyLine={row.jerseyLine}
          snippet={row.snippet}
          timeLabel={row.timeLabel}
          unread={row.unread}
          initial={row.initial}
          avatarUri={row.avatarUrl ? resolvePeerAvatarUrl(row.avatarUrl) : null}
          thumbUri={row.thumbUrl ? resolvePhotoUrl(row.thumbUrl, "grid") : null}
          imageHeaders={imageHeaders}
          accessibilityLabel={row.accessibilityLabel}
          testID={`inbox-row-${row.key}`}
          onPress={() => openConversation(row.conversationId, row.messageId)}
        />
      </View>
    );
  };

  const emptyState = filterActive ? (
    <EmptyState title="Ingen bud om trøjen" body="Der er ingen bud om denne trøje lige nu." />
  ) : (
    <EmptyState
      title="Ingen samtaler endnu"
      body="En samtale starter med et bud eller en besked."
      action={
        <View style={styles.emptyActions}>
          <Button
            label="Find trøjer"
            variant="primary"
            testID="inbox-empty-find"
            onPress={() => router.navigate(PLACE_HREFS.search)}
          />
          <Button
            label="Åbn for bud"
            variant="secondary"
            testID="inbox-empty-open-for-bid"
            onPress={() => router.navigate(PLACE_HREFS.collection)}
          />
        </View>
      }
    />
  );

  const list = view.empty ? (
    emptyState
  ) : (
    <SectionList
      sections={sections}
      keyExtractor={(row) => row.key}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: isWide ? tabBarPadding : 0 }}
      renderSectionHeader={({ section }) => (
        <View
          testID={`inbox-section-${section.key}`}
          accessibilityRole="header"
          style={styles.sectionHeading}
        >
          <Text style={[typography.section, { color: theme.contentPrimary }]}>{section.title}</Text>
          {section.count ? (
            <Text
              testID={`inbox-section-${section.key}-count`}
              style={[typography.monoSm, { color: theme.contentMuted }]}
            >
              {section.count}
            </Text>
          ) : null}
        </View>
      )}
      renderItem={({ item }) => renderRow(item)}
    />
  );

  const body = loading ? (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.contentPrimary} />
    </View>
  ) : (
    list
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
      <ScreenHeader title="Indbakke" />
      {filterActive ? (
        <InboxJerseyFilterChip
          kitLine={filtered.kitLine}
          onClear={() => router.setParams({ jerseyId: undefined })}
        />
      ) : null}
      {body}
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
              focusMessageId={selectedMessageId}
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
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.gapSm,
    paddingHorizontal: space.insetMd,
    paddingTop: space.insetMd,
    paddingBottom: space.insetSm,
  },
  emptyActions: {
    alignItems: "center",
    gap: space.gapSm,
  },
});
