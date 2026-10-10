import { describe, expect, it } from "vitest";
import {
  DOOR_DIVIDER_LABEL,
  DOOR_EMAIL_INVALID,
  DOOR_PROVIDER_LABEL,
  DOOR_SUBMIT_LABEL,
  DOOR_TERMS_LINE,
  DOOR_TITLE,
  isValidEmail,
  socialCancelledMessage,
} from "../src/first-session/door-copy";

describe("first-session door copy", () => {
  it("locks the single Kom i gang sheet copy", () => {
    expect(DOOR_TITLE).toBe("Kom i gang");
    expect(DOOR_SUBMIT_LABEL).toBe("Fortsæt");
    expect(DOOR_DIVIDER_LABEL).toBe("eller");
    expect(DOOR_PROVIDER_LABEL).toEqual({ google: "Google", facebook: "Facebook" });
    expect(DOOR_TERMS_LINE).toContain("vilkårene");
    expect(DOOR_TERMS_LINE).toContain("privatlivspolitikken");
    expect(DOOR_EMAIL_INVALID).toBe("Skriv en gyldig e-mail");
  });

  it("names the provider in the cancelled-login toast", () => {
    expect(socialCancelledMessage("google")).toBe("Google-login blev afbrudt");
    expect(socialCancelledMessage("facebook")).toBe("Facebook-login blev afbrudt");
  });
});

describe("isValidEmail", () => {
  it.each(["a@b.dk", "dig@eksempel.dk", "  dig@eksempel.dk  ", "navn.efternavn+tag@mail.co.uk"])(
    "accepts %j",
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each([
    "",
    "   ",
    "dig",
    "dig@",
    "@eksempel.dk",
    "dig@eksempel",
    "dig@eksempel.",
    "a b@c.dk",
    "a@@b.dk",
  ])("rejects %j", (value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});
