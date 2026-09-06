import { KIT_TYPE_LABELS_DA, KIT_TYPES } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  selectDraftKitType,
  setDraftBadge,
  setDraftBadgeEnabled,
  setDraftClub,
  setDraftPlayer,
  setDraftSeason,
} from "@/capture/captureSession";
import {
  clearConfirmSeasonEdited,
  markConfirmClubEdited,
  markConfirmKitTypeEdited,
  markConfirmSeasonEdited,
} from "@/capture/confirmManualEdits";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmSave } from "@/capture/useConfirmSave";
import { dummyBadgesForSeason, dummyClubById, dummySeasonsForClub } from "@/catalog/dummyCatalog";
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
  const { sessionId, editJerseyId } = useLocalSearchParams<{
    sessionId: string;
    editJerseyId?: string;
  }>();
  const { accessToken } = useAuth();
  const { state, isSessionResolved, mutate, draft, handleCommitDrill } = useConfirmSave({
    sessionId,
    editJerseyId,
  });
  useConfirmExit(sessionId, state, isSessionResolved);

  const [openPicker, setOpenPicker] = useState<DataPickerKind | null>(null);

  if (!sessionId || !draft) {
    return null;
  }

  const fadeDockScrollPadding =
    BUTTON_DOCK_FADE_SCROLL_PADDING + Math.max(insets.bottom, space.insetMd);
  const clubCountry = draft.clubId ? dummyClubById(draft.clubId)?.country : null;
  const seasonValue =
    draft.seasonLabel ??
    (draft.clubId && draft.seasonId
      ? (dummySeasonsForClub(draft.clubId).find((row) => row.id === draft.seasonId)?.label ?? null)
      : null);
  const playerMeta = draft.playerNumber ? `Nr. ${draft.playerNumber}` : null;
  const seasonBadges = dummyBadgesForSeason(draft.clubId ?? "", draft.seasonId);

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ConfirmDrillHeader title="Data" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: fadeDockScrollPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <CatalogSelectRow
            placeholder="Vælg klub"
            value={draft.clubLabel}
            meta={clubCountry}
            onPress={() => setOpenPicker("club")}
          />
          {draft.clubId ? (
            <CatalogSelectRow
              placeholder="Vælg sæson"
              value={seasonValue}
              onPress={() => setOpenPicker("season")}
            />
          ) : null}
          {draft.clubId ? (
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
            seasonBadges.length > 0 ? (
              <View style={styles.chipRow}>
                {seasonBadges.map((badge) => (
                  <Chip
                    key={badge.id}
                    label={badge.label}
                    selected={draft.badgeId === badge.id}
                    accessibilityRole="radio"
                    onPress={() => {
                      mutate((current) =>
                        setDraftBadge(current, current.activeDraftId, {
                          id: badge.id,
                          label: badge.label,
                        }),
                      );
                    }}
                  />
                ))}
              </View>
            ) : (
              <Text style={[typography.caption, { color: theme.contentMuted }]}>
                Vælg en sæson for at se badges.
              </Text>
            )
          ) : null}
        </View>
      </ScrollView>

      <ButtonDock variant="fade">
        <Button label="Gem" variant="primary" width="fill" onPress={handleCommitDrill} />
      </ButtonDock>

      <ClubPickerOverlay
        visible={openPicker === "club"}
        accessToken={accessToken}
        selectedClubId={draft.clubId}
        onSelect={(club) => {
          markConfirmClubEdited();
          clearConfirmSeasonEdited();
          mutate((current) => setDraftClub(current, current.activeDraftId, club.id, club.label));
        }}
        onDismiss={() => setOpenPicker(null)}
      />

      <SeasonPickerOverlay
        visible={openPicker === "season"}
        clubId={draft.clubId}
        selectedId={draft.seasonId}
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
        clubId={draft.clubId}
        seasonId={draft.seasonId}
        selectedId={draft.playerId}
        onSelect={(player) => {
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
