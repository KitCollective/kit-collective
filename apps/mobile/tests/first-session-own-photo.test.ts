import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type OwnPhotoPickers, pickOwnPhotos } from "../src/first-session/own-photo-source";

const srcDir = join(__dirname, "../src/first-session");

function read(file: string) {
  return readFileSync(join(srcDir, file), "utf8");
}

function pickers(overrides: Partial<OwnPhotoPickers> = {}): OwnPhotoPickers {
  return {
    library: async () => ["file:///a.jpg"],
    files: async () => ["file:///f.jpg"],
    ...overrides,
  };
}

describe("own-photo source picking", () => {
  it("asks the photo library for at most three photos and keeps picker order", async () => {
    let asked: number | null = null;
    const uris = await pickOwnPhotos(
      "library",
      pickers({
        library: async ({ selectionLimit }) => {
          asked = selectionLimit;
          return ["a", "b", "c", "d"];
        },
      }),
    );

    expect(asked).toBe(3);
    expect(uris).toEqual(["a", "b", "c"]);
  });

  it("Filer is capped at three too", async () => {
    const uris = await pickOwnPhotos("files", pickers({ files: async () => ["1", "2", "3", "4"] }));

    expect(uris).toEqual(["1", "2", "3"]);
  });

  it("a cancelled or empty pick starts nothing", async () => {
    expect(await pickOwnPhotos("library", pickers({ library: async () => null }))).toBeNull();
    expect(await pickOwnPhotos("files", pickers({ files: async () => [] }))).toBeNull();
  });
});

describe("own-photo road chrome", () => {
  it("the source sheet offers Tag billede, Fotobibliotek and Filer with testIDs", () => {
    const copy = read("source-copy.ts");
    const sheet = read("source-sheet.tsx");

    expect(copy).toContain('SOURCE_CAMERA_LABEL = "Tag billede"');
    expect(copy).toContain('SOURCE_LIBRARY_LABEL = "Fotobibliotek"');
    expect(copy).toContain('SOURCE_FILES_LABEL = "Filer"');
    expect(sheet).toContain("source-sheet-");
    expect(sheet).toContain("hideChrome");
    expect(sheet).toContain("SOURCE_CANCEL_LABEL");
    expect(sheet).toContain('name="chevron-forward"');
  });

  it("the chooser is the source sheet over welcome, not a plain screen with Upload filer", () => {
    const flow = read("chooser-screen.tsx");
    const host = readFileSync(join(__dirname, "../app/(first-session)/index.tsx"), "utf8");

    expect(flow).toContain("FirstSessionSourceSheet");
    expect(flow).toContain("pickOwnPhotos");
    expect(flow).toContain("capFirstSessionPhotos");
    expect(flow).not.toContain("Upload filer");
    expect(flow).not.toContain("ScreenHeader");
    // iOS presents the system picker only after the sheet's Modal has left.
    expect(flow).toContain("onModalHide");
    expect(host).toContain("FirstSessionChooserScreen");
  });

  it("the analysing screen shows the photo on the shared 4:5 stage with the demo rows and no seconds", () => {
    const analysing = read("analysing-screen.tsx");
    const stage = read("vision-stage.tsx");
    const demo = read("demo-screen.tsx");

    expect(analysing).toContain("stageRectFor");
    expect(analysing).toContain("VisionRow");
    expect(analysing).toContain("StageOverlays");
    expect(analysing).toContain("DEMO_ROW_LABELS");
    expect(analysing).toContain('testID="analysing-stage"');
    expect(analysing).toContain("classifyVisionJob");
    expect(analysing).toContain("fetchUnsignedVisionJob");
    expect(analysing).not.toContain("demoSecondsLabel");
    expect(analysing).not.toContain("progressTrack");
    // The demo and the own-photo road draw the same stage, not two copies.
    expect(stage).toContain("5 / 4");
    expect(demo).toContain("stageRectFor");
    expect(demo).toContain("VisionRow");
    expect(demo).toContain("StageOverlays");
  });

  it("Reduce Motion omits the scan line and still resolves the rows", () => {
    const analysing = read("analysing-screen.tsx");

    expect(analysing).toContain("motionGate");
    expect(analysing).toContain("showsScanLine={!reduceMotion}");
    expect(analysing).toContain("visionResolvedRows");
  });

  it("the failure screen keeps the photo and offers Udfyld selv and Prøv et andet foto", () => {
    const copy = read("vision-failed-copy.ts");
    const screen = read("vision-failed-screen.tsx");
    const host = readFileSync(join(__dirname, "../app/(first-session)/index.tsx"), "utf8");

    expect(copy).toContain('VISION_FAILED_FILL_SELF_LABEL = "Udfyld selv"');
    expect(copy).toContain('VISION_FAILED_TRY_ANOTHER_LABEL = "Prøv et andet foto"');
    expect(copy).toContain("Vision kunne ikke genkende trøjen");
    expect(screen).toContain('testID="vision-failed-fill-self"');
    expect(screen).toContain('testID="vision-failed-try-another"');
    expect(screen).toContain("loadPersistedCaptureSession");
    // Danger token on border and text only.
    expect(screen).toContain("color.danger");
    expect(screen).not.toMatch(/backgroundColor:\s*color\.danger/);
    expect(host).toContain("VisionFailedScreen");
    expect(host).toContain('type: "tryAnotherPhoto"');
  });
});
