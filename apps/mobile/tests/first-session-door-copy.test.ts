import { describe, expect, it } from "vitest";
import {
  DOOR_SPLITTER_LABEL,
  doorEmailCtaLabel,
  doorPasswordSubmitLabel,
  doorSentence,
  doorStepCaption,
  doorSwapLabel,
  doorTitle,
  EMAIL_CHANGE_LABEL,
  EMAIL_NEXT_LABEL,
  FORGOT_PASSWORD_LABEL,
  PASSWORD_HELPER,
  PASSWORD_REPEAT_LABEL,
  SPLASH_CAPTION,
  SPLASH_LOGIN_LABEL,
  SPLASH_REGISTER_LABEL,
  VERIFY_EMAIL_CONTINUE,
  VERIFY_EMAIL_TITLE,
} from "../src/first-session/door-copy";

describe("first-session door copy", () => {
  it("locks login labels", () => {
    expect(doorTitle("login")).toBe("Log ind");
    expect(doorSentence("login")).toBe("Samlingen venter.");
    expect(doorEmailCtaLabel("login")).toBe("Log ind med e-mail");
    expect(doorSwapLabel("login")).toBe("Ny her? Opret konto");
    expect(doorPasswordSubmitLabel("login")).toBe("Log ind");
  });

  it("locks register labels", () => {
    expect(doorTitle("register")).toBe("Gem samlingen");
    expect(doorSentence("register")).toBe("Trøjen er læst. En konto husker den.");
    expect(doorEmailCtaLabel("register")).toBe("Opret med e-mail");
    expect(doorSwapLabel("register")).toBe("Jeg har en konto");
    expect(doorPasswordSubmitLabel("register")).toBe("Opret konto");
  });

  it("locks email step chrome", () => {
    expect(doorStepCaption(1)).toBe("1/2");
    expect(doorStepCaption(2)).toBe("2/2");
    expect(EMAIL_NEXT_LABEL).toBe("Næste");
    expect(EMAIL_CHANGE_LABEL).toBe("Skift");
    expect(PASSWORD_REPEAT_LABEL).toBe("Gentag adgangskode");
    expect(PASSWORD_HELPER).toBe("mindst 8 tegn");
    expect(FORGOT_PASSWORD_LABEL).toBe("Glemt adgangskode?");
    expect(DOOR_SPLITTER_LABEL).toBe("eller");
  });

  it("locks splash and verify collector copy", () => {
    expect(SPLASH_CAPTION).toBe("Tryk for at fortsætte");
    expect(SPLASH_LOGIN_LABEL).toBe("Log ind");
    expect(SPLASH_REGISTER_LABEL).toBe("Opret konto");
    expect(VERIFY_EMAIL_TITLE).toBe("Tjek din e-mail");
    expect(VERIFY_EMAIL_CONTINUE).toBe("Fortsæt");
  });
});
