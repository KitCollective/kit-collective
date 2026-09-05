import { describe, expect, it } from "vitest";
import {
  DOOR_LOGIN_SEGMENT,
  DOOR_REGISTER_SEGMENT,
  DOOR_SPLITTER_LABEL,
  doorPasswordSubmitLabel,
  doorSwapLabel,
  doorTitle,
  FORGOT_PASSWORD_BACK,
  FORGOT_PASSWORD_DONE,
  FORGOT_PASSWORD_INFO,
  FORGOT_PASSWORD_LABEL,
  FORGOT_PASSWORD_SUBMIT,
  FORGOT_PASSWORD_TITLE,
  PASSWORD_HELPER,
  PASSWORD_REPEAT_LABEL,
  SPLASH_CAPTION,
  SPLASH_LOGIN_LABEL,
  SPLASH_REGISTER_LABEL,
  VERIFY_EMAIL_CONTINUE,
  VERIFY_EMAIL_TITLE,
} from "../src/first-session/door-copy";

describe("first-session door copy", () => {
  it("uses Login as the general term in login mode", () => {
    expect(doorTitle("login")).toBe("Login");
    expect(doorSwapLabel("login")).toBe("Ny her? Opret konto");
    expect(doorPasswordSubmitLabel("login")).toBe("Login");
  });

  it("locks register labels with Opret", () => {
    expect(doorTitle("register")).toBe("Opret");
    expect(doorSwapLabel("register")).toBe("Har du en konto? Login");
    expect(doorPasswordSubmitLabel("register")).toBe("Opret konto");
  });

  it("locks the two-mode title switcher segments", () => {
    expect(DOOR_LOGIN_SEGMENT).toBe("Login");
    expect(DOOR_REGISTER_SEGMENT).toBe("Opret");
  });

  it("locks single-face identity chrome without a sentence line", () => {
    expect(PASSWORD_REPEAT_LABEL).toBe("Gentag adgangskode");
    expect(PASSWORD_HELPER).toBe("mindst 8 tegn");
    expect(FORGOT_PASSWORD_LABEL).toBe("Glemt adgangskode?");
    expect(DOOR_SPLITTER_LABEL).toBe("eller");
  });

  it("locks the in-sheet forgot-password page copy", () => {
    expect(FORGOT_PASSWORD_TITLE).toBe("Nulstil adgangskode");
    expect(FORGOT_PASSWORD_SUBMIT).toBe("Send link");
    expect(FORGOT_PASSWORD_BACK).toBe("Tilbage");
    expect(FORGOT_PASSWORD_INFO).toContain("Vi sender et link");
    expect(FORGOT_PASSWORD_DONE).toContain("Tjek din e-mail");
  });

  it("locks splash and verify collector copy", () => {
    expect(SPLASH_CAPTION).toBe("Tryk for at fortsætte");
    expect(SPLASH_LOGIN_LABEL).toBe("Login");
    expect(SPLASH_REGISTER_LABEL).toBe("Opret konto");
    expect(VERIFY_EMAIL_TITLE).toBe("Tjek din e-mail");
    expect(VERIFY_EMAIL_CONTINUE).toBe("Fortsæt");
  });
});
