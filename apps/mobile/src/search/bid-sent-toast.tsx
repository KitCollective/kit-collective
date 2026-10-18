import { StyleSheet, Text, View } from "react-native";
import Toast, { type ToastConfig, type ToastConfigParams } from "react-native-toast-message";
import { bidSentToastMessage } from "@/search/bid-rules";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const BID_SENT_TOAST_TYPE = "bidSent";

/**
 * Non-danger Toast body of "Dit bud er sendt til handle" (docs/design-system.md → Foreign UserJersey
 * detail → After sending). Same chrome as the danger Toast (`fill.secondary`, `radius.md`, one
 * `type.body` line in `content.primary`, the same whisper shadow) without the danger border, the
 * icon or the action. The lock has no success Toast variant; flagged in the issue report.
 */
function BidSentToast({ text1 }: ToastConfigParams<undefined>) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      accessibilityRole="alert"
      testID="bid-sent-toast"
      style={[
        styles.card,
        { backgroundColor: theme.fillSecondary, shadowColor: theme.contentPrimary },
      ]}
    >
      <Text
        style={[typography.body, styles.message, { color: theme.contentPrimary }]}
        numberOfLines={2}
      >
        {text1}
      </Text>
    </View>
  );
}

/** Config for the `<Toast>` host the foreign UserJersey detail mounts. */
export const bidSentToastConfig: ToastConfig = {
  [BID_SENT_TOAST_TYPE]: (params) => <BidSentToast {...params} />,
};

/** Fire-and-forget: the bid is already sent. */
export function showBidSentToast(handle: string): void {
  Toast.show({
    type: BID_SENT_TOAST_TYPE,
    position: "bottom",
    text1: bidSentToastMessage(handle),
  });
}

const styles = StyleSheet.create({
  card: {
    width: "90%",
    borderRadius: radius.md,
    padding: space.insetMd,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  message: {
    flex: 1,
  },
});
