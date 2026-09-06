import { MAX_USER_JERSEY_PHOTOS } from "@kit/domain";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JERSEY_PHOTO_CAP_HELPER_DA } from "@/capture/captureSession";
import { Banner } from "@/components/catalog-ui";
import { Button, IconButton } from "@/components/ui";
import { color, radius, space, type } from "@/theme/tokens";

const FILMSTRIP_THUMB_HEIGHT = 44;
const FILMSTRIP_THUMB_WIDTH = (FILMSTRIP_THUMB_HEIGHT * 4) / 5;
const CAMERA_CAPTURE_QUALITY = 0.8;

type CaptureCameraSessionProps = {
  initialPhotoUris?: string[];
  onComplete: (uris: string[]) => void;
  onClose: () => void;
  onGalleryEscape: (existingUris: string[]) => void;
  onPhotoCaptured?: (uri: string) => void;
};

/**
 * Repeat-capture session with in-app CameraView.
 *
 * Shoot-first: no role overlay on the viewfinder. Roles are assigned on Confirm
 * via fill order Forside → Bagside → Venstre → Højre → unlabeled Andet.
 *
 * Camera permission is deferred until shutter intent: CameraView is not mounted
 * until the user has granted permission via the shutter button.
 */
export function CaptureCameraSession({
  initialPhotoUris = [],
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
  const [photoUris, setPhotoUris] = useState<string[]>(initialPhotoUris);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const atPhotoCap = photoUris.length >= MAX_USER_JERSEY_PHOTOS;

  const captureFromCamera = useCallback(async () => {
    if (!cameraRef.current || atPhotoCap) {
      return;
    }

    const shot = await cameraRef.current.takePictureAsync({
      quality: CAMERA_CAPTURE_QUALITY,
      skipProcessing: Platform.OS === "ios",
    });

    if (!shot?.uri) {
      return;
    }

    setPhotoUris((current) => [...current, shot.uri]);
    onPhotoCaptured?.(shot.uri);
  }, [atPhotoCap, onPhotoCaptured]);

  const takeShot = useCallback(async () => {
    if (atPhotoCap) {
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        return;
      }
      setPendingShot(true);
      return;
    }

    await captureFromCamera();
  }, [atPhotoCap, captureFromCamera, permission?.granted, requestPermission]);

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
          <Text style={styles.count}>
            {photoUris.length}/{MAX_USER_JERSEY_PHOTOS}
          </Text>
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

        <View style={styles.shutterBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tag billede"
            accessibilityHint="Tager et foto til denne trøje"
            disabled={cameraDenied || atPhotoCap}
            onPress={() => void takeShot()}
            style={({ pressed }) => [
              styles.shutter,
              (cameraDenied || atPhotoCap) && styles.shutterDisabled,
              pressed && !cameraDenied && !atPhotoCap && styles.shutterPressed,
            ]}
          />
          {atPhotoCap ? <Text style={styles.capHelper}>{JERSEY_PHOTO_CAP_HELPER_DA}</Text> : null}
        </View>

        {photoUris.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filmstripContent}
            style={styles.filmstrip}
          >
            {photoUris.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={styles.filmstripThumb}
                accessibilityIgnoresInvertColors
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.controls}>
          <Button
            label="Vælg fra galleri"
            variant="tertiary"
            onPress={() => onGalleryEscape(photoUris)}
          />
          <Button
            label="Fortsæt"
            variant="secondary"
            disabled={photoUris.length === 0}
            onPress={() => onComplete(photoUris)}
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
    ...StyleSheet.absoluteFill,
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
  count: {
    flex: 1,
    textAlign: "center",
    fontSize: type.mono.fontSize,
    lineHeight: type.mono.lineHeight,
    fontFamily: type.mono.fontFamily,
    color: color.contentInverse,
    opacity: 0.9,
  },
  deniedBanner: {
    marginTop: space.gapSm,
  },
  spacer: {
    flex: 1,
  },
  shutterBlock: {
    alignItems: "center",
    gap: space.gapSm,
    marginBottom: space.insetSm,
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
  capHelper: {
    textAlign: "center",
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentInverse,
    opacity: 0.9,
  },
  filmstrip: {
    marginBottom: space.insetSm,
    minHeight: FILMSTRIP_THUMB_HEIGHT,
  },
  filmstripContent: {
    gap: space.gapSm,
    alignItems: "center",
  },
  filmstripThumb: {
    width: FILMSTRIP_THUMB_WIDTH,
    height: FILMSTRIP_THUMB_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: color.fillSecondary,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapSm,
  },
});
