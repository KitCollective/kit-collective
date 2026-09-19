import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const profileDir = join(__dirname, "../app/(tabs)/profile");
const genvejeSheetPath = join(__dirname, "../src/components/genveje-sheet.tsx");
const collectionIndexPath = join(__dirname, "../app/(tabs)/collection/index.tsx");

const PROFILE_SCREEN_EXPORTS = [
  {
    file: "cookie-indstillinger.tsx",
    english: "CookieSettingsScreen",
    danish: "CookieIndstillingerScreen",
  },
  {
    file: "skift-adgangskode.tsx",
    english: "ChangePasswordScreen",
    danish: "SkiftAdgangskodeScreen",
  },
  {
    file: "skift-email.tsx",
    english: "ChangeEmailScreen",
    danish: "SkiftEmailScreen",
  },
  {
    file: "email-notifikationer.tsx",
    english: "EmailNotificationsScreen",
    danish: "EmailNotifikationerScreen",
  },
  {
    file: "push-notifikationer.tsx",
    english: "PushNotificationsScreen",
    danish: "PushNotifikationerScreen",
  },
  {
    file: "moerk-tilstand.tsx",
    english: "DarkModeScreen",
    danish: "MoerkTilstandScreen",
  },
  {
    file: "favoritter.tsx",
    english: "FavoritesScreen",
    danish: "FavoritterScreen",
  },
] as const;

describe("profile screen identifiers (KIT-131)", () => {
  for (const { file, english, danish } of PROFILE_SCREEN_EXPORTS) {
    it(`uses English default export in ${file}`, () => {
      const source = readFileSync(join(profileDir, file), "utf8");

      expect(source).toMatch(new RegExp(`export default function ${english}\\(`));
      expect(source).not.toMatch(new RegExp(`\\b${danish}\\b`));
    });
  }

  it("exports ShortcutsSheet from genveje-sheet.tsx", () => {
    const source = readFileSync(genvejeSheetPath, "utf8");

    expect(source).toMatch(/export function ShortcutsSheet\(/);
    expect(source).not.toMatch(/\bGenvejeSheet\b/);
    expect(source).toMatch(/ShortcutsSheetProps/);
    expect(source).toMatch(/ShortcutsSheetMode/);
  });

  it("imports ShortcutsSheet in collection home", () => {
    const source = readFileSync(collectionIndexPath, "utf8");

    expect(source).toMatch(/import \{ ShortcutsSheet \} from "@\/components\/genveje-sheet"/);
    expect(source).toMatch(/<ShortcutsSheet/);
    expect(source).not.toMatch(/\bGenvejeSheet\b/);
  });
});
