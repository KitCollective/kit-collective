import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  bindUnboundPhotosToDraft,
  createDraftFromUnbound,
  discardUnboundPhotos,
  JERSEY_PHOTO_CAP_HELPER_DA,
} from "@/capture/captureSession";
import {
  deleteConfirmCopy,
  draftPickerRows,
  leftBehindCount,
  selectedCaption,
  selectionBadge,
  toggleSelection,
  unassignedDock,
  unassignedExit,
} from "@/capture/unassignedPhotos";
import { usePersistedCaptureSession } from "@/capture/usePersistedCaptureSession";
import { ConfirmSheet } from "@/components/account-ui";
import { CaptureOverviewHeader } from "@/components/capture-overview-header";
import { CaptureOverviewRow } from "@/components/capture-overview-row";
import { Sheet } from "@/components/catalog-ui";
import { BUTTON_DOCK_FADE_SCROLL_PADDING, Button, ButtonDock } from "@/components/ui";
import { stickySize } from "@/prefs/stickySizeStore";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, type } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const COLUMNS = 2;
const HEADER_FALLBACK_HEIGHT = 44 + space.insetLg;
const FILL_BUTTON_HEIGHT = 48;
/** The fade dock's own scroll clearance covers one button; the other two add their height and gap. */
const EXTRA_DOCK_BUTTONS = 2 * (FILL_BUTTON_HEIGHT + space.gapMd);
const OUTLINE_WIDTH = 3;
const BADGE_SIZE = 28;
/** Share of the window the picker's list may take, so the Sheet's title and Annuller stay on screen. */
const PICKER_LIST_SHARE = 0.4;

/**
 * Fotos uden trøje (docs/design-system.md, Capture session, Revision 2026-10-09, item 5): the
 * photos a session holds without a jersey, sorted by hand. Pick photos in a two-column 4:5 grid,
 * then start a new jersey from them, add them to one that exists, or delete them.
 */
export default function UnassignedPhotosScreen() {
  const router = useRouter();
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { state, isSessionResolved, mutate } = usePersistedCaptureSession(sessionId);
  const [selection, setSelection] = useState<string[]>([]);
  const [leftBehind, setLeftBehind] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(insets.top + HEADER_FALLBACK_HEIGHT);

  // One way out, to the overview: the chevron, Android back and an empty grid all land here. The
  // guard keeps a press from racing the empty-grid exit into two navigations. `dismissTo` pops to
  // the overview when it is underneath and, when this screen was the landing, replaces this
  // screen with it (expo-router POP_TO), so both cases end on the overview.
  const exitedRef = useRef(false);
  const leave = useCallback(
    (target: "overview" | "collection") => {
      if (exitedRef.current) {
        return;
      }
      exitedRef.current = true;
      if (target === "overview" && sessionId) {
        router.dismissTo({ pathname: "/(capture)/overview", params: { sessionId } });
        return;
      }
      router.dismissTo("/(tabs)/collection");
    },
    [router, sessionId],
  );

  const exit = unassignedExit(state, isSessionResolved);
  useEffect(() => {
    if (exit) {
      leave(exit);
    }
  }, [exit, leave]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        leave("overview");
        return true;
      });
      return () => subscription.remove();
    }, [leave]),
  );

  if (!sessionId || !state) {
    return <View style={[styles.container, { backgroundColor: theme.canvas }]} />;
  }

  const photos = state.unboundUris;
  const pickerRows = draftPickerRows(state);
  const dock = unassignedDock(selection.length, pickerRows.length > 0);
  const cellWidth = (windowWidth - 2 * space.insetLg - (COLUMNS - 1) * space.gapMd) / COLUMNS;
  const cellHeight = (cellWidth * 5) / 4;
  const dockPadding =
    BUTTON_DOCK_FADE_SCROLL_PADDING + Math.max(insets.bottom, space.insetMd) + EXTRA_DOCK_BUTTONS;

  // The selection is spent by every action; what a full jersey could not take stays loose.
  const finishAction = (next: typeof state | null) => {
    setSelection([]);
    setLeftBehind(next ? leftBehindCount(selection, next) : 0);
  };

  const handleNewJersey = () => {
    finishAction(
      mutate((current) =>
        createDraftFromUnbound(current, selection, { defaultSize: stickySize.get() }),
      ),
    );
  };

  const handleAddToDraft = (draftId: string) => {
    setPickerOpen(false);
    finishAction(mutate((current) => bindUnboundPhotosToDraft(current, selection, draftId)));
  };

  const handleDelete = () => {
    setDeleteOpen(false);
    mutate((current) => discardUnboundPhotos(current, selection));
    finishAction(null);
  };

  const deleteCopy = deleteConfirmCopy(selection.length);

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + space.insetSm, paddingBottom: dockPadding },
        ]}
      >
        <View style={styles.grid}>
          {photos.map((uri, index) => {
            const badge = selectionBadge(selection, uri);
            return (
              <Pressable
                key={uri}
                accessibilityRole="button"
                accessibilityLabel={
                  badge ? `Foto ${index + 1}, valgt som nummer ${badge}` : `Foto ${index + 1}`
                }
                accessibilityState={{ selected: badge !== null }}
                testID={`unassigned-photo-${index}`}
                onPress={() => setSelection((current) => toggleSelection(current, uri))}
                style={{ width: cellWidth, height: cellHeight }}
              >
                <Image
                  source={{ uri }}
                  accessibilityIgnoresInvertColors
                  style={[styles.photo, { backgroundColor: theme.fillSecondary }]}
                />
                {badge ? (
                  <>
                    <View
                      pointerEvents="none"
                      style={[styles.outline, { borderColor: theme.fillPrimary }]}
                    />
                    <View
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={[styles.badge, { backgroundColor: theme.fillPrimary }]}
                    >
                      <Text style={[typography.captionSm, { color: theme.contentInverse }]}>
                        {badge}
                      </Text>
                    </View>
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <CaptureOverviewHeader
        title="Fotos uden trøje"
        caption="Vælg dem, der hører sammen"
        leading="back"
        testIDPrefix="unassigned"
        onClose={() => leave("overview")}
        onMeasure={setHeaderHeight}
      />

      <ButtonDock variant="fade">
        {leftBehind > 0 ? (
          <Text
            testID="unassigned-cap-helper"
            style={[typography.caption, { color: theme.contentMuted }]}
          >
            {JERSEY_PHOTO_CAP_HELPER_DA}
          </Text>
        ) : null}
        <Button
          label={dock.primary.label}
          testID="unassigned-new-jersey"
          variant="primary"
          width="fill"
          disabled={dock.primary.disabled}
          onPress={handleNewJersey}
        />
        <Button
          label={dock.addToDraft.label}
          testID="unassigned-add-to-draft"
          variant="secondary"
          width="fill"
          disabled={dock.addToDraft.disabled}
          onPress={() => setPickerOpen(true)}
        />
        <Button
          label={dock.discard.label}
          testID="unassigned-delete"
          variant="secondary"
          tone="danger"
          width="fill"
          disabled={dock.discard.disabled}
          onPress={() => setDeleteOpen(true)}
        />
      </ButtonDock>

      <Sheet
        visible={pickerOpen}
        title="Læg til en trøje"
        onDismiss={() => setPickerOpen(false)}
        hideChrome
      >
        <Text style={[typography.caption, { color: theme.contentSecondary }]}>
          {selectedCaption(selection.length)}
        </Text>
        <ScrollView
          style={{ maxHeight: windowHeight * PICKER_LIST_SHARE }}
          contentContainerStyle={styles.pickerList}
        >
          {pickerRows.map((entry, index) => (
            <CaptureOverviewRow
              key={entry.draftId}
              row={entry.row}
              testID={`unassigned-draft-${index}`}
              disabled={entry.full}
              onPress={() => handleAddToDraft(entry.draftId)}
            />
          ))}
        </ScrollView>
        <Button
          label="Annuller"
          variant="tertiary"
          width="fill"
          onPress={() => setPickerOpen(false)}
        />
      </Sheet>

      <ConfirmSheet
        visible={deleteOpen}
        title={deleteCopy.title}
        consequence={deleteCopy.consequence}
        confirmLabel={deleteCopy.confirmLabel}
        confirmTestID="unassigned-delete-confirm"
        onConfirm={handleDelete}
        onDismiss={() => setDeleteOpen(false)}
      />
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
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapMd,
  },
  photo: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
  },
  outline: {
    ...StyleSheet.absoluteFill,
    borderWidth: OUTLINE_WIDTH,
    borderRadius: radius.md,
  },
  badge: {
    position: "absolute",
    top: space.insetSm,
    left: space.insetSm,
    minWidth: BADGE_SIZE,
    height: Math.max(BADGE_SIZE, type.captionSm.lineHeight),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerList: {
    gap: space.gapMd,
  },
});
