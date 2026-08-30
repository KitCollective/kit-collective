import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkMobileConversationDetailsChrome } from "../check-mobile-conversation-details-chrome.mjs";

const profileUiSource = readFileSync("apps/mobile/src/components/profile-ui.tsx", "utf8");
const detailsViewSource = readFileSync(
  "apps/mobile/src/components/conversation-details-view.tsx",
  "utf8",
);

describe("checkMobileConversationDetailsChrome", () => {
  it("passes on committed sources", () => {
    assert.deepEqual(
      checkMobileConversationDetailsChrome({ profileUiSource, detailsViewSource }),
      [],
    );
  });

  it("fails when chevron is conditional on onPress", () => {
    const mutated = profileUiSource
      .replace("export function ListPeerStubRow", "export function ListPeerStubRowBroken")
      .replace(
        '<Ionicons\n        name="chevron-forward"',
        '{onPress ? (\n        <Ionicons\n          name="chevron-forward"',
      );
    const violations = checkMobileConversationDetailsChrome({
      profileUiSource: mutated,
      detailsViewSource,
    });
    assert.ok(
      violations.some(
        (v) => v.includes("conditional on onPress") || v.includes("missing ListPeerStubRow"),
      ),
    );
  });

  it("fails when helper copy uses useMemo", () => {
    const mutated = detailsViewSource.replace(
      "const CONVERSATION_DETAILS_HELPER_COPY",
      "const helperCopy = useMemo(() =>",
    );
    const violations = checkMobileConversationDetailsChrome({
      profileUiSource,
      detailsViewSource: mutated,
    });
    assert.ok(violations.some((v) => v.includes("useMemo")));
  });
});
