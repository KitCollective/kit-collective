import { beforeEach, describe, expect, it } from "vitest";
import { takeMailLinkOpening } from "@/links/mail-link-opening";
import { rememberMailLink, takeMailLink } from "@/links/pending-mail-link";
import { redirectSystemPath } from "../app/+native-intent";

const HOST = "https://kitcollective.app";
const CONVERSATION = {
  pathname: "/(tabs)/inbox/[conversationId]",
  params: { conversationId: "conv_1", messageId: "msg-9" },
};

beforeEach(() => {
  takeMailLink();
});

describe("redirectSystemPath", () => {
  it("holds a mail link's target and starts the app at home", () => {
    expect(redirectSystemPath({ path: `${HOST}/c/conv_1/m/msg-9`, initial: true })).toBe("/");
    expect(takeMailLink()).toEqual({
      kind: "conversation",
      conversationId: "conv_1",
      messageId: "msg-9",
    });
  });

  it("holds a link that arrives as a bare path", () => {
    expect(redirectSystemPath({ path: "/plus", initial: false })).toBe("/");
    expect(takeMailLink()).toEqual({ kind: "paywall" });
  });

  it("passes the sign-in return through unchanged and holds nothing", () => {
    const path = "kitcollective://auth/callback?code=abc";
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(takeMailLink()).toBeNull();
  });

  it("passes an unknown path through and holds nothing", () => {
    expect(redirectSystemPath({ path: "/profile", initial: false })).toBe("/profile");
    expect(takeMailLink()).toBeNull();
  });
});

describe("takeMailLinkOpening", () => {
  it("opens nothing when no link is held", () => {
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })).toBeNull();
  });

  it("signed out: opens nothing and keeps the target for after sign-in", () => {
    rememberMailLink({ kind: "conversation", conversationId: "conv_1", messageId: "msg-9" });
    expect(takeMailLinkOpening({ signedIn: false, inTabs: false })).toBeNull();
    expect(takeMailLinkOpening({ signedIn: false, inTabs: true })).toBeNull();
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })).toEqual({
      hrefs: [CONVERSATION],
      paywall: false,
    });
  });

  it("signed in outside the tabs: opens nothing and keeps the target", () => {
    rememberMailLink({ kind: "conversation", conversationId: "conv_1", messageId: "msg-9" });
    expect(takeMailLinkOpening({ signedIn: true, inTabs: false })).toBeNull();
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })?.hrefs).toEqual([CONVERSATION]);
  });

  it("signed in in the tabs: opens the target once", () => {
    rememberMailLink({ kind: "conversation", conversationId: "conv_1", messageId: "msg-9" });
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })).toEqual({
      hrefs: [CONVERSATION],
      paywall: false,
    });
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })).toBeNull();
  });

  it("opens Send bud over its jersey", () => {
    rememberMailLink({ kind: "send-bid", jerseyId: "jersey_7" });
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })).toEqual({
      hrefs: [
        { pathname: "/(tabs)/search/[jerseyId]", params: { jerseyId: "jersey_7" } },
        { pathname: "/(tabs)/search/send-bid/[jerseyId]", params: { jerseyId: "jersey_7" } },
      ],
      paywall: false,
    });
  });

  it("opens the paywall sheet over Profil", () => {
    rememberMailLink({ kind: "paywall" });
    expect(takeMailLinkOpening({ signedIn: true, inTabs: true })).toEqual({
      hrefs: [{ pathname: "/(tabs)/profile" }],
      paywall: true,
    });
  });
});
