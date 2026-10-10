import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(join(__dirname, path), "utf8");

describe("bulk overview wiring", () => {
  const overview = read("../app/(capture)/overview.tsx");
  const layout = read("../app/(capture)/_layout.tsx");
  const saveHook = read("../src/capture/useConfirmSave.ts");
  const collection = read("../app/(tabs)/collection/index.tsx");
  const landing = read("../src/capture/use-capture-landing.ts");

  it("registers the overview route in the capture stack", () => {
    expect(layout).toContain('name="overview"');
  });

  it("runs grouping on the overview and lists rows from the pure derivation", () => {
    expect(overview).toContain("useConfirmGrouping");
    expect(overview).toContain("overviewRows(state)");
    expect(overview).toContain("pendingSkeletonRows");
    expect(overview).toContain("CaptureOverviewSkeletonRow");
    expect(overview).toContain("inboxRow(state)");
    expect(overview).toContain('testID="overview-progress"');
    expect(overview).toContain('testID="overview-primary"');
    expect(overview).toContain('testID="overview-tertiary"');
  });

  it("opens Confirm for a tapped row and for the first unsaved draft", () => {
    expect(overview).toContain("firstUnsavedDraftId(state)");
    expect(overview).toContain("openConfirm(row.draftId)");
    expect(overview).toContain('pathname: "/(capture)/confirm"');
  });

  it("sends Luk, the tertiary button, Android back and any removal through one exit", () => {
    expect(overview).toContain("leaveOverviewSession");
    expect(overview).toContain("useConfirmExit(sessionId, state, isSessionResolved, leaveSession)");
    expect(overview).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(overview).toContain('addListener("beforeRemove"');
    expect(read("../app/(capture)/confirm.tsx")).toContain("leaveOverviewSession(sessionId)");
  });

  it("returns to the overview after the last Gem og næste", () => {
    expect(saveHook).toContain('outcome.status === "overview-continue"');
    expect(saveHook).toContain('pathname: "/(capture)/overview"');
    expect(saveHook).toContain("router.dismissTo");
    expect(saveHook).toContain("Gem og næste");
  });

  it("shows one parked row on Samling, between the header and the shortcut chips", () => {
    const header = collection.lastIndexOf("<CollectionHeader count={totalJerseyCount}");
    const parked = collection.indexOf("<ParkedSessionRow />", header);
    const chips = collection.indexOf("<ShortcutChipRow", header);
    expect(header).toBeGreaterThan(-1);
    expect(parked).toBeGreaterThan(header);
    expect(chips).toBeGreaterThan(parked);
  });

  it("lands on the overview or Confirm by the pure entry decision", () => {
    expect(landing).toContain("shouldOpenBulkOverview");
    expect(landing).toContain('"/(capture)/overview"');
    expect(landing).toContain('"/(capture)/confirm"');
  });
});
