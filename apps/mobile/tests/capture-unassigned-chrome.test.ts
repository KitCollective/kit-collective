import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(join(__dirname, path), "utf8");

describe("photos without a jersey wiring", () => {
  const screen = read("../app/(capture)/unassigned.tsx");
  const layout = read("../app/(capture)/_layout.tsx");
  const overview = read("../app/(capture)/overview.tsx");
  const landing = read("../src/capture/use-capture-landing.ts");

  it("registers the route in the capture stack without a native header and with a fade under reduced motion", () => {
    expect(layout).toMatch(
      /name="unassigned"\s+options=\{\{ headerShown: false, animation: stackScreenMotion\(reduceMotion\) \}\}/,
    );
  });

  it("opens from the overview's inbox row instead of Confirm", () => {
    const inbox = overview.slice(overview.indexOf('testID="overview-inbox"'));
    const onPress = inbox.slice(0, inbox.indexOf("/>"));
    expect(onPress).toContain('pathname: "/(capture)/unassigned"');
    expect(onPress).not.toContain("openConfirm");
  });

  it("is where a Vision-off bulk capture lands", () => {
    expect(landing).toContain("shouldOpenUnassigned");
    expect(landing).toContain('"/(capture)/unassigned"');
  });

  it("reads the persisted session and sorts in place, with no grouping and no park logic", () => {
    expect(screen).toContain("usePersistedCaptureSession(sessionId)");
    expect(screen).toContain("state.unboundUris");
    expect(screen).not.toContain("useConfirmGrouping");
    expect(screen).not.toContain("parkedSession");
  });

  it("runs the three actions through the session reducers", () => {
    expect(screen).toContain(
      "createDraftFromUnbound(current, selection, { defaultSize: stickySize.get() })",
    );
    expect(screen).toContain("bindUnboundPhotosToDraft(current, selection, draftId)");
    expect(screen).toContain("discardUnboundPhotos(current, selection)");
    expect(screen).toContain("JERSEY_PHOTO_CAP_HELPER_DA");
  });

  it("opens the picker as a form Sheet with one tertiary Annuller, and Slet in the existing confirm Sheet", () => {
    expect(screen).not.toContain("hideChrome");
    expect(screen).toContain('label="Annuller"');
    expect(screen).toContain('variant="tertiary"');
    expect(screen).toContain("<ConfirmSheet");
    expect(screen).not.toContain("Forslag");
  });

  it("leaves through one guarded dismissTo: chevron, Android back and empty grid to the overview, a lost session to Samling", () => {
    expect(screen).toContain("exitedRef");
    expect(screen).toContain("router.dismissTo");
    expect(screen).toContain('pathname: "/(capture)/overview"');
    expect(screen).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(screen).toContain("unassignedExit(state, isSessionResolved)");
    expect(screen).not.toContain("router.replace");
    expect(screen).not.toContain("router.back");
  });

  it("carries the test ids", () => {
    for (const id of [
      'testID="unassigned-new-jersey"',
      'testID="unassigned-add-to-draft"',
      'testID="unassigned-delete"',
      "testID={`unassigned-photo-",
      "testID={`unassigned-draft-",
      'confirmTestID="unassigned-delete-confirm"',
      'testIDPrefix="unassigned"',
    ]) {
      expect(screen).toContain(id);
    }
    const header = read("../src/components/capture-overview-header.tsx");
    expect(header).toContain("-title`");
    expect(header).toContain(`back ? "back" : "close"`);
    expect(read("../src/components/account-ui.tsx")).toContain("testID={confirmTestID}");
  });
});
