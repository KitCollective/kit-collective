import type { PhotoSource } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import {
  createPersistedCaptureSession,
  isBulkUpload,
  readPrefilledClub,
  showBulkUploadBlockedAlert,
} from "@/capture/captureFlow";
import { galleryMultiSelectQuality } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { isRepeatCaptureSession } from "@/session/addSession";
import { useTheme } from "@/theme/use-theme";

export default function CaptureScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{
    prefilledClubId?: string;
    prefilledClubLabel?: string;
  }>();
  const prefilledClub = readPrefilledClub(params);
  const [showCameraAfterGallery, setShowCameraAfterGallery] = useState(
    () => Platform.OS === "web" || isRepeatCaptureSession(),
  );

  const finishCapture = useCallback(
    (uris: string[], photoSource: PhotoSource) => {
      if (uris.length === 0) {
        return;
      }

      if (isBulkUpload(uris.length)) {
        showBulkUploadBlockedAlert();
        return;
      }

      const { sessionId } = createPersistedCaptureSession(uris, {
        prefilledClub,
        photoSource,
      });
      router.replace({
        pathname: "/(tabs)/add/confirm",
        params: { sessionId },
      });
    },
    [prefilledClub, router],
  );

  const openGalleryEscape = useCallback(async () => {
    const uris = await pickGalleryPhotos({
      allowsMultipleSelection: true,
      quality: galleryMultiSelectQuality(),
    });

    if (!uris) {
      return false;
    }

    if (isBulkUpload(uris.length)) {
      showBulkUploadBlockedAlert();
      return false;
    }

    finishCapture(uris, "gallery");
    return true;
  }, [finishCapture]);

  const galleryFirstLaunched = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web" || isRepeatCaptureSession() || galleryFirstLaunched.current) {
      return;
    }
    galleryFirstLaunched.current = true;
    void (async () => {
      const completed = await openGalleryEscape();
      if (!completed) {
        setShowCameraAfterGallery(true);
      }
    })();
  }, [openGalleryEscape]);

  if (!showCameraAfterGallery) {
    return <View style={[styles.fallback, { backgroundColor: theme.canvas }]} />;
  }

  return (
    <CaptureCameraSession
      onComplete={(uris) => finishCapture(uris, "camera")}
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
