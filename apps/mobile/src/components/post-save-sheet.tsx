import type { CatalogPickerItem, CollectionJersey } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { useCaptureChooser } from "@/capture/capture-chooser";
import { buildSavedSheetModel, pickSavedFrontPhoto } from "@/capture/confirmSheet";
import { Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PostSaveSheetProps = {
  visible: boolean;
  savedClub: CatalogPickerItem | null;
  savedSeasonLabel: string | null;
  savedJersey: CollectionJersey | null;
  /** Running collection count; null while unknown (the line is omitted). */
  savedCount: number | null;
  onDismiss: () => void;
};

const THUMB_WIDTH = space.insetLg * 3;

export function PostSaveSheet({
  visible,
  savedClub,
  savedSeasonLabel,
  savedJersey,
  savedCount,
  onDismiss,
}: PostSaveSheetProps) {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const captureChooser = useCaptureChooser();
  const { accessToken } = useAuth();

  const model = buildSavedSheetModel({
    club: savedClub,
    seasonLabel: savedSeasonLabel,
    kitType: savedJersey?.type ?? null,
    count: savedCount,
  });

  const frontPhoto = savedJersey ? pickSavedFrontPhoto(savedJersey.photos) : null;
  const photoSource = frontPhoto
    ? {
        uri: resolvePhotoUrl(frontPhoto.photoUrl, "grid"),
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      }
    : null;

  const openChooser = (side?: { id: string; label: string } | null) => {
    // Close this Sheet and leave Confirm before presenting the Chooser: two
    // Sheets deep is not a supported depth (docs/design-system.md → Sheet).
    onDismiss();
    router.replace("/(tabs)/collection");
    captureChooser.open(side ?? null);
  };

  return (
    <Sheet visible={visible} title={model.title} onDismiss={onDismiss}>
      <View style={styles.content}>
        <View style={styles.summaryRow}>
          <View
            style={[
              styles.thumb,
              { backgroundColor: theme.fillSecondary, borderColor: theme.borderSubtle },
            ]}
          >
            {photoSource ? (
              <Image source={photoSource} style={styles.thumbImage} resizeMode="cover" />
            ) : null}
          </View>
          <View style={styles.summaryText}>
            {model.summary ? (
              <Text style={[typography.body, { color: theme.contentPrimary }]}>
                {model.summary}
              </Text>
            ) : null}
            {model.countLine ? (
              <Text style={[typography.mono, { color: theme.contentSecondary }]}>
                {model.countLine}
              </Text>
            ) : null}
          </View>
        </View>
        <Button label={model.nextLabel} onPress={() => openChooser()} />
        {model.sameSideLabel ? (
          <Button
            label={model.sameSideLabel}
            variant="secondary"
            onPress={() => openChooser(model.sameSide)}
          />
        ) : null}
        <Button
          label={model.collectionLabel}
          variant="tertiary"
          onPress={onDismiss}
          testID="post-save-to-collection"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.gapSm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapLg,
    marginBottom: space.gapSm,
  },
  thumb: {
    width: THUMB_WIDTH,
    aspectRatio: 4 / 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  summaryText: {
    flex: 1,
    gap: space.gapSm,
  },
});
