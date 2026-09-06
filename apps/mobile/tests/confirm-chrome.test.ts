import { readFileSync } from "node:fs";
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
      jerseyTabs.indexOf("</ScrollView>"),
    );
    expect(jerseyTabs).not.toContain("flex: 1");
    expect(jerseyTabs).toContain("radius.pill");
    expect(jerseyTabs).toContain("theme.fillSecondary");
    expect(jerseyTabs).not.toContain("theme.danger");
    expect(jerseyTabs).not.toContain("theme.warning");

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

    expect(confirm).not.toContain("ConfirmPhotoRecategorize");
    expect(confirm).not.toContain("applyConfirmPhotoOccupancy");
    expect(confirm).not.toContain("photoDragging");

    const viewer = readFileSync(
      join(__dirname, "../src/components/confirm-photo-viewer.tsx"),
      "utf8",
    );
    expect(viewer).toContain("ScrollView");
    expect(viewer).not.toContain("borderWidth");

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
    expect(dataScreen).toContain("dummyBadgesForSeason");
    expect(dataScreen).not.toContain('label="Noter"');
    expect(dataScreen).not.toContain("Batch");

    expect(confirm).not.toContain('label="Noter"');
    expect(confirm).toContain("dataSectionFacts");
    expect(confirm).toContain("detailsSectionFacts");
    expect(confirm).toContain("sectionPair");
    expect(confirm).toContain("hubSpacer");
    // The standalone Vision skeleton was folded into the AI Vision Analyzer banner,
    // which owns the Vision slot under the sandbox.
    expect(confirm).toContain("ConfirmVisionSlot");
    expect(confirmVision).toContain("resolveConfirmVisionBannerState");
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
    const visionBannerIdx = confirm.indexOf("<ConfirmVisionSlot");
    const spacerIdx = confirm.indexOf("hubSpacer");
    const pairIdx = confirm.indexOf("sectionPair");
    const dataIdx = confirm.indexOf('title="Data"');
    expect(photoIdx).toBeGreaterThan(-1);
    expect(sandboxIdx).toBeGreaterThan(photoIdx);
    // Vision banner reads as "we analysed these photos": under the sandbox, above the spacer.
    expect(visionBannerIdx).toBeGreaterThan(sandboxIdx);
    expect(spacerIdx).toBeGreaterThan(visionBannerIdx);
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
