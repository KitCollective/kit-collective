import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkMobileProfileSettingsHub } from "../check-mobile-profile-settings-hub.mjs";

const indstillingerPath = "apps/mobile/app/(tabs)/profile/indstillinger.tsx";

test("checkMobileProfileSettingsHub passes on locked Indstillinger hub", () => {
  const violations = checkMobileProfileSettingsHub();
  assert.deepEqual(violations, []);
});

test("checkMobileProfileSettingsHub fails when a section label is removed", () => {
  const indstillingerSource = readFileSync(indstillingerPath, "utf8");
  const mutated = indstillingerSource.replace(
    "<SettingsSectionLabel>Privatlivsindstillinger</SettingsSectionLabel>",
    "",
  );
  const violations = checkMobileProfileSettingsHub({ indstillingerSource: mutated });
  assert.ok(violations.some((v) => v.includes("Privatlivsindstillinger")));
});

test("checkMobileProfileSettingsHub fails when a prefs drill uses factory jargon", () => {
  const pushPath = "apps/mobile/app/(tabs)/profile/push-notifikationer.tsx";
  const pushSource = readFileSync(pushPath, "utf8");
  const mutated = `${pushSource}\n// shell placeholder`;
  const violations = checkMobileProfileSettingsHub({ [`prefs:${pushPath}`]: mutated });
  assert.ok(violations.some((v) => v.includes("factory jargon")));
});
