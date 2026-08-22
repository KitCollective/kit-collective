import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { useIsFocused } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureQualityForRole } from "@/capture/photoBytes";
import { Banner } from "@/components/catalog-ui";
import { PhotoSlot } from "@/components/photo-slot";
import { Button } from "@/components/ui";
import { loadDraft, nextEmptyRole, upsertDraftPhoto } from "@/drafts/jerseyDraftStore";
import { color, space, type } from "@/theme/tokens";

type CaptureCameraSessionProps = {
  draftId: string;
  onContinue: () => void;
};

export function CaptureCameraSession({ draftId, onContinue }: CaptureCameraSessionProps) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [activeRole, setActiveRole] = useState<PhotoRole>(() => {
    const draft = loadDraft(draftId);
    return nextEmptyRole(draft.photos) ?? PHOTO_ROLES[0];
  });
  const [photos, setPhotos] = useState(() => loadDraft(draftId).photos);

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

  const takeShot = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        return;
      }
    }

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
  }, [activeRole, draftId, permission?.granted, refreshPhotos, requestPermission]);

  const pickFromGallery = async () => {
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryPermission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: captureQualityForRole(activeRole),
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    upsertDraftPhoto(draftId, activeRole, result.assets[0].uri, "gallery");
    refreshPhotos();
  };

  const cameraDenied = permission?.status === "denied";

  return (
    <View style={styles.root}>
      {isFocused && !cameraDenied ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraFallback]} />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Luk"
        style={[styles.close, { top: insets.top + space.insetSm }]}
        onPress={() => router.back()}
      >
        <Text style={styles.closeLabel}>Luk</Text>
      </Pressable>

      <Text style={[styles.hint, { top: insets.top + space.insetSm + 36 }]}>
        Tag forside, bagside og mærke
      </Text>

      {cameraDenied ? (
        <View style={[styles.deniedBanner, { top: insets.top + 72 }]}>
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

      <View style={[styles.slotRow, { bottom: insets.bottom + 132 }]}>
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

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.insetMd }]}>
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
  close: {
    position: "absolute",
    left: space.insetMd,
    zIndex: 2,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: type.label.fontWeight,
    color: color.contentInverse,
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 2,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentInverse,
    opacity: 0.9,
  },
  deniedBanner: {
    position: "absolute",
    left: space.insetMd,
    right: space.insetMd,
    zIndex: 2,
  },
  slotRow: {
    position: "absolute",
    left: space.insetMd,
    right: space.insetMd,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.gapSm,
    zIndex: 2,
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
    gap: space.gapSm,
    zIndex: 2,
  },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
