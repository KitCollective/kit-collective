import type { CollectionPeerJersey } from "@kit/api-contract";
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { BiddingFetchError, fetchPeerJersey } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { addFavorite, fetchFavorites, removeFavorite } from "@/api/favorites";
import { blockPeer, reportPeer } from "@/api/moderation";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/catalog-ui";
import { toastConfig } from "@/components/toast-config";
import { Button, ButtonDock, IconButton } from "@/components/ui";
import { peerThreadHref, writeToPeerLabel } from "@/inbox/thread-view-model";
import { WriteToPeerButton } from "@/inbox/write-to-peer-button";
import {
  JerseyFactRow,
  JerseyPlayerRow,
  JerseyTitleBlock,
} from "@/jersey-detail/jersey-detail-rows";
import { JerseyPhotoPager } from "@/jersey-detail/jersey-photos";
import { peerJerseyDockState } from "@/search/bid-rules";
import { consumeBidSent } from "@/search/bid-sent-handoff";
import { bidSentToastConfig, showBidSentToast } from "@/search/bid-sent-toast";
import { ForeignJerseyOwnerRow } from "@/search/foreign-jersey-owner-row";
import { buildForeignJerseyView } from "@/search/foreign-jersey-view-model";
import { OwnBidRow } from "@/search/own-bid-row";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** Dock content (the 54 high own bid row and Send bud) plus the dock's top padding and a gap. */
const BID_ROW_DOCK_CLEARANCE = 54 + space.insetMd + space.gapMd;

export default function ForeignJerseyDetailScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [peerJersey, setPeerJersey] = useState<CollectionPeerJersey | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);

  const loadPeerJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    try {
      const [response, favorites] = await Promise.all([
        fetchPeerJersey(accessToken, jerseyId),
        fetchFavorites(accessToken),
      ]);
      setPeerJersey(response);
      setIsFavorite(favorites.favorites.some((item) => item.userJerseyId === jerseyId));
    } catch (caught) {
      if (caught instanceof BiddingFetchError && caught.status === 404) {
        setPeerJersey(null);
      } else {
        throw caught;
      }
    }
  }, [accessToken, jerseyId]);

  // Reload on every focus, so coming back from Send bud (or a thread) shows the own bid row. The
  // Toast is a one-shot handoff consumed here, not on every reload.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function run() {
        try {
          await loadPeerJersey();
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void run();
      const sentTo = jerseyId ? consumeBidSent(jerseyId) : null;
      if (sentTo) {
        showBidSentToast(sentTo);
      }

      return () => {
        active = false;
      };
    }, [loadPeerJersey, jerseyId]),
  );

  const handleToggleFavorite = async () => {
    if (!accessToken || !jerseyId || favoriteBusy) {
      return;
    }

    setFavoriteBusy(true);
    try {
      if (isFavorite) {
        await removeFavorite(accessToken, jerseyId);
        setIsFavorite(false);
      } else {
        await addFavorite(accessToken, { userJerseyId: jerseyId });
        setIsFavorite(true);
      }
    } catch {
      Alert.alert("Favorit", "Favoritten kunne ikke opdateres.");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const runModeration = async (label: string, action: () => Promise<void>) => {
    if (!accessToken || moderationBusy) {
      return;
    }

    setModerationBusy(true);
    setOverflowOpen(false);
    try {
      await action();
      Alert.alert(label, "Handlingen er gennemført.", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch {
      Alert.alert(label, "Handlingen kunne ikke gennemføres.");
    } finally {
      setModerationBusy(false);
    }
  };

  const handleReport = () => {
    if (!peerJersey || !accessToken) {
      return;
    }

    void runModeration("Rapportér", () => reportPeer(accessToken, peerJersey.ownerId, {}));
  };

  const handleBlock = () => {
    if (!peerJersey || !accessToken) {
      return;
    }

    void runModeration("Blokér", () => blockPeer(accessToken, peerJersey.ownerId));
  };

  // This screen is a full-screen modal over the Søg tab: a push into the Indbakke tab alone opens
  // the thread behind it (hosted Device flow, KIT-291). Close the Søg stack first.
  const openThreadWithOwner = () => {
    if (!peerJersey) {
      return;
    }
    router.dismissAll();
    // SAFETY: the view-model builds only routes that exist under app/(tabs).
    router.push(peerThreadHref(peerJersey.ownerId, peerJersey.id) as Href);
  };

  const view = useMemo(
    () => (peerJersey ? buildForeignJerseyView(peerJersey) : null),
    [peerJersey],
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!peerJersey || !view) {
    return (
      <View
        testID="foreign-jersey-not-found"
        style={[styles.centered, { backgroundColor: theme.canvas }]}
      >
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  const dockState = peerJerseyDockState({
    biddingEnabled: peerJersey.biddingEnabled,
    myPendingBid: peerJersey.myPendingBid,
  });

  return (
    <View testID="foreign-jersey-detail" style={[styles.root, { backgroundColor: theme.canvas }]}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: space.insetLg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <JerseyPhotoPager
          pagerRef={pagerRef}
          photos={peerJersey.photos}
          photoUris={peerJersey.photos.map((photo) => resolvePhotoUrl(photo.photoUrl, "lightbox"))}
          title={view.title}
          accessToken={accessToken}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          onBack={() => router.back()}
          onMore={() => setOverflowOpen(true)}
          favorite={{ active: isFavorite, onPress: () => void handleToggleFavorite() }}
        />

        <View style={styles.column}>
          <JerseyTitleBlock caption={view.caption} title={view.title} season={view.season} />

          {view.playerRow ? <JerseyPlayerRow row={view.playerRow} /> : null}

          <View>
            {view.factRows.map((row, index) => (
              <JerseyFactRow key={row.key} row={row} hairline={index < view.factRows.length - 1} />
            ))}
          </View>

          <ForeignJerseyOwnerRow owner={view.owner} onPress={() => router.push(view.owner.href)} />
        </View>
      </ScrollView>

      {dockState.kind === "send" ? (
        <ButtonDock>
          <View style={styles.dockRow}>
            <WriteToPeerButton
              testID="foreign-jersey-write"
              name={writeToPeerLabel(peerJersey.ownerHandle)}
              onPress={openThreadWithOwner}
            />
            <View style={styles.dockPrimary}>
              <Button
                label="Send bud"
                testID="send-bid-open"
                width="fill"
                onPress={() => router.push(`/(tabs)/search/send-bid/${jerseyId}`)}
              />
            </View>
          </View>
        </ButtonDock>
      ) : null}

      {dockState.kind === "none" ? (
        <ButtonDock>
          <Button
            label={writeToPeerLabel(peerJersey.ownerHandle)}
            testID="foreign-jersey-write"
            variant="secondary"
            width="fill"
            onPress={openThreadWithOwner}
          />
        </ButtonDock>
      ) : null}

      {dockState.kind === "own-pending" ? (
        <ButtonDock>
          <OwnBidRow
            amountDkk={dockState.amountDkk}
            onPress={() => {
              // This screen is a full-screen modal over the Søg tab: a push into the Indbakke tab
              // alone opens the thread behind it (hosted Device flow, KIT-291). Close the Søg
              // stack first.
              router.dismissAll();
              router.push(`/(tabs)/inbox/${dockState.conversationId}`);
            }}
          />
        </ButtonDock>
      ) : null}

      {/*
        This screen is a full-screen modal on iOS, a native surface the root <Toast> cannot cover:
        the host lives here, like the (capture) group's. It carries the locked `toastConfig` too: Toast
        routes every show to the last mounted host, so an `error` Toast must keep its danger chrome.
        bottomOffset clears the dock.
        docs/design-system.md → Toast → Placement.
      */}
      <Toast
        config={{ ...toastConfig, ...bidSentToastConfig }}
        position="bottom"
        bottomOffset={Math.max(insets.bottom, space.insetMd) + BID_ROW_DOCK_CLEARANCE}
      />

      <Sheet visible={overflowOpen} title="Handlinger" onDismiss={() => setOverflowOpen(false)}>
        <View style={styles.overflowActions}>
          <Button
            label="Rapportér"
            testID="foreign-jersey-report"
            variant="secondary"
            width="fill"
            disabled={moderationBusy}
            onPress={handleReport}
          />
          <Button
            label="Blokér"
            testID="foreign-jersey-block"
            variant="destructive"
            width="fill"
            disabled={moderationBusy}
            onPress={handleBlock}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  column: {
    paddingHorizontal: space.insetMd,
    paddingTop: space.insetMd,
    gap: space.gapLg,
  },
  dockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  dockPrimary: {
    flex: 1,
  },
  overflowActions: {
    gap: space.gapSm,
  },
});
