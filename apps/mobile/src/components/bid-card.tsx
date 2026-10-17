import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import type { BidCardState } from "@/inbox/thread-view-model";
import { useBrandFontsEnabled, useTypography } from "@/theme/brand-fonts";
import { fontFamily, radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** docs/design-system.md → Bid card, Revision 2026-10-10. */
const BID_CARD_WIDTH = 290;
const JERSEY_THUMB_WIDTH = 40;
const JERSEY_THUMB_HEIGHT = 50;
/** `mono` 28 / 500 is a lock size outside the type scale (Typography → Bid amount entry). */
const BID_CARD_AMOUNT_SIZE = 28;
/** The lock gives no line height for the 28 amount; the 28 step of the scale (display) sets 34. */
const BID_CARD_AMOUNT_LINE_HEIGHT = 34;
/** **kr** in `mono` 15: no 15 step in the mono scale (design gap). */
const BID_CARD_UNIT_SIZE = 15;
/** Club and season in `label` 15 / 600: the type scale has no 15 step and no 600 Plex face (design gap). */
const JERSEY_TITLE_SIZE = 15;
const STATUS_ICON_SIZE = 16;

type BidCardProps = {
  card: BidCardState;
  /** testID suffix: the Bud's message id. */
  messageId: string;
  /** The jersey thumb, already resolved to a full URL; null shows the empty slot. */
  thumbUri: string | null;
  imageHeaders?: Record<string, string>;
  responding?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onNavigate: (href: string) => void;
};

export function BidCard({
  card,
  messageId,
  thumbUri,
  imageHeaders,
  responding = false,
  onAccept,
  onDecline,
  onNavigate,
}: BidCardProps) {
  const theme = useTheme();
  const typography = useTypography();
  const brandFontsEnabled = useBrandFontsEnabled();
  const jersey = card.jersey;
  const jerseyHref = jersey?.href ?? null;
  const sendNewBidHref = card.sendNewBidHref;

  const jerseyRowContent = jersey ? (
    <>
      <View style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri, headers: imageHeaders }}
            style={styles.thumbImage}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <View style={styles.jerseyText}>
        <Text
          style={[typography.label, { fontSize: JERSEY_TITLE_SIZE, color: theme.contentPrimary }]}
          numberOfLines={1}
        >
          {jersey.title}
        </Text>
        <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
          {jersey.meta}
        </Text>
        {jersey.unavailableLabel ? (
          <Text
            testID={`bid-card-unavailable-${messageId}`}
            style={[typography.caption, { color: theme.contentSecondary }]}
          >
            {jersey.unavailableLabel}
          </Text>
        ) : null}
      </View>
      {jerseyHref ? (
        <Ionicons
          name="chevron-forward"
          size={STATUS_ICON_SIZE}
          color={theme.contentMuted}
          accessibilityElementsHidden
        />
      ) : null}
    </>
  ) : null;

  const jerseyRowStyle = [styles.jerseyRow, { borderBottomColor: theme.borderSubtle }];

  return (
    <View
      testID="bid-card"
      style={[
        styles.card,
        {
          alignSelf: card.align === "end" ? "flex-end" : "flex-start",
          backgroundColor: theme.surface,
          borderColor: theme.borderSubtle,
        },
      ]}
    >
      {jersey && jerseyHref ? (
        <Pressable
          testID={`bid-card-jersey-${messageId}`}
          accessibilityRole="button"
          accessibilityLabel={card.accessibility.jerseyRow ?? undefined}
          onPress={() => onNavigate(jerseyHref)}
          style={({ pressed }) => [...jerseyRowStyle, pressed && styles.pressed]}
        >
          {jerseyRowContent}
        </Pressable>
      ) : jersey ? (
        <View testID={`bid-card-jersey-${messageId}`} style={jerseyRowStyle}>
          {jerseyRowContent}
        </View>
      ) : null}

      <View accessible accessibilityLabel={card.accessibility.card} style={styles.body}>
        <Text style={[typography.labelSm, { color: theme.contentSecondary }]}>{card.whoLine}</Text>
        <View style={styles.amountRow}>
          <Text
            style={[
              typography.mono,
              styles.amount,
              {
                color: theme.contentPrimary,
                fontFamily: brandFontsEnabled ? fontFamily.monoMedium : typography.mono.fontFamily,
              },
            ]}
          >
            {card.amount}
          </Text>
          <Text style={[typography.mono, styles.unit, { color: theme.contentSecondary }]}>kr</Text>
        </View>
        {card.status ? (
          <View testID={`bid-card-status-${card.status.kind}`} style={styles.statusRow}>
            {card.status.kind === "accepted" ? (
              <Ionicons
                name="checkmark-circle"
                size={STATUS_ICON_SIZE}
                color={theme.contentPrimary}
                accessibilityElementsHidden
              />
            ) : null}
            <Text
              style={[
                typography.labelSm,
                {
                  color:
                    card.status.kind === "accepted" ? theme.contentPrimary : theme.contentSecondary,
                },
              ]}
            >
              {card.status.label}
            </Text>
          </View>
        ) : null}
      </View>

      {card.actions === "answer" ? (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              testID={`bid-card-accept-${messageId}`}
              label="Accepter"
              accessibilityLabel={card.accessibility.accept}
              variant="primary"
              width="fill"
              loading={responding}
              disabled={responding}
              onPress={onAccept}
            />
          </View>
          <View style={styles.action}>
            <Button
              testID={`bid-card-decline-${messageId}`}
              label="Afvis"
              accessibilityLabel={card.accessibility.decline}
              variant="secondary"
              width="fill"
              loading={responding}
              disabled={responding}
              onPress={onDecline}
            />
          </View>
        </View>
      ) : null}

      {sendNewBidHref ? (
        <Button
          testID={`bid-card-send-new-bid-${messageId}`}
          label="Send nyt bud"
          accessibilityLabel={card.accessibility.sendNewBid}
          variant="secondary"
          width="fill"
          onPress={() => onNavigate(sendNewBidHref)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: BID_CARD_WIDTH,
    marginHorizontal: space.insetMd,
    padding: space.insetMd,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: space.gapMd,
  },
  jerseyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingBottom: space.gapMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  thumb: {
    width: JERSEY_THUMB_WIDTH,
    height: JERSEY_THUMB_HEIGHT,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  jerseyText: {
    flex: 1,
  },
  body: {
    gap: space.gapSm,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.gapSm,
  },
  amount: {
    fontSize: BID_CARD_AMOUNT_SIZE,
    lineHeight: BID_CARD_AMOUNT_LINE_HEIGHT,
  },
  unit: {
    fontSize: BID_CARD_UNIT_SIZE,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  actions: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  action: {
    flex: 1,
  },
});
