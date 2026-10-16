import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BiddingFetchError, fetchPeerJersey, sendBid } from "@/api/bidding";
import { resolvePhotoUrl } from "@/api/collection";
import { useAuth } from "@/auth/AuthProvider";
import { Button, IconButton } from "@/components/ui";
import { sendBidButtonLabel, sendBidDockBottomPadding } from "@/search/send-bid-layout";
import { useBrandFontsEnabled, useTypography } from "@/theme/brand-fonts";
import { fontFamily, radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SendBidScreen() {
  const { jerseyId } = useLocalSearchParams<{ jerseyId: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const brandFontsEnabled = useBrandFontsEnabled();
  const amountInputRef = useRef<TextInput>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [peerJersey, setPeerJersey] = useState<Awaited<ReturnType<typeof fetchPeerJersey>> | null>(
    null,
  );

  const loadPeerJersey = useCallback(async () => {
    if (!accessToken || !jerseyId) {
      return;
    }

    const response = await fetchPeerJersey(accessToken, jerseyId);
    setPeerJersey(response);
  }, [accessToken, jerseyId]);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        await loadPeerJersey();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [loadPeerJersey]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // The number pad opens on arrival (Send bid lock), but not through the focus-on-mount prop: on iOS
  // Fabric that makes the field first responder before the sibling InputAccessoryView attaches,
  // and the pad then opens without Færdig. Focusing after the loaded screen has committed lets
  // the accessory attach first.
  const formReady = !loading && peerJersey !== null;
  useEffect(() => {
    if (!formReady) {
      return;
    }
    const frame = requestAnimationFrame(() => amountInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [formReady]);

  const parsedAmount = Number.parseInt(amount, 10);
  const canSubmit = Number.isInteger(parsedAmount) && parsedAmount >= 1 && !submitting;

  const handleSendBid = async () => {
    if (!accessToken || !jerseyId || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await sendBid(accessToken, jerseyId, { amountDkk: parsedAmount });
      router.back();
    } catch (caught) {
      if (caught instanceof BiddingFetchError) {
        setError("Buddet kunne ikke sendes. Tjek at trøjen stadig er åben for bud.");
      } else {
        setError("Buddet kunne ikke sendes.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <ActivityIndicator color={theme.fillPrimary} />
      </View>
    );
  }

  if (!peerJersey) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.canvas }]}>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>Trøjen findes ikke</Text>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }

  const primaryPhoto = peerJersey.photos[0];
  const summaryTitle = `${peerJersey.clubLabel} ${peerJersey.seasonLabel}`;
  const amountWidth = Math.max(amount.length, 1) * AMOUNT_CHAR_WIDTH;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.canvas }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.insetSm }]}>
        <IconButton name="Tilbage" icon="arrow-back" onPress={() => router.back()} />
        <Text style={[typography.title, { color: theme.contentPrimary }]}>Send bud</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.summary}>
          <View style={[styles.thumb, { backgroundColor: theme.fillSecondary }]}>
            {primaryPhoto ? (
              <Image
                source={{
                  uri: resolvePhotoUrl(primaryPhoto.photoUrl),
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                }}
                style={styles.thumbImage}
                resizeMode="cover"
                accessibilityLabel={`${peerJersey.clubLabel} forside`}
              />
            ) : null}
          </View>
          <View style={styles.summaryText}>
            <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={1}>
              {summaryTitle}
            </Text>
            <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
              {KIT_TYPE_LABELS_DA[peerJersey.type]}
            </Text>
            <Text style={[typography.caption, { color: theme.contentSecondary }]} numberOfLines={1}>
              {peerJersey.ownerHandle}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.amountBlock}
          accessible={false}
          onPress={() => amountInputRef.current?.focus()}
        >
          <Text style={[typography.caption, { color: theme.contentSecondary }]}>Dit bud</Text>
          <View style={styles.amountRow}>
            <TextInput
              ref={amountInputRef}
              accessibilityLabel="Dit bud i kroner"
              testID="bid-amount"
              keyboardType="number-pad"
              returnKeyType="done"
              inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_ACCESSORY_ID : undefined}
              onSubmitEditing={Keyboard.dismiss}
              value={amount}
              onChangeText={(text) => setAmount(text.replace(/\D/g, ""))}
              placeholder="0"
              placeholderTextColor={theme.contentMuted}
              style={[
                typography.mono,
                styles.amountInput,
                {
                  width: amountWidth,
                  color: theme.contentPrimary,
                  fontFamily: brandFontsEnabled
                    ? fontFamily.monoMedium
                    : typography.mono.fontFamily,
                },
              ]}
            />
            <Text style={[typography.mono, styles.amountUnit, { color: theme.contentSecondary }]}>
              kr
            </Text>
          </View>
          <View style={[styles.amountUnderline, { backgroundColor: theme.fillPrimary }]} />
        </Pressable>
      </ScrollView>
      <View
        style={[
          styles.dock,
          {
            paddingBottom: sendBidDockBottomPadding(keyboardVisible, insets.bottom),
            borderTopColor: theme.borderSubtle,
            backgroundColor: theme.canvas,
          },
        ]}
      >
        {error ? (
          <Text style={[typography.body, { color: theme.danger }]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>
          {peerJersey.ownerHandle} får dit bud i Indbakke. Det er ikke et køb.
        </Text>
        <Button
          label={sendBidButtonLabel(amount)}
          testID="bid-submit"
          width="fill"
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void handleSendBid()}
        />
      </View>
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
          <View
            style={[
              styles.accessory,
              { backgroundColor: theme.canvas, borderTopColor: theme.borderSubtle },
            ]}
          >
            <Button
              label="Færdig"
              variant="tertiary"
              testID="bid-keyboard-done"
              onPress={Keyboard.dismiss}
            />
          </View>
        </InputAccessoryView>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const KEYBOARD_ACCESSORY_ID = "bid-keyboard-accessory";

/** Advance of one digit in `mono` 56 (IBM Plex Mono is 0.6em wide), so the amount stays centred. */
const AMOUNT_CHAR_WIDTH = 34;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
  },
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.insetMd,
    gap: space.gapLg,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
  },
  thumb: {
    width: 56,
    height: 70,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  summaryText: {
    flex: 1,
  },
  amountBlock: {
    alignItems: "center",
    gap: space.gapSm,
    paddingTop: space.insetLg,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: space.gapSm,
  },
  amountInput: {
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1.68,
    textAlign: "right",
    padding: 0,
  },
  amountUnit: {
    fontSize: 20,
    lineHeight: 24,
  },
  amountUnderline: {
    alignSelf: "stretch",
    height: 2,
  },
  dock: {
    borderTopWidth: 1,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
  accessory: {
    alignItems: "flex-end",
    borderTopWidth: 1,
    paddingHorizontal: space.insetSm,
  },
});
