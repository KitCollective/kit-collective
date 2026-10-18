import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import host, { gateWaitSeconds, runLand } from "../host.js";
import { hostContract, LAND_SCRIPT } from "./host-contract.js";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A checkout whose landing script prints its arguments and exits 3, like a waiting slice. */
function checkout(): string {
  const dir = mkdtempSync(join(tmpdir(), "optio-land-"));
  temps.push(dir);
  mkdirSync(join(dir, "scripts"));
  writeFileSync(
    join(dir, LAND_SCRIPT),
    'console.log("WAITING (land-approved): queued: " + process.argv.slice(2).join(" "));\nprocess.exit(3);\n',
  );
  return dir;
}

describe("run_land", () => {
  it("runs only the fixed landing script with the step, the PR, the issue and a slice timeout", async () => {
    expect(LAND_SCRIPT).toBe("scripts/land-approved.mjs");
    expect(host.handlers.run_land).toBe(runLand);
    const cwd = checkout();
    const result = await runLand(
      { cwd, step: "finish", pr: 12, issue: "ABC-9", timeoutMs: 9 * 60_000 },
      { signal: new AbortController().signal },
    );
    expect(result).toMatchObject({
      exitCode: 3,
      cwd,
      lastLine: `WAITING (land-approved): queued: finish 12 --issue ABC-9 --timeout ${gateWaitSeconds(9 * 60_000)}`,
    });
  });

  it("refuses a script, an unknown step or a malformed issue from the caller", async () => {
    const input = hostContract.run_land.input["~standard"];
    const good = { cwd: "/x", step: "start", pr: 1, issue: "ABC-1" };
    expect(await input.validate(good)).not.toHaveProperty("issues");
    expect(await input.validate({ ...good, script: "other.mjs" })).toHaveProperty("issues");
    expect(await input.validate({ ...good, step: "merge" })).toHaveProperty("issues");
    expect(await input.validate({ ...good, issue: "ABC-1 --x" })).toHaveProperty("issues");
  });
});
