import type { CollectionJersey } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { patchJerseyBidding, patchJerseyPrivate } from "@/api/bidding";
import { fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
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
  // Reserve space for floating tab bar — inline per docs/design-system.md Layout constraints.
  const tabBarPadding =
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd;
  const [loading, setLoading] = useState(true);
  const [jersey, setJersey] = useState<CollectionJersey | null>(null);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [savingBidding, setSavingBidding] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);

  const loadJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken);
    const found = response.jerseys.find((item) => item.id === jerseyId) ?? null;
    setJersey(found);
    setBiddingEnabled(found?.biddingEnabled ?? false);
    setIsPrivate(found?.private ?? false);
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

  const toggleBidding = async (nextValue: boolean) => {
    if (!accessToken || !jerseyId) {
      return;
    }

    setBiddingEnabled(nextValue);
    setSavingBidding(true);
    try {
      const updated = await patchJerseyBidding(accessToken, jerseyId, {
        biddingEnabled: nextValue,
      });
      setBiddingEnabled(updated.biddingEnabled);
    } catch {
      setBiddingEnabled(!nextValue);
    } finally {
      setSavingBidding(false);
    }
  };

  const togglePrivate = async (nextValue: boolean) => {
    if (!accessToken || !jerseyId) {
      return;
    }

    setIsPrivate(nextValue);
    setSavingPrivate(true);
    try {
      const updated = await patchJerseyPrivate(accessToken, jerseyId, { private: nextValue });
      setIsPrivate(updated.private);
      setBiddingEnabled(updated.biddingEnabled);
    } catch {
      setIsPrivate(!nextValue);
    } finally {
      setSavingPrivate(false);
    }
  };

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
      <View
        style={[
          styles.biddingRow,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderSubtle,
            opacity: isPrivate ? 0.4 : 1,
          },
        ]}
      >
        <View style={styles.biddingCopy}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Åben for bud</Text>
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>
            Andre samlere kan finde trøjen under Søg og sende bud.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Åben for bud"
          accessibilityRole="switch"
          accessibilityState={{ checked: biddingEnabled, disabled: savingBidding || isPrivate }}
          value={biddingEnabled}
          disabled={savingBidding || isPrivate}
          onValueChange={(value) => void toggleBidding(value)}
          trackColor={{ false: theme.borderSubtle, true: theme.fillPrimary }}
          thumbColor={theme.contentInverse}
        />
      </View>
      <View
        style={[
          styles.biddingRow,
          { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
        ]}
      >
        <View style={styles.biddingCopy}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Privat</Text>
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>
            Skjuler trøjen fra søgning og andre samlere.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Privat"
          accessibilityRole="switch"
          accessibilityState={{ checked: isPrivate, disabled: savingPrivate }}
          value={isPrivate}
          disabled={savingPrivate}
          onValueChange={(value) => void togglePrivate(value)}
          trackColor={{ false: theme.borderSubtle, true: theme.fillPrimary }}
          thumbColor={theme.contentInverse}
        />
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
  biddingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapMd,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.insetMd,
  },
  biddingCopy: {
    flex: 1,
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
