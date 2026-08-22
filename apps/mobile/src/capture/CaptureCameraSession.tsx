import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureQualityForRole } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { Banner } from "@/components/catalog-ui";
import { PhotoSlot } from "@/components/photo-slot";
import { Button, IconButton } from "@/components/ui";
import { loadDraft, nextEmptyRole, upsertDraftPhoto } from "@/drafts/jerseyDraftStore";
import { color, radius, space, type } from "@/theme/tokens";

type CaptureCameraSessionProps = {
  draftId: string;
  onContinue: () => void;
};

/**
 * Repeat-capture session with in-app CameraView.
 *
 * Camera permission is deferred until shutter intent: CameraView is not mounted
 * until the user has granted permission via the shutter button (see Expo camera
 * docs — mounting CameraView before grant triggers the OS prompt on mount).
 */
export function CaptureCameraSession({ draftId, onContinue }: CaptureCameraSessionProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isFocused, setIsFocused] = useState(true);
  const [pendingShot, setPendingShot] = useState(false);
  const [activeRole, setActiveRole] = useState<PhotoRole>(() => {
    const draft = loadDraft(draftId);
    return nextEmptyRole(draft.photos) ?? PHOTO_ROLES[0];
  });
  const [photos, setPhotos] = useState(() => loadDraft(draftId).photos);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const photoMap: Record<PhotoRole, string | undefined> = {
    front: photos.find((photo) => photo.role === "front")?.uri,
    back: photos.find((photo) => photo.role === "back")?.uri,
    label: photos.find((photo) => photo.role === "label")?.uri,
  };

  const refreshPhotos = useCallback(() => {
    const draft = loadDraft(draftId);
    setPhotos(draft.photos);
    const next = nextEmptyRole(draft.photos);
    if (next) {
      setActiveRole(next);
    }
  }, [draftId]);

  const captureFromCamera = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }

    const shot = await cameraRef.current.takePictureAsync({
      quality: captureQualityForRole(activeRole),
      skipProcessing: Platform.OS === "ios",
    });

    if (!shot?.uri) {
      return;
    }

    upsertDraftPhoto(draftId, activeRole, shot.uri, "camera");
    refreshPhotos();
  }, [activeRole, draftId, refreshPhotos]);

  const takeShot = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        return;
      }
      setPendingShot(true);
      return;
    }

    await captureFromCamera();
  }, [captureFromCamera, permission?.granted, requestPermission]);

  useEffect(() => {
    if (!permission?.granted || !pendingShot || !isFocused) {
      return;
    }

    let cancelled = false;

    const runPendingShot = async () => {
      // CameraView mounts only after grant; wait one frame for the ref to attach.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      if (cancelled || !cameraRef.current) {
        return;
      }

      await captureFromCamera();
      if (!cancelled) {
        setPendingShot(false);
      }
    };

    void runPendingShot();

    return () => {
      cancelled = true;
    };
  }, [captureFromCamera, isFocused, pendingShot, permission?.granted]);

  const pickFromGallery = async () => {
    const uris = await pickGalleryPhotos({
      quality: captureQualityForRole(activeRole),
    });

    if (!uris?.[0]) {
      return;
    }

    upsertDraftPhoto(draftId, activeRole, uris[0], "gallery");
    refreshPhotos();
  };

  const cameraDenied = permission?.status === "denied";
  const showCamera = isFocused && permission?.granted;

  return (
    <View style={styles.root}>
      {showCamera ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraFallback]} />
      )}

      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + space.insetSm,
            paddingBottom: insets.bottom + space.insetMd,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.header} pointerEvents="box-none">
          <IconButton
            name="Luk"
            icon="close"
            iconColor={color.contentInverse}
            onPress={() => router.back()}
          />
          <Text style={styles.hint}>Tag forside, bagside og mærke</Text>
          <View style={styles.headerSpacer} />
        </View>

        {cameraDenied ? (
          <View style={styles.deniedBanner}>
            <Banner
              tone="warning"
              message="Kameraadgang er slået fra. Vælg fotos fra galleriet, eller slå kamera til i Indstillinger."
              action={
                <Button
                  label="Åbn indstillinger"
                  variant="tertiary"
                  onPress={() => void Linking.openSettings()}
                />
              }
            />
          </View>
        ) : null}

        <View style={styles.spacer} />

        <View style={styles.slotRow}>
          {PHOTO_ROLES.map((role) => (
            <PhotoSlot
              key={role}
              variant="camera-overlay"
              role={role}
              uri={photoMap[role]}
              selected={activeRole === role}
              onPress={() => setActiveRole(role)}
            />
          ))}
        </View>

        <View style={styles.controls}>
          <Button
            label="Vælg fra galleri"
            variant="tertiary"
            onPress={() => void pickFromGallery()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tag billede"
            accessibilityHint="Tager et foto til den valgte slot"
            disabled={cameraDenied}
            onPress={() => void takeShot()}
            style={({ pressed }) => [
              styles.shutter,
              cameraDenied && styles.shutterDisabled,
              pressed && !cameraDenied && styles.shutterPressed,
            ]}
          />
          <Button
            label="Fortsæt"
            variant="secondary"
            disabled={photos.length === 0}
            onPress={onContinue}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  cameraFallback: {
    backgroundColor: color.fillSecondary,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
    zIndex: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  headerSpacer: {
    width: 44,
  },
  hint: {
    flex: 1,
    textAlign: "center",
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentInverse,
    opacity: 0.9,
  },
  deniedBanner: {
    marginTop: space.gapSm,
  },
  spacer: {
    flex: 1,
  },
  slotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.gapSm,
    marginBottom: space.insetLg,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapSm,
  },
  shutter: {
    width: space.insetLg + space.insetMd + space.insetLg,
    height: space.insetLg + space.insetMd + space.insetLg,
    borderRadius: radius.pill,
    backgroundColor: color.fillPrimary,
    borderWidth: 4,
    borderColor: color.contentInverse,
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterPressed: {
    opacity: 0.85,
  },
});
