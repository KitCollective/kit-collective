import type { CollectionDiscoverCatalogDrill, CollectionDiscoverJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BiddingFetchError, fetchDiscoverCatalogDrill } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { Mark } from "@/components/catalog-ui";
import { JerseyTile } from "@/components/jersey-tile";
import { DrillHeader } from "@/components/profile-ui";
import { EmptyState } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CatalogDrillKind = CollectionDiscoverCatalogDrill["kind"];

export function CatalogDrillScreen({ kind }: { kind: CatalogDrillKind }) {
  const params = useLocalSearchParams<{ clubId?: string; playerId?: string; label?: string }>();
  const entityId = kind === "club" ? params.clubId : params.playerId;
  const fallbackTitle =
    typeof params.label === "string" && params.label.trim()
      ? params.label
      : kind === "club"
        ? "Klub"
        : "Spiller";
  const router = useRouter();
  const { accessToken } = useAuth();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [drill, setDrill] = useState<CollectionDiscoverCatalogDrill | null>(null);

  const loadDrill = useCallback(async () => {
    if (!accessToken || !entityId) {
      return;
    }

    try {
      setDrill(await fetchDiscoverCatalogDrill(accessToken, kind, entityId));
      setMissing(false);
    } catch (caught) {
      if (caught instanceof BiddingFetchError && caught.status === 404) {
        setDrill(null);
        setMissing(true);
        return;
      }
      throw caught;
    }
  }, [accessToken, entityId, kind]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadDrill();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, [loadDrill]);

  const title = drill?.title ?? fallbackTitle;
  const columnGap = space.gapMd;
  const horizontalPadding = space.insetMd * 2;
  const tileWidth = (width - horizontalPadding - columnGap) / 2;

  const photoSource = (jersey: CollectionDiscoverJersey) => {
    const primaryPhoto = jersey.photos[0];
    return primaryPhoto
      ? {
          uri: resolvePhotoUrl(primaryPhoto.photoUrl),
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        }
      : undefined;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <DrillHeader title={title} onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator color={theme.contentSecondary} style={styles.loading} />
      ) : missing ? (
        <EmptyState title="Ikke fundet" body="Denne katalogside findes ikke." />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarPadding }]}>
          <View testID={`catalog-drill-${kind}`} style={styles.identity}>
            <Mark label={title} size="md" />
            <Text style={[typography.mono, { color: theme.contentSecondary }]}>
              {drill?.count ?? 0} trøjer
            </Text>
          </View>
          {drill && drill.jerseys.length === 0 ? (
            <EmptyState
              title="Ingen trøjer"
              body="Ingen synlige trøjer matcher denne katalogside."
            />
          ) : (
            <View style={styles.grid}>
              {drill?.jerseys.map((jersey) => (
                <View key={jersey.id} style={{ width: tileWidth }}>
                  <JerseyTile
                    photoSource={photoSource(jersey)}
                    clubLabel={jersey.clubLabel}
                    seasonLabel={jersey.seasonLabel}
                    typeLabel={KIT_TYPE_LABELS_DA[jersey.type]}
                    onPress={() => router.push(`/(tabs)/search/${jersey.id}`)}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    marginTop: space.insetLg,
  },
  content: {
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapMd,
  },
});
