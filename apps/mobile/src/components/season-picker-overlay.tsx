import type { CatalogPickerItem } from "@kit/api-contract";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListRow } from "@/components/catalog-ui";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type SeasonPickerOverlayProps = {
  visible: boolean;
  seasons: CatalogPickerItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (item: CatalogPickerItem) => void;
  onDismiss: () => void;
};

export function SeasonPickerOverlay({
  visible,
  seasons,
  selectedId,
  loading,
  onSelect,
  onDismiss,
}: SeasonPickerOverlayProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.canvas,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <IconButton name="Tilbage" icon="arrow-back" onPress={onDismiss} />
          <Text style={[typography.title, { color: theme.contentPrimary, flex: 1 }]}>
            Vælg sæson
          </Text>
          <IconButton name="Luk" icon="close" onPress={onDismiss} />
        </View>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={theme.fillPrimary} style={styles.loader} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {seasons.map((season) => (
                <ListRow
                  key={season.id}
                  title={season.label}
                  selected={selectedId === season.id}
                  onPress={() => {
                    onSelect(season);
                    onDismiss();
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetMd,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.insetLg,
  },
  loader: {
    marginTop: space.insetMd,
  },
});
