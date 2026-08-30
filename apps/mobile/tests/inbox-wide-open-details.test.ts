import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inboxIndexPath = join(__dirname, "../app/(tabs)/inbox/index.tsx");
const conversationIndexPath = join(__dirname, "../app/(tabs)/inbox/[conversationId]/index.tsx");
const detailsPath = join(__dirname, "../app/(tabs)/inbox/[conversationId]/details.tsx");
const detailsViewPath = join(__dirname, "../src/components/conversation-details-view.tsx");

describe("conversation Detaljer navigation", () => {
  it("routes wide inbox onOpenDetails to the details screen", () => {
    const source = readFileSync(inboxIndexPath, "utf8");
    expect(source).toMatch(/onOpenDetails=\{\(\) =>[\s\S]*details/);
  });

  it("routes narrow conversation onOpenDetails to the details screen", () => {
    const source = readFileSync(conversationIndexPath, "utf8");
    expect(source).toMatch(/router\.push\(`\/\(tabs\)\/inbox\/\$\{conversationId\}\/details`\)/);
  });

  it("renders Detaljer screen with danger rows and helper copy", () => {
    const routeSource = readFileSync(detailsPath, "utf8");
    expect(routeSource).toMatch(/ConversationDetailsView/);

    const viewSource = readFileSync(detailsViewPath, "utf8");
    expect(viewSource).toMatch(/title="Detaljer"/);
    expect(viewSource).toMatch(/ListDangerRow/);
    expect(viewSource).toMatch(/Rapportér/);
    expect(viewSource).toMatch(/Blokér/);
    expect(viewSource).toMatch(/Slet samtale/);
    expect(viewSource).toMatch(/Blokering skjuler samtalen for jer begge/);
    expect(viewSource).toMatch(/fillSecondary/);
  });
});
