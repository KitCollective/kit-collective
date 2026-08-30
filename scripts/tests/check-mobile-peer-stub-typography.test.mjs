import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkMobilePeerStubTypography } from "../check-mobile-peer-stub-typography.mjs";

const profileUiPath = "apps/mobile/src/components/profile-ui.tsx";

test("ListPeerStubRow uses headingSm for initial and handle", () => {
  const source = readFileSync(profileUiPath, "utf8");
  const violations = checkMobilePeerStubTypography({ profileUiSource: source });
  assert.deepEqual(violations, []);
});

test("checkMobilePeerStubTypography fails when handle uses typography.body", () => {
  const source = readFileSync(profileUiPath, "utf8");
  const mutated = source.replace(
    /<Text style=\{\[typography\.headingSm, \{ color: theme\.contentPrimary \}\]\}>\{handle\}<\/Text>/,
    '<Text style={[typography.body, { color: theme.contentPrimary }]}>{handle}</Text>',
  );
  const violations = checkMobilePeerStubTypography({ profileUiSource: mutated });
  assert.ok(
    violations.some((violation) => violation.includes("ListPeerStubRow handle must use typography.headingSm")),
  );
});

test("checkMobilePeerStubTypography fails when initial uses typography.body", () => {
  const source = readFileSync(profileUiPath, "utf8");
  const mutated = source.replace(
    /<Text style=\{\[typography\.headingSm, \{ color: theme\.contentPrimary \}\]\}>\{initial\}<\/Text>/,
    '<Text style={[typography.body, { color: theme.contentPrimary }]}>{initial}</Text>',
  );
  const violations = checkMobilePeerStubTypography({ profileUiSource: mutated });
  assert.ok(
    violations.some((violation) => violation.includes("ListPeerStubRow initial badge must use typography.headingSm")),
  );
});
