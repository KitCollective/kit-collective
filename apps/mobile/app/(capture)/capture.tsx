import type { PhotoRole, PhotoSource } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import {
  clearActiveCameraCaptureSessionId,
  createPersistedCaptureSession,
  mergeGalleryEscapePhotos,
  persistCameraShotInSession,
  readPrefilledClub,
  replacePersistedCapturePhotos,
  resolveResumableCameraSession,
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
  const resumedSession = useMemo(() => resolveResumableCameraSession(), []);
  const [showCameraAfterGallery, setShowCameraAfterGallery] = useState(
    () => Platform.OS === "web" || isRepeatCaptureSession() || resumedSession !== null,
  );
  const sessionIdRef = useRef<string | null>(resumedSession?.sessionId ?? null);
  const [initialCameraPhotos] = useState(resumedSession?.photos ?? []);

  const navigateToConfirm = useCallback(
    (sessionId: string) => {
      clearActiveCameraCaptureSessionId();
      router.replace({
        pathname: "/(capture)/confirm",
        params: { sessionId },
      });
    },
    [router],
  );

  const finishCaptureFromPhotos = useCallback(
    (photos: ReturnType<typeof mergeGalleryEscapePhotos>) => {
      if (photos.length === 0) {
        return;
      }

      const sessionId = replacePersistedCapturePhotos(sessionIdRef.current, photos, {
        prefilledClub,
      });
      sessionIdRef.current = sessionId;
      navigateToConfirm(sessionId);
    },
    [navigateToConfirm, prefilledClub],
  );

  const finishCapture = useCallback(
    (uris: string[], photoSource: PhotoSource) => {
      if (uris.length === 0) {
        return;
      }

      if (sessionIdRef.current) {
        navigateToConfirm(sessionIdRef.current);
        return;
      }

      const { sessionId } = createPersistedCaptureSession(uris, {
        prefilledClub,
        photoSource,
      });
      navigateToConfirm(sessionId);
    },
    [navigateToConfirm, prefilledClub],
  );

  const handlePhotoCaptured = useCallback(
    (photo: { role: PhotoRole; uri: string }) => {
      sessionIdRef.current = persistCameraShotInSession(
        sessionIdRef.current,
        { ...photo, source: "camera" },
        { prefilledClub, photoSource: "camera" },
      );
    },
    [prefilledClub],
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
      finishCaptureFromPhotos(merged);
      return true;
    },
    [finishCaptureFromPhotos],
  );

  const galleryFirstLaunched = useRef(false);

  useEffect(() => {
    if (
      resumedSession ||
      Platform.OS === "web" ||
      isRepeatCaptureSession() ||
      galleryFirstLaunched.current
    ) {
      return;
    }
    galleryFirstLaunched.current = true;
    void (async () => {
      const completed = await openGalleryEscape([]);
      if (!completed) {
        setShowCameraAfterGallery(true);
      }
    })();
  }, [openGalleryEscape, resumedSession]);

  if (!showCameraAfterGallery) {
    return <View style={[styles.fallback, { backgroundColor: theme.canvas }]} />;
  }

  return (
    <CaptureCameraSession
      initialPhotos={initialCameraPhotos}
      onComplete={(uris) => finishCapture(uris, "camera")}
      onClose={() => router.back()}
      onGalleryEscape={(existingPhotos) => void openGalleryEscape(existingPhotos)}
      onPhotoCaptured={handlePhotoCaptured}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
  },
});
