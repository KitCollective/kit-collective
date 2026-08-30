import { Ionicons } from "@expo/vector-icons";
import type { CollectionActivityItem } from "@kit/api-contract";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { bidCardAmountTypography } from "@/components/bid-card-amount";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ActivityCardProps = {
  item: CollectionActivityItem;
  onPress: () => void;
};

function activityStatusLabel(status: CollectionActivityItem["status"]): string {
  switch (status) {
    case "pending":
      return "Afventer";
    case "accepted":
      return "Accepteret";
    case "declined":
      return "Afvist";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function ActivityCard({ item, onPress }: ActivityCardProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.amountDkk} kroner, ${activityStatusLabel(item.status)}, fra ${item.fromHandle}${item.unread ? ", ulæst" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: item.unread ? theme.fillSecondary : theme.surface,
          borderColor: theme.borderSubtle,
          borderRadius: radius.md,
          opacity: pressed ? 0.92 : 1,
        },
        !item.unread && styles.readCard,
      ]}
    >
      <View style={styles.content}>
        <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[typography.mono, { color: theme.contentMuted }]} numberOfLines={1}>
          {item.kitLine}
        </Text>
        <Text style={[typography.mono, styles.amount, { color: theme.contentPrimary }]}>
          {item.amountDkk} kr
        </Text>
        <Text style={[typography.mono, { color: theme.contentMuted }]}>
          {activityStatusLabel(item.status)}
        </Text>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          fra {item.fromHandle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.contentMuted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.insetMd,
    marginBottom: space.gapMd,
    padding: space.insetMd,
    gap: space.gapSm,
    minHeight: 44,
  },
  readCard: {
    borderWidth: 1,
  },
  content: {
    flex: 1,
    gap: space.gapSm,
  },
  amount: bidCardAmountTypography(),
});
