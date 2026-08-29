import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileInboxConversationChrome } from "../check-mobile-inbox-conversation-chrome.mjs";

const compliantInboxIndex = `
const { setConversationVisible, refreshUnreadCount } = useInboxChrome();
useEffect(() => {
  setConversationVisible(Boolean(selectedConversationId));
}, [selectedConversationId, setConversationVisible]);
const handleConversationOpened = async () => {
  await refreshUnreadCount();
};
const openConversation = (conversationId) => {
  setSelectedConversationId(conversationId);
};
<ConversationView onConversationOpened={() => void handleConversationOpened()} />
`;

const compliantFloatingBar = `
const hideForWideConversation = inboxChrome?.conversationVisible ?? false;
if (hideForWideConversation) return null;
`;

const compliantConversationView = `
onConversationOpened?.();
`;

const compliantMessageComposer = `
const fieldBorder = composerFieldBorder(theme, focused);
`;

const compliantInboxChrome = `
conversationVisible
setConversationVisible
refreshUnreadCount
`;

const compliantFieldBorder = `
return { borderColor: theme.contentPrimary, borderWidth: 2 };
`;

const compliantChromeTest = `
it("does not auto-select the first conversation on wide load", () => {});
`;

const compliantFieldBorderTest = `
it("uses border.strong / border.focus on focus", () => {});
`;

describe("checkMobileInboxConversationChrome", () => {
  it("passes compliant inbox conversation chrome wiring", () => {
    assert.deepEqual(
      checkMobileInboxConversationChrome({
        inboxIndexSource: compliantInboxIndex,
        floatingBarSource: compliantFloatingBar,
        conversationViewSource: compliantConversationView,
        messageComposerSource: compliantMessageComposer,
        inboxChromeSource: compliantInboxChrome,
        fieldBorderSource: compliantFieldBorder,
        chromeTestSource: compliantChromeTest,
        fieldBorderTestSource: compliantFieldBorderTest,
      }),
      [],
    );
  });

  it("fails when wide inbox auto-selects the first conversation", () => {
    const violations = checkMobileInboxConversationChrome({
      inboxIndexSource: `${compliantInboxIndex}\nsetSelectedConversationId(conversations[0].id);`,
      floatingBarSource: compliantFloatingBar,
      conversationViewSource: compliantConversationView,
      messageComposerSource: compliantMessageComposer,
      inboxChromeSource: compliantInboxChrome,
      fieldBorderSource: compliantFieldBorder,
      chromeTestSource: compliantChromeTest,
      fieldBorderTestSource: compliantFieldBorderTest,
    });

    assert.ok(violations.some((line) => line.includes("conversations[0]")));
  });

  it("fails when openConversation races loadConversations with GET detail", () => {
    const violations = checkMobileInboxConversationChrome({
      inboxIndexSource: `
        const openConversation = () => {
          void loadConversations();
        };
      `,
      floatingBarSource: compliantFloatingBar,
      conversationViewSource: compliantConversationView,
      messageComposerSource: compliantMessageComposer,
      inboxChromeSource: compliantInboxChrome,
      fieldBorderSource: compliantFieldBorder,
      chromeTestSource: compliantChromeTest,
      fieldBorderTestSource: compliantFieldBorderTest,
    });

    assert.ok(violations.some((line) => line.includes("race loadConversations")));
  });
});
