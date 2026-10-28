import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IdentityAuthError } from "../src/auth/identity-auth-error";
import {
  codeConfirmed,
  codeSent,
  confirmFailed,
  EMAIL_CHANGE_PROBLEM_MESSAGE,
  sendFailed,
  startEmailChange,
  submitAddress,
  typeCode,
} from "../src/profile/email-change";

const CURRENT = "old@example.com";

function atCodeStep(email = "new@example.com") {
  return codeSent(submitAddress(startEmailChange, email, CURRENT));
}

describe("e-mail change flow: the address step", () => {
  it("starts on an empty address with no problem", () => {
    expect(startEmailChange).toEqual({ step: "address", email: "", code: "", problem: null });
  });

  it("sends a trimmed, lower-cased new address", () => {
    expect(submitAddress(startEmailChange, "  New@Example.COM ", CURRENT)).toEqual({
      step: "sending",
      email: "new@example.com",
      code: "",
      problem: null,
    });
  });

  it("stays on the address with a problem when it is not an e-mail", () => {
    for (const raw of ["", "   ", "not-an-email", "a@b"]) {
      const next = submitAddress(startEmailChange, raw, CURRENT);
      expect(next.step, raw).toBe("address");
      expect(next.problem, raw).toBe("invalid");
    }
  });

  it("stays on the address when it is the one the account already has, in any case", () => {
    const next = submitAddress(startEmailChange, " OLD@example.com", CURRENT);
    expect(next.step).toBe("address");
    expect(next.problem).toBe("same");
  });

  it("returns to the address with the reason when the code could not be sent", () => {
    const sending = submitAddress(startEmailChange, "new@example.com", CURRENT);

    expect(sendFailed(sending, new IdentityAuthError(429, "x"))).toMatchObject({
      step: "address",
      email: "new@example.com",
      problem: "throttled",
    });
    expect(sendFailed(sending, new IdentityAuthError(400, "x")).problem).toBe("invalid");
    expect(sendFailed(sending, new IdentityAuthError(500, "x")).problem).toBe("failed");
    expect(sendFailed(sending, new TypeError("Network request failed")).problem).toBe("failed");
  });
});

describe("e-mail change flow: the code step", () => {
  it("moves to the code step once the code is sent, keeping the address", () => {
    expect(atCodeStep()).toEqual({
      step: "code",
      email: "new@example.com",
      code: "",
      problem: null,
    });
  });

  it("keeps digits only and does not submit before the sixth digit", () => {
    const partial = typeCode(atCodeStep(), "12 3-4");
    expect(partial).toMatchObject({ step: "code", code: "1234" });
    expect(typeCode(partial, "12345")).toMatchObject({ step: "code", code: "12345" });
  });

  it("submits on the sixth digit, also when a longer string is pasted", () => {
    expect(typeCode(atCodeStep(), "123456")).toMatchObject({ step: "verifying", code: "123456" });
    expect(typeCode(atCodeStep(), "1234567890")).toMatchObject({
      step: "verifying",
      code: "123456",
    });
  });

  it("ignores typing while a code is being checked and outside the code step", () => {
    const verifying = typeCode(atCodeStep(), "123456");
    expect(typeCode(verifying, "000000")).toEqual(verifying);
    expect(typeCode(startEmailChange, "123456")).toEqual(startEmailChange);
  });

  it("finishes on a confirmed code", () => {
    expect(codeConfirmed(typeCode(atCodeStep(), "123456")).step).toBe("done");
  });

  it("clears the boxes and says wrong, expired or throttled, staying on the code step", () => {
    const verifying = typeCode(atCodeStep(), "123456");
    for (const [status, problem] of [
      [401, "wrong"],
      [410, "expired"],
      [429, "throttled"],
    ] as const) {
      expect(confirmFailed(verifying, new IdentityAuthError(status, "x"))).toEqual({
        step: "code",
        email: "new@example.com",
        code: "",
        problem,
      });
    }
  });

  it("clears the problem as soon as the collector types again", () => {
    const wrong = confirmFailed(typeCode(atCodeStep(), "123456"), new IdentityAuthError(401, "x"));
    expect(typeCode(wrong, "1")).toMatchObject({ step: "code", code: "1", problem: null });
  });

  it("goes back to the address when the address turns out to belong to someone else", () => {
    const next = confirmFailed(typeCode(atCodeStep(), "123456"), new IdentityAuthError(409, "x"));
    expect(next).toEqual({
      step: "address",
      email: "new@example.com",
      code: "",
      problem: "taken",
    });
  });

  it("reports a failure that is not the code's fault without blaming the code", () => {
    const next = confirmFailed(typeCode(atCodeStep(), "123456"), new TypeError("offline"));
    expect(next).toMatchObject({ step: "code", code: "", problem: "failed" });
  });

  it("empties the boxes and the problem when a new code is sent after an expired one", () => {
    const expired = confirmFailed(
      typeCode(atCodeStep(), "123456"),
      new IdentityAuthError(410, "x"),
    );
    expect(codeSent(expired)).toEqual({
      step: "code",
      email: "new@example.com",
      code: "",
      problem: null,
    });
  });

  it("tells the collector what went wrong in Danish, without saying who has an account", () => {
    expect(EMAIL_CHANGE_PROBLEM_MESSAGE.taken).not.toMatch(/bruger|konto|oprettet|registreret/i);
    for (const message of Object.values(EMAIL_CHANGE_PROBLEM_MESSAGE)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe("e-mail change client", () => {
  // email-change-api.ts reaches expo-constants through @/api/config, which vitest cannot load, so the client
  // is read as source (as vision-request-error.test.ts does). The status it keeps is tested
  // through identityAuthErrorFromResponse in first-session-code.test.ts.
  const clientSource = readFileSync(join(__dirname, "../src/profile/email-change-api.ts"), "utf8");
  const clientCall = (name: string) =>
    clientSource.slice(clientSource.indexOf(`export async function ${name}(`)).split("\n}\n")[0];

  it("asks for a code with the signed-in token and the new address only", () => {
    const call = clientCall("requestEmailChangeCode");

    expect(call).toContain('postJson("/v1/identity/email/code", accessToken, { email })');
    expect(clientSource).toContain('method: "POST"');
    expect(clientSource).toMatch(/Authorization: `Bearer \$\{accessToken\}`/);
    expect(call).toContain("identityAuthErrorFromResponse(response");
  });

  it("confirms with the address and the code only, and keeps the refusal's status", () => {
    const call = clientCall("confirmEmailChange");

    expect(call).toContain('postJson("/v1/identity/email/verify", accessToken, { email, code })');
    expect(call).toContain("identityAuthErrorFromResponse(response");
    expect(call).toContain("identityMeSchema.parse");
  });
});

describe("Konto wires the flow", () => {
  // Wiring with no other seam: the row is a screen, the check script guards it too.
  const konto = readFileSync(
    join(__dirname, "../app/(tabs)/profile/kontoindstillinger.tsx"),
    "utf8",
  );

  it("gives the e-mail row a Skift action that opens the e-mail change screen", () => {
    expect(konto).toMatch(/title="E-mail"[\s\S]*?actionLabel="Skift"[\s\S]*?onAction=/);
    expect(konto).toContain("skift-email");
  });
});
