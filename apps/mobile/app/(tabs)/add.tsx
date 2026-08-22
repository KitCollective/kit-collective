import type { CatalogPickerItem } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchClubSeasons, searchCatalogClubs } from "@/api/catalog";
import { useAuth } from "@/auth/AuthProvider";
import { Banner, ListRow, SearchField, Sheet } from "@/components/catalog-ui";
import { Button } from "@/components/ui";
import { color, space, type } from "@/theme/tokens";

const MIN_CLUB_SEARCH_LENGTH = 2;

export default function AddScreen() {
  const { accessToken } = useAuth();
  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<CatalogPickerItem[]>([]);
  const [seasonResults, setSeasonResults] = useState<CatalogPickerItem[]>([]);
  const [selectedClub, setSelectedClub] = useState<CatalogPickerItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<CatalogPickerItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [catalogMiss, setCatalogMiss] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const runClubSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();

      if (!accessToken || trimmed.length === 0) {
        setClubResults([]);
        setCatalogMiss(false);
        setSearchError(false);
        return;
      }

      setSearching(true);
      setSearchError(false);

      try {
        const response = await searchCatalogClubs(accessToken, trimmed, "da");
        setClubResults(response.clubs);
        setCatalogMiss(trimmed.length >= MIN_CLUB_SEARCH_LENGTH && response.clubs.length === 0);
      } catch {
        setClubResults([]);
        setCatalogMiss(false);
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!clubSheetOpen) {
      return;
    }

    const handle = setTimeout(() => {
      void runClubSearch(clubQuery);
    }, 300);

    return () => clearTimeout(handle);
  }, [clubQuery, clubSheetOpen, runClubSearch]);

  const openClubSheet = () => {
    setClubQuery("");
    setClubResults([]);
    setCatalogMiss(false);
    setSearchError(false);
    setClubSheetOpen(true);
  };

  const selectClub = async (club: CatalogPickerItem) => {
    setSelectedClub(club);
    setSelectedSeason(null);
    setClubSheetOpen(false);
    setSeasonSheetOpen(true);

    if (!accessToken) {
      return;
    }

    setLoadingSeasons(true);
    try {
      const response = await fetchClubSeasons(accessToken, club.id);
      setSeasonResults(response.seasons);
    } catch {
      setSeasonResults([]);
    } finally {
      setLoadingSeasons(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tilføj trøje</Text>
      <Text style={styles.body}>Vælg klub og sæson for den trøje du vil registrere.</Text>

      {catalogMiss && !clubSheetOpen ? (
        <Banner
          tone="info"
          message="Klubben findes ikke i kataloget endnu. Dit draft bliver gemt."
          action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
        />
      ) : null}

      <View style={styles.pickerSection}>
        <Text style={styles.sectionLabel}>Klub</Text>
        <ListRow
          title={selectedClub?.label ?? "Vælg klub"}
          onPress={openClubSheet}
          selected={selectedClub !== null}
        />
      </View>

      {selectedClub ? (
        <View style={styles.pickerSection}>
          <Text style={styles.sectionLabel}>Sæson</Text>
          <ListRow
            title={selectedSeason?.label ?? "Vælg sæson"}
            onPress={() => setSeasonSheetOpen(true)}
            selected={selectedSeason !== null}
          />
        </View>
      ) : null}

      <Sheet visible={clubSheetOpen} title="Vælg klub" onDismiss={() => setClubSheetOpen(false)}>
        <SearchField
          accessibilityLabel="Søg klub"
          placeholder="Søg klub"
          value={clubQuery}
          onChangeText={setClubQuery}
          onClear={() => setClubQuery("")}
        />

        {catalogMiss ? (
          <Banner
            tone="info"
            message="Klubben findes ikke i kataloget endnu."
            action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
          />
        ) : null}

        {searchError ? (
          <Banner
            tone="warning"
            message="Kunne ikke søge i kataloget. Prøv igen."
            action={
              <Button
                label="Prøv igen"
                variant="tertiary"
                onPress={() => void runClubSearch(clubQuery)}
              />
            }
          />
        ) : null}

        {searching ? (
          <ActivityIndicator color={color.fillPrimary} style={styles.loader} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {clubResults.map((club) => (
              <ListRow
                key={club.id}
                title={club.label}
                selected={selectedClub?.id === club.id}
                onPress={() => void selectClub(club)}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>

      <Sheet
        visible={seasonSheetOpen}
        title="Vælg sæson"
        onDismiss={() => setSeasonSheetOpen(false)}
      >
        {loadingSeasons ? (
          <ActivityIndicator color={color.fillPrimary} style={styles.loader} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {seasonResults.map((season) => (
              <ListRow
                key={season.id}
                title={season.label}
                selected={selectedSeason?.id === season.id}
                onPress={() => {
                  setSelectedSeason(season);
                  setSeasonSheetOpen(false);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
    padding: space.insetLg,
    gap: space.gapLg,
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
  pickerSection: {
    gap: space.gapSm,
  },
  sectionLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: type.label.fontWeight,
    color: color.contentPrimary,
  },
  loader: {
    paddingVertical: space.insetLg,
  },
});
