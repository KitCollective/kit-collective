import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Admin Auth ops chrome", () => {
  it("keeps Auth ops under User Data chips, not a third waffle tile or dash iframe", () => {
    const collectors = readFileSync(join(here, "CollectorsPage.tsx"), "utf8");
    const shell = readFileSync(join(here, "../components/AdminShell.tsx"), "utf8");
    const account = readFileSync(join(here, "AccountPage.tsx"), "utf8");
    const drill = readFileSync(join(here, "CollectorUserDrillPage.tsx"), "utf8");

    expect(collectors).toContain('"auth-events"');
    expect(collectors).toContain('"auth-security"');
    expect(collectors).toContain("Auth events");
    expect(collectors).toContain("Auth security");
    expect(collectors).toContain("/admin/auth/events");
    expect(collectors).toContain("/admin/auth/security");
    expect(collectors).not.toContain("dash.better-auth.com");
    expect(collectors).not.toContain("<iframe");

    expect(shell).toContain('label: "Master Data"');
    expect(shell).toContain('label: "User Data"');
    expect(shell.match(/label: "/g)?.length).toBe(2);
    expect(shell).toContain('navigate("/account")');
    expect(shell).not.toContain("Auth ops");

    expect(account).toContain("/identity/auth-events");
    expect(account).toContain("/identity/sessions/revoke-all");
    expect(account).toContain("Revoke sessions");
    expect(account).not.toContain("/admin/auth/security");
    expect(account).not.toContain("dash.better-auth.com");

    expect(drill).toContain("/auth-events");
    expect(drill).toContain("/sessions/revoke");
    expect(drill).toContain("Auth events");
    expect(drill).not.toContain("/admin/auth/security");
  });
});
