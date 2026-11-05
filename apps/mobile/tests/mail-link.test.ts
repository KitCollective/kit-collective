import { beforeEach, describe, expect, it } from "vitest";
import { mailLinkHref, mailLinkStack, resolveMailLink } from "@/links/mail-link";
import { rememberMailLink, takeMailLink } from "@/links/pending-mail-link";

const HOST = "https://kitcollective.app";

describe("resolveMailLink", () => {
  it("opens a conversation", () => {
    expect(resolveMailLink(`${HOST}/c/conv_1`)).toEqual({
      kind: "conversation",
      conversationId: "conv_1",
    });
  });

  it("opens a conversation at a bid message", () => {
    expect(resolveMailLink(`${HOST}/c/conv_1/m/msg-9`)).toEqual({
      kind: "conversation",
      conversationId: "conv_1",
      messageId: "msg-9",
    });
  });

  it("opens someone else's jersey", () => {
    expect(resolveMailLink(`${HOST}/j/jersey_7`)).toEqual({
      kind: "foreign-jersey",
      jerseyId: "jersey_7",
    });
  });

  it("opens Send bud for a jersey", () => {
    expect(resolveMailLink(`${HOST}/j/jersey_7/bud`)).toEqual({
      kind: "send-bid",
      jerseyId: "jersey_7",
    });
  });

  it("opens the KitCollective+ paywall", () => {
    expect(resolveMailLink(`${HOST}/plus`)).toEqual({ kind: "paywall" });
  });

  it("accepts the www host, a query string, a fragment and a trailing slash", () => {
    expect(resolveMailLink("https://www.kitcollective.app/j/a1/?utm=mail#x")).toEqual({
      kind: "foreign-jersey",
      jerseyId: "a1",
    });
  });

  it("accepts a bare path, which is what the router hands to +native-intent", () => {
    expect(resolveMailLink("/c/conv_1/m/msg-9")).toEqual({
      kind: "conversation",
      conversationId: "conv_1",
      messageId: "msg-9",
    });
    expect(resolveMailLink("/plus")).toEqual({ kind: "paywall" });
  });

  it.each([
    ["an unknown path", `${HOST}/privacy`],
    ["the site root", `${HOST}/`],
    ["a foreign host", "https://example.com/c/conv_1"],
    ["a look-alike host", "https://kitcollective.app.evil.com/c/conv_1"],
    ["http", "http://kitcollective.app/c/conv_1"],
    ["a custom scheme", "kitcollective://c/conv_1"],
    ["an empty id", `${HOST}/c//m/x`],
    ["a bad id", `${HOST}/c/has space`],
    ["an encoded slash in the id", `${HOST}/c/a%2Fb`],
    ["an id that is too long", `${HOST}/j/${"a".repeat(65)}`],
    ["an extra segment", `${HOST}/c/conv_1/m/msg-9/extra`],
    ["a half path", `${HOST}/c/conv_1/m`],
    ["a wrong sub path", `${HOST}/j/jersey_7/foo`],
    ["an extra segment after plus", `${HOST}/plus/more`],
    ["an empty string", ""],
    ["garbage", "%%%::not a link"],
  ])("sends %s home", (_label, input) => {
    expect(resolveMailLink(input)).toEqual({ kind: "home" });
  });

  it("never throws", () => {
    for (const input of ["", " ", "//", "http://", "https://[", "\u0000", "/c/\ud800"]) {
      expect(() => resolveMailLink(input)).not.toThrow();
    }
  });
});

describe("mailLinkHref", () => {
  it("maps every target to an in-app route", () => {
    expect(mailLinkHref({ kind: "conversation", conversationId: "c1" })).toEqual({
      pathname: "/(tabs)/inbox/[conversationId]",
      params: { conversationId: "c1" },
    });
    expect(mailLinkHref({ kind: "conversation", conversationId: "c1", messageId: "m1" })).toEqual({
      pathname: "/(tabs)/inbox/[conversationId]",
      params: { conversationId: "c1", messageId: "m1" },
    });
    expect(mailLinkHref({ kind: "foreign-jersey", jerseyId: "j1" })).toEqual({
      pathname: "/(tabs)/search/[jerseyId]",
      params: { jerseyId: "j1" },
    });
    expect(mailLinkHref({ kind: "send-bid", jerseyId: "j1" })).toEqual({
      pathname: "/(tabs)/search/send-bid/[jerseyId]",
      params: { jerseyId: "j1" },
    });
    expect(mailLinkHref({ kind: "paywall" })).toEqual({ pathname: "/(tabs)/profile" });
    expect(mailLinkHref({ kind: "home" })).toEqual({ pathname: "/" });
  });
});

describe("mailLinkStack", () => {
  it("opens Send bud over the jersey, so back lands on the jersey as from Søg", () => {
    expect(mailLinkStack({ kind: "send-bid", jerseyId: "j1" })).toEqual([
      { pathname: "/(tabs)/search/[jerseyId]", params: { jerseyId: "j1" } },
      { pathname: "/(tabs)/search/send-bid/[jerseyId]", params: { jerseyId: "j1" } },
    ]);
  });

  it("opens every other target as one screen", () => {
    expect(mailLinkStack({ kind: "paywall" })).toEqual([{ pathname: "/(tabs)/profile" }]);
    expect(mailLinkStack({ kind: "conversation", conversationId: "c1" })).toHaveLength(1);
    expect(mailLinkStack({ kind: "foreign-jersey", jerseyId: "j1" })).toHaveLength(1);
  });

  it("opens nothing for home", () => {
    expect(mailLinkStack({ kind: "home" })).toEqual([]);
  });
});

describe("pending mail link", () => {
  beforeEach(() => {
    takeMailLink();
  });

  it("holds the target until it is taken, then clears", () => {
    rememberMailLink({ kind: "paywall" });
    expect(takeMailLink()).toEqual({ kind: "paywall" });
    expect(takeMailLink()).toBeNull();
  });

  it("keeps only the latest target", () => {
    rememberMailLink({ kind: "foreign-jersey", jerseyId: "a" });
    rememberMailLink({ kind: "foreign-jersey", jerseyId: "b" });
    expect(takeMailLink()).toEqual({ kind: "foreign-jersey", jerseyId: "b" });
  });
});
