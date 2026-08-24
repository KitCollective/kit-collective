import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  createPersistedCaptureSession,
  isBulkUpload,
  readPrefilledClub,
  showBulkUploadBlockedAlert,
} from "@/capture/captureFlow";
import { pickUploadFiles } from "@/capture/pickUploadFiles";
import { ScreenHeader } from "@/components/screen-header";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

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
    const uris = await pickUploadFiles({
      allowsMultipleSelection: true,
    });

    if (!uris) {
      return;
    }

    if (isBulkUpload(uris.length)) {
      showBulkUploadBlockedAlert();
      return;
    }

    const { sessionId } = createPersistedCaptureSession(uris, {
      prefilledClub,
      photoSource: "gallery",
    });
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
          Vælg op til tre billeder — de bliver én trøje med forside, bagside og mærke.
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
