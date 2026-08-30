import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BiddingFetchError, fetchPeerJersey, sendBid } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { addFavorite, fetchFavorites, removeFavorite } from "@/api/favorites";
import { useAuth } from "@/auth/AuthProvider";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SendBidScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
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
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [peerJersey, setPeerJersey] = useState<Awaited<ReturnType<typeof fetchPeerJersey>> | null>(
    null,
  );
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const loadPeerJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    const [response, favorites] = await Promise.all([
      fetchPeerJersey(accessToken, jerseyId),
      fetchFavorites(accessToken),
    ]);
    setPeerJersey(response);
    setIsFavorite(favorites.favorites.some((item) => item.userJerseyId === jerseyId));
  }, [accessToken, jerseyId]);

  useEffect(() => {
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

    return () => {
      active = false;
    };
  }, [loadPeerJersey]);

  const parsedAmount = Number.parseInt(amount, 10);
  const canSubmit = Number.isInteger(parsedAmount) && parsedAmount >= 1 && !submitting;

  const handleToggleFavorite = async () => {
    if (!accessToken || !jerseyId || favoriteBusy) {
      return;
    }

    setFavoriteBusy(true);
    setError(null);
    try {
      if (isFavorite) {
        await removeFavorite(accessToken, jerseyId);
        setIsFavorite(false);
      } else {
        await addFavorite(accessToken, { userJerseyId: jerseyId });
        setIsFavorite(true);
      }
    } catch {
      setError("Favoritten kunne ikke opdateres.");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleSendBid = async () => {
    if (!accessToken || !jerseyId || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await sendBid(accessToken, jerseyId, { amountDkk: parsedAmount });
      router.back();
    } catch (caught) {
      if (caught instanceof BiddingFetchError) {
        setError("Buddet kunne ikke sendes. Tjek at trøjen stadig er åben for bud.");
      } else {
        setError("Buddet kunne ikke sendes.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!peerJersey) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  const primaryPhoto = peerJersey.photos[0];
  const metaLine = `${peerJersey.seasonLabel} · ${KIT_TYPE_LABELS_DA[peerJersey.type]}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.canvas }}
      contentContainerStyle={{
        paddingBottom: tabBarPadding,
        gap: space.gapLg,
      }}
    >
      <View style={{ paddingTop: insets.top + space.insetSm, paddingHorizontal: space.insetMd }}>
        <View style={styles.headerRow}>
          <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
          <View style={styles.headerSpacer} />
          <IconButton
            name={isFavorite ? "Fjern favorit" : "Gem favorit"}
            icon={isFavorite ? "heart" : "heart-outline"}
            disabled={favoriteBusy}
            onPress={() => void handleToggleFavorite()}
          />
        </View>
        <Text
          style={[typography.title, { color: theme.contentPrimary, marginBottom: space.insetMd }]}
        >
          Send bud
        </Text>
      </View>
      <View style={styles.content}>
        <View style={styles.photoCard}>
          {primaryPhoto ? (
            <Image
              source={{
                uri: resolvePhotoUrl(primaryPhoto.photoUrl),
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
              }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel={`${peerJersey.clubLabel} forside`}
            />
          ) : null}
        </View>
        <View style={styles.titleBlock}>
          <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>
            {peerJersey.clubLabel}
          </Text>
          <Text style={[typography.mono, { color: theme.contentSecondary }]}>{metaLine}</Text>
        </View>
        <View style={styles.ownerRow}>
          <View style={[styles.ownerInitial, { backgroundColor: theme.fillSecondary }]}>
            <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>
              {peerJersey.ownerInitial}
            </Text>
          </View>
          <Text style={[typography.headingSm, { color: theme.contentPrimary }]}>
            {peerJersey.ownerHandle}
          </Text>
        </View>
        <View style={styles.fieldBlock}>
          <Text style={[typography.label, { color: theme.contentSecondary }]}>Dit bud</Text>
          <View
            style={[
              styles.amountField,
              {
                borderColor: theme.contentPrimary,
                backgroundColor: theme.fillSecondary,
              },
            ]}
          >
            <TextInput
              accessibilityLabel="Dit bud i kroner"
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={theme.contentMuted}
              style={[typography.mono, styles.amountInput, { color: theme.contentPrimary }]}
            />
            <Text style={[typography.mono, { color: theme.contentSecondary }]}>kr</Text>
          </View>
          {peerJersey.latestBidAmountDkk ? (
            <Text style={[typography.mono, { color: theme.contentMuted }]}>
              Seneste bud: {peerJersey.latestBidAmountDkk} kr
            </Text>
          ) : null}
        </View>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Ejer får en besked i Indbakke. Dette er ikke et køb.
        </Text>
        {error ? (
          <Text style={[typography.body, { color: theme.danger }]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button
          label="Send bud"
          width="fill"
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void handleSendBid()}
        />
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
  headerSpacer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.insetMd,
    gap: space.gapLg,
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
  titleBlock: {
    gap: space.gapSm,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  ownerInitial: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBlock: {
    gap: space.gapSm,
  },
  amountField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.insetMd,
    minHeight: 48,
    gap: space.gapSm,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    lineHeight: 24,
    paddingVertical: space.insetSm,
  },
});
