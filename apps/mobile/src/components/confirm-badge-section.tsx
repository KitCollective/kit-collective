import type { CatalogPickerItem } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fetchSeasonPatches } from "@/api/catalog";
import { useAuth } from "@/auth/AuthProvider";
import { setDraftBadge, setDraftBadgeEnabled } from "@/capture/captureSession";
import type { CaptureJerseyDraft, CaptureSessionMutator } from "@/capture/captureSessionTypes";
import { markConfirmBadgeEdited } from "@/capture/confirmManualEdits";
import { Chip } from "@/components/chip";
import { SwitchControl } from "@/components/profile-ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmBadgeSectionProps = {
  draft: CaptureJerseyDraft;
  mutate: CaptureSessionMutator;
};

/**
 * Optional Badge switch and sleeve-patch chips. Lives on the Detaljer drill since the
 * 2026-10-09 revision (Detaljer holds only Badge and Noter); the behaviour is unchanged from
 * when it sat on the Data drill.
 */
export function ConfirmBadgeSection({ draft, mutate }: ConfirmBadgeSectionProps) {
  const theme = useTheme();
  const typography = useTypography();
  const { accessToken } = useAuth();
  const [livePatches, setLivePatches] = useState<CatalogPickerItem[]>([]);
  const [patchesLoading, setPatchesLoading] = useState(false);
  const [patchesError, setPatchesError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !draft.badgeEnabled || !draft.seasonId) {
      setLivePatches([]);
      setPatchesLoading(false);
      setPatchesError(null);
      return;
    }

    let cancelled = false;
    setLivePatches([]);
    setPatchesLoading(true);
    setPatchesError(null);
    void fetchSeasonPatches(accessToken, draft.seasonId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setLivePatches(response.items);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLivePatches([]);
        setPatchesError("Kunne ikke hente badges.");
      })
      .finally(() => {
        if (!cancelled) {
          setPatchesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, draft.badgeEnabled, draft.seasonId]);

  return (
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
        !draft.seasonId ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>
            Vælg en sæson for at se badges.
          </Text>
        ) : patchesError ? (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>{patchesError}</Text>
        ) : livePatches.length > 0 ? (
          <View style={styles.chipRow}>
            {livePatches.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draft.badgeId === item.id}
                accessibilityRole="radio"
                onPress={() => {
                  markConfirmBadgeEdited();
                  mutate((current) =>
                    setDraftBadge(current, current.activeDraftId, {
                      id: item.id,
                      label: item.label,
                    }),
                  );
                }}
              />
            ))}
          </View>
        ) : patchesLoading ? null : (
          <Text style={[typography.caption, { color: theme.contentMuted }]}>
            Ingen badges for denne sæson.
          </Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
