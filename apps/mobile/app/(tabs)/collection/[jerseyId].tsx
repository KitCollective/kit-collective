import type { CollectionJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { useTabBarContentPadding } from "@/components/shortcut-chip-row";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function JerseyDetailScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const tabBarPadding = useTabBarContentPadding();
  const [loading, setLoading] = useState(true);
  const [jersey, setJersey] = useState<CollectionJersey | null>(null);

  const loadJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken);
    const found = response.jerseys.find((item) => item.id === jerseyId) ?? null;
    setJersey(found);
  }, [accessToken, jerseyId]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadJersey();
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
  }, [loadJersey]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!jersey) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  const metaLine = `${jersey.seasonLabel} · ${KIT_TYPE_LABELS_DA[jersey.type]}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + space.insetSm,
        paddingBottom: tabBarPadding,
        paddingHorizontal: space.insetMd,
        gap: space.gapLg,
      }}
    >
      <View style={styles.headerRow}>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
      <View style={styles.titleBlock}>
        <Text style={[typography.title, { color: theme.contentPrimary }]}>{jersey.clubLabel}</Text>
        <Text style={[typography.mono, { color: theme.contentSecondary }]}>{metaLine}</Text>
      </View>
      <View style={styles.photoGrid}>
        {jersey.photos.map((photo) => (
          <View key={photo.id} style={styles.photoCard}>
            <Image
              source={{
                uri: resolvePhotoUrl(photo.photoUrl),
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
              }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel={`${jersey.clubLabel} ${photo.role}`}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleBlock: {
    gap: space.gapSm,
  },
  photoGrid: {
    gap: space.gapMd,
  },
  photoCard: {
    borderRadius: radius.md,
    overflow: "hidden",
    aspectRatio: 4 / 5,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
});
