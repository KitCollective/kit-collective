import type { WishlistEntry } from "@kit/api-contract";
import { JERSEY_SIZES, KIT_TYPES } from "@kit/domain";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchClubSeasons } from "@/api/catalog";
import { resolvePhotoUrl } from "@/api/collection";
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
import { ClubPickerOverlay } from "@/components/club-picker-overlay";
import { ScreenHeader } from "@/components/screen-header";
import { SeasonPickerOverlay } from "@/components/season-picker-overlay";
import { Button, EmptyState, IconButton } from "@/components/ui";
import { useIsPlaceHomeLive } from "@/navigation/place-homes";
import { readPlaceOverview, writePlaceOverview } from "@/navigation/place-overview-cache";
import { usePlaceOverview } from "@/navigation/use-place-overview";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";
import { useWishlistBadge } from "@/wishlist/wishlist-badge";
import { buildWishlistViewModel } from "@/wishlist/wishlist-view-model";
import {
  applyWishlistSideSelection,
  buildWishlistWritePayload,
  canSaveWishlistEntry,
  emptyWishlistCriteria,
  resolveWishlistEmptyActionLabel,
  resolveWishlistEmptyBody,
  resolveWishlistEmptyTitle,
  resolveWishlistSheetTitle,
  seedCriteriaForEdit,
  WISHLIST_AND_HELPER_COPY,
  WISHLIST_SIZE_OPTIONS,
  WISHLIST_TYPE_OPTIONS,
  type WishlistCriteria,
  type WishlistSheetMode,
  wishlistSideId,
} from "./wishlist-sheet-logic";

export function WishlistScreen() {
  const theme = useTheme();
  const typography = useTypography();
  const router = useRouter();
  const { refreshUnseenCount } = useWishlistBadge();
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
  const viewModel = useMemo(() => buildWishlistViewModel(entries), [entries]);

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
      // Reading the list marked its Matches seen on the server; the tab badge follows.
      void refreshUnseenCount();
    } finally {
      setLoading(false);
    }
  }, [accessToken, refreshUnseenCount]);

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
    const sideId = wishlistSideId(criteria);
    if (!sideId) {
      return;
    }

    setSeasonPickerOpen(true);
    if (seasonOptions.length === 0) {
      await loadSeasonOptions(sideId);
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
    setSeasonOptions([]);
    setMode("form");
  };

  const openEditForm = async (entry: WishlistEntry) => {
    const granted = await requestPremiumAccess();
    if (!granted) {
      return;
    }

    setEditingEntryId(entry.id);
    const nextCriteria = seedCriteriaForEdit(entry);
    setCriteria(nextCriteria);
    setMode("form");
    const sideId = wishlistSideId(nextCriteria);
    if (sideId) {
      await loadSeasonOptions(sideId);
    }
  };

  const handleClubSelected = async (club: {
    id: string;
    label: string;
    kind?: "club" | "national_team";
  }) => {
    setCriteria((current) => applyWishlistSideSelection(current, club));
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

  const handleThumbPress = (route: string) => {
    // SAFETY: the view-model builds `/search/${jerseyId}`, a typed Expo Router Href.
    router.push(route as Href);
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
            ) : viewModel.page === "empty" ? (
              <EmptyState
                title={resolveWishlistEmptyTitle()}
                body={resolveWishlistEmptyBody()}
                action={
                  <Button
                    label={resolveWishlistEmptyActionLabel()}
                    testID="wishlist-add"
                    variant="primary"
                    width="fill"
                    onPress={() => void openCreateForm()}
                  />
                }
              />
            ) : (
              <>
                <ScrollView>
                  {viewModel.rows.map((row, index) => {
                    const entry = entries[index];
                    return (
                      <View
                        key={row.id}
                        style={[
                          styles.wishRow,
                          index < viewModel.rows.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.borderSubtle,
                          },
                        ]}
                      >
                        <View style={styles.manageRow}>
                          <View
                            style={styles.manageMain}
                            accessible
                            accessibilityLabel={row.accessibilityLabel}
                          >
                            <Text
                              style={[typography.label, { color: theme.contentPrimary }]}
                              importantForAccessibility="no-hide-descendants"
                            >
                              {row.title}
                            </Text>
                            <Text
                              style={[typography.mono, { color: theme.contentMuted }]}
                              importantForAccessibility="no-hide-descendants"
                            >
                              {row.facetLine}
                            </Text>
                          </View>
                          {row.badge.kind === "new" ? (
                            <View style={[styles.newPill, { backgroundColor: theme.fillPrimary }]}>
                              <Text
                                style={[typography.captionSm, { color: theme.contentInverse }]}
                                importantForAccessibility="no-hide-descendants"
                              >
                                {row.badge.label}
                              </Text>
                            </View>
                          ) : row.badge.kind === "count" ? (
                            <Text
                              style={[typography.mono, { color: theme.contentMuted }]}
                              importantForAccessibility="no-hide-descendants"
                            >
                              {row.badge.label}
                            </Text>
                          ) : null}
                          {entry ? (
                            <>
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
                            </>
                          ) : null}
                        </View>
                        {row.emptyLabel ? (
                          <Text style={[typography.caption, { color: theme.contentMuted }]}>
                            {row.emptyLabel}
                          </Text>
                        ) : (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.thumbRow}
                          >
                            {row.thumbs.map((thumb) => (
                              <Pressable
                                key={thumb.jerseyId}
                                style={styles.thumb}
                                accessibilityRole="button"
                                accessibilityLabel={thumb.accessibilityLabel}
                                onPress={() => handleThumbPress(thumb.route)}
                              >
                                {thumb.thumbUrl ? (
                                  <Image
                                    source={{
                                      uri: resolvePhotoUrl(thumb.thumbUrl),
                                      headers: accessToken
                                        ? { Authorization: `Bearer ${accessToken}` }
                                        : undefined,
                                    }}
                                    style={[
                                      styles.thumbImage,
                                      { backgroundColor: theme.fillSecondary },
                                    ]}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.thumbImage,
                                      { backgroundColor: theme.fillSecondary },
                                    ]}
                                  />
                                )}
                                <Text
                                  style={[typography.captionSm, { color: theme.contentSecondary }]}
                                  numberOfLines={1}
                                  importantForAccessibility="no-hide-descendants"
                                >
                                  {thumb.handle}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
                <Button
                  label="Tilføj"
                  testID="wishlist-add"
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
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                Klub eller landshold
              </Text>
              <SelectField
                value={criteria.club?.label ?? criteria.nationalTeam?.label ?? null}
                placeholder="Vælg klub eller landshold"
                onPress={() => setClubPickerOpen(true)}
              />
            </View>

            {wishlistSideId(criteria) ? (
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
        <ClubPickerOverlay
          visible={clubPickerOpen}
          accessToken={accessToken}
          selectedClubId={wishlistSideId(criteria)}
          onSelect={(item) => void handleClubSelected(item)}
          onDismiss={() => setClubPickerOpen(false)}
        />
      ) : null}

      {seasonPickerOpen && accessToken && wishlistSideId(criteria) ? (
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
  wishRow: {
    gap: space.gapSm,
    paddingVertical: space.insetSm,
  },
  newPill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.insetSm,
    paddingVertical: 2,
  },
  thumbRow: {
    gap: space.gapSm,
  },
  thumb: {
    width: 84,
    gap: 4,
  },
  thumbImage: {
    width: 84,
    height: 105,
    borderRadius: radius.sm,
  },
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  manageMain: {
    flex: 1,
    gap: space.gapSm,
  },
});
