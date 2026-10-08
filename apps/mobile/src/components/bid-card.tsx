import type { CollectionConversationMessage } from "@kit/api-contract";
import { StyleSheet, Text, View } from "react-native";
import { bidCardAmountTypography } from "@/components/bid-card-amount";
import { Button } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type BidCardProps = {
  message: CollectionConversationMessage;
  peerHandle: string;
  jerseyContext?: {
    clubLabel: string;
    seasonLabel: string;
    typeLabel: string;
  };
  incomingPending?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  responding?: boolean;
};

function bidStatusLabel(status: NonNullable<CollectionConversationMessage["bidStatus"]>): string {
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

export function BidCard({
  message,
  peerHandle,
  jerseyContext,
  incomingPending = false,
  onAccept,
  onDecline,
  responding = false,
}: BidCardProps) {
  const theme = useTheme();
  const typography = useTypography();

  if (message.kind !== "bid" || !message.bidAmountDkk) {
    return null;
  }

  const contextLine = jerseyContext
    ? `${jerseyContext.clubLabel} · ${jerseyContext.seasonLabel} · ${jerseyContext.typeLabel}`
    : undefined;
  const body = contextLine
    ? `${peerHandle} bød på din ${contextLine}.`
    : `${peerHandle} sendte et bud.`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderSubtle,
          borderRadius: radius.md,
        },
      ]}
      accessibilityLabel={`${body} ${message.bidAmountDkk} kroner, ${message.bidStatus ? bidStatusLabel(message.bidStatus) : "Afventer"}`}
    >
      <Text style={[typography.body, { color: theme.contentPrimary }]}>{body}</Text>
      <Text style={[typography.mono, styles.amount, { color: theme.contentPrimary }]}>
        {message.bidAmountDkk} kr
      </Text>
      {message.bidStatus ? (
        <Text style={[typography.mono, { color: theme.contentMuted }]}>
          {bidStatusLabel(message.bidStatus)}
        </Text>
      ) : null}
      {incomingPending && message.bidStatus === "pending" ? (
        <View style={styles.actions}>
          <Button
            label="Accepter"
            variant="primary"
            width="fill"
            loading={responding}
            disabled={responding}
            onPress={onAccept}
          />
          <Button
            label="Afvis"
            variant="secondary"
            width="fill"
            loading={responding}
            disabled={responding}
            onPress={onDecline}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.insetMd,
    marginBottom: space.gapMd,
    padding: space.insetMd,
    borderWidth: 1,
    gap: space.gapSm,
    alignSelf: "flex-start",
    maxWidth: 320,
  },
  amount: bidCardAmountTypography(),
  actions: {
    flexDirection: "row",
    gap: space.gapSm,
    marginTop: space.gapSm,
    minHeight: 44,
  },
});
