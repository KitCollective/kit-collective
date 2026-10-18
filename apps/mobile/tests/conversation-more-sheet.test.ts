import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const detailsRoutePath = join(__dirname, "../app/(tabs)/inbox/[conversationId]/details.tsx");
const detailsViewPath = join(__dirname, "../src/components/conversation-details-view.tsx");
const conversationRoutePath = join(__dirname, "../app/(tabs)/inbox/[conversationId]/index.tsx");
const conversationViewPath = join(__dirname, "../src/components/conversation-view.tsx");
const moreSheetsPath = join(__dirname, "../src/inbox/conversation-more-sheets.tsx");

describe("Conversation More Sheet replaces Detaljer (KIT-299)", () => {
  it("has no Detaljer route or view left", () => {
    expect(existsSync(detailsRoutePath)).toBe(false);
    expect(existsSync(detailsViewPath)).toBe(false);

    const route = readFileSync(conversationRoutePath, "utf8");
    expect(route).not.toMatch(/\/details/);
    expect(route).not.toMatch(/ConversationDetailsView/);
  });

  it("opens the More Sheet from the header instead of routing", () => {
    const view = readFileSync(conversationViewPath, "utf8");

    expect(view).toMatch(/testID="conversation-more"/);
    expect(view).toMatch(/handleOpenMore/);
    expect(view).not.toMatch(/router\.push\([^)]*details/);
  });

  it("asks in a confirm Sheet before Blokér and Slet samtale run", () => {
    const view = readFileSync(conversationViewPath, "utf8");

    // The More rows only open the confirm; the API calls live in the confirm handler.
    expect(view).toMatch(/chooseMoreAction\("block"\)/);
    expect(view).toMatch(/chooseMoreAction\("delete"\)/);
    expect(view).toMatch(/runConfirmed[\s\S]*blockConversation[\s\S]*hideConversation/);
    expect(view).toMatch(/Platform\.OS !== "ios"/);
    expect(view).toMatch(/onModalHide=\{runPendingMoreAction\}/);
  });

  it("shows a danger Banner in the thread column when an action fails", () => {
    const view = readFileSync(conversationViewPath, "utf8");

    expect(view).toMatch(/<Banner tone="danger" message=\{moreError\} \/>/);
  });

  it("builds the rows from List row primitives, Slet samtale as danger", () => {
    const sheets = readFileSync(moreSheetsPath, "utf8");

    expect(sheets).toMatch(/ListPeerStubRow/);
    expect(sheets).toMatch(/ListNavigateRow/);
    expect(sheets).toMatch(/<ListDangerRow[\s\S]*conversation-more-delete/);
    // Hairline between Rapportér and Blokér, as the lock's List row asks.
    expect(sheets).toMatch(
      /conversation-more-report[\s\S]*<ProfileRowDivider \/>[\s\S]*conversation-more-block/,
    );
    // Not announced by colour alone: the row reads "Slet samtale" and carries a trash icon.
    expect(sheets).toMatch(/icon="trash-outline"/);
  });

  it("confirms through the locked ConfirmSheet, not a copy of it", () => {
    const view = readFileSync(conversationViewPath, "utf8");
    const sheets = readFileSync(moreSheetsPath, "utf8");

    expect(view).toMatch(/import \{ ConfirmSheet \} from "@\/components\/account-ui"/);
    expect(view).toMatch(/<ConfirmSheet[\s\S]*more\.confirm\[confirmKind\]/);
    expect(sheets).not.toMatch(/variant="destructive"/);
  });
});
