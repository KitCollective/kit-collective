import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asset, BOARD_ALT } from "../dist/notify/assets.js";
import { composeMail } from "../dist/notify/kinds/registry.js";

const CONFIG = { assetBaseUrl: "https://assets.test/email" };
const CONVERSATION_ID = "0b6c2f0e-6a52-4c53-8f7e-2f6d1a9a1c11";
const MESSAGE_ID = "5d1d6ad4-79f4-4a63-a0d5-0a0f3f5a3b22";
const JERSEY_ID = "9a8f1c43-2d64-4b8e-9c0a-7e31d0b4f533";

/** Visible text only: the style block, tags and images are dropped, as with images blocked. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&zwnj;/g, " ")
    .replace(/\s+/g, " ");
}

const jersey = {
  club: "FC København",
  meta: "Hjemme · 2023/24",
  photoUrl: "https://api.test/v1/collection/showcase/photos/photo-1",
  amountDkk: 1250,
};

describe("Notify, bid mails (05, 06, 07)", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.EMAIL_ASSET_BASE_URL = CONFIG.assetBaseUrl;
    process.env.APP_LINK_BASE_URL = "https://app.test";
    delete process.env.EMAIL_SUPPORT_ADDRESS;
    delete process.env.EMAIL_LEGAL_LINE;
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  const newBid = (bidderCity?: string) =>
    composeMail({
      kind: "bid-new",
      to: "owner@example.com",
      data: {
        ...jersey,
        bidderHandle: "samler42",
        ...(bidderCity ? { bidderCity } : {}),
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      },
    });
  const accepted = () =>
    composeMail({
      kind: "bid-accepted",
      to: "bidder@example.com",
      data: { ...jersey, ownerHandle: "ejer7", conversationId: CONVERSATION_ID },
    });
  const declined = (reason: "declined" | "went-to-another" | "jersey-deleted" = "declined") =>
    composeMail({
      kind: "bid-declined",
      to: "bidder@example.com",
      data:
        reason === "declined"
          ? { ...jersey, ownerHandle: "ejer7", reason, userJerseyId: JERSEY_ID }
          : { ...jersey, ownerHandle: "ejer7", reason },
    });

  const expectShown = (mail: ReturnType<typeof composeMail>, facts: string[]) => {
    const shown = visibleText(mail.html);
    for (const fact of facts) {
      expect(mail.text).toContain(fact);
      expect(shown).toContain(fact);
    }
  };

  it("new bid: locked subject and headline, jersey, the amount in mono and the bidder with their city", () => {
    const mail = newBid("Aarhus");
    expect(mail.subject).toBe("Nyt bud på din trøje");
    expectShown(mail, [
      "Nyt bud på din trøje",
      "FC København",
      "Hjemme · 2023/24",
      "Bud",
      "1250 kr",
      "Fra",
      "samler42 · Aarhus",
    ]);
    expect(mail.html).toMatch(/font-family:[^;]*mono[^;]*;font-size:20px[^>]*>1250 kr/i);
  });

  it("new bid: the bidder alone when they share no city", () => {
    const mail = newBid();
    expect(mail.text).toContain("Fra: samler42");
    expect(mail.text).not.toContain("samler42 ·");
  });

  it("new bid: button Se buddet links to the conversation at that bid", () => {
    const mail = newBid();
    const url = `https://app.test/samtale/${CONVERSATION_ID}/bud/${MESSAGE_ID}`;
    expect(mail.text).toContain(`Se buddet: ${url}`);
    expect(mail.html).toContain(`href="${url}"`);
  });

  it("bid accepted: locked subject and headline, Bud, Ejer and the button Åbn samtalen", () => {
    const mail = accepted();
    expect(mail.subject).toBe("Dit bud er accepteret");
    expectShown(mail, ["Dit bud er accepteret", "FC København", "Bud", "1250 kr", "Ejer", "ejer7"]);
    const url = `https://app.test/samtale/${CONVERSATION_ID}`;
    expect(mail.text).toContain(`Åbn samtalen: ${url}`);
    expect(mail.html).toContain(`href="${url}"`);
  });

  it("bid declined: locked subject and headline, Bud, Ejer and the button Send nyt bud to Send bud", () => {
    const mail = declined();
    expect(mail.subject).toBe("Dit bud er afvist");
    expectShown(mail, ["Dit bud er afvist", "Bud", "1250 kr", "Ejer", "ejer7"]);
    const url = `https://app.test/troeje/${JERSEY_ID}/bud`;
    expect(mail.text).toContain(`Send nyt bud: ${url}`);
    expect(mail.html).toContain(`href="${url}"`);
  });

  it("bid declined, went to another collector: the locked line and no button", () => {
    const mail = declined("went-to-another");
    expect(mail.subject).toBe("Dit bud er afvist");
    expectShown(mail, ["Trøjen er gået til en anden samler."]);
    expect(mail.html).not.toContain(`class="btn-link"`);
    expect(mail.text).not.toContain("Send nyt bud");
  });

  it("bid declined, jersey deleted: no button and a flagged line, never the 'another collector' line", () => {
    const mail = declined("jersey-deleted");
    expect(mail.html).not.toContain(`class="btn-link"`);
    expect(mail.text).toContain("[MANGLER:");
    expect(mail.text).not.toContain("anden samler");
    expect(mail.text).toContain("1250 kr");
  });

  it("deleted jersey shows no photo, because its bytes are gone", () => {
    const mail = composeMail({
      kind: "bid-declined",
      to: "bidder@example.com",
      data: {
        club: jersey.club,
        meta: jersey.meta,
        amountDkk: 400,
        ownerHandle: "ejer7",
        reason: "jersey-deleted",
      },
    });
    expect(mail.html).not.toContain("showcase/photos");
  });

  it("never puts the amount in the subject or the preheader", () => {
    for (const mail of [
      newBid("Aarhus"),
      accepted(),
      declined(),
      declined("went-to-another"),
      declined("jersey-deleted"),
    ]) {
      expect(mail.subject).not.toMatch(/1250|1\.250|kr/);
      expect(mail.preheader).not.toMatch(/1250|1\.250|kr/);
    }
  });

  it("all three use board 1, and say the footer follows Bud og beskeder", () => {
    for (const mail of [newBid(), accepted(), declined()]) {
      expect(mail.html).toContain(`${CONFIG.assetBaseUrl}/${asset.board(1, "light", false)}`);
      expect(mail.html).toContain(`${CONFIG.assetBaseUrl}/${asset.board(1, "dark", false)}`);
      expect(mail.html).toContain(`${CONFIG.assetBaseUrl}/${asset.board(1, "light", true)}`);
      expect(mail.html).toContain(BOARD_ALT[1]);
    }
  });

  it("links are https on the link base and carry ids only: no handle, amount or address", () => {
    const urls = [newBid("Aarhus"), accepted(), declined()].flatMap((mail) =>
      [...mail.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? ""),
    );
    const buttonUrls = urls.filter((url) => url.startsWith("https://app.test"));
    expect(buttonUrls).toHaveLength(3);
    for (const url of buttonUrls) {
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toMatch(/samler42|ejer7|1250|@|Aarhus/);
    }
  });

  it("escapes a handle in the HTML", () => {
    const mail = composeMail({
      kind: "bid-accepted",
      to: "bidder@example.com",
      data: { ...jersey, ownerHandle: "<b>x</b>", conversationId: CONVERSATION_ID },
    });
    expect(mail.html).not.toContain("<b>x</b>");
  });

  it("refuses a link base that is not https", () => {
    process.env.APP_LINK_BASE_URL = "http://app.test";
    expect(() => accepted()).toThrow(/APP_LINK_BASE_URL/);
  });

  it("defaults the link base to the product domain", () => {
    delete process.env.APP_LINK_BASE_URL;
    expect(accepted().text).toContain(`https://kitcollective.app/samtale/${CONVERSATION_ID}`);
  });
});
