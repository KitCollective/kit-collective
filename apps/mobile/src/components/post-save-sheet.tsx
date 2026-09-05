import type { CatalogPickerItem } from "@kit/api-contract";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useCaptureChooser } from "@/capture/capture-chooser";
import { Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type PostSaveSheetProps = {
  visible: boolean;
  savedClub: CatalogPickerItem | null;
  savedSeasonLabel: string | null;
  onDismiss: () => void;
};

export function PostSaveSheet({
  visible,
  savedClub,
  savedSeasonLabel,
  onDismiss,
}: PostSaveSheetProps) {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const captureChooser = useCaptureChooser();

  const openChooser = (club?: CatalogPickerItem | null) => {
    // Close this Sheet and leave Confirm before presenting the Chooser: two
    // Sheets deep is not a supported depth (docs/design-system.md → Sheet).
    onDismiss();
    router.replace("/(tabs)/collection");
    captureChooser.open(club ? { id: club.id, label: club.label } : null);
  };

  const body =
    savedClub && savedSeasonLabel
      ? `${savedClub.label} · ${savedSeasonLabel}`
      : "Din trøje er i samlingen.";

  return (
    <Sheet visible={visible} title="Gemt" onDismiss={onDismiss}>
      <View style={styles.content}>
        <Text
          style={[typography.body, { color: theme.contentSecondary, marginBottom: space.gapSm }]}
        >
          {body}
        </Text>
        <Button label="Samme klub" onPress={() => openChooser(savedClub)} disabled={!savedClub} />
        <Button label="Ny trøje" variant="secondary" onPress={() => openChooser()} />
        <Button label="Til samling" variant="tertiary" onPress={onDismiss} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.gapSm,
  },
});
