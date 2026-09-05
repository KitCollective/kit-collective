import type { WishlistEntry } from "@kit/api-contract";
import { JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchClubSeasons } from "@/api/catalog";
import {
  createWishlistEntry,
  deleteWishlistEntry,
  fetchWishlistEntries,
  updateWishlistEntry,
  WishlistPremiumRequiredError,
} from "@/api/wishlist";
import { useAuth } from "@/auth/AuthProvider";
import { SelectField } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { FacetPickerOverlay } from "@/components/facet-picker-overlay";
import { ScreenHeader } from "@/components/screen-header";
import { SeasonPickerOverlay } from "@/components/season-picker-overlay";
import { Button, EmptyState, IconButton } from "@/components/ui";
import { useIsPlaceHomeLive } from "@/navigation/place-homes";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";
import {
  buildWishlistWritePayload,
  canSaveWishlistEntry,
  emptyWishlistCriteria,
  hasWishlistHit,
  hitRowAccessibilityLabel,
  manageRowAccessibilityLabel,
  resolveWishlistEmptyBody,
  resolveWishlistEmptyTitle,
  resolveWishlistHitRoute,
  resolveWishlistSheetTitle,
  seedCriteriaForEdit,
  WISHLIST_AND_HELPER_COPY,
  WISHLIST_SIZE_OPTIONS,
  WISHLIST_TYPE_OPTIONS,
  type WishlistCriteria,
  type WishlistSheetMode,
} from "./wishlist-sheet-logic";

export function WishlistScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const router = useRouter();
  const insets = useStableSafeAreaInsets();
  const { accessToken, requestPremiumAccess, closePaywall } = useAuth();

  const cachedWishlist = usePlaceOverview("wishlist");
  const isLive = useIsPlaceHomeLive("wishlist");
  const [mode, setMode] = useState<WishlistSheetMode>("list");
  const [entries, setEntries] = useState<WishlistEntry[]>(cachedWishlist?.entries ?? []);
  const [loading, setLoading] = useState(cachedWishlist == null);
  const [saving, setSaving] = useState(false);
  const [criteria, setCriteria] = useState<WishlistCriteria>(emptyWishlistCriteria());
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [seasonOptions, setSeasonOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);

  useEffect(() => {
    if (!cachedWishlist) {
      return;
    }
    setEntries(cachedWishlist.entries);
    setLoading(false);
  }, [cachedWishlist]);

  const loadEntries = useCallback(async () => {
    if (!accessToken) {
      setEntries([]);
      return;
    }

    if (!readPlaceOverview("wishlist")) {
      setLoading(true);
    }
    try {
      const response = await fetchWishlistEntries(accessToken);
      setEntries(response.entries);
      writePlaceOverview("wishlist", { entries: response.entries });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadSeasonOptions = useCallback(
    async (clubId: string) => {
      if (!accessToken) {
        return;
      }

      setLoadingSeasons(true);
      try {
        const response = await fetchClubSeasons(accessToken, clubId);
        setSeasonOptions(response.seasons);
      } catch {
        setSeasonOptions([]);
      } finally {
        setLoadingSeasons(false);
      }
    },
    [accessToken],
  );

  const openSeasonPicker = async () => {
    if (!criteria.club) {
      return;
    }

    setSeasonPickerOpen(true);
    if (seasonOptions.length === 0) {
      await loadSeasonOptions(criteria.club.id);
    }
  };

  useEffect(() => {
    if (!isLive) {
      return;
    }
    void loadEntries();
  }, [isLive, loadEntries]);

  const openPaywallOnPremiumError = async (error: unknown): Promise<boolean> => {
    if (error instanceof WishlistPremiumRequiredError) {
      closePaywall();
      await requestPremiumAccess();
      return true;
    }
    return false;
  };

  const openCreateForm = async () => {
    const granted = await requestPremiumAccess();
    if (!granted) {
      return;
    }

    setEditingEntryId(null);
    setCriteria(emptyWishlistCriteria());
    setMode("form");
  };

  const openEditForm = async (entry: WishlistEntry) => {
    const granted = await requestPremiumAccess();
    if (!granted) {
      return;
    }

    setEditingEntryId(entry.id);
    setCriteria(seedCriteriaForEdit(entry));
    setMode("form");
  };

  const handleClubSelected = async (club: { id: string; label: string }) => {
    setCriteria((current) => ({
      ...current,
      club: { id: club.id, label: club.label },
      season: null,
    }));
    setClubPickerOpen(false);
    setSeasonPickerOpen(true);
    await loadSeasonOptions(club.id);
  };

  const handleSave = async () => {
    if (!accessToken || !canSaveWishlistEntry(criteria, saving)) {
      return;
    }

    setSaving(true);
    try {
      const payload = buildWishlistWritePayload(criteria);
      if (editingEntryId) {
        await updateWishlistEntry(accessToken, editingEntryId, payload);
      } else {
        await createWishlistEntry(accessToken, payload);
      }

      await loadEntries();
      setMode("list");
    } catch (error) {
      await openPaywallOnPremiumError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!accessToken) {
      return;
    }

    await deleteWishlistEntry(accessToken, entryId);
    await loadEntries();
  };

  const handleHitPress = (entry: WishlistEntry) => {
    if (!hasWishlistHit(entry) || !entry.matchedJerseyId) {
      return;
    }
    // SAFETY: handleHitPress already required a hit + matchedJerseyId; the helper
    // returns `/search/${id}`, which is a typed Expo Router Href.
    router.push(resolveWishlistHitRoute(entry.matchedJerseyId) as Href);
  };

  const sheetTitle = resolveWishlistSheetTitle(mode);
  const canSave = canSaveWishlistEntry(criteria, saving);

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <ScreenHeader
        title={sheetTitle}
        trailing={
          mode === "form" ? (
            <IconButton name="Tilbage" icon="chevron-back" onPress={() => setMode("list")} />
          ) : undefined
        }
      />
      <View style={[styles.content, { paddingBottom: insets.bottom + space.insetMd }]}>
        {mode === "list" ? (
          <View style={styles.listBody}>
            {loading ? (
              <ActivityIndicator color={theme.fillPrimary} />
            ) : entries.length === 0 ? (
              <EmptyState
                title={resolveWishlistEmptyTitle()}
                body={resolveWishlistEmptyBody()}
                action={
                  <Button
                    label="Tilføj"
                    variant="primary"
                    width="fill"
                    onPress={() => void openCreateForm()}
                  />
                }
              />
            ) : (
              <>
                <ScrollView>
                  {entries.map((entry, index) => {
                    const isHit = hasWishlistHit(entry);
                    const rowLabel = isHit
                      ? hitRowAccessibilityLabel(entry.name, entry.meta)
                      : manageRowAccessibilityLabel(entry.name, entry.meta);

                    return (
                      <View
                        key={entry.id}
                        style={[
                          styles.manageRow,
                          isHit && { backgroundColor: theme.fillSecondary },
                          index < entries.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.borderSubtle,
                          },
                        ]}
                      >
                        <Pressable
                          style={styles.manageMain}
                          accessible
                          accessibilityRole="button"
                          accessibilityLabel={rowLabel}
                          disabled={!isHit}
                          onPress={() => handleHitPress(entry)}
                        >
                          <Text
                            style={[typography.body, { color: theme.contentPrimary }]}
                            importantForAccessibility="no-hide-descendants"
                          >
                            {entry.name}
                          </Text>
                          <Text
                            style={[typography.mono, { color: theme.contentMuted }]}
                            importantForAccessibility="no-hide-descendants"
                          >
                            {entry.meta}
                          </Text>
                        </Pressable>
                        <IconButton
                          name="Rediger"
                          icon="create-outline"
                          onPress={() => void openEditForm(entry)}
                        />
                        <IconButton
                          name="Slet"
                          icon="trash-outline"
                          onPress={() => void handleDelete(entry.id)}
                        />
                      </View>
                    );
                  })}
                </ScrollView>
                <Button
                  label="Tilføj"
                  variant="primary"
                  width="fill"
                  onPress={() => void openCreateForm()}
                />
              </>
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.formBody}>
            <Text style={[typography.body, { color: theme.contentSecondary }]}>
              {WISHLIST_AND_HELPER_COPY}
            </Text>

            <View style={styles.field}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>Klub</Text>
              <SelectField
                value={criteria.club?.label ?? null}
                placeholder="Vælg klub"
                onPress={() => setClubPickerOpen(true)}
              />
            </View>

            {criteria.club ? (
              <View style={styles.field}>
                <Text style={[typography.label, { color: theme.contentPrimary }]}>Sæson</Text>
                <SelectField
                  value={criteria.season?.label ?? null}
                  placeholder="Vælg sæson"
                  onPress={() => void openSeasonPicker()}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>Type</Text>
              <View style={styles.chipRow}>
                {KIT_TYPES.map((value) => (
                  <Chip
                    key={value}
                    label={WISHLIST_TYPE_OPTIONS[value]}
                    selected={criteria.type === value}
                    accessibilityRole="radio"
                    onPress={() =>
                      setCriteria((current) => ({
                        ...current,
                        type: current.type === value ? null : value,
                      }))
                    }
                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>Størrelse</Text>
              <View style={styles.chipRow}>
                {JERSEY_SIZES.map((value) => (
                  <Chip
                    key={value}
                    label={WISHLIST_SIZE_OPTIONS[value]}
                    selected={criteria.size === value}
                    accessibilityRole="radio"
                    onPress={() =>
                      setCriteria((current) => ({
                        ...current,
                        size: current.size === value ? null : value,
                      }))
                    }
                  />
                ))}
              </View>
            </View>

            <Button
              label="Gem"
              variant="primary"
              width="fill"
              loading={saving}
              disabled={!canSave}
              onPress={() => void handleSave()}
            />
          </ScrollView>
        )}
      </View>

      {clubPickerOpen && accessToken ? (
        <FacetPickerOverlay
          visible={clubPickerOpen}
          facetKind="club"
          accessToken={accessToken}
          selectedId={criteria.club?.id ?? null}
          mostUsed={[]}
          onSelect={(item) => void handleClubSelected(item)}
          onDismiss={() => setClubPickerOpen(false)}
        />
      ) : null}

      {seasonPickerOpen && accessToken && criteria.club ? (
        <SeasonPickerOverlay
          visible={seasonPickerOpen}
          seasons={seasonOptions}
          selectedId={criteria.season?.id ?? null}
          loading={loadingSeasons}
          onSelect={(season) => {
            setCriteria((current) => ({
              ...current,
              season: { id: season.id, label: season.label },
            }));
          }}
          onDismiss={() => setSeasonPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: space.insetMd,
  },
  listBody: {
    flex: 1,
    gap: space.insetMd,
  },
  formBody: {
    gap: space.insetMd,
  },
  field: {
    gap: space.gapSm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    paddingVertical: space.insetSm,
  },
  manageMain: {
    flex: 1,
    gap: space.gapSm,
  },
});
