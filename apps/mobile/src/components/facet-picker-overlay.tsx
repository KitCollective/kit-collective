import type { CatalogPickerItem } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  searchCatalogClubs,
  searchCatalogCountries,
  searchCatalogLeagues,
  searchCatalogPlayers,
} from "@/api/catalog";
import { ListRow, SearchField } from "@/components/catalog-ui";
import type { GenvejeFacetKind } from "@/components/genveje-sheet-logic";
import {
  resolveFacetPickerTitle,
  resolveFacetSearchPlaceholder,
} from "@/components/genveje-sheet-logic";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type FacetPickerOverlayProps = {
  visible: boolean;
  facetKind: GenvejeFacetKind;
  accessToken: string;
  selectedId: string | null;
  mostUsed: CatalogPickerItem[];
  onSelect: (item: CatalogPickerItem) => void;
  onDismiss: () => void;
};

async function searchFacet(
  facetKind: GenvejeFacetKind,
  accessToken: string,
  query: string,
): Promise<CatalogPickerItem[]> {
  switch (facetKind) {
    case "country": {
      const response = await searchCatalogCountries(accessToken, query);
      return response.items;
    }
    case "league": {
      const response = await searchCatalogLeagues(accessToken, query);
      return response.items;
    }
    case "club": {
      const response = await searchCatalogClubs(accessToken, query);
      return response.clubs;
    }
    case "player": {
      const response = await searchCatalogPlayers(accessToken, query);
      return response.items;
    }
    default: {
      const neverKind: never = facetKind;
      return neverKind;
    }
  }
}

export function FacetPickerOverlay({
  visible,
  facetKind,
  accessToken,
  selectedId,
  mostUsed,
  onSelect,
  onDismiss,
}: FacetPickerOverlayProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [results, setResults] = useState<CatalogPickerItem[]>([]);

  const runSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setSearching(true);
      setSearchError(false);
      try {
        const items = await searchFacet(facetKind, accessToken, searchQuery.trim());
        setResults(items);
      } catch {
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    },
    [accessToken, facetKind],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void runSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, visible, runSearch]);

  const showMostUsed = query.trim().length === 0 && mostUsed.length > 0;
  const rows = showMostUsed ? mostUsed : results;

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
            {resolveFacetPickerTitle(facetKind)}
          </Text>
          <IconButton name="Luk" icon="close" onPress={onDismiss} />
        </View>

        <View style={styles.body}>
          <SearchField
            variant="catalog"
            accessibilityLabel={resolveFacetSearchPlaceholder(facetKind)}
            placeholder={resolveFacetSearchPlaceholder(facetKind)}
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
          />

          {searchError ? (
            <Text style={[typography.body, { color: theme.danger }]}>
              Kunne ikke søge i kataloget. Prøv igen.
            </Text>
          ) : null}

          {showMostUsed ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>Mest brugte</Text>
          ) : null}

          {searching ? (
            <ActivityIndicator color={theme.fillPrimary} style={styles.loader} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {rows.map((row) => (
                <ListRow
                  key={row.id}
                  title={row.label}
                  selected={selectedId === row.id}
                  onPress={() => {
                    onSelect(row);
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
