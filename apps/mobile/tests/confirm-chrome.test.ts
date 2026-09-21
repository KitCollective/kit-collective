import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  closeConfirmSheet,
  openConfirmSheet,
  shouldOpenSeasonAfterClubDismiss,
} from "../src/capture/confirmSheet";
import {
  SANDBOX_GATHER_STAGGER_MS,
  SANDBOX_THUMB_STEP,
  sandboxGatherDelayMs,
  sandboxGatherTranslateX,
} from "../src/capture/sandboxGather";

const confirmPath = join(__dirname, "../app/(capture)/confirm.tsx");
const dataScreenPath = join(__dirname, "../src/components/confirm-data-screen.tsx");
const detailsScreenPath = join(__dirname, "../src/components/confirm-details-screen.tsx");
const drillHeaderPath = join(__dirname, "../src/components/confirm-drill-header.tsx");
const hubHeaderPath = join(__dirname, "../src/components/confirm-hub-header.tsx");
const confirmExitPath = join(__dirname, "../src/capture/use-confirm-exit.ts");
const confirmPhotosPath = join(__dirname, "../src/capture/use-confirm-photos.ts");
const confirmVisionPath = join(__dirname, "../src/capture/use-confirm-vision.ts");
const confirmGroupingPath = join(__dirname, "../src/capture/use-confirm-grouping.ts");
const jerseyTabBarPath = join(__dirname, "../src/components/bulk/JerseyTabBar.tsx");
const captureLayoutPath = join(__dirname, "../app/(capture)/_layout.tsx");
const pickerModalPath = join(__dirname, "../src/components/catalog-picker-modal.tsx");

describe("confirmSheet", () => {
  it("allows only one picker sheet kind at a time", () => {
    expect(openConfirmSheet("club", "season")).toBe("season");
    expect(closeConfirmSheet("season", "season")).toBeNull();
    expect(closeConfirmSheet("club", "season")).toBe("club");
  });

  it("opens season only after the club sheet dismisses", () => {
    expect(shouldOpenSeasonAfterClubDismiss(true, "club")).toBe(true);
    expect(shouldOpenSeasonAfterClubDismiss(true, "season")).toBe(false);
    expect(shouldOpenSeasonAfterClubDismiss(false, "club")).toBe(false);
  });
});

describe("Confirm chrome", () => {
  it("opens Data and Detaljer as stack drills with donut rows, not inline cards", () => {
    const confirm = readFileSync(confirmPath, "utf8");
    const layout = readFileSync(captureLayoutPath, "utf8");
    const dataScreen = readFileSync(dataScreenPath, "utf8");
    const detailsScreen = readFileSync(detailsScreenPath, "utf8");
    const drillHeader = readFileSync(drillHeaderPath, "utf8");
    const confirmExit = readFileSync(confirmExitPath, "utf8");
    const confirmPhotos = readFileSync(confirmPhotosPath, "utf8");
    const confirmVision = readFileSync(confirmVisionPath, "utf8");

    expect(confirm).toContain('title="Data"');
    expect(confirm).toContain('title="Detaljer"');
    expect(confirm).toContain("ConfirmSectionRow");
    expect(confirm).toContain("confirm-data");
    expect(confirm).toContain("confirm-details");
    expect(confirm).not.toContain("Identitet");
    expect(confirm).not.toContain("Tilstand");
    expect(confirm).not.toMatch(/Stamdata\s*\|/);
    expect(confirm).not.toMatch(/stepper|TabView/i);
    expect(confirm).toContain("saveEnabled");
    expect(confirm).toContain("ConfirmHubHeader");
    expect(confirm).not.toContain("Bekræft og gem");
    expect(confirm).not.toContain("Vælg klub, sæson og detaljer.");
    expect(confirm).toContain("JerseyTabBar");
    expect(confirm).toContain("ConfirmPhotoViewer");
    expect(confirm).toContain("UnboundPhotosRow");
    expect(confirm).toContain("deferIdentity: shouldHoldIdentityForGrouping");
    expect(confirm).toContain("groupingInFlight: grouping.blocksIdentity");
    expect(confirm).not.toContain("GROUPING_ANALYZING_COPY");
    expect(confirm).not.toContain("analyzingMessage");
    expect(confirm).toContain("analyzing={grouping.blocksIdentity}");
    expect(confirm).toContain("grouping.blocksIdentity");
    expect(confirm).toContain("homecoming={grouping.homecoming}");
    expect(confirm).not.toContain("visionSlotReserve");
    expect(confirm).not.toContain("ConfirmVisionBanner");
    expect(confirm).toContain("loading={vision.fieldMarkInput.analyzing}");
    expect(confirm).toContain("onDiscardPhoto");
    expect(confirm).toContain("onUpload");
    expect(confirmPhotos).toContain("pickUploadFiles");
    expect(confirm).not.toContain("Flere trøjer i denne upload");

    const hubHeader = readFileSync(hubHeaderPath, "utf8");
    expect(hubHeader).toContain("Bekræft");
    expect(hubHeader).not.toContain("Bekræft og gem");
    expect(hubHeader).toContain("FadeScrim");
    expect(hubHeader).toContain('edge="top"');
    expect(hubHeader).toContain("FADE_SCRIM_HEIGHT");
    // Top-left circular Luk (X) chrome button dismisses the capture modal.
    expect(hubHeader).toContain('accessibilityLabel="Luk"');
    expect(hubHeader).toContain('name="close"');
    expect(hubHeader).toContain("onClose");
    expect(hubHeader).toContain("radius.pill");
    expect(hubHeader).toContain("withAlpha(theme.contentPrimary, 0.06)");

    // The hub wires Luk to a single guarded exit: one `dismissTo` pops the whole
    // (capture) modal back to Samling, and an `exitedRef` guard makes the Luk press and
    // the redirect-away effect idempotent so exit can never double-hop.
    expect(confirm).toContain("ConfirmHubHeader onClose={exitToCollection}");
    expect(confirm).toContain("exitToCollection");
    expect(confirmExit).toContain("exitedRef");
    expect(confirmExit).toContain("router.dismissTo(COLLECTION_ROUTE)");
    // No replace-to-collection exit anymore (replace stacked a fresh tabs screen on the
    // closing modal — the double hop).
    expect(confirm).not.toContain('router.replace("/(tabs)/collection")');

    const jerseyTabs = readFileSync(jerseyTabBarPath, "utf8");
    expect(jerseyTabs).toContain('accessibilityLabel="Tilføj trøje"');
    expect(jerseyTabs).toContain('name="add"');
    expect(jerseyTabs).not.toContain("+ trøje");
    expect(jerseyTabs).not.toMatch(/Trøje \$\{index \+ 1\}/);
    expect(jerseyTabs.indexOf("drafts.map")).toBeLessThan(
      jerseyTabs.indexOf('accessibilityLabel="Tilføj trøje"'),
    );
    expect(jerseyTabs.indexOf('accessibilityLabel="Tilføj trøje"')).toBeLessThan(
      jerseyTabs.indexOf("</Animated.ScrollView>"),
    );
    expect(jerseyTabs).not.toContain("flex: 1");
    expect(jerseyTabs).toContain("radius.pill");
    expect(jerseyTabs).toContain("theme.fillSecondary");
    expect(jerseyTabs).not.toContain("theme.danger");
    expect(jerseyTabs).not.toContain("theme.warning");
    expect(jerseyTabs).toContain("Keyframe");
    expect(jerseyTabs).toContain("LinearTransition");
    expect(jerseyTabs).toContain("scale: 0.95");
    expect(jerseyTabs).toContain("scale: 0.97");
    expect(jerseyTabs).toContain("Easing.bezier(0.4, 0, 0.2, 1)");
    expect(jerseyTabs).toContain("useReduceMotion");
    expect(jerseyTabs).toContain("motion.slow");
    expect(jerseyTabs).not.toContain("motion.fast");
    expect(jerseyTabs).toContain('key="add-jersey"');
    expect(jerseyTabs).toContain("analyzing");
    expect(jerseyTabs).toContain("jerseyTabPillX");
    expect(jerseyTabs).toContain("JERSEY_TAB_STEP");
    expect(jerseyTabs).toContain("withTiming");
    expect(jerseyTabs).toContain("translateX");
    expect(jerseyTabs).toContain("inverseRow");
    expect(jerseyTabs).toContain("-pillX.get()");
    expect(jerseyTabs).toContain('overflow: "hidden"');
    expect(jerseyTabs).not.toContain("grouping-skeleton-");
    expect(jerseyTabs).not.toContain("ConfirmAnalyzingPulse");
    expect(jerseyTabs).toContain("paddingTop: BADGE_OUTSET");
    expect(jerseyTabs).toContain("top: -BADGE_OUTSET");
    expect(jerseyTabs).not.toContain("theme.info");
    expect(jerseyTabs).not.toContain("theme.success");

    const unboundRow = readFileSync(
      join(__dirname, "../src/components/bulk/UnboundPhotosRow.tsx"),
      "utf8",
    );
    expect(unboundRow).toContain('name="close-circle"');
    expect(unboundRow).toContain("theme.danger");
    expect(unboundRow).toContain("Fjern foto");
    expect(unboundRow).not.toMatch(/>Fjern</);
    expect(unboundRow).toContain("top: 0");
    expect(unboundRow).toContain("right: 0");
    expect(unboundRow).not.toContain("paddingTop:");
    expect(unboundRow).not.toContain("paddingRight:");
    expect(unboundRow).toContain("Upload");
    expect(unboundRow).toContain("onDiscardPhoto");
    expect(unboundRow).toContain("onUpload");
    expect(unboundRow).not.toContain("ConfirmPhotoSlotAnchor");
    expect(unboundRow).not.toContain("Tryk og hold");
    expect(unboundRow).not.toContain("confirm-photo-recategorize");
    expect(unboundRow).toContain("FadeOut");
    expect(unboundRow).toContain("LinearTransition");
    expect(unboundRow).toContain("useReduceMotion");
    expect(unboundRow).toContain("motion.slow");
    expect(unboundRow).not.toContain("motion.fast");
    expect(unboundRow).toContain("gatheringUris");
    expect(unboundRow).toContain("sandboxGatherTranslateX");
    expect(unboundRow).toContain("@/capture/sandboxGather");
    expect(unboundRow).toContain("withTiming");
    expect(unboundRow).toContain("withTiming(0.95");
    expect(unboundRow).toContain("analyzing");
    expect(unboundRow).toContain("ConfirmAnalyzingPulse");
    expect(unboundRow).toContain("Grupperer fotoet");
    expect(unboundRow).not.toContain("thumbSkeleton");
    expect(unboundRow).toContain("withAlpha(theme.canvas, 0.6)");
    expect(unboundRow).not.toContain("travel=");
    expect(unboundRow).toContain("SANDBOX_GATHER_LIFT");
    expect(unboundRow).toContain("sandboxGatherDelayMs");
    expect(unboundRow).not.toContain("theme.info");

    const analyzingPulse = readFileSync(
      join(__dirname, "../src/components/confirm-analyzing-pulse.tsx"),
      "utf8",
    );
    expect(analyzingPulse).toContain('pointerEvents="none"');
    expect(analyzingPulse).toContain("withRepeat");
    expect(analyzingPulse).toContain("useReduceMotion");
    expect(analyzingPulse).toContain("ANALYZING_PULSE_MS = motion.slow * 5");
    expect(analyzingPulse).toContain("Easing.bezier(0.4, 0, 0.6, 1)");
    expect(analyzingPulse).toContain("SKELETON_BONE_ALPHA = 0.18");
    expect(analyzingPulse).toContain("REST_OPACITY = 1");
    expect(analyzingPulse).toContain("MID_OPACITY = 0.55");
    expect(analyzingPulse).not.toContain("translateX");
    expect(analyzingPulse).not.toContain("ANALYZING_SHIMMER_MS");

    const grouping = readFileSync(confirmGroupingPath, "utf8");
    expect(grouping).not.toContain("GROUPING_ANALYZING_COPY");
    expect(grouping).toContain("GROUPING_TAB_STAGGER_MS = motion.slow");
    expect(grouping).toContain("GROUPING_GATHER_MS = motion.slow + motion.base");
    expect(grouping).toContain("GROUPING_FIRST_ROLL_MS = motion.slow");
    expect(grouping).toContain("setRollingUris(gatherUris.slice(0, 1))");
    expect(grouping).toContain("GROUPING_SLOT_ROLL_MS = motion.slow");
    expect(grouping).toContain("gatherUris.slice(0, shown + 1)");
    expect(grouping).toContain("for (let shown = 1; shown < gatherUris.length");
    const shownLoop = grouping.indexOf("for (let shown = 1; shown < gatherUris.length");
    const bindAfterHold = grouping.indexOf("revealSlice([...prior, { photoIds }], groupIndex)");
    expect(shownLoop).toBeGreaterThan(-1);
    expect(bindAfterHold).toBeGreaterThan(shownLoop);
    expect(grouping.slice(shownLoop, bindAfterHold)).not.toContain("revealSlice");
    expect(grouping).toContain("GROUPING_SLOT_POP_MS = motion.slow");
    expect(grouping).toContain("GROUPING_SLOT_HOLD_MS = motion.slow + motion.base");
    expect(grouping).toContain("GROUPING_REVEAL_SETTLE_MS = motion.base");
    expect(grouping).toContain("GROUPING_RETURN_MS = motion.slow");
    expect(grouping).toContain("setHomecoming");
    expect(grouping).toContain("activateGroup");
    expect(grouping).toContain("const first = current.drafts[0]");
    expect(grouping).toContain("setGatheringUris");
    expect(grouping).not.toContain("photoIds.slice(0, photoIndex + 1)");
    expect(confirm).toContain("gatheringUris={grouping.gatheringUris}");
    expect(confirm).toContain("hiddenSandboxUris");
    expect(grouping).toContain("setHiddenSandboxUris");
    expect(confirm).toContain("rollingUris={grouping.rollingUris}");
    expect(grouping).toContain("setAnalyzing(true)");
    expect(grouping).toContain("blocksIdentity");
    expect(grouping).toContain("applyFillOrderToDraft");
    expect(grouping).toContain("if (!accessToken || !sessionId)");
    expect(grouping).toContain("ensureSessionPhotoIds");
    expect(grouping).toContain("buildGroupingSuggestRequest");
    expect(grouping).toContain("Promise.allSettled");
    expect(grouping).toContain("closeGroupingRun");
    expect(grouping).toContain('applyGroupingClose("timeout"');
    expect(grouping).not.toContain("confirm.grouping");
    expect(grouping).toContain("shouldBeginGroupingStart");
    expect(confirmVision).toContain("deferIdentity");
    expect(confirmVision).toContain("shouldAttemptIdentityQueue");
    expect(confirmVision).toContain("nextQueuedIdentityDraft");
    expect(confirmVision).toContain("identityLoopActiveRef");
    expect(confirmVision).toContain("identityKickAgainRef");
    expect(confirmVision).toContain("launchIdentityLoop");
    expect(confirmVision).not.toContain("skipNewDrafts");
    expect(confirm).toContain("shouldHoldIdentityForGrouping");
    expect(confirmVision).toContain("shouldSyncIdentityChrome");
    expect(confirmVision).toContain("raceWithTimeout");
    expect(confirmVision).toContain("identitySettledSnapshot");
    expect(confirmVision).not.toContain("setActiveDraft(current, next.id)");
    expect(confirmVision).not.toContain("startedIdentityKeysRef.current.delete");
    expect(confirmVision).not.toContain("Promise.all(");
    expect(confirmVision).toContain("groupingJustClosed");
    expect(confirmVision).toContain("fieldMarkInput");
    expect(confirmVision).toContain("markDataReviewed");
    expect(confirmVision).not.toContain(
      "setIdentitySnapshot({ fieldPreselect: {}, suggestions: null, catalogMiss: false })",
    );
    expect(confirmVision).toContain("VISION_TIMEOUT_MS = 45_000");
    expect(confirmVision).toContain("await applySuggestions(job, inFlightDraftId)");
    expect(confirmVision).not.toContain("await applySuggestions(job);");

    expect(confirm).not.toContain("ConfirmPhotoRecategorize");
    expect(confirm).not.toContain("applyConfirmPhotoOccupancy");
    expect(confirm).not.toContain("photoDragging");

    const viewer = readFileSync(
      join(__dirname, "../src/components/confirm-photo-viewer.tsx"),
      "utf8",
    );
    const photoSlot = readFileSync(join(__dirname, "../src/components/photo-slot.tsx"), "utf8");
    expect(viewer).toContain("ScrollView");
    expect(viewer).not.toContain("borderWidth");
    expect(viewer).toContain("analyzing");
    expect(viewer).toContain("groupingStripUris");
    expect(viewer).toContain("groupingViewerRoles");
    expect(viewer).toContain("isGroupingWait");
    expect(viewer).toContain("ConfirmGroupingWait");
    expect(viewer).toContain("rollingUris");
    expect(viewer).toContain('labelPlacement={analyzing ? "none" : "overlay"}');
    expect(viewer).toContain("homecoming");
    expect(viewer).toContain("slotUris[role] ?? role");
    expect(viewer).not.toContain("analyzing ? (slotUris[role] ?? role) : role");

    const groupingWait = readFileSync(
      join(__dirname, "../src/components/confirm-grouping-wait.tsx"),
      "utf8",
    );
    expect(groupingWait).toContain("Forsøger at gruppere dine trøjer");
    expect(groupingWait).toContain("Du kan starte grupperingen selv");
    expect(groupingWait).toContain("CONFIRM_VIEWER_WIDTH");
    expect(groupingWait).toContain("(CONFIRM_VIEWER_WIDTH * 5) / 4");
    expect(groupingWait).toContain("GROUPING_WAIT_CYCLE_MS = motion.slow * 5");
    expect(groupingWait).toContain("translateY");
    expect(groupingWait).not.toContain("theme.info");
    expect(photoSlot).toContain("ConfirmAnalyzingPulse");
    expect(photoSlot).not.toContain("skeletonStack");
    expect(photoSlot).toContain("SKELETON_BONE_ALPHA");
    expect(photoSlot).toContain("withAlpha(theme.fillPrimary, SKELETON_BONE_ALPHA)");
    expect(photoSlot).not.toContain("travel=");
    expect(photoSlot).toContain("theme.surface");
    expect(photoSlot).toContain("SLOT_FADE_ENTERING");
    expect(photoSlot).toContain("SLOT_ROLL_ENTERING");
    expect(photoSlot).toContain("FadeOut");
    expect(photoSlot).not.toContain("scale: 0.95");
    expect(photoSlot).toContain("motion.slow");
    expect(photoSlot).not.toContain("theme.info");

    expect(layout).toContain('name="confirm-data"');
    expect(layout).toContain('name="confirm-details"');

    expect(drillHeader).toContain('icon="chevron-back"');
    expect(dataScreen).toContain("ConfirmDrillHeader");
    expect(dataScreen).toContain("handleCommitDrill");
    expect(dataScreen).toContain('label="Gem"');
    expect(dataScreen).not.toContain("dockHelper");
    expect(dataScreen).not.toContain("saveEnabled");
    expect(dataScreen).not.toContain("handleSave");
    expect(dataScreen).toContain("KIT_TYPES");
    expect(dataScreen).toContain("Vælg spiller");
    expect(dataScreen).toContain("Vælg sæson");
    expect(dataScreen).toContain('accessibilityLabel="Badge"');
    expect(dataScreen).toContain("SwitchControl");
    expect(dataScreen).not.toContain("dummyBadgesForSeason");
    expect(dataScreen).not.toContain("dummyCatalog");
    expect(dataScreen).not.toContain('label="Noter"');
    expect(dataScreen).not.toContain("Batch");

    expect(confirm).not.toContain('label="Noter"');
    expect(confirm).toContain("dataSectionFacts");
    expect(confirm).toContain("attachConfirmVisionFieldMarks");
    expect(confirm).toContain("detailsSectionFacts");
    expect(confirm).toContain("sectionPair");
    expect(confirm).toContain("hubSpacer");
    // The standalone Vision skeleton was folded into the AI Vision Analyzer banner,
    // which owns the Vision slot under the sandbox.
    expect(confirm).toContain("ConfirmVisionSlot");
    expect(confirm).not.toContain("resolveConfirmVisionBannerState");
    expect(confirm).not.toContain("groupHairline");
    // The Data/Detaljer rows are no longer wrapped in outer boxes — the row owns its border.
    expect(confirm).not.toContain("sectionGroup");

    // Bottom-anchored, full-width stacked pair — not two side-by-side columns.
    const sectionPairBlock = confirm.slice(
      confirm.indexOf("sectionPair:"),
      confirm.indexOf("},", confirm.indexOf("sectionPair:")),
    );
    expect(sectionPairBlock).toContain('flexDirection: "column"');
    expect(sectionPairBlock).not.toContain('flexDirection: "row"');
    expect(sectionPairBlock).not.toContain('alignItems: "stretch"');
    expect(confirm).toContain("flexGrow: 1");

    // Equal-height pair: both rows share one measured minHeight (taller Data wins).
    expect(confirm).toContain("sectionMinHeight");
    expect(confirm).toContain("Math.max(dataSectionHeight, detailsSectionHeight)");
    expect(confirm).toContain("onMeasureHeight={setDataSectionHeight}");
    expect(confirm).toContain("onMeasureHeight={setDetailsSectionHeight}");
    expect(confirm).toContain("minHeight={sectionMinHeight}");

    // Viewer and sandbox share one tighter-gap wrapper (gapMd < the column's gapLg)
    // so the sandbox reads as attached to the viewer, not floating far below it.
    expect(confirm).toContain("photoStack");
    const photoStackBlock = confirm.slice(
      confirm.indexOf("photoStack:"),
      confirm.indexOf("},", confirm.indexOf("photoStack:")),
    );
    expect(photoStackBlock).toContain("gap: space.gapMd");

    const photoIdx = confirm.indexOf("ConfirmPhotoViewer");
    const sandboxIdx = confirm.indexOf("<UnboundPhotosRow");
    const spacerIdx = confirm.indexOf("hubSpacer");
    const pairIdx = confirm.indexOf("sectionPair");
    const dataIdx = confirm.indexOf('title="Data"');
    expect(photoIdx).toBeGreaterThan(-1);
    expect(sandboxIdx).toBeGreaterThan(photoIdx);
    expect(spacerIdx).toBeGreaterThan(sandboxIdx);
    expect(pairIdx).toBeGreaterThan(spacerIdx);
    expect(dataIdx).toBeGreaterThan(pairIdx);

    expect(detailsScreen).toContain("ConfirmDrillHeader");
    expect(detailsScreen).toContain("handleCommitDrill");
    expect(detailsScreen).toContain('label="Gem"');
    expect(detailsScreen).not.toContain("dockHelper");
    expect(detailsScreen).not.toContain("saveEnabled");
    expect(detailsScreen).not.toContain("handleSave");
    expect(detailsScreen).toContain("JERSEY_SIZES");
    expect(detailsScreen).toContain("JERSEY_CONDITIONS");
    expect(detailsScreen).not.toContain("ProfileSurfaceGroup");
    expect(detailsScreen).not.toContain("groupHairline");
    expect(detailsScreen).toContain('label="Noter"');
    expect(detailsScreen).toContain('meta="Valgfrit"');
    expect(detailsScreen).not.toContain('helper="Valgfrit');

    const sectionRow = readFileSync(
      join(__dirname, "../src/components/confirm-section-row.tsx"),
      "utf8",
    );
    expect(sectionRow).toContain("facts");
    expect(sectionRow).toContain('borderStyle: "dashed"');
    expect(sectionRow).toContain("mangler");
    expect(sectionRow).toContain("paddingHorizontal: space.insetMd");
    expect(sectionRow).toContain("paddingVertical: space.insetMd");
    expect(sectionRow).toContain("flex: 1");
    expect(sectionRow).not.toContain("sectionGroup");
    expect(sectionRow).not.toContain("groupHairline");
    // The row is now the bordered card itself and equalises height as a matched pair.
    expect(sectionRow).toContain("theme.surface");
    expect(sectionRow).toContain("theme.borderSubtle");
    expect(sectionRow).toContain("borderRadius: radius.md");
    expect(sectionRow).toContain('alignItems: "center"');
    expect(sectionRow).toContain("minHeight");
    expect(sectionRow).toContain("onMeasureHeight");
    expect(sectionRow).toContain("eye-outline");
    expect(sectionRow).toContain("visionMark");
    expect(sectionRow).toContain("ConfirmAnalyzingPulse");
    expect(sectionRow).toContain("DATA_SKELETON_WIDTHS");
    expect(sectionRow).toContain("analyserer");
    expect(sectionRow).not.toContain("theme.success");
    expect(sectionRow).not.toContain("theme.info");

    const donut = readFileSync(
      join(__dirname, "../src/components/confirm-progress-donut.tsx"),
      "utf8",
    );
    expect(donut).toContain("{filled}/{required}");
    expect(donut).toContain("typography.monoSm");
    expect(donut).toContain("theme.warning");
    expect(donut).toContain("theme.fillPrimary");
    expect(donut).not.toContain("theme.success");
  });

  it("opens club, season, and player as one full-screen picker at a time, not a Sheet", () => {
    const dataScreen = readFileSync(dataScreenPath, "utf8");
    const pickerModal = readFileSync(pickerModalPath, "utf8");

    expect(dataScreen).toContain("ClubPickerOverlay");
    expect(dataScreen).toContain("SeasonPickerOverlay");
    expect(dataScreen).toContain("PlayerPickerOverlay");
    expect(dataScreen).toContain("CatalogSelectRow");
    expect(dataScreen).toContain("useState<DataPickerKind | null>");
    expect(dataScreen).toContain("fetchClubSeasons");
    expect(dataScreen).not.toContain("<Sheet");
    expect(dataScreen).not.toContain("pendingSeasonAfterClub");

    expect(pickerModal).toContain('presentationStyle="fullScreen"');
    expect(pickerModal).toContain('name="Luk"');
    expect(pickerModal).toContain('icon="close"');
    expect(pickerModal).toContain("SearchField");
  });

  it("gathers sandbox thumbs toward the first photo of the jersey", () => {
    const uris = ["a", "b", "c"];
    expect(sandboxGatherTranslateX(uris, ["b", "c"], "b")).toBe(0);
    expect(sandboxGatherTranslateX(uris, ["b", "c"], "c")).toBe(-SANDBOX_THUMB_STEP);
    expect(sandboxGatherTranslateX(uris, ["b", "c"], "a")).toBe(0);
    expect(sandboxGatherDelayMs(0)).toBe(0);
    expect(sandboxGatherDelayMs(2)).toBe(SANDBOX_GATHER_STAGGER_MS * 2);
  });

  it("keeps player print off the main confirm column", () => {
    const confirm = readFileSync(confirmPath, "utf8");
    const mainColumn = confirm.slice(
      confirm.indexOf("<ScrollView"),
      confirm.indexOf("</ScrollView>"),
    );

    expect(mainColumn).not.toMatch(/Spiller-print|nameset|playerPrint/i);
    expect(mainColumn).not.toContain("Spiller");
  });
});
