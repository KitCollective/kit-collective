import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  createPersistedCaptureSession,
  isBulkUpload,
  type PrefilledClub,
} from "@/capture/captureFlow";
import { galleryMultiSelectQuality } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { ScreenHeader } from "@/components/screen-header";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

function readPrefilledClub(params: {
  prefilledClubId?: string | string[];
  prefilledClubLabel?: string | string[];
}): PrefilledClub | null {
  const clubId = Array.isArray(params.prefilledClubId)
    ? params.prefilledClubId[0]
    : params.prefilledClubId;
  const clubLabel = Array.isArray(params.prefilledClubLabel)
    ? params.prefilledClubLabel[0]
    : params.prefilledClubLabel;

  if (!clubId || !clubLabel) {
    return null;
  }

  return { id: clubId, label: clubLabel };
}

export default function AddChooserScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const params = useLocalSearchParams<{
    prefilledClubId?: string;
    prefilledClubLabel?: string;
  }>();
  const prefilledClub = readPrefilledClub(params);

  const handleClose = useCallback(() => {
    router.replace("/(tabs)/collection");
  }, [router]);

  const handleUpload = useCallback(async () => {
    const uris = await pickGalleryPhotos({
      allowsMultipleSelection: true,
      quality: galleryMultiSelectQuality(),
    });

    if (!uris) {
      return;
    }

    if (isBulkUpload(uris.length)) {
      Alert.alert(
        "For mange billeder",
        "Du har valgt mere end tre billeder. Binding af mange billeder kommer i en senere opdatering — vælg op til tre billeder for én trøje.",
      );
      return;
    }

    const { sessionId } = createPersistedCaptureSession(uris, { prefilledClub });
    router.push({
      pathname: "/(tabs)/add/confirm",
      params: { sessionId },
    });
  }, [prefilledClub, router]);

  const handleCamera = useCallback(() => {
    router.push({
      pathname: "/(tabs)/add/capture",
      params: prefilledClub
        ? {
            prefilledClubId: prefilledClub.id,
            prefilledClubLabel: prefilledClub.label,
          }
        : undefined,
    });
  }, [prefilledClub, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScreenHeader
        title="Tilføj trøje"
        trailing={<IconButton name="Luk" icon="close" onPress={handleClose} />}
      />

      <View style={styles.body}>
        <Text style={[typography.body, { color: theme.contentMuted }]}>
          Få billeder bliver én trøje. Mange billeder lander som en uredigeret række, du binder
          senere.
        </Text>

        <View style={styles.actions}>
          <Button label="Upload filer" width="fill" onPress={() => void handleUpload()} />
          <Button label="Tag billede" variant="secondary" width="fill" onPress={handleCamera} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.insetLg,
    gap: space.gapLg,
    justifyContent: "center",
  },
  actions: {
    gap: space.gapSm,
  },
});
