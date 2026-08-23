import type { CatalogPickerItem } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { searchCatalogClubs } from "@/api/catalog";
import { ListRow, SearchField } from "@/components/catalog-ui";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type ClubPickerOverlayProps = {
  visible: boolean;
  accessToken: string;
  selectedClubId: string | null;
  onSelect: (club: CatalogPickerItem) => void;
  onDismiss: () => void;
};

export function ClubPickerOverlay({
  visible,
  accessToken,
  selectedClubId,
  onSelect,
  onDismiss,
}: ClubPickerOverlayProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [clubQuery, setClubQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [clubResults, setClubResults] = useState<CatalogPickerItem[]>([]);

  const runClubSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setClubResults([]);
        return;
      }

      setSearching(true);
      setSearchError(false);
      try {
        const response = await searchCatalogClubs(accessToken, query.trim());
        setClubResults(response.clubs);
      } catch {
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = setTimeout(() => {
      void runClubSearch(clubQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [clubQuery, visible, runClubSearch]);

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
            Vælg klub
          </Text>
          <IconButton name="Luk" icon="close" onPress={onDismiss} />
        </View>

        <View style={styles.body}>
          <SearchField
            variant="catalog"
            accessibilityLabel="Søg klub"
            placeholder="Søg klub"
            value={clubQuery}
            onChangeText={setClubQuery}
            onClear={() => setClubQuery("")}
          />

          {searchError ? (
            <Text style={[typography.body, { color: theme.danger }]}>
              Kunne ikke søge i kataloget. Prøv igen.
            </Text>
          ) : null}

          {searching ? (
            <ActivityIndicator color={theme.fillPrimary} style={styles.loader} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {clubResults.map((club) => (
                <ListRow
                  key={club.id}
                  title={club.label}
                  selected={selectedClubId === club.id}
                  onPress={() => {
                    onSelect(club);
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
    gap: space.gapMd,
  },
  loader: {
    marginTop: space.insetMd,
  },
});
