import type { CatalogPickerItem } from "@kit/api-contract";
import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
  type JerseyCondition,
  type JerseySize,
  KIT_TYPE_LABELS_DA,
  KIT_TYPES,
  type KitType,
} from "@kit/domain";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchClubSeasons, searchCatalogClubs } from "@/api/catalog";
import { saveUserJersey } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { Banner, ListRow, SearchField, Sheet } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui";
import { color, radius, space, type } from "@/theme/tokens";

const MIN_CLUB_SEARCH_LENGTH = 2;

type LocalPhoto = {
  uri: string;
  base64: string;
  role: "front" | "back" | "label";
};

export default function AddScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [clubSheetOpen, setClubSheetOpen] = useState(false);
  const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<CatalogPickerItem[]>([]);
  const [seasonResults, setSeasonResults] = useState<CatalogPickerItem[]>([]);
  const [selectedClub, setSelectedClub] = useState<CatalogPickerItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<CatalogPickerItem | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [kitType, setKitType] = useState<KitType>("home");
  const [size, setSize] = useState<JerseySize>("m");
  const [condition, setCondition] = useState<JerseyCondition>("used");
  const [searching, setSearching] = useState(false);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogMiss, setCatalogMiss] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saveError, setSaveError] = useState(false);

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

  const pickGalleryPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const roles: LocalPhoto["role"][] = ["front", "back", "label"];
    const nextPhotos: LocalPhoto[] = [];

    for (const [index, asset] of result.assets.entries()) {
      if (!asset.base64) {
        continue;
      }

      nextPhotos.push({
        uri: asset.uri,
        base64: asset.base64,
        role: roles[index] ?? "front",
      });
    }

    if (nextPhotos.length > 0) {
      setPhotos(nextPhotos);
    }
  };

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

  const canSave = accessToken && selectedClub && selectedSeason && photos.length > 0 && !saving;

  const handleSave = async () => {
    if (!accessToken || !selectedClub || !selectedSeason || photos.length === 0) {
      return;
    }

    setSaving(true);
    setSaveError(false);

    try {
      await saveUserJersey(accessToken, {
        clubId: selectedClub.id,
        seasonId: selectedSeason.id,
        catalogKitId: null,
        type: kitType,
        size,
        condition,
        photos: photos.map((photo) => ({
          role: photo.role,
          source: "gallery",
          contentBase64: photo.base64,
        })),
      });

      router.replace("/(tabs)/collection");
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Bekræft og gem</Text>
        <Text style={styles.body}>
          Vælg foto, klub, sæson og detaljer. Gem kræver mindst ét foto.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fotos</Text>
          <Button
            label="Vælg fra galleri"
            variant="secondary"
            onPress={() => void pickGalleryPhotos()}
          />
          {photos.length > 0 ? (
            <View style={styles.photoRow}>
              {photos.map((photo) => (
                <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.photoThumb} />
              ))}
            </View>
          ) : (
            <Text style={styles.helper}>Mindst ét foto er påkrævet.</Text>
          )}
        </View>

        {catalogMiss && !clubSheetOpen ? (
          <Banner
            tone="info"
            message="Klubben findes ikke i kataloget endnu. Dit draft bliver gemt."
            action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Klub</Text>
          <ListRow
            title={selectedClub?.label ?? "Vælg klub"}
            onPress={openClubSheet}
            selected={selectedClub !== null}
          />
        </View>

        {selectedClub ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Sæson</Text>
            <ListRow
              title={selectedSeason?.label ?? "Vælg sæson"}
              onPress={() => setSeasonSheetOpen(true)}
              selected={selectedSeason !== null}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.chipRow}>
            {KIT_TYPES.map((value) => (
              <Chip
                key={value}
                label={KIT_TYPE_LABELS_DA[value]}
                selected={kitType === value}
                onPress={() => setKitType(value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Størrelse</Text>
          <View style={styles.chipRow}>
            {JERSEY_SIZES.map((value) => (
              <Chip
                key={value}
                label={JERSEY_SIZE_LABELS_DA[value]}
                selected={size === value}
                onPress={() => setSize(value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Stand</Text>
          <View style={styles.chipRow}>
            {JERSEY_CONDITIONS.map((value) => (
              <Chip
                key={value}
                label={JERSEY_CONDITION_LABELS_DA[value]}
                selected={condition === value}
                onPress={() => setCondition(value)}
              />
            ))}
          </View>
        </View>

        {saveError ? (
          <Banner
            tone="danger"
            message="Kunne ikke gemme trøjen. Prøv igen."
            action={
              <Button label="Prøv igen" variant="tertiary" onPress={() => void handleSave()} />
            }
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Gem"
          variant="primary"
          loading={saving}
          disabled={!canSave}
          onPress={() => void handleSave()}
        />
      </View>

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
  },
  scrollContent: {
    padding: space.insetLg,
    gap: space.gapLg,
    paddingBottom: space.insetLg,
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
  section: {
    gap: space.gapSm,
  },
  sectionLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: type.label.fontWeight,
    color: color.contentPrimary,
  },
  helper: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.contentMuted,
  },
  photoRow: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  photoThumb: {
    width: 72,
    height: 90,
    borderRadius: radius.md,
    backgroundColor: color.fillSecondary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  footer: {
    padding: space.insetLg,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
    backgroundColor: color.canvas,
  },
  loader: {
    paddingVertical: space.insetLg,
  },
});
