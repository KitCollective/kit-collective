import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const authDir = join(__dirname, "../app/(auth)");

describe("Expo verify and reset chrome", () => {
  it("keeps Danish collector copy on verify and reset screens", () => {
    const verify = readFileSync(join(authDir, "verify.tsx"), "utf8");
    const reset = readFileSync(join(authDir, "reset.tsx"), "utf8");
    const complete = readFileSync(join(authDir, "reset-complete.tsx"), "utf8");
    const login = readFileSync(join(authDir, "login.tsx"), "utf8");

    expect(verify).toContain("Bekræft e-mail");
    expect(reset).toContain("Nulstil adgangskode");
    expect(complete).toContain("Ny adgangskode");
    expect(login).toContain("Glemt adgangskode");
  });
});
