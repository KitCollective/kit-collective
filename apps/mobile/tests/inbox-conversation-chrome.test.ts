import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inboxIndexPath = join(__dirname, "../app/(tabs)/inbox/index.tsx");
const tabLayoutPath = join(__dirname, "../app/(tabs)/_layout.tsx");
const conversationViewPath = join(__dirname, "../src/components/conversation-view.tsx");
const messageComposerPath = join(__dirname, "../src/components/message-composer.tsx");

describe("inbox conversation chrome (KIT-118)", () => {
  it("does not auto-select the first conversation on wide load", () => {
    const source = readFileSync(inboxIndexPath, "utf8");

    expect(source).not.toMatch(/conversations\[0\]/);
    expect(source).not.toMatch(/setSelectedConversationId\(firstId\)/);
  });

  it("keeps the native tab bar visible on wide-layout conversations", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");
    const layoutSource = readFileSync(tabLayoutPath, "utf8");

    // Inbox still tracks conversation visibility for its own layout/refresh needs.
    expect(inboxSource).toMatch(/setConversationVisible\(Boolean\(selectedConversationId\)\)/);
    // Native tabs stay on detail screens — no custom hide mechanism (design lock 2026-09-05).
    expect(layoutSource).toContain("NativeTabs");
    expect(layoutSource).not.toContain("hideForWideConversation");
  });

  it("opens a waiting row at its Bud every time on the wide layout (KIT-296)", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");
    const viewSource = readFileSync(conversationViewPath, "utf8");

    // Every open mounts a fresh thread, so a re-opened conversation scrolls to its Bud again.
    expect(inboxSource).toMatch(
      /<ConversationView\s+key=\{`\$\{selectedConversationId\}:\$\{openCount\}`\}/,
    );
    expect(inboxSource).toMatch(/setOpenCount\(/);
    // And a mounted view starts over when its conversation or Bud prop changes.
    expect(viewSource).toMatch(/focusRequest\.current = \{ key, scrolled: false \}/);
  });

  it("refreshes inbox unread after conversation GET succeeds", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");
    const viewSource = readFileSync(conversationViewPath, "utf8");

    expect(viewSource).toMatch(/onConversationOpened\?\.\(\)/);
    expect(inboxSource).toMatch(
      /onConversationOpened=\{\(\) => void handleConversationOpened\(\)\}/,
    );
    expect(inboxSource).toMatch(/await refreshUnreadCount\(\)/);
    expect(inboxSource).not.toMatch(/openConversation[\s\S]*void loadInbox\(\)/);
  });

  it("applies composer focus border tokens from the design lock", () => {
    const composerSource = readFileSync(messageComposerPath, "utf8");

    expect(composerSource).toMatch(/composerFieldBorder/);
    expect(composerSource).toMatch(/onFocus=\{\(\) => setFocused\(true\)\}/);
    expect(composerSource).toMatch(/onBlur=\{\(\) => setFocused\(false\)\}/);
  });

  it("is one list from one request, with no Beskeder | Aktivitet tabs (KIT-296)", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");

    expect(inboxSource).toMatch(/fetchConversations/);
    expect(inboxSource).not.toMatch(/fetchActivity/);
    expect(inboxSource).not.toMatch(/ActivityCard/);
    expect(inboxSource).not.toMatch(/TopTabs|InboxInnerPager|INBOX_TABS|setInboxTab/);
    expect(inboxSource).not.toMatch(/inboxInnerConsumesSwipe/);
    expect(inboxSource).toMatch(/buildInbox/);
  });

  it("passes the Bud's message id when a waiting row opens its thread (KIT-296)", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");

    expect(inboxSource).toMatch(/messageId=\$\{messageId\}/);
  });

  it("offers Find trøjer to Søg and Åbn for bud to Samling in the empty Indbakke (KIT-296)", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");

    expect(inboxSource).toMatch(/title="Ingen samtaler endnu"/);
    expect(inboxSource).toMatch(/label="Find trøjer"[\s\S]*?variant="primary"/);
    expect(inboxSource).toMatch(/router\.navigate\(PLACE_HREFS\.search\)/);
    expect(inboxSource).toMatch(/label="Åbn for bud"[\s\S]*?variant="secondary"/);
    expect(inboxSource).toMatch(/router\.navigate\(PLACE_HREFS\.collection\)/);
  });

  it("sends the wide thread pane back to Vælg en samtale after Blokér or Slet samtale (KIT-425)", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");
    const conversationSource = readFileSync(conversationViewPath, "utf8");

    expect(inboxSource).toMatch(
      /<ConversationView[\s\S]*?onConversationHidden=\{\(\) => void handleConversationHidden\(\)\}/,
    );
    expect(inboxSource).toMatch(
      /const handleConversationHidden = useCallback\(async \(\) => \{[\s\S]*?setSelectedConversationId\(null\)[\s\S]*?await refreshInbox\(\)/,
    );
    expect(inboxSource).not.toMatch(/onOpenDetails/);
    expect(conversationSource).not.toMatch(/onOpenDetails/);
  });
});
