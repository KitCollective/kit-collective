import { StyleSheet, Text, View } from "react-native";
import { collectionFactsNumeralStyle } from "@/collection/collection-facts-style";
import type { CollectionFacts } from "@/collection/collection-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CollectionFactsBlockProps = {
  /** `null` while the collection is empty: nothing renders. */
  facts: CollectionFacts | null;
};

// An en dash is allowed in `numeral` (docs/design-system.md → Numerals) and stands in when
// no season label has a start year.
const NO_YEAR = "–";

/**
 * Three facts about the collection between two hairlines (docs/design-system.md → Collection
 * grid, Revision 2026-10-10). Only digits are set in `numeral`; the labels are `caption`.
 */
export function CollectionFactsBlock({ facts }: CollectionFactsBlockProps) {
  const theme = useTheme();
  const typography = useTypography();

  if (!facts) {
    return null;
  }

  const columns = [
    { key: "jerseys", value: String(facts.jerseyCount), label: "Trøjer" },
    { key: "clubs", value: String(facts.clubCount), label: "Klubber" },
    {
      key: "oldest",
      value: facts.oldestSeasonYear === null ? NO_YEAR : String(facts.oldestSeasonYear),
      label: "Ældste sæson",
    },
  ];

  return (
    <View
      testID="collection-facts"
      style={[
        styles.block,
        { borderTopColor: theme.borderSubtle, borderBottomColor: theme.borderSubtle },
      ]}
    >
      {columns.map((column) => (
        <View
          key={column.key}
          accessible
          accessibilityLabel={`${column.label}: ${column.value}`}
          style={styles.column}
        >
          <Text
            style={[
              collectionFactsNumeralStyle(typography.numeral40),
              { color: theme.contentPrimary },
            ]}
          >
            {column.value}
          </Text>
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>
            {column.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: "row",
    marginHorizontal: space.insetMd,
    marginBottom: space.insetSm,
    paddingVertical: space.insetMd,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  column: {
    flex: 1,
    gap: space.gapSm,
  },
});
