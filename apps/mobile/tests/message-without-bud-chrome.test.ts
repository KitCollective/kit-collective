import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const jerseyScreen = () => read("app/(tabs)/search/[jerseyId].tsx");
const peerScreen = () => read("app/(tabs)/search/peer/[handle].tsx");
const threadRoute = () => read("app/(tabs)/inbox/peer/[peerId].tsx");

describe("foreign jersey dock: Skriv til <handle> (KIT-298 AC 1, 2)", () => {
  it("docks the 54px message Icon button before Send bud when the jersey is åben for bud", () => {
    const source = jerseyScreen();
    const send = source.indexOf('dockState.kind === "send"');
    const button = source.indexOf("<WriteToPeerButton", send);
    const sendBid = source.indexOf('testID="send-bid-open"', send);

    expect(send).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(send);
    expect(sendBid).toBeGreaterThan(button);
    expect(source).toContain("name={writeToPeerLabel(peerJersey.ownerHandle)}");
  });

  it("docks a secondary Button Skriv til <handle> alone when the jersey is not åben for bud", () => {
    const source = jerseyScreen();
    const messageOnly = source.indexOf('dockState.kind === "message-only"');
    const own = source.indexOf('dockState.kind === "own-pending"', messageOnly);
    const block = source.slice(messageOnly, own);

    expect(messageOnly).toBeGreaterThan(-1);
    expect(block).toContain("label={writeToPeerLabel(peerJersey.ownerHandle)}");
    expect(block).toContain('variant="secondary"');
    expect(block).not.toContain("Send bud");
    expect(block).not.toContain("<WriteToPeerButton");
  });

  it("gives the own bid row no message control", () => {
    const source = jerseyScreen();
    const own = source.indexOf('dockState.kind === "own-pending"');
    const end = source.indexOf("<Toast", own);

    expect(source.slice(own, end)).not.toContain("WriteToPeerButton");
    expect(source.slice(own, end)).not.toContain("writeToPeerLabel");
  });

  it("closes the Søg stack, then opens the thread with the owner about this jersey", () => {
    const source = jerseyScreen();

    expect(source).toContain("peerThreadHref(peerJersey.ownerId, peerJersey.id)");
    expect(source.indexOf("router.dismissAll()")).toBeLessThan(
      source.indexOf("peerThreadHref(peerJersey.ownerId"),
    );
  });

  it("builds the message control from the secondary Button tokens at 54", () => {
    const source = read("src/inbox/write-to-peer-button.tsx");

    expect(source).toContain("WRITE_TO_PEER_BUTTON_SIZE = 54");
    expect(source).toContain("theme.fillSecondary");
    expect(source).toContain("theme.borderSubtle");
    expect(source).toContain("radius.sm");
    expect(source).toContain("accessibilityLabel={name}");
  });
});

describe("Peer Profil: Skriv besked (KIT-298 AC 3)", () => {
  it("holds one primary Button under the identity block, not on the collector's own profile", () => {
    const source = peerScreen();
    const identity = source.indexOf("<PeerIdentityCard");
    const button = source.indexOf('label="Skriv besked"');

    expect(button).toBeGreaterThan(identity);
    expect(source.match(/label="Skriv besked"/g)).toHaveLength(1);
    expect(source).toMatch(/label="Skriv besked"[\s\S]*?variant="primary"/);
    expect(source).toContain("user?.id === profile.id");
  });

  it("opens the thread with the collector, closing the Søg stack first above a foreign jersey", () => {
    const source = peerScreen();

    expect(source).toContain("sitsAboveForeignJersey");
    expect(source).toContain("peerThreadHref(profile.id)");
    expect(source.indexOf("router.dismissAll()")).toBeLessThan(
      source.indexOf("peerThreadHref(profile.id)"),
    );
  });
});

describe("the thread with a Collector (KIT-298 AC 4, 5)", () => {
  it("has a static peer route that no dynamic conversation segment can shadow", () => {
    const inbox = join(root, "app/(tabs)/inbox");

    expect(existsSync(join(inbox, "peer/[peerId].tsx"))).toBe(true);
    // `/inbox/peer/<id>` is three segments; the conversation directory holds no dynamic child.
    const children = readdirSync(join(inbox, "[conversationId]"));
    expect(children.filter((name) => name.startsWith("[") || name === "peer")).toHaveLength(0);
  });

  it("looks up the Conversation (creating nothing) and opens it, else shows the empty thread", () => {
    const source = threadRoute();

    expect(source).toContain("fetchPeerConversation");
    expect(source).toContain("loaded.peer.conversationId");
    expect(source).toContain("<ConversationView");
    expect(source).toContain("<NewThreadView");
  });

  it("reads the jersey the thread was opened from, and leaves the reference out when it cannot", () => {
    const source = threadRoute();

    expect(source).toContain("fetchPeerJersey");
    expect(source).toContain("peerJersey.ownerId === peer");
  });

  it("replaces the empty thread with the Conversation after the first message, and refreshes Samtaler", () => {
    const source = threadRoute();

    expect(source).toMatch(/router\.replace\(`\/\(tabs\)\/inbox\/\$\{conversationId\}`\)/);
    expect(source).toContain('writePlaceOverview("inbox"');
  });

  it("starts the empty thread with a centred 64px Avatar, the Handle and city · n trøjer", () => {
    const source = read("src/inbox/new-thread-view.tsx");

    expect(source).toContain('size="lg"');
    expect(source).toContain("threadStart(peer)");
    expect(source).toContain("start.meta");
    expect(source).toContain('testID="thread-start"');
    expect(source).toContain("sendPeerMessage");
    // The empty thread has no Conversation to report, block or delete: the header has no More.
    expect(source).not.toContain("onMore=");
  });
});

describe("jersey reference in the composer (KIT-298 AC 6, 7)", () => {
  it("sits in the reply-to slot, above the field, with a dismiss Icon button", () => {
    const composer = read("src/components/message-composer.tsx");
    const row = read("src/inbox/jersey-reference-row.tsx");

    expect(composer.indexOf("<JerseyReferenceRow")).toBeGreaterThan(-1);
    expect(composer.indexOf("<JerseyReferenceRow")).toBeLessThan(composer.indexOf("replyRow"));
    expect(composer.indexOf("<JerseyReferenceRow")).toBeLessThan(
      composer.indexOf('accessibilityLabel="Besked"'),
    );
    expect(row).toContain("REFERENCE_THUMB_WIDTH = 32");
    expect(row).toContain("REFERENCE_THUMB_HEIGHT = 40");
    expect(row).toContain("typography.caption");
    expect(row).toContain("<IconButton");
  });

  it("is dropped when dismissed and after the first send, and rides the send body only while shown", () => {
    const view = read("src/components/conversation-view.tsx");
    const empty = read("src/inbox/new-thread-view.tsx");

    expect(view).toContain("onDismissReference={() => setReference(null)}");
    expect(view).toMatch(/await sendConversationMessage\([\s\S]*?setReference\(null\)/);
    expect(view).toContain("sendMessageBody(");
    expect(empty).toContain("onDismissReference={() => setReference(null)}");
    expect(empty).toContain("sendMessageBody(");
  });

  it("shows the receiver which jersey a message is about, read-only above the bubble", () => {
    const view = read("src/components/conversation-view.tsx");
    const bubble = view.indexOf("<ChatBubble");

    expect(view.lastIndexOf("<JerseyReferenceRow", bubble)).toBeGreaterThan(-1);
    expect(view).toContain("item.reference");
  });
});
