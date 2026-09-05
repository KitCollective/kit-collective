import type { CollectionJersey } from "@kit/api-contract";
import { JERSEY_CONDITION_LABELS_DA, JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { patchJerseyBidding, patchJerseyPrivate } from "@/api/bidding";
import { deleteUserJersey, fetchCollectionJerseys, resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { createEditCaptureSession } from "@/capture/captureSession";
import { createSqliteCaptureSessionStore } from "@/capture/captureSessionSqliteStore";
import { Sheet } from "@/components/catalog-ui";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const TAB_BAR_STYLE_VISIBLE = {
  position: "absolute" as const,
  backgroundColor: "transparent",
  borderTopWidth: 0,
  elevation: 0,
};

export default function JerseyDetailScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { width: screenWidth } = useWindowDimensions();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [jersey, setJersey] = useState<CollectionJersey | null>(null);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [savingBidding, setSavingBidding] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useLayoutEffect(() => {
    const tabNav = navigation.getParent();
    tabNav?.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      tabNav?.setOptions({ tabBarStyle: TAB_BAR_STYLE_VISIBLE });
    };
  }, [navigation]);

  const loadJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    const response = await fetchCollectionJerseys(accessToken);
    const found = response.jerseys.find((item) => item.id === jerseyId) ?? null;
    setJersey(found);
    setBiddingEnabled(found?.biddingEnabled ?? false);
    setIsPrivate(found?.private ?? false);
    setPhotoIndex(0);
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

  const handleEdit = () => {
    if (!jersey) {
      return;
    }

    const sessionId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `edit-${Date.now()}`;
    const store = createSqliteCaptureSessionStore(sessionId);
    createEditCaptureSession(jersey, sessionId, store);
    router.push({
      pathname: "/(capture)/confirm",
      params: { sessionId, editJerseyId: jersey.id },
    });
  };

  const handleDelete = async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    setDeleting(true);
    try {
      await deleteUserJersey(accessToken, jerseyId);
      setDeleteSheetOpen(false);
      router.replace("/(tabs)/collection");
    } catch {
      setDeleteSheetOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const onPhotoScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    setPhotoIndex(index);
  };

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

  const metaLine = `${jersey.seasonLabel} · ${KIT_TYPE_LABELS_DA[jersey.type]} · ${JERSEY_SIZE_LABELS_DA[jersey.size]} · ${JERSEY_CONDITION_LABELS_DA[jersey.condition]}`;
  const showPagerDots = jersey.photos.length > 1;

  return (
    <View style={[styles.root, { backgroundColor: theme.fillPrimary }]}>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPhotoScroll}
        style={styles.stage}
        contentContainerStyle={styles.stageContent}
      >
        {jersey.photos.map((photo) => (
          <Image
            key={photo.id}
            source={{
              uri: resolvePhotoUrl(photo.photoUrl),
              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            }}
            style={[styles.stagePhoto, { width: screenWidth }]}
            resizeMode="cover"
            accessibilityLabel={`${jersey.clubLabel} ${photo.role}`}
          />
        ))}
      </ScrollView>

      <View style={[styles.stageChrome, { paddingTop: insets.top + space.insetSm }]}>
        <IconButton
          name="Tilbage"
          icon="arrow-back"
          iconColor={theme.contentInverse}
          onPress={() => router.back()}
        />
        {showPagerDots ? (
          <View
            style={styles.pagerDots}
            accessibilityLabel={`Foto ${photoIndex + 1} af ${jersey.photos.length}`}
          >
            {jersey.photos.map((photo, index) => (
              <View
                key={photo.id}
                style={[
                  styles.pagerDot,
                  {
                    backgroundColor: theme.contentInverse,
                    opacity: index === photoIndex ? 1 : 0.35,
                  },
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.pagerSpacer} />
        )}
      </View>

      <View
        style={[
          styles.bottomSheet,
          {
            backgroundColor: theme.surfaceRaised,
            paddingBottom: insets.bottom + space.insetMd,
          },
        ]}
      >
        <View
          style={[styles.sheetHandle, { backgroundColor: theme.borderSubtle }]}
          accessibilityElementsHidden
        />
        <Text style={[typography.title, { color: theme.contentPrimary }]}>{jersey.clubLabel}</Text>
        <Text style={[typography.mono, { color: theme.contentSecondary }]}>{metaLine}</Text>

        <View
          style={[
            styles.switchRow,
            {
              borderColor: theme.borderSubtle,
              opacity: isPrivate ? 0.4 : 1,
            },
          ]}
        >
          <View style={styles.switchCopy}>
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

        <View style={[styles.switchRow, { borderColor: theme.borderSubtle }]}>
          <View style={styles.switchCopy}>
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

        <View style={styles.actionRow}>
          <Button label="Rediger" variant="secondary" width="fill" onPress={handleEdit} />
          <Button
            label="Slet"
            variant="destructive"
            width="fill"
            onPress={() => setDeleteSheetOpen(true)}
          />
        </View>
      </View>

      <Sheet
        visible={deleteSheetOpen}
        title="Slet trøje?"
        onDismiss={() => setDeleteSheetOpen(false)}
      >
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Trøjen fjernes permanent fra din samling.
        </Text>
        <View style={styles.deleteActions}>
          <Button
            label="Annuller"
            variant="tertiary"
            width="fill"
            onPress={() => setDeleteSheetOpen(false)}
          />
          <Button
            label="Slet trøje"
            variant="destructive"
            width="fill"
            loading={deleting}
            onPress={() => void handleDelete()}
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
  stage: {
    ...StyleSheet.absoluteFill,
  },
  stageContent: {
    flexGrow: 1,
  },
  stagePhoto: {
    height: "100%",
  },
  stageChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
  },
  pagerDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  pagerDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  pagerSpacer: {
    width: 44,
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: space.gapSm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapMd,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.insetMd,
  },
  switchCopy: {
    flex: 1,
    gap: space.gapSm,
  },
  actionRow: {
    gap: space.gapSm,
    marginTop: space.gapSm,
  },
  deleteActions: {
    gap: space.gapSm,
    marginTop: space.gapMd,
  },
});
