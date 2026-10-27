import { Ionicons } from "@expo/vector-icons";
import type { CollectionJersey } from "@kit/api-contract";
import {
  JERSEY_CONDITION_LABELS_DA,
  JERSEY_CONDITIONS,
  JERSEY_SIZE_LABELS_DA,
  JERSEY_SIZES,
  KIT_TYPE_LABELS_DA,
  KIT_TYPES,
} from "@kit/domain";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { fetchClubSeasons, fetchSeasonPatches } from "@/api/catalog";
import { Mark, Sheet, useSheetScroll } from "@/components/catalog-ui";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui";
import {
  type ClubChangeCopy,
  type JerseyEdit,
  type JerseyFactKey,
  jerseyFactSheetCopy,
  NO_BADGE_LABEL,
  seasonDecades,
  sortSeasonsNewestFirst,
} from "@/jersey-detail/jersey-edit";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type Option = { key: string; label: string; selected: boolean; edit: JerseyEdit };

type FactSheetProps = {
  visible: boolean;
  /** Null while no fact sheet is open; the last fact stays rendered while the sheet closes. */
  factKey: JerseyFactKey | null;
  jersey: CollectionJersey;
  accessToken: string | null;
  onSelect: (edit: JerseyEdit) => void;
  onDismiss: () => void;
  onModalHide: () => void;
};

type PatchOption = { id: string; label: string };

/**
 * Type, Størrelse, Stand and Badge: one Sheet `form` with Chip `single-select` for that fact
 * only. A tap saves and closes. Badge options are the current season's patches plus Ingen.
 */
export function JerseyFactSheet({
  visible,
  factKey,
  jersey,
  accessToken,
  onSelect,
  onDismiss,
  onModalHide,
}: FactSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const lastKey = useRef<JerseyFactKey>("type");
  if (factKey) {
    lastKey.current = factKey;
  }
  const key = lastKey.current;
  const copy = jerseyFactSheetCopy(key, jersey);

  const [patches, setPatches] = useState<PatchOption[]>([]);
  const [patchesLoading, setPatchesLoading] = useState(false);
  const [patchesError, setPatchesError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || factKey !== "badge" || !accessToken) {
      return;
    }
    let cancelled = false;
    setPatchesLoading(true);
    setPatchesError(null);
    void fetchSeasonPatches(accessToken, jersey.seasonId)
      .then((response) => {
        if (!cancelled) {
          setPatches(response.items.map((item) => ({ id: item.id, label: item.label })));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPatches([]);
          setPatchesError("Kunne ikke hente badges.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPatchesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, factKey, accessToken, jersey.seasonId]);

  const options = optionsFor(key, jersey, patches);

  return (
    <Sheet visible={visible} title={copy.title} onDismiss={onDismiss} onModalHide={onModalHide}>
      <View
        accessible={false}
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityRole="radiogroup"
        testID={`jersey-detail-sheet-${key}`}
        style={styles.chips}
      >
        {options.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={option.selected}
            accessibilityRole="radio"
            testID={`jersey-detail-option-${key}-${option.key}`}
            onPress={() => {
              onSelect(option.edit);
              onDismiss();
            }}
          />
        ))}
      </View>
      {key === "badge" && patchesLoading ? <ActivityIndicator color={theme.fillPrimary} /> : null}
      {key === "badge" && patchesError ? (
        <Text style={[typography.caption, { color: theme.contentMuted }]}>{patchesError}</Text>
      ) : null}
      {key === "badge" && !patchesLoading && !patchesError && patches.length === 0 ? (
        <Text style={[typography.caption, { color: theme.contentMuted }]}>
          Ingen badges for denne sæson.
        </Text>
      ) : null}
    </Sheet>
  );
}

function optionsFor(
  key: JerseyFactKey,
  jersey: CollectionJersey,
  patches: readonly PatchOption[],
): Option[] {
  switch (key) {
    case "type":
      return KIT_TYPES.map((value) => ({
        key: value,
        label: KIT_TYPE_LABELS_DA[value],
        selected: jersey.type === value,
        edit: { kind: "type", value },
      }));
    case "size":
      return JERSEY_SIZES.map((value) => ({
        key: value,
        label: JERSEY_SIZE_LABELS_DA[value],
        selected: jersey.size === value,
        edit: { kind: "size", value },
      }));
    case "condition":
      return JERSEY_CONDITIONS.map((value) => ({
        key: value,
        label: JERSEY_CONDITION_LABELS_DA[value],
        selected: jersey.condition === value,
        edit: { kind: "condition", value },
      }));
    case "badge": {
      const currentId = jersey.patches?.[0]?.id ?? null;
      return [
        {
          key: "none",
          label: NO_BADGE_LABEL,
          selected: currentId === null,
          edit: { kind: "badge", patch: null },
        },
        ...patches.map((patch) => ({
          key: patch.id,
          label: patch.label,
          selected: currentId === patch.id,
          edit: { kind: "badge", patch } as JerseyEdit,
        })),
      ];
    }
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

type SeasonSheetProps = {
  visible: boolean;
  title: string;
  /** The club or national team whose seasons are listed. */
  sideId: string | null;
  currentSeasonId: string | null;
  accessToken: string | null;
  onSelect: (season: { id: string; label: string }) => void;
  onDismiss: () => void;
  onModalHide: () => void;
};

const SEASON_ROW_MIN_HEIGHT = 56;
const SEASON_LIST_MAX = 0.4;

/**
 * Season: the club's seasons, newest first, with decade chips that jump the list. The current
 * season carries a check Mark. A tap saves and closes.
 */
export function JerseySeasonSheet({
  visible,
  title,
  sideId,
  currentSeasonId,
  accessToken,
  onSelect,
  onDismiss,
  onModalHide,
}: SeasonSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const { height } = useWindowDimensions();
  const listRef = useRef<ScrollView>(null);
  const rowTops = useRef(new Map<string, number>());
  const [seasons, setSeasons] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !accessToken || !sideId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    rowTops.current.clear();
    void fetchClubSeasons(accessToken, sideId)
      .then((response) => {
        if (!cancelled) {
          setSeasons(sortSeasonsNewestFirst(response.seasons));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSeasons([]);
          setError("Kunne ikke hente sæsoner.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, accessToken, sideId]);

  const decades = seasonDecades(seasons);
  const sheetScroll = useSheetScroll();

  const jumpTo = (seasonId: string) => {
    const top = rowTops.current.get(seasonId);
    if (top !== undefined) {
      listRef.current?.scrollTo({ y: top, animated: true });
    }
  };

  const list = (
    <Animated.ScrollView
      ref={listRef as never}
      onScroll={sheetScroll?.scrollHandler}
      scrollEventThrottle={16}
      style={{ maxHeight: height * SEASON_LIST_MAX }}
      testID="jersey-detail-season-list"
    >
      {seasons.map((season) => {
        const selected = season.id === currentSeasonId;
        return (
          <Pressable
            key={season.id}
            accessibilityRole="button"
            accessibilityLabel={selected ? `${season.label}, nuværende sæson` : season.label}
            accessibilityState={{ selected }}
            onLayout={(event: LayoutChangeEvent) => {
              rowTops.current.set(season.id, event.nativeEvent.layout.y);
            }}
            onPress={() => {
              onSelect(season);
              onDismiss();
            }}
            testID={`jersey-detail-season-${season.id}`}
            style={({ pressed }) => [
              styles.seasonRow,
              (pressed || selected) && { backgroundColor: theme.fillSecondary },
            ]}
          >
            <Mark label={season.label} />
            <Text style={[typography.body, styles.seasonLabel, { color: theme.contentPrimary }]}>
              {season.label}
            </Text>
            {selected ? (
              <Ionicons
                name="checkmark"
                size={20}
                color={theme.contentPrimary}
                accessibilityElementsHidden
              />
            ) : null}
          </Pressable>
        );
      })}
    </Animated.ScrollView>
  );

  return (
    <Sheet visible={visible} title={title} onDismiss={onDismiss} onModalHide={onModalHide}>
      {decades.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.decades}
          accessibilityLabel="Spring til årti"
        >
          {decades.map((decade) => (
            <Chip
              key={decade.label}
              label={decade.label}
              testID={`jersey-detail-decade-${decade.label}`}
              onPress={() => jumpTo(decade.firstSeasonId)}
            />
          ))}
        </ScrollView>
      ) : null}
      {loading ? <ActivityIndicator color={theme.fillPrimary} /> : null}
      {error ? <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text> : null}
      {!loading && !error && seasons.length === 0 ? (
        <Text style={[typography.caption, { color: theme.contentMuted }]}>
          Ingen sæsoner for denne klub.
        </Text>
      ) : null}
      {sheetScroll ? (
        <GestureDetector gesture={sheetScroll.scrollGesture}>{list}</GestureDetector>
      ) : (
        list
      )}
    </Sheet>
  );
}

type ClubChangeSheetProps = {
  visible: boolean;
  copy: ClubChangeCopy | null;
  onConfirm: () => void;
  onKeep: () => void;
  onModalHide: () => void;
};

/**
 * Changing club is the only edit that asks first: what is kept, what is reset. Nothing is
 * saved before the primary is tapped; the tertiary keeps the current club.
 */
export function JerseyClubChangeSheet({
  visible,
  copy,
  onConfirm,
  onKeep,
  onModalHide,
}: ClubChangeSheetProps) {
  const last = useRef<ClubChangeCopy | null>(null);
  if (copy) {
    last.current = copy;
  }
  const shown = last.current;

  return (
    <Sheet
      visible={visible}
      title={shown?.title ?? ""}
      onDismiss={onKeep}
      onModalHide={onModalHide}
    >
      {shown ? (
        <View style={styles.changeBody} testID="jersey-detail-club-change">
          <View accessible accessibilityLabel={shown.accessibilityLabel} style={styles.changeLists}>
            <ChangeList heading={shown.keptHeading} items={shown.kept} />
            {shown.reset.length > 0 ? (
              <ChangeList heading={shown.resetHeading} items={shown.reset} />
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button
              label={shown.confirmLabel}
              variant="primary"
              width="fill"
              onPress={onConfirm}
              testID="jersey-detail-club-change-confirm"
            />
            <Button
              label={shown.keepLabel}
              variant="tertiary"
              width="fill"
              onPress={onKeep}
              testID="jersey-detail-club-change-keep"
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function ChangeList({ heading, items }: { heading: string; items: readonly string[] }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.changeList}>
      <Text style={[typography.caption, { color: theme.contentSecondary }]}>{heading}</Text>
      <Text style={[typography.body, { color: theme.contentPrimary }]}>{items.join(" · ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  decades: {
    gap: space.gapSm,
    paddingBottom: space.gapSm,
  },
  seasonRow: {
    minHeight: SEASON_ROW_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetSm,
  },
  seasonLabel: {
    flex: 1,
  },
  changeBody: {
    gap: space.gapLg,
  },
  changeLists: {
    gap: space.gapMd,
  },
  changeList: {
    gap: 2,
  },
  actions: {
    gap: space.gapSm,
  },
});
