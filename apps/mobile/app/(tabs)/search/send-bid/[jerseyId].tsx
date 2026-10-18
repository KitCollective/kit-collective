import { type Href, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
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
import { Banner } from "@/components/catalog-ui";
import { Button, IconButton } from "@/components/ui";
import { normalizeBidAmountInput, sendBidButton } from "@/search/bid-rules";
import { rememberBidSent } from "@/search/bid-sent-handoff";
import {
  sitsAboveForeignJersey,
  sitsDirectlyAboveForeignJerseyOf,
} from "@/search/foreign-jersey-route";
import { sendBidDockBottomPadding } from "@/search/send-bid-layout";
import { sendBidExit } from "@/search/send-bid-return";
import { buildSendBidSummary } from "@/search/send-bid-summary";
import { useBrandFontsEnabled, useTypography } from "@/theme/brand-fonts";
import { fontFamily, radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export default function SendBidScreen() {
  const { jerseyId, returnTo } = useLocalSearchParams<{
    jerseyId: string;
    returnTo?: string | string[];
  }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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

  // Above the foreign detail on iOS the Tab bar is hidden (full-screen modal), so the dock adds no
  // Tab bar inset. On Android the Material bar stays (Tab bar → Hide behavior).
  const [tabBarShown] = useState(() => {
    if (Platform.OS !== "ios") {
      return true;
    }
    const state = navigation.getState();
    if (!state) {
      return true;
    }
    return !sitsAboveForeignJersey(
      state.routes.map((candidate) => candidate.name),
      state.index,
    );
  });

  // The detail of this jersey is what back returns to. From an Indbakke thread (Send nyt bud) it
  // is not, and the Toast must not wait for a later visit to the detail.
  const [landsOnJerseyDetail] = useState(() => {
    const state = navigation.getState();
    return (
      !!state && !!jerseyId && sitsDirectlyAboveForeignJerseyOf(state.routes, state.index, jerseyId)
    );
  });

  const parsedAmount = Number.parseInt(amount, 10);
  const submitButton = sendBidButton(amount);
  const canSubmit = !submitButton.disabled && !submitting;

  const handleSendBid = async () => {
    if (!accessToken || !jerseyId || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await sendBid(accessToken, jerseyId, { amountDkk: parsedAmount });
      const exit = sendBidExit(returnTo);
      if (exit.kind === "back") {
        // The detail under this screen shows the Toast once, when it regains focus.
        if (peerJersey && landsOnJerseyDetail) {
          rememberBidSent(jerseyId, peerJersey.ownerHandle);
        }
        router.back();
      } else {
        // Send nyt bud: pop Send bud off the Søg stack, then show the thread it was tapped in. The
        // thread has no detail waiting for the Toast, so nothing is remembered.
        router.back();
        router.navigate(exit.href as Href);
      }
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
  const summary = buildSendBidSummary(peerJersey);
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
      {error ? (
        <View style={styles.banner}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}
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
              {summary.title}
            </Text>
            <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
              {summary.facts}
            </Text>
            <Text style={[typography.caption, { color: theme.contentSecondary }]} numberOfLines={1}>
              {summary.byline}
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
              onChangeText={(text) => setAmount(normalizeBidAmountInput(text))}
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
            paddingBottom: sendBidDockBottomPadding(keyboardVisible, insets.bottom, tabBarShown),
            borderTopColor: theme.borderSubtle,
            backgroundColor: theme.canvas,
          },
        ]}
      >
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>
          {peerJersey.ownerHandle} får dit bud i Indbakke. Det er ikke et køb.
        </Text>
        <Button
          label={submitButton.label}
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
    alignItems: "flex-start",
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
  },
  banner: {
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
