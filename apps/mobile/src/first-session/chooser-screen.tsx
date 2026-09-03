import type { PhotoRole } from "@kit/domain";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import {
  createPersistedCaptureSession,
  mergeGalleryEscapePhotos,
  persistCameraShotInSession,
  replacePersistedCapturePhotos,
} from "@/capture/captureFlow";
import type { CaptureSessionPhoto } from "@/capture/captureSessionTypes";
import { expoGalleryPickerAdapter, expoUploadFilesAdapter } from "@/capture/expoPickerAdapters";
import { galleryMultiSelectQuality } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { pickUploadFiles } from "@/capture/pickUploadFiles";
import { ScreenHeader } from "@/components/screen-header";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type FirstSessionChooserScreenProps = {
  onClose: () => void;
  onPhotosPicked: (sessionId: string) => void;
};

export function FirstSessionChooserScreen({
  onClose,
  onPhotosPicked,
}: FirstSessionChooserScreenProps) {
  const theme = useTheme();
  const typography = useTypography();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSessionId, setCameraSessionId] = useState<string | null>(null);
  const [cameraPhotos, setCameraPhotos] = useState<Array<{ role: PhotoRole; uri: string }>>([]);

  const handleUpload = useCallback(async () => {
    const uris = await pickUploadFiles(
      {
        allowsMultipleSelection: true,
      },
      expoUploadFilesAdapter,
    );

    if (!uris || uris.length === 0) {
      return;
    }

    const { sessionId } = createPersistedCaptureSession(uris, {
      photoSource: "gallery",
    });
    onPhotosPicked(sessionId);
  }, [onPhotosPicked]);

  const finishCaptureFromPhotos = useCallback(
    (photos: CaptureSessionPhoto[]) => {
      if (photos.length === 0) {
        return;
      }

      const sessionId = replacePersistedCapturePhotos(cameraSessionId, photos);
      onPhotosPicked(sessionId);
    },
    [cameraSessionId, onPhotosPicked],
  );

  const handleGalleryEscape = useCallback(
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

      finishCaptureFromPhotos(mergeGalleryEscapePhotos(existingPhotos, uris));
      return true;
    },
    [finishCaptureFromPhotos],
  );

  if (showCamera) {
    return (
      <CaptureCameraSession
        initialPhotos={cameraPhotos}
        onComplete={(uris) => {
          if (uris.length === 0) {
            setShowCamera(false);
            return;
          }

          if (cameraSessionId) {
            onPhotosPicked(cameraSessionId);
            return;
          }

          const { sessionId } = createPersistedCaptureSession(uris, {
            photoSource: "camera",
          });
          onPhotosPicked(sessionId);
        }}
        onClose={() => setShowCamera(false)}
        onGalleryEscape={(existingPhotos) => void handleGalleryEscape(existingPhotos)}
        onPhotoCaptured={(photo) => {
          const sessionId = persistCameraShotInSession(
            cameraSessionId,
            { ...photo, source: "camera" },
            { photoSource: "camera" },
          );
          setCameraSessionId(sessionId);
          setCameraPhotos((current) => {
            const next = current.filter((entry) => entry.role !== photo.role);
            return [...next, photo];
          });
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScreenHeader
        title="Tilføj trøje"
        trailing={<IconButton name="Luk" icon="close" onPress={onClose} />}
      />

      <View style={styles.body}>
        <Text style={[typography.body, { color: theme.contentMuted }]}>
          Få billeder bliver én trøje. Mange billeder lander som uredigerede, som du binder til
          trøjer.
        </Text>

        <View style={styles.actions}>
          <Button label="Upload filer" width="fill" onPress={() => void handleUpload()} />
          <Button
            label="Tag billede"
            variant="secondary"
            width="fill"
            onPress={() => setShowCamera(true)}
          />
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
