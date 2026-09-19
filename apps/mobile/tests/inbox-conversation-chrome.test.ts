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

  it("loads activity projection on the Aktivitet tab (KIT-120)", () => {
    const inboxSource = readFileSync(inboxIndexPath, "utf8");

    expect(inboxSource).toMatch(/fetchActivity/);
    expect(inboxSource).toMatch(/ActivityCard/);
    expect(inboxSource).toMatch(/activityItems/);
  });
});
