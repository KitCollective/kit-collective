import { PHOTO_ROLES } from "@kit/domain";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { CaptureCameraSession } from "@/capture/CaptureCameraSession";
import { resolveCaptureMode } from "@/capture/sessionMode";
import { Button } from "@/components/ui";
import {
  createDraft,
  createDraftId,
  draftExists,
  loadDraft,
  upsertDraftPhoto,
} from "@/drafts/jerseyDraftStore";
import { color, space, type } from "@/theme/tokens";

export default function CaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId?: string }>();
  const mode = resolveCaptureMode();
  const autoGalleryOpened = useRef(false);
  const [initializing, setInitializing] = useState(true);

  const [draftId] = useState(() => params.draftId ?? createDraftId());

  useEffect(() => {
    if (!draftExists(draftId)) {
      createDraft(draftId);
    }
    setInitializing(false);
  }, [draftId]);

  const goToConfirm = useCallback(() => {
    router.push({
      pathname: "/(tabs)/add/confirm",
      params: { draftId },
    });
  }, [draftId, router]);

  const openGalleryMulti = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: PHOTO_ROLES.length,
      quality: 0.8,
    });

    if (result.canceled) {
      return;
    }

    let roleIndex = 0;
    for (const asset of result.assets) {
      if (!asset.uri || roleIndex >= PHOTO_ROLES.length) {
        continue;
      }

      const role = PHOTO_ROLES[roleIndex];
      if (!role) {
        continue;
      }

      upsertDraftPhoto(draftId, role, asset.uri, "gallery");
      roleIndex += 1;
    }

    const draft = loadDraft(draftId);
    if (draft.photos.length > 0) {
      goToConfirm();
    }
  }, [draftId, goToConfirm]);

  useEffect(() => {
    if (initializing || mode !== "gallery" || autoGalleryOpened.current) {
      return;
    }

    autoGalleryOpened.current = true;
    void openGalleryMulti();
  }, [initializing, mode, openGalleryMulti]);

  if (initializing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.fillPrimary} />
      </View>
    );
  }

  if (mode === "camera" && Platform.OS !== "web") {
    return <CaptureCameraSession draftId={draftId} onContinue={goToConfirm} />;
  }

  const draft = loadDraft(draftId);
  const photoCount = draft.photos.length;

  return (
    <View style={styles.galleryFallback}>
      <Text style={styles.title}>Tilføj fotos</Text>
      <Text style={styles.body}>
        {Platform.OS === "web"
          ? "Vælg fotos fra galleriet for at tilføje en trøje."
          : "Vælg fotos fra galleriet for din første trøje i denne session."}
      </Text>
      <Button label="Vælg fra galleri" onPress={() => void openGalleryMulti()} />
      {photoCount > 0 ? <Button label="Fortsæt" variant="secondary" onPress={goToConfirm} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.canvas,
  },
  galleryFallback: {
    flex: 1,
    backgroundColor: color.canvas,
    padding: space.insetLg,
    gap: space.gapMd,
    justifyContent: "center",
  },
  title: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: type.title.fontWeight,
    color: color.contentPrimary,
  },
  body: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.contentMuted,
  },
});
