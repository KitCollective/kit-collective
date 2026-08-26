import type { PhotoRole, PhotoSource } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import {
  createPersistedCaptureSession,
  createPersistedCaptureSessionFromPhotos,
  isBulkUpload,
  mergeGalleryEscapePhotos,
  readPrefilledClub,
  showBulkUploadBlockedAlert,
} from "@/capture/captureFlow";
import { expoGalleryPickerAdapter } from "@/capture/expoPickerAdapters";
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

  const finishCaptureFromPhotos = useCallback(
    (photos: ReturnType<typeof mergeGalleryEscapePhotos>) => {
      if (photos.length === 0) {
        return;
      }

      if (isBulkUpload(photos.length)) {
        showBulkUploadBlockedAlert();
        return;
      }

      const { sessionId } = createPersistedCaptureSessionFromPhotos(photos, {
        prefilledClub,
      });
      router.replace({
        pathname: "/(tabs)/add/confirm",
        params: { sessionId },
      });
    },
    [prefilledClub, router],
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

  const openGalleryEscape = useCallback(
    async (existingPhotos: Array<{ role: PhotoRole; uri: string }>) => {
      const uris = await pickGalleryPhotos(
        {
          allowsMultipleSelection: true,
          quality: galleryMultiSelectQuality(),
        },
        expoGalleryPickerAdapter,
      );

      if (!uris) {
        return false;
      }

      const merged = mergeGalleryEscapePhotos(existingPhotos, uris);
      if (isBulkUpload(merged.length)) {
        showBulkUploadBlockedAlert();
        return false;
      }

      finishCaptureFromPhotos(merged);
      return true;
    },
    [finishCaptureFromPhotos],
  );

  const galleryFirstLaunched = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web" || isRepeatCaptureSession() || galleryFirstLaunched.current) {
      return;
    }
    galleryFirstLaunched.current = true;
    void (async () => {
      const completed = await openGalleryEscape([]);
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
      onGalleryEscape={(existingPhotos) => void openGalleryEscape(existingPhotos)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
  },
});
