import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { collectionFactsNumeralStyle } from "@/collection/collection-facts-style";
import { NumberEmblem } from "@/components/number-emblem";
import { SwitchControl } from "@/components/profile-ui";
import type {
  BidRowView,
  FactRowView,
  PlayerRowView,
  SettingRowView,
} from "@/jersey-detail/jersey-detail-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const BID_ROW_HEIGHT = 48;
const INITIAL_DISC = 26;
const DISC_OVERLAP = 8;
const ROW_MIN_HEIGHT = 56;
/** The lock sets the bid text in label 15 (500); the type scale has no 15 step (design gap). */
const BID_TEXT_FONT_SIZE = 15;

type TitleBlockProps = {
  caption: string;
  title: string;
  season: string;
};

/**
 * Caption line, then the club in display 32 with the season in numeral 44 on the same baseline.
 *
 * Nothing here can clip, whatever the Dynamic Type size: the line wraps, so when the club and the
 * season do not fit side by side the season drops to its own line instead of squeezing the club;
 * the club has no line limit (it grows downwards) and the season may shrink to the column width,
 * where a Text wraps rather than clips. The numeral keeps the taller line box
 * `collectionFactsNumeralStyle` gives it, so the digit tops are not cut either.
 */
export function JerseyTitleBlock({ caption, title, season }: TitleBlockProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={styles.titleBlock} testID="jersey-detail-title">
      <Text style={[typography.caption, { color: theme.contentSecondary }]}>{caption}</Text>
      <View
        style={styles.titleLine}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}, ${season}`}
      >
        <Text style={[typography.displayLarge, styles.titleText, { color: theme.contentPrimary }]}>
          {title}
        </Text>
        <Text
          style={[
            collectionFactsNumeralStyle(typography.numeral44),
            styles.season,
            { color: theme.contentPrimary },
          ]}
        >
          {season}
        </Text>
      </View>
    </View>
  );
}

type JerseyBidRowProps = {
  row: BidRowView;
  onPress: () => void;
};

/**
 * Quiet bid row: reads like an Indbakke thread, not an alert. No amount, no fill.primary, no
 * count disc.
 */
export function JerseyBidRow({ row, onPress }: JerseyBidRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint={row.accessibilityHint}
      onPress={onPress}
      testID="jersey-detail-bid-row"
      style={({ pressed }) => [
        styles.bidRow,
        { backgroundColor: theme.fillSecondary, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View style={styles.discs} accessibilityElementsHidden>
        {row.initials.map((initial, index) => (
          <View
            key={row.initials.slice(0, index + 1).join("-")}
            style={[
              styles.disc,
              {
                backgroundColor: theme.surface,
                borderColor: theme.fillSecondary,
                marginLeft: index === 0 ? 0 : -DISC_OVERLAP,
              },
            ]}
          >
            <Text style={[typography.captionSm, { color: theme.contentPrimary }]}>{initial}</Text>
          </View>
        ))}
      </View>
      <Text
        style={[
          typography.label,
          styles.bidText,
          { fontSize: BID_TEXT_FONT_SIZE, color: theme.contentPrimary },
        ]}
        numberOfLines={1}
      >
        {row.text}
      </Text>
      {row.time ? (
        <Text style={[typography.mono, { color: theme.contentMuted }]}>{row.time}</Text>
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.contentMuted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

/** Player row. No chevron: a chevron on a row that does nothing would lie. */
export function JerseyPlayerRow({ row }: { row: PlayerRowView }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      accessible
      accessibilityLabel={row.accessibilityLabel}
      testID="jersey-detail-player-row"
      style={[styles.playerRow, { backgroundColor: theme.fillSecondary }]}
    >
      {row.kind === "player" ? (
        // A player without a shirt number has no emblem in the lock: empty tile (design gap).
        <NumberEmblem size="lg" state="rest" number={row.number ?? undefined} />
      ) : (
        <NumberEmblem size="lg" state="add" />
      )}
      <View style={styles.rowBody}>
        {row.kind === "player" ? (
          <>
            <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={2}>
              {row.name}
            </Text>
            <Text style={[typography.caption, { color: theme.contentSecondary }]}>
              {row.caption}
            </Text>
          </>
        ) : (
          <Text style={[typography.label, { color: theme.contentPrimary }]}>{row.title}</Text>
        )}
      </View>
    </View>
  );
}

/** Label-left / value-right List row. No chevron: the row does nothing when pressed. */
export function JerseyFactRow({ row, hairline }: { row: FactRowView; hairline: boolean }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      accessible
      accessibilityLabel={row.accessibilityLabel}
      testID={`jersey-detail-fact-${row.key}`}
      style={[
        styles.factRow,
        hairline && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.borderSubtle,
        },
      ]}
    >
      <Text style={[typography.body, { color: theme.contentSecondary }]}>{row.label}</Text>
      <Text
        style={[
          typography.label,
          styles.factValue,
          { color: row.muted ? theme.contentMuted : theme.contentPrimary },
        ]}
      >
        {row.value}
      </Text>
    </View>
  );
}

type JerseySwitchRowProps = {
  row: SettingRowView;
  onValueChange: (next: boolean) => void;
  testID?: string;
};

/** List row with a trailing Switch and one helper line. The row is the hit target. */
export function JerseySwitchRow({ row, onValueChange, testID }: JerseySwitchRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={row.accessibilityLabel}
      accessibilityState={{ checked: row.checked, disabled: row.disabled }}
      disabled={row.disabled}
      onPress={() => onValueChange(!row.checked)}
      testID={testID}
      style={({ pressed }) => [
        styles.switchRow,
        { opacity: row.disabled ? 0.4 : pressed ? 0.9 : 1 },
      ]}
    >
      <View style={styles.rowBody}>
        <Text style={[typography.body, { color: theme.contentPrimary }]}>{row.label}</Text>
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>{row.helper}</Text>
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <SwitchControl
          value={row.checked}
          disabled={row.disabled}
          onValueChange={onValueChange}
          accessibilityLabel={row.label}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    gap: space.gapSm,
  },
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space.gapMd,
    rowGap: space.gapSm,
  },
  titleText: {
    flexShrink: 1,
  },
  season: {
    flexShrink: 1,
  },
  bidRow: {
    minHeight: BID_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
  },
  discs: {
    flexDirection: "row",
    alignItems: "center",
  },
  disc: {
    width: INITIAL_DISC,
    height: INITIAL_DISC,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bidText: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    borderRadius: radius.md,
    padding: space.insetMd,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  factRow: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapMd,
    paddingVertical: space.insetSm,
  },
  factValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  switchRow: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingVertical: space.insetSm,
  },
});
