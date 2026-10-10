import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IdentityAuthError, identityAuthErrorFromResponse } from "../src/auth/identity-auth-error";
import {
  CODE_EXPIRED_MESSAGE,
  CODE_RESEND_EXPIRED_LABEL,
  CODE_RESEND_LABEL,
  CODE_WRONG_EMAIL_LABEL,
  CODE_WRONG_MESSAGE,
  codeProgressLabel,
  codeTitle,
  resendLabel,
} from "../src/first-session/code-copy";
import {
  CODE_LENGTH,
  codeFailureFromError,
  isCompleteCode,
  nextCountdown,
  RESEND_COUNTDOWN_SECONDS,
  sanitizeCode,
} from "../src/first-session/code-entry";

const mobileRoot = join(__dirname, "..");
const read = (file: string) => readFileSync(join(mobileRoot, file), "utf8");

describe("code entry", () => {
  it("keeps digits only and at most six", () => {
    expect(sanitizeCode("123456")).toBe("123456");
    expect(sanitizeCode("12 34-56")).toBe("123456");
    expect(sanitizeCode("1234567890")).toBe("123456");
    expect(sanitizeCode("abc")).toBe("");
    expect(sanitizeCode("")).toBe("");
  });

  it("is complete on the sixth digit and not before", () => {
    expect(CODE_LENGTH).toBe(6);
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("123456")).toBe(true);
  });

  it("maps a refused code to what the collector sees", () => {
    expect(codeFailureFromError(new IdentityAuthError(401, "x"))).toBe("wrong");
    expect(codeFailureFromError(new IdentityAuthError(410, "x"))).toBe("expired");
    expect(codeFailureFromError(new IdentityAuthError(429, "x"))).toBe("throttled");
    expect(codeFailureFromError(new IdentityAuthError(500, "x"))).toBe("failed");
    expect(codeFailureFromError(new TypeError("Network request failed"))).toBe("failed");
  });

  it("keeps the HTTP status of a refused code from the API", () => {
    for (const status of [401, 410, 429]) {
      const error = identityAuthErrorFromResponse(new Response(null, { status }), {
        fallbackMessage: "Kunne ikke bekræfte koden",
      });
      expect(error.status).toBe(status);
    }
  });

  it("counts down to zero and no further", () => {
    expect(RESEND_COUNTDOWN_SECONDS).toBeGreaterThan(0);
    expect(nextCountdown(3)).toBe(2);
    expect(nextCountdown(1)).toBe(0);
    expect(nextCountdown(0)).toBe(0);
  });
});

describe("code copy", () => {
  it("puts the e-mail in the instruction and names the resend states", () => {
    expect(codeTitle("dig@eksempel.dk")).toContain("dig@eksempel.dk");
    expect(CODE_WRONG_EMAIL_LABEL).toBe("Forkert e-mail?");
    expect(CODE_RESEND_LABEL).toBe("Send igen");
    expect(CODE_RESEND_EXPIRED_LABEL).toBe("Send ny kode");
    expect(resendLabel(0)).toBe("Send igen");
    expect(resendLabel(30)).toBe("Send igen om 0:30");
    expect(codeProgressLabel(3)).toBe("Kode, 3 af 6 cifre");
    expect(CODE_WRONG_MESSAGE.length).toBeGreaterThan(0);
    expect(CODE_EXPIRED_MESSAGE.length).toBeGreaterThan(0);
  });
});

describe("code screen chrome", () => {
  const screen = read("src/first-session/code-screen.tsx");
  const copy = read("src/first-session/code-copy.ts");

  it("has six boxes, one-time-code autofill and no submit button", () => {
    expect(screen).toContain("code-box-${index}");
    expect(screen).toContain('keyboardType="number-pad"');
    expect(screen).toContain('textContentType="oneTimeCode"');
    expect(screen).toContain('autoComplete="sms-otp"');
    for (const testId of [
      "code-screen",
      "code-title",
      "code-wrong-email",
      "code-input",
      "code-error",
      "code-resend",
      "code-back",
    ]) {
      expect(screen).toContain(testId);
    }
    expect(screen).not.toMatch(/Fortsæt|Bekræft|onSubmit|onSubmitEditing/);
  });

  it("announces errors and uses danger on the box border and the message only", () => {
    expect(screen).toContain('accessibilityRole="alert"');
    const dangerUses = screen.match(/theme\.danger/g) ?? [];
    expect(dangerUses).toHaveLength(2);
    expect(screen).toContain("borderColor: theme.danger");
    expect(screen).toContain("color: theme.danger");
  });

  it("disables the boxes when the code expired and sends a new one from a primary button", () => {
    expect(screen).toContain("editable={!expired}");
    expect(screen).toContain("CODE_RESEND_EXPIRED_LABEL");
    expect(screen).toContain("disabled={!resendEnabled}");
  });

  it("asks for no password anywhere", () => {
    expect(`${screen}\n${copy}`).not.toMatch(/adgangskode|password/i);
  });

  it("the placeholder is gone", () => {
    expect(existsSync(join(mobileRoot, "src/first-session/code-stub.tsx"))).toBe(false);
  });
});

describe("code step host wiring", () => {
  const host = read("app/(first-session)/index.tsx");

  it("requests the code before the code step opens", () => {
    const submit = host.slice(host.indexOf("async function handleSubmitEmail"));
    expect(submit.indexOf("requestSignInCode")).toBeGreaterThan(-1);
    expect(submit.indexOf("requestSignInCode")).toBeLessThan(submit.indexOf('method: "email"'));
  });

  it("submits on the sixth digit, once, and lands through the reducer", () => {
    expect(host).toContain("isCompleteCode(next)");
    expect(host).toContain("codeInFlight");
    expect(host).toContain("signInWithCode(email.trim(), value)");
    expect(host).toContain('dispatch({ type: "submitIdentity", method: "code" })');
  });

  it("a wrong code clears the boxes and enables resend at once; an expired one disables them", () => {
    const failure = host.slice(host.indexOf("async function submitCode"));
    expect(failure).toContain('setCodeStatus("wrong")');
    expect(failure).toContain('setCodeStatus("expired")');
    expect(failure).toContain('setCode("")');
    expect(failure).toContain("resendCountdown.clear()");
  });

  it("Forkert e-mail? and the back button both return to the sheet with the address kept", () => {
    expect(host).toContain("onWrongEmail={handleWrongEmail}");
    expect(host).toContain("onBack={handleWrongEmail}");
    const wrongEmail = host.slice(host.indexOf("function handleWrongEmail"));
    expect(wrongEmail.slice(0, wrongEmail.indexOf("\n  }\n"))).not.toContain('setEmail("")');
  });

  it("sends no password on this path", () => {
    const client = read("src/api/identity.ts");
    const start = client.indexOf("export async function requestSignInCode");
    const end = client.indexOf("export async function loginSocial");
    const codeClient = client.slice(start, end);
    expect(codeClient).toContain("/v1/identity/code");
    expect(codeClient).toContain("/v1/identity/code/verify");
    expect(codeClient).not.toMatch(/password/i);
  });
});
