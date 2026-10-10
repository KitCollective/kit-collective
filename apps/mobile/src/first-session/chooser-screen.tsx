import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import {
  createPersistedCaptureSession,
  finalizeShootFirstSession,
  mergeGalleryEscapePhotos,
  persistCameraShotInSession,
  replacePersistedCapturePhotos,
} from "@/capture/captureFlow";
import type { CaptureSessionPhoto } from "@/capture/captureSessionTypes";
import { expoDocumentPickerAdapter, expoGalleryPickerAdapter } from "@/capture/expoPickerAdapters";
import { galleryMultiSelectQuality } from "@/capture/photoBytes";
import { pickDocumentImages } from "@/capture/pickDocumentImages";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { type OwnPhotoSource, pickOwnPhotos } from "@/first-session/own-photo-source";
import { FirstSessionSourceSheet } from "@/first-session/source-sheet";
import { capFirstSessionPhotos, FIRST_SESSION_PHOTO_CAP } from "@/first-session/vision-result";

type FirstSessionChooserScreenProps = {
  onClose: () => void;
  onPhotosPicked: (sessionId: string) => void;
};

/**
 * Brug mit eget foto: the source sheet over the welcome screen (Tag billede,
 * Fotobibliotek, Filer). Up to three photos become one jersey. Cancelling a
 * picker or the camera brings the sheet back.
 */
export function FirstSessionChooserScreen({
  onClose,
  onPhotosPicked,
}: FirstSessionChooserScreenProps) {
  const [sheetVisible, setSheetVisible] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSessionId, setCameraSessionId] = useState<string | null>(null);
  const [cameraPhotoUris, setCameraPhotoUris] = useState<string[]>([]);
  // A chosen source waits until the sheet's Modal has left the screen: on iOS the
  // system picker cannot present on top of a closing Modal.
  const queued = useRef<OwnPhotoSource | null>(null);

  const finishFromUris = useCallback(
    (uris: string[], photoSource: "gallery" | "camera") => {
      const { sessionId } = createPersistedCaptureSession(capFirstSessionPhotos(uris), {
        photoSource,
      });
      onPhotosPicked(sessionId);
    },
    [onPhotosPicked],
  );

  const runSource = useCallback(
    async (source: OwnPhotoSource) => {
      if (source === "camera") {
        setShowCamera(true);
        return;
      }

      const uris = await pickOwnPhotos(source, {
        library: ({ selectionLimit }) =>
          pickGalleryPhotos(
            {
              allowsMultipleSelection: true,
              selectionLimit,
              quality: galleryMultiSelectQuality(),
            },
            expoGalleryPickerAdapter,
          ),
        files: () => pickDocumentImages({ multiple: true }, expoDocumentPickerAdapter),
      });

      if (!uris) {
        setSheetVisible(true);
        return;
      }
      finishFromUris(uris, "gallery");
    },
    [finishFromUris],
  );

  const finishCaptureFromPhotos = useCallback(
    (photos: CaptureSessionPhoto[]) => {
      if (photos.length === 0) {
        return;
      }

      const sessionId = replacePersistedCapturePhotos(
        cameraSessionId,
        capFirstSessionPhotos(photos),
      );
      onPhotosPicked(sessionId);
    },
    [cameraSessionId, onPhotosPicked],
  );

  const handleGalleryEscape = useCallback(
    async (existingUris: string[]) => {
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

      finishCaptureFromPhotos(mergeGalleryEscapePhotos(existingUris, uris));
      return true;
    },
    [finishCaptureFromPhotos],
  );

  if (showCamera) {
    return (
      <CaptureCameraSession
        initialPhotos={cameraPhotoUris}
        onComplete={(uris) => {
          if (uris.length === 0) {
            setShowCamera(false);
            setSheetVisible(true);
            return;
          }

          if (cameraSessionId && uris.length <= FIRST_SESSION_PHOTO_CAP) {
            finalizeShootFirstSession(cameraSessionId);
            onPhotosPicked(cameraSessionId);
            return;
          }

          finishFromUris(uris, "camera");
        }}
        onClose={() => {
          setShowCamera(false);
          setSheetVisible(true);
        }}
        onGalleryEscape={(existingUris) => void handleGalleryEscape(existingUris)}
        onPhotoCaptured={(uri) => {
          const sessionId = persistCameraShotInSession(
            cameraSessionId,
            { uri, source: "camera" },
            { photoSource: "camera" },
          );
          setCameraSessionId(sessionId);
          setCameraPhotoUris((current) => [...current, uri]);
        }}
      />
    );
  }

  return (
    <FirstSessionSourceSheet
      visible={sheetVisible}
      onDismiss={() => {
        queued.current = null;
        setSheetVisible(false);
        onClose();
      }}
      onConfirm={(source) => {
        setSheetVisible(false);
        if (Platform.OS === "ios") {
          queued.current = source;
          return;
        }
        void runSource(source);
      }}
      onModalHide={() => {
        const next = queued.current;
        if (!next) {
          return;
        }
        queued.current = null;
        void runSource(next);
      }}
    />
  );
}
