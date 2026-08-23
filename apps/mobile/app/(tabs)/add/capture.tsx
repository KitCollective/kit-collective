import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import {
  createPersistedCaptureSession,
  isBulkUpload,
  type PrefilledClub,
} from "@/capture/captureFlow";
import { galleryMultiSelectQuality } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { isRepeatCaptureSession } from "@/session/addSession";
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

export default function CaptureScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{
    prefilledClubId?: string;
    prefilledClubLabel?: string;
  }>();
  const prefilledClub = readPrefilledClub(params);

  const finishCapture = useCallback(
    (uris: string[]) => {
      if (uris.length === 0) {
        return;
      }

      if (isBulkUpload(uris.length)) {
        router.replace("/(tabs)/add");
        return;
      }

      const { sessionId } = createPersistedCaptureSession(uris, { prefilledClub });
      router.replace({
        pathname: "/(tabs)/add/confirm",
        params: { sessionId, photoSource: "camera" },
      });
    },
    [prefilledClub, router],
  );

  const openGalleryEscape = useCallback(async () => {
    const uris = await pickGalleryPhotos({
      allowsMultipleSelection: true,
      quality: galleryMultiSelectQuality(),
    });

    if (uris) {
      finishCapture(uris);
    }
  }, [finishCapture]);

  const galleryFirstLaunched = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web" || !isRepeatCaptureSession()) {
      if (galleryFirstLaunched.current) {
        return;
      }
      galleryFirstLaunched.current = true;
      void openGalleryEscape();
    }
  }, [openGalleryEscape]);

  if (Platform.OS === "web" || !isRepeatCaptureSession()) {
    return <View style={[styles.fallback, { backgroundColor: theme.canvas }]} />;
  }

  return (
    <CaptureCameraSession
      onComplete={finishCapture}
      onClose={() => router.back()}
      onGalleryEscape={() => void openGalleryEscape()}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
  },
});
