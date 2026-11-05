import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startTrialFromPaywall, TRIAL_START_FAILED_MESSAGE } from "../src/premium/start-trial";

const mobileRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("startTrialFromPaywall", () => {
  it("starts the trial once, refreshes the profile and reports it started", async () => {
    const calls: string[] = [];
    const result = await startTrialFromPaywall({
      startTrial: async () => {
        calls.push("start");
      },
      refreshProfile: async () => {
        calls.push("refresh");
        return { id: "profile" };
      },
    });

    expect(calls).toEqual(["start", "refresh"]);
    expect(result).toEqual({ status: "started", profile: { id: "profile" } });
  });

  it("reports a failed start with the Banner message and does not refresh", async () => {
    let refreshed = false;
    const result = await startTrialFromPaywall({
      startTrial: async () => {
        throw new Error("Trial allerede brugt");
      },
      refreshProfile: async () => {
        refreshed = true;
        return { id: "profile" };
      },
    });

    expect(result).toEqual({ status: "failed", message: TRIAL_START_FAILED_MESSAGE });
    expect(TRIAL_START_FAILED_MESSAGE).toBe("Prøven kunne ikke starte. Prøv igen.");
    expect(refreshed).toBe(false);
  });
});

describe("who may start the Nest-trial", () => {
  it("calls startNestTrial from the paywall's Start gratis prøve handler and nowhere else", () => {
    const files = [
      ...sourceFiles(path.join(mobileRoot, "src")),
      ...sourceFiles(path.join(mobileRoot, "app")),
    ];
    const callers = files
      .filter((file) => !file.endsWith(path.join("api", "billing.ts")))
      .filter((file) => readFileSync(file, "utf8").includes("startNestTrial"));

    expect(callers.map((file) => path.relative(mobileRoot, file))).toEqual([
      path.join("src", "auth", "AuthProvider.tsx"),
    ]);

    const auth = readFileSync(path.join(mobileRoot, "src/auth/AuthProvider.tsx"), "utf8");
    const request = auth.slice(
      auth.indexOf("const requestPremiumAccess"),
      auth.indexOf("const value = useMemo"),
    );
    expect(request).not.toContain("startNestTrial");
    expect(request).not.toContain("startTrialFromPaywall");
    expect(auth).toContain("startTrialFromPaywall");
  });
});
