import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const threadRowPath = join(__dirname, "../src/components/thread-row.tsx");

describe("ThreadRow (Revision 2026-10-10, KIT-296)", () => {
  it("has the person and bid variants, with a 48px circle and a 48 x 60 thumb", () => {
    const source = readFileSync(threadRowPath, "utf8");

    expect(source).toMatch(/variant: "person" \| "bid"/);
    expect(source).toMatch(/LEADING_SIZE = 48/);
    expect(source).toMatch(/THUMB_WIDTH = 48/);
    expect(source).toMatch(/THUMB_HEIGHT = 60/);
    expect(source).toMatch(/borderRadius: radius\.sm/);
  });

  it("signals unread with an 8px fill.primary dot and weight 500, never a row fill", () => {
    const source = readFileSync(threadRowPath, "utf8");

    expect(source).toMatch(/UNREAD_DOT_SIZE = 8/);
    expect(source).toMatch(/\{unread \? \(/);
    expect(source).toMatch(/backgroundColor: theme\.fillPrimary/);
    expect(source).toMatch(/fontWeight: unread \? "500" : "400"/);
    expect(source).not.toMatch(/unread \? theme\.fillSecondary/);
    expect(source).toMatch(/backgroundColor: theme\.canvas/);
  });

  it("takes its accessible name from the view-model and keeps formatThreadTime", () => {
    const source = readFileSync(threadRowPath, "utf8");

    expect(source).toMatch(/accessibilityLabel=\{accessibilityLabel\}/);
    expect(source).toMatch(/export function formatThreadTime/);
  });
});
