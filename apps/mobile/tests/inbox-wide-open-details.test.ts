import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inboxIndexPath = join(__dirname, "../app/(tabs)/inbox/index.tsx");

describe("wide inbox Samtale Detaljer stub", () => {
  it("passes onOpenDetails to ConversationView so Detaljer does not fall back to onBack", () => {
    const source = readFileSync(inboxIndexPath, "utf8");

    const wideConversationView = source.match(
      /<ConversationView[\s\S]*?conversationId=\{selectedConversationId\}[\s\S]*?\/>/,
    );

    expect(wideConversationView).not.toBeNull();
    expect(wideConversationView![0]).toMatch(/onOpenDetails=\{\(\) => undefined\}/);
  });
});
