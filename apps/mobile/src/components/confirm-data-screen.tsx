import type { CatalogPickerItem } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA, KIT_TYPES } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchClubSeasons } from "@/api/catalog";
import { useAuth } from "@/auth/AuthProvider";
import {
  catalogSideId,
  selectDraftKitType,
  setDraftBadgeEnabled,
  setDraftCatalogSide,
  setDraftPlayer,
  setDraftSeason,
} from "@/capture/captureSession";
import {
  clearConfirmSeasonEdited,
  markConfirmBadgeEdited,
  markConfirmClubEdited,
  markConfirmKitTypeEdited,
  markConfirmPlayerEdited,
  markConfirmSeasonEdited,
} from "@/capture/confirmManualEdits";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmSave } from "@/capture/useConfirmSave";
import { CatalogSelectRow } from "@/components/catalog-select-row";
import { Chip } from "@/components/chip";
import { ClubPickerOverlay } from "@/components/club-picker-overlay";
import { ConfirmDrillHeader } from "@/components/confirm-drill-header";
import { PlayerPickerOverlay } from "@/components/player-picker-overlay";
import { SwitchControl } from "@/components/profile-ui";
import { SeasonPickerOverlay } from "@/components/season-picker-overlay";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type DataPickerKind = "club" | "season" | "player";

export function ConfirmDataScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { sessionId, editJerseyId, visionSideHint } = useLocalSearchParams<{
    sessionId: string;
    editJerseyId?: string;
    visionSideHint?: string;
  }>();
  const { accessToken } = useAuth();
  const { state, isSessionResolved, mutate, draft, handleCommitDrill } = useConfirmSave({
    sessionId,
    editJerseyId,
  });
  useConfirmExit(sessionId, state, isSessionResolved);

  const [openPicker, setOpenPicker] = useState<DataPickerKind | null>(null);
  const [liveSeasons, setLiveSeasons] = useState<CatalogPickerItem[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const sideId = catalogSideId({
    clubId: draft?.clubId ?? null,
    nationalTeamId: draft?.nationalTeamId ?? null,
  });

  useEffect(() => {
    if (!accessToken || !sideId) {
      setLiveSeasons([]);
      setSeasonsLoading(false);
      setSeasonsError(null);
      return;
    }

    let cancelled = false;
    setLiveSeasons([]);
    setSeasonsLoading(true);
    setSeasonsError(null);
    void fetchClubSeasons(accessToken, sideId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setLiveSeasons(response.seasons);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLiveSeasons([]);
        setSeasonsError("Kunne ikke hente sæsoner.");
      })
      .finally(() => {
        if (!cancelled) {
          setSeasonsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, sideId]);

  if (!sessionId || !draft) {
    return null;
  }

  const fadeDockScrollPadding =
    BUTTON_DOCK_FADE_SCROLL_PADDING + Math.max(insets.bottom, space.insetMd);
  const sideLabel = draft.clubLabel ?? draft.nationalTeamLabel;
  const seasonValue =
    draft.seasonLabel ?? liveSeasons.find((season) => season.id === draft.seasonId)?.label ?? null;
  const playerMeta = draft.playerNumber ? `Nr. ${draft.playerNumber}` : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ConfirmDrillHeader title="Data" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: fadeDockScrollPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <CatalogSelectRow
            placeholder="Vælg klub eller landshold"
            value={sideLabel}
            onPress={() => setOpenPicker("club")}
          />
          {sideId ? (
            <CatalogSelectRow
              placeholder="Vælg sæson"
              value={seasonValue}
              onPress={() => setOpenPicker("season")}
            />
          ) : null}
          {sideId ? (
            <>
              <CatalogSelectRow
                placeholder="Vælg spiller"
                value={draft.playerName || null}
                meta={playerMeta}
                onPress={() => setOpenPicker("player")}
              />
              <Text style={[typography.caption, { color: theme.contentMuted }]}>
                Valgfrit. Spillernummer vises på den valgte række.
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={[typography.label, { color: theme.contentPrimary }]}>Type</Text>
          <View style={styles.chipRow}>
            {KIT_TYPES.map((value) => (
              <Chip
                key={value}
                label={KIT_TYPE_LABELS_DA[value]}
                selected={draft.kitTypeSelected && draft.kitType === value}
                accessibilityRole="radio"
                onPress={() => {
                  markConfirmKitTypeEdited();
                  mutate((current) => selectDraftKitType(current, current.activeDraftId, value));
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Badge"
            accessibilityState={{ checked: draft.badgeEnabled }}
            onPress={() => {
              markConfirmBadgeEdited();
              mutate((current) =>
                setDraftBadgeEnabled(current, current.activeDraftId, !draft.badgeEnabled),
              );
            }}
            style={styles.badgeRow}
          >
            <View style={styles.badgeCopy}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>Badge</Text>
              <Text style={[typography.caption, { color: theme.contentMuted }]}>
                Ærmemærke for liga eller turnering.
              </Text>
            </View>
            <View
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <SwitchControl
                value={draft.badgeEnabled}
                onValueChange={() => undefined}
                accessibilityLabel="Badge"
              />
            </View>
          </Pressable>
          {draft.badgeEnabled ? (
            <Text style={[typography.caption, { color: theme.contentMuted }]}>
              Vælg en sæson for at se badges.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <ButtonDock variant="fade">
        <Button label="Gem" variant="primary" width="fill" onPress={handleCommitDrill} />
      </ButtonDock>

      <ClubPickerOverlay
        visible={openPicker === "club"}
        accessToken={accessToken}
        selectedClubId={sideId}
        initialQuery={visionSideHint ?? null}
        catalogMissHint={visionSideHint ?? null}
        onSelect={(club) => {
          markConfirmClubEdited();
          clearConfirmSeasonEdited();
          mutate((current) => setDraftCatalogSide(current, current.activeDraftId, club));
        }}
        onDismiss={() => setOpenPicker(null)}
      />

      <SeasonPickerOverlay
        visible={openPicker === "season"}
        seasons={liveSeasons}
        clubId={sideId}
        selectedId={draft.seasonId}
        loading={seasonsLoading}
        errorMessage={seasonsError}
        onSelect={(season) => {
          markConfirmSeasonEdited();
          mutate((current) =>
            setDraftSeason(current, current.activeDraftId, season.id, season.label),
          );
        }}
        onDismiss={() => setOpenPicker(null)}
      />

      <PlayerPickerOverlay
        visible={openPicker === "player"}
        accessToken={accessToken}
        clubId={sideId}
        seasonId={draft.seasonId}
        selectedId={draft.playerId}
        onSelect={(player) => {
          markConfirmPlayerEdited();
          mutate((current) =>
            setDraftPlayer(current, current.activeDraftId, {
              id: player.id,
              name: player.label,
              number: player.number,
            }),
          );
        }}
        onDismiss={() => setOpenPicker(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: space.insetLg,
    gap: space.gapLg,
  },
  section: {
    gap: space.gapSm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  badgeRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  badgeCopy: {
    flex: 1,
    gap: 2,
  },
});
