import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const profileUiPath = join(__dirname, "../src/components/profile-ui.tsx");

// The peer stub and danger rows now live in the Conversation More Sheet (KIT-299); the
// Detaljer screen they were first built for is retired.
describe("List row chrome used by the Conversation More Sheet", () => {
  it("renders grouped lists with navigate chevron and row hairlines", () => {
    const profileSource = readFileSync(profileUiPath, "utf8");
    expect(profileSource).toMatch(
      /export function ListPeerStubRow[\s\S]*chevron-forward[\s\S]*<\/Pressable>/,
    );
    expect(profileSource).not.toMatch(/\{onPress \? \([\s\S]*chevron-forward/);
    expect(profileSource).toMatch(/showHairline/);
    expect(profileSource).toMatch(
      /export function ListDangerRow[\s\S]*StyleSheet\.hairlineWidth[\s\S]*borderBottomColor: theme\.borderSubtle/,
    );
  });

  it("renders the peer stub with locked heading-sm roles matching Thread row", () => {
    const source = readFileSync(profileUiPath, "utf8");
    expect(source).toMatch(
      /<Text style=\{\[typography\.headingSm, \{ color: theme\.contentPrimary \}\]\}>\{initial\}<\/Text>/,
    );
    expect(source).toMatch(
      /<Text style=\{\[typography\.headingSm, \{ color: theme\.contentPrimary \}\]\}>\{handle\}<\/Text>/,
    );
  });
});
