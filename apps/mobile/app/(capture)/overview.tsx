import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  firstUnsavedDraftId,
  inboxRow,
  overviewCaption,
  overviewDock,
  overviewProgress,
  overviewRows,
  overviewTitle,
  pendingSkeletonRows,
  unsavedDraftCount,
} from "@/capture/captureOverview";
import {
  addJerseyDraft,
  markOverviewSession,
  setActiveDraft,
  switchSingleToBulkBind,
} from "@/capture/captureSession";
import { leaveOverviewSession, unparkSessionById } from "@/capture/parkedSession";
import { useConfirmExit } from "@/capture/use-confirm-exit";
import { useConfirmGrouping } from "@/capture/use-confirm-grouping";
import { usePersistedCaptureSession } from "@/capture/usePersistedCaptureSession";
import { CaptureOverviewHeader } from "@/components/capture-overview-header";
import { CaptureOverviewRow, CaptureOverviewSkeletonRow } from "@/components/capture-overview-row";
import { SessionSummaryRow } from "@/components/session-summary-row";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { stickySize } from "@/prefs/stickySizeStore";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const PROGRESS_HEIGHT = space.insetSm / 2;
const PILE_THUMB_WIDTH = space.insetLg;
const PILE_THUMB_HEIGHT = (PILE_THUMB_WIDTH * 5) / 4;
const PILE_THUMBS_MAX = 8;
/** The fade dock's own scroll clearance covers one button; the second one adds its height and gap. */
const SECOND_DOCK_BUTTON = 44 + space.gapSm;
const HEADER_FALLBACK_HEIGHT = 44 + space.insetLg;

/**
 * The bulk overview (docs/design-system.md, Capture session, Revision 2026-10-09, items 3 and 4):
 * four or more photos with Vision on land here before Confirm. It fills up as grouping runs, then
 * lists the jerseys that need a check first and the saved ones last.
 */
export default function CaptureOverviewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { accessToken } = useAuth();
  const { state, isSessionResolved, mutate, refresh } = usePersistedCaptureSession(sessionId);
  const grouping = useConfirmGrouping({ accessToken, sessionId, state, mutate, reduceMotion });
  const [headerHeight, setHeaderHeight] = useState(insets.top + HEADER_FALLBACK_HEIGHT);

  // Back from Confirm: pick up the jerseys saved there.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // This session is the overview's from here on, and no longer parked while it is open.
  const claimedRef = useRef(false);
  useEffect(() => {
    if (!sessionId || !state || claimedRef.current) {
      return;
    }
    claimedRef.current = true;
    mutate((current) => markOverviewSession(current));
    unparkSessionById(sessionId);
  }, [mutate, sessionId, state]);

  // Every way out ends in the same exit: Luk, the parked tertiary button, Android back, and
  // any other removal of this screen. It parks the session, or clears it when nothing is left.
  const leaveSession = useCallback(() => {
    if (sessionId) {
      leaveOverviewSession(sessionId);
    }
  }, [sessionId]);
  const exitToCollection = useConfirmExit(sessionId, state, isSessionResolved, leaveSession);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        exitToCollection();
        return true;
      });
      return () => subscription.remove();
    }, [exitToCollection]),
  );

  useEffect(
    () => navigation.addListener("beforeRemove", () => leaveSession()),
    [leaveSession, navigation],
  );

  if (!sessionId || !state) {
    return <View style={[styles.container, { backgroundColor: theme.canvas }]} />;
  }

  const analyzing = grouping.analyzing;
  const rows = overviewRows(state);
  const unsavedCount = unsavedDraftCount(state);
  const unboundCount = state.unboundUris.length;
  const totalPhotos = state.orderedUris.length;
  const skeletons = pendingSkeletonRows({ analyzing, unboundCount });
  const inbox = analyzing ? null : inboxRow(state);
  const firstUnsaved = rows.find((row) => row.kind === "draft") ?? null;
  const visionFailed = grouping.failed && rows.length === 0 && !analyzing;
  const dock = overviewDock({
    analyzing,
    failed: visionFailed,
    unsavedCount,
    firstTitle: firstUnsaved?.title ?? null,
  });

  const openConfirm = (draftId: string | null) => {
    mutate((current) => {
      let next = current;
      if (draftId && current.drafts.some((draft) => draft.id === draftId)) {
        next = setActiveDraft(next, draftId);
      } else if (!current.drafts.some((draft) => draft.id === current.activeDraftId)) {
        // Every jersey is saved: the loose photos still need a draft to land on.
        next = addJerseyDraft(switchSingleToBulkBind(next), { defaultSize: stickySize.get() });
      }
      return next;
    });
    router.push({ pathname: "/(capture)/confirm", params: { sessionId } });
  };

  const handlePrimary = () => {
    if (visionFailed) {
      grouping.retry();
      return;
    }
    if (!analyzing && unsavedCount === 0) {
      exitToCollection();
      return;
    }
    openConfirm(firstUnsavedDraftId(state));
  };

  const handleTertiary = () => {
    if (analyzing) {
      grouping.stop();
      openConfirm(firstUnsavedDraftId(state));
      return;
    }
    if (visionFailed) {
      openConfirm(null);
      return;
    }
    exitToCollection();
  };

  const dockPadding =
    BUTTON_DOCK_FADE_SCROLL_PADDING +
    Math.max(insets.bottom, space.insetMd) +
    (dock.tertiary ? SECOND_DOCK_BUTTON : 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + space.insetSm, paddingBottom: dockPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {analyzing ? (
          <View
            testID="overview-progress"
            accessibilityRole="progressbar"
            accessibilityLabel="Sorterer fotos"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(overviewProgress({ totalPhotos, unboundCount }) * 100),
            }}
            style={styles.progressBlock}
          >
            <View style={[styles.progressTrack, { backgroundColor: theme.fillSecondary }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.fillPrimary,
                    width: `${overviewProgress({ totalPhotos, unboundCount }) * 100}%`,
                  },
                ]}
              />
            </View>
            {unboundCount > 0 ? (
              <View style={styles.pile}>
                {state.unboundUris.slice(0, PILE_THUMBS_MAX).map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    accessibilityIgnoresInvertColors
                    style={[styles.pileThumb, { backgroundColor: theme.fillSecondary }]}
                  />
                ))}
                <Text style={[typography.monoSm, { color: theme.contentSecondary }]}>
                  {unboundCount}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {inbox ? (
          <SessionSummaryRow
            testID="overview-inbox"
            thumbUris={inbox.thumbUris}
            title={inbox.label}
            pillLabel={inbox.pill}
            onPress={() => openConfirm(firstUnsavedDraftId(state))}
          />
        ) : null}

        {rows.map((row, index) => (
          <CaptureOverviewRow
            key={`${row.kind}-${row.draftId}`}
            row={row}
            testID={`overview-row-${index}`}
            onPress={() => openConfirm(row.draftId)}
          />
        ))}

        {Array.from({ length: skeletons }, (_, index) => (
          <CaptureOverviewSkeletonRow
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size placeholder rows
            key={`skeleton-${index}`}
            testID={`overview-skeleton-${index}`}
          />
        ))}
      </ScrollView>

      <CaptureOverviewHeader
        title={overviewTitle({ analyzing, totalPhotos, jerseyCount: rows.length })}
        caption={overviewCaption({
          analyzing,
          failed: grouping.failed,
          totalPhotos,
          jerseyCount: rows.length,
        })}
        onClose={exitToCollection}
        onMeasure={setHeaderHeight}
      />

      <ButtonDock variant="fade">
        <Button
          label={dock.primary.label}
          testID="overview-primary"
          variant="primary"
          width="fill"
          disabled={dock.primary.disabled}
          onPress={handlePrimary}
        />
        {dock.tertiary ? (
          <Button
            label={dock.tertiary}
            testID="overview-tertiary"
            variant="tertiary"
            width="fill"
            onPress={handleTertiary}
          />
        ) : null}
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.insetLg,
    gap: space.gapMd,
  },
  progressBlock: {
    gap: space.gapMd,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: PROGRESS_HEIGHT,
    borderRadius: radius.pill,
  },
  pile: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm / 2,
  },
  pileThumb: {
    width: PILE_THUMB_WIDTH,
    height: PILE_THUMB_HEIGHT,
    borderRadius: radius.xs,
  },
});
