import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  closeConfirmSheet,
  openConfirmSheet,
  shouldOpenSeasonAfterClubDismiss,
} from "../src/capture/confirmSheet";

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
  it("opens Data from an identity block and Detaljer from a quiet row, with no donut cards", () => {
    const confirm = readFileSync(confirmPath, "utf8");
    const layout = readFileSync(captureLayoutPath, "utf8");
    const dataScreen = readFileSync(dataScreenPath, "utf8");
    const detailsScreen = readFileSync(detailsScreenPath, "utf8");
    const drillHeader = readFileSync(drillHeaderPath, "utf8");
    const confirmExit = readFileSync(confirmExitPath, "utf8");
    const confirmPhotos = readFileSync(confirmPhotosPath, "utf8");
    const confirmVision = readFileSync(confirmVisionPath, "utf8");

    expect(confirm).toContain("ConfirmIdentityBlock");
    expect(confirm).toContain("ConfirmSizeCondition");
    expect(confirm).toContain('title="Badge og noter"');
    expect(confirm).toContain('meta="valgfrit"');
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
    // Grouping lives on the bulk overview now: Confirm carries no grouping wait chrome.
    expect(confirm).not.toContain("useConfirmGrouping");
    expect(confirm).not.toContain("grouping.");
    expect(confirm).not.toContain("visionSlotReserve");
    expect(confirm).not.toContain("GROUPING_ANALYZING_COPY");
    expect(confirm).not.toContain("analyzingMessage");
    expect(confirm).not.toContain("ConfirmVisionBanner");
    expect(confirm).not.toContain("resolveConfirmVisionBannerState");
    expect(confirm).not.toContain("loading={vision.fieldMarkInput.analyzing}");
    expect(confirm).toContain("onDiscardPhoto");
    // The Foto tile on the photo strip adds photos; there is no Upload tile on Confirm.
    expect(confirm).toContain("onAddPhoto");
    expect(confirm).not.toContain("onUpload");
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
    expect(confirm).toContain("onClose={exitToCollection}");
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
    expect(jerseyTabs).not.toContain("analyzing");
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
    expect(unboundRow).not.toContain("gatheringUris");
    expect(unboundRow).not.toContain("sandboxGather");
    expect(unboundRow).not.toContain("Grupperer fotoet");
    expect(unboundRow).not.toContain("thumbSkeleton");
    expect(unboundRow).not.toContain("travel=");
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
    // The grouping hook feeds the overview: per-group rule in the reducer, no Confirm reveal.
    for (const gone of [
      "GROUPING_TAB_STAGGER_MS",
      "GROUPING_GATHER_MS",
      "setGatheringUris",
      "setRollingUris",
      "setHomecoming",
      "setHiddenSandboxUris",
      "blocksIdentity",
      "pendingGrouping",
      "groupingDesignGap",
    ]) {
      expect(grouping).not.toContain(gone);
    }
    expect(grouping).toContain("applyGroupingSuggestion");
    expect(grouping).toContain("markGroupingSettled");
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
    expect(confirmVision).toContain("shouldSyncIdentityChrome");
    expect(confirmVision).toContain("raceWithTimeout");
    expect(confirmVision).toContain("identitySettledSnapshot");
    expect(confirmVision).not.toContain("setActiveDraft(current, next.id)");
    expect(confirmVision).not.toContain("startedIdentityKeysRef.current.delete");
    expect(confirmVision).not.toContain("Promise.all(");
    expect(confirmVision).toContain("groupingJustClosed");
    expect(confirmVision).not.toContain("fieldMarkInput");
    expect(confirmVision).not.toContain("markDataReviewed");
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
    expect(viewer).not.toContain("groupingStripUris");
    expect(viewer).not.toContain("groupingViewerRoles");
    expect(viewer).not.toContain("isGroupingWait");
    expect(viewer).not.toContain("ConfirmGroupingWait");
    expect(viewer).not.toContain("rollingUris");
    expect(viewer).not.toContain("homecoming");
    expect(viewer).toContain("photoUris[role] ?? role");

    // The grouping wait canvas is gone from Confirm (the overview replaced it).
    expect(existsSync(join(__dirname, "../src/components/confirm-grouping-wait.tsx"))).toBe(false);
    expect(existsSync(join(__dirname, "../src/capture/groupingReveal.ts"))).toBe(false);
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
    // Badge moved to the Detaljer drill (Revision 2026-10-09): Detaljer holds Badge and Noter only.
    expect(dataScreen).not.toContain("SwitchControl");
    expect(dataScreen).not.toContain("fetchSeasonPatches");
    expect(dataScreen).not.toContain("setDraftBadge");
    const badgeSection = readFileSync(
      join(__dirname, "../src/components/confirm-badge-section.tsx"),
      "utf8",
    );
    expect(badgeSection).toContain('accessibilityLabel="Badge"');
    expect(badgeSection).toContain("SwitchControl");
    expect(badgeSection).toContain("fetchSeasonPatches");
    expect(badgeSection).toContain("setDraftBadge");
    expect(dataScreen).not.toContain("dummyBadgesForSeason");
    expect(dataScreen).not.toContain("dummyCatalog");
    expect(dataScreen).not.toContain('label="Noter"');
    expect(dataScreen).not.toContain("Batch");

    expect(confirm).not.toContain('label="Noter"');
    expect(confirm).not.toContain("attachConfirmVisionFieldMarks");
    expect(confirm).toContain("hubSpacer");
    // No Data / Detaljer donut cards, fact capsules or equal-height pair.
    for (const gone of [
      "dataSectionFacts",
      "detailsSectionFacts",
      "sectionPair",
      "sectionMinHeight",
      "onMeasureHeight",
      "ConfirmProgressDonut",
      "groupHairline",
      "sectionGroup",
    ]) {
      expect(confirm).not.toContain(gone);
    }
    // The Vision slot keeps only the catalog-miss note.
    expect(confirm).toContain("ConfirmVisionSlot");

    // Viewer and sandbox share one tighter-gap wrapper (gapMd < the column's gapLg)
    // so the sandbox reads as attached to the viewer, not floating far below it.
    expect(confirm).toContain("photoStack");
    const photoStackBlock = confirm.slice(
      confirm.indexOf("photoStack:"),
      confirm.indexOf("},", confirm.indexOf("photoStack:")),
    );
    expect(photoStackBlock).toContain("gap: space.gapMd");

    // Top to bottom: photos, sandbox (conditional), identity, size and condition, spacer,
    // the quiet Badge og noter row just above Gem.
    const photoIdx = confirm.indexOf("<ConfirmPhotoViewer");
    const sandboxIdx = confirm.indexOf("<UnboundPhotosRow");
    const identityIdx = confirm.indexOf("<ConfirmIdentityBlock");
    const sizeIdx = confirm.indexOf("<ConfirmSizeCondition");
    const spacerIdx = confirm.indexOf("<View style={styles.hubSpacer}");
    const rowIdx = confirm.indexOf("<ConfirmSectionRow");
    expect(photoIdx).toBeGreaterThan(-1);
    expect(sandboxIdx).toBeGreaterThan(photoIdx);
    expect(identityIdx).toBeGreaterThan(sandboxIdx);
    expect(sizeIdx).toBeGreaterThan(identityIdx);
    expect(spacerIdx).toBeGreaterThan(sizeIdx);
    expect(rowIdx).toBeGreaterThan(spacerIdx);
    // The sandbox strip renders only while the session has photos without a jersey.
    expect(confirm).toContain("showSandbox");
    expect(confirm).toContain("uden trøje");

    expect(detailsScreen).toContain("ConfirmDrillHeader");
    expect(detailsScreen).toContain("handleCommitDrill");
    expect(detailsScreen).toContain('label="Gem"');
    expect(detailsScreen).not.toContain("dockHelper");
    expect(detailsScreen).not.toContain("saveEnabled");
    expect(detailsScreen).not.toContain("handleSave");
    // Size and condition moved to the hub; Detaljer holds only Badge and Noter.
    expect(detailsScreen).not.toContain("JERSEY_SIZES");
    expect(detailsScreen).not.toContain("JERSEY_CONDITIONS");
    expect(detailsScreen).toContain("ConfirmBadgeSection");
    expect(detailsScreen).not.toContain("ProfileSurfaceGroup");
    expect(detailsScreen).not.toContain("groupHairline");
    expect(detailsScreen).toContain('label="Noter"');
    expect(detailsScreen).toContain('meta="Valgfrit"');
    expect(detailsScreen).not.toContain('helper="Valgfrit');

    const sectionRow = readFileSync(
      join(__dirname, "../src/components/confirm-section-row.tsx"),
      "utf8",
    );
    expect(sectionRow).toContain("chevron-forward");
    expect(sectionRow).toContain("theme.borderSubtle");
    expect(sectionRow).toContain("borderRadius: radius.md");
    expect(sectionRow).toContain("minHeight: 44");
    for (const gone of ["facts", "mangler", "onMeasureHeight", "Donut", "theme.success"]) {
      expect(sectionRow).not.toContain(gone);
    }
    expect(existsSync(join(__dirname, "../src/components/confirm-progress-donut.tsx"))).toBe(false);
    expect(existsSync(join(__dirname, "../src/components/confirm-vision-banner.tsx"))).toBe(false);
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
