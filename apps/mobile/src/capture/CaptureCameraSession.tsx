import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureQualityForRole } from "@/capture/photoBytes";
import { Banner } from "@/components/catalog-ui";
import { PhotoSlot } from "@/components/photo-slot";
import { Button, IconButton } from "@/components/ui";
import { color, radius, space, type } from "@/theme/tokens";

type CaptureCameraSessionProps = {
  onComplete: (uris: string[]) => void;
  onClose: () => void;
  onGalleryEscape: (existingPhotos: CapturedPhoto[]) => void;
  onPhotoCaptured?: (photo: CapturedPhoto) => void;
};

type CapturedPhoto = {
  role: PhotoRole;
  uri: string;
};

function nextEmptyRole(photos: CapturedPhoto[]): PhotoRole | null {
  for (const role of PHOTO_ROLES) {
    if (!photos.some((photo) => photo.role === role)) {
      return role;
    }
  }
  return null;
}

/**
 * Repeat-capture session with in-app CameraView.
 *
 * Camera permission is deferred until shutter intent: CameraView is not mounted
 * until the user has granted permission via the shutter button.
 */
export function CaptureCameraSession({
  onComplete,
  onClose,
  onGalleryEscape,
  onPhotoCaptured,
}: CaptureCameraSessionProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isFocused, setIsFocused] = useState(true);
  const [pendingShot, setPendingShot] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [activeRole, setActiveRole] = useState<PhotoRole>(PHOTO_ROLES[0]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    const next = nextEmptyRole(photos);
    if (next) {
      setActiveRole(next);
    }
  }, [photos]);

  const photoMap: Record<PhotoRole, string | undefined> = {
    front: photos.find((photo) => photo.role === "front")?.uri,
    back: photos.find((photo) => photo.role === "back")?.uri,
    label: photos.find((photo) => photo.role === "label")?.uri,
  };

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

    const captured = { role: activeRole, uri: shot.uri };
    setPhotos((current) => [...current.filter((photo) => photo.role !== activeRole), captured]);
    onPhotoCaptured?.(captured);
  }, [activeRole, onPhotoCaptured]);

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
          <IconButton name="Luk" icon="close" iconColor={color.contentInverse} onPress={onClose} />
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
            onPress={() => onGalleryEscape(photos)}
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
            onPress={() => {
              const orderedUris = PHOTO_ROLES.map(
                (role) => photos.find((photo) => photo.role === role)?.uri,
              ).filter((uri): uri is string => Boolean(uri));
              onComplete(orderedUris);
            }}
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
