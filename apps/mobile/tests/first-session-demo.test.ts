import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_MEASURED_SECONDS,
  DEMO_ROW_KEYS,
  demoResolvedRows,
  demoRowValue,
  demoSecondsLabel,
  demoTimeline,
  EXAMPLE_JERSEYS,
  exampleById,
} from "../src/first-session/demo";

const mobileRoot = join(__dirname, "..");

describe("demo example jerseys", () => {
  it("offers exactly three bundled examples with a fixed club, season and type", () => {
    expect(EXAMPLE_JERSEYS).toHaveLength(3);
    for (const jersey of EXAMPLE_JERSEYS) {
      expect(exampleById(jersey.id)).toBe(jersey);
      expect(demoRowValue(jersey, "club")).toBe(jersey.clubLabel);
      expect(demoRowValue(jersey, "season")).toBe(jersey.seasonLabel);
      expect(demoRowValue(jersey, "type").length).toBeGreaterThan(0);
    }
  });
});

describe("demo timeline", () => {
  it("resolves club, season and type one row at a time, in order", () => {
    const timeline = demoTimeline(false);
    const [club, season, type] = timeline.rowAtMs;

    expect(DEMO_ROW_KEYS).toEqual(["club", "season", "type"]);
    expect(club).toBeLessThan(season);
    expect(season).toBeLessThan(type);
    expect(demoResolvedRows(timeline, club - 1)).toEqual([]);
    expect(demoResolvedRows(timeline, club)).toEqual(["club"]);
    expect(demoResolvedRows(timeline, season)).toEqual(["club", "season"]);
    expect(demoResolvedRows(timeline, type)).toEqual(["club", "season", "type"]);
  });

  it("the jersey flies for about 420ms and the scan line passes for 900ms before the first row", () => {
    const timeline = demoTimeline(false);

    expect(timeline.travel).toBe("fly");
    expect(timeline.travelMs).toBe(420);
    expect(timeline.showsScanLine).toBe(true);
    expect(timeline.rowAtMs[0]).toBe(420 + 900);
    expect(timeline.rowRevealMs).toBe(260);
  });

  it("Reduce Motion cross-fades, omits the scan line and reaches the same end state", () => {
    const calm = demoTimeline(true);
    const lively = demoTimeline(false);

    expect(calm.travel).toBe("crossfade");
    expect(calm.showsScanLine).toBe(false);
    expect(demoResolvedRows(calm, calm.resultAtMs)).toEqual(
      demoResolvedRows(lively, lively.resultAtMs),
    );
    expect(demoResolvedRows(calm, calm.resultAtMs)).toEqual([...DEMO_ROW_KEYS]);
    expect(calm.resultAtMs).toBeLessThanOrEqual(lively.resultAtMs);
  });
});

describe("demo seconds counter", () => {
  it("is hidden until a measured Vision time is configured", () => {
    expect(DEMO_MEASURED_SECONDS).toBe(null);
    expect(demoSecondsLabel(DEMO_MEASURED_SECONDS)).toBe(null);
    expect(demoSecondsLabel(0)).toBe(null);
    expect(demoSecondsLabel(Number.NaN)).toBe(null);
  });

  it("shows the measured value once supplied", () => {
    expect(demoSecondsLabel(7)).toBe("Læst på 7 sek.");
  });
});

describe("demo marks the jersey as an example and never saves it", () => {
  it("the result screen shows the example mark, Kom i gang and Prøv en anden trøje", () => {
    const screen = readFileSync(join(mobileRoot, "src/first-session/demo-screen.tsx"), "utf8");
    const copy = readFileSync(join(mobileRoot, "src/first-session/welcome-copy.ts"), "utf8");

    expect(copy).toContain('DEMO_EXAMPLE_MARK = "Eksempel · ikke gemt"');
    expect(screen).toContain("DEMO_EXAMPLE_MARK");
    expect(screen).toContain("DEMO_START_LABEL");
    expect(screen).toContain("DEMO_ANOTHER_LABEL");
    expect(screen).toContain("DEMO_MEASURED_SECONDS");
  });

  it("works with network off: no api import, no Vision, no persistence in the demo modules", () => {
    for (const file of ["demo.ts", "demo-screen.tsx", "welcome-screen.tsx", "wall-photos.ts"]) {
      const source = readFileSync(join(mobileRoot, "src/first-session", file), "utf8");
      expect(source).not.toMatch(/from "@\/(api|capture|auth)\//);
      expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|saveUserJersey|expo-sqlite/);
    }
  });
});

describe("bundled placeholder photos", () => {
  const dir = join(mobileRoot, "assets/first-session");

  it("ships 8 to 12 wall tiles, all clearly named placeholder", () => {
    const files = readdirSync(dir).filter((name) => name.endsWith(".png"));

    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files.length).toBeLessThanOrEqual(12);
    for (const name of files) {
      expect(name).toMatch(/^placeholder-/);
      expect(statSync(join(dir, name)).size).toBeLessThan(20_000);
    }
  });

  it("wall-photos requires only files that exist and commits no Drive test photo", () => {
    const source = readFileSync(join(mobileRoot, "src/first-session/wall-photos.ts"), "utf8");
    // SAFETY: the regex has one capture group, so every match has index 1.
    const required = [...source.matchAll(/require\("\.\.\/\.\.\/(assets\/[^"]+)"\)/g)].map(
      (match) => match[1] as string,
    );

    expect(required.length).toBeGreaterThanOrEqual(8);
    for (const path of required) {
      expect(path).toMatch(/placeholder-/);
      expect(existsSync(join(mobileRoot, path))).toBe(true);
    }
  });
});
