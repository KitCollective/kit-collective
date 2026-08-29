#!/usr/bin/env node
/**
 * Ratchet (KIT-118): fail CI when wide inbox Samtale keeps the Tab bar visible,
 * auto-opens the first thread, or skips unread refresh after GET detail.
 */
import { readFileSync } from "node:fs";

const INBOX_INDEX_PATH = "apps/mobile/app/(tabs)/inbox/index.tsx";
const FLOATING_BAR_PATH = "apps/mobile/src/components/floating-tab-bar.tsx";
const CONVERSATION_VIEW_PATH = "apps/mobile/src/components/conversation-view.tsx";
const MESSAGE_COMPOSER_PATH = "apps/mobile/src/components/message-composer.tsx";
const INBOX_CHROME_PATH = "apps/mobile/src/inbox/inbox-chrome.tsx";
const FIELD_BORDER_PATH = "apps/mobile/src/components/message-composer-field-border.ts";
const CHROME_TEST_PATH = "apps/mobile/tests/inbox-conversation-chrome.test.ts";
const FIELD_BORDER_TEST_PATH = "apps/mobile/tests/message-composer-field-border.test.ts";

/**
 * @param {{
 *   inboxIndexSource: string;
 *   floatingBarSource: string;
 *   conversationViewSource: string;
 *   messageComposerSource: string;
 *   inboxChromeSource: string;
 *   fieldBorderSource: string;
 *   chromeTestSource: string;
 *   fieldBorderTestSource: string;
 * }} input
 * @returns {string[]}
 */
export function checkMobileInboxConversationChrome({
  inboxIndexSource,
  floatingBarSource,
  conversationViewSource,
  messageComposerSource,
  inboxChromeSource,
  fieldBorderSource,
  chromeTestSource,
  fieldBorderTestSource,
}) {
  const violations = [];

  if (/conversations\[0\]/.test(inboxIndexSource)) {
    violations.push(
      `${INBOX_INDEX_PATH}: must not auto-select conversations[0] on wide load (marks read without a tap)`,
    );
  }

  if (!inboxIndexSource.includes("setConversationVisible(Boolean(selectedConversationId))")) {
    violations.push(
      `${INBOX_INDEX_PATH}: must drive wide-layout tab bar hiding via setConversationVisible`,
    );
  }

  if (!floatingBarSource.includes("hideForWideConversation")) {
    violations.push(
      `${FLOATING_BAR_PATH}: must hide the pill when inbox chrome reports conversationVisible`,
    );
  }

  if (!conversationViewSource.includes("onConversationOpened?.()")) {
    violations.push(`${CONVERSATION_VIEW_PATH}: must notify host after conversation GET succeeds`);
  }

  if (!inboxIndexSource.includes("await refreshUnreadCount()")) {
    violations.push(
      `${INBOX_INDEX_PATH}: must refresh the tab-bar unread count after opening Samtale`,
    );
  }

  if (/openConversation[\s\S]*void loadConversations\(\)/.test(inboxIndexSource)) {
    violations.push(
      `${INBOX_INDEX_PATH}: must not race loadConversations in parallel with GET detail on open`,
    );
  }

  if (!inboxChromeSource.includes("conversationVisible")) {
    violations.push(`${INBOX_CHROME_PATH}: must expose conversationVisible for wide Samtale`);
  }

  if (!messageComposerSource.includes("composerFieldBorder")) {
    violations.push(
      `${MESSAGE_COMPOSER_PATH}: must use composerFieldBorder for locked focus tokens`,
    );
  }

  if (!fieldBorderSource.includes("borderWidth: 2")) {
    violations.push(
      `${FIELD_BORDER_PATH}: focused composer field must use border.focus (2px strong border)`,
    );
  }

  if (!chromeTestSource.includes("does not auto-select the first conversation on wide load")) {
    violations.push(
      `${CHROME_TEST_PATH}: must regression-test wide inbox chrome (no auto-open, unread refresh)`,
    );
  }

  if (!fieldBorderTestSource.includes("uses border.strong / border.focus on focus")) {
    violations.push(`${FIELD_BORDER_TEST_PATH}: must regression-test composer focus border tokens`);
  }

  return violations;
}

export function checkMobileInboxConversationChromeFromDisk() {
  return checkMobileInboxConversationChrome({
    inboxIndexSource: readFileSync(INBOX_INDEX_PATH, "utf8"),
    floatingBarSource: readFileSync(FLOATING_BAR_PATH, "utf8"),
    conversationViewSource: readFileSync(CONVERSATION_VIEW_PATH, "utf8"),
    messageComposerSource: readFileSync(MESSAGE_COMPOSER_PATH, "utf8"),
    inboxChromeSource: readFileSync(INBOX_CHROME_PATH, "utf8"),
    fieldBorderSource: readFileSync(FIELD_BORDER_PATH, "utf8"),
    chromeTestSource: readFileSync(CHROME_TEST_PATH, "utf8"),
    fieldBorderTestSource: readFileSync(FIELD_BORDER_TEST_PATH, "utf8"),
  });
}

function main() {
  const violations = checkMobileInboxConversationChromeFromDisk();
  if (violations.length > 0) {
    console.error("Mobile inbox conversation chrome ratchet failed:\n");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Mobile inbox conversation chrome check passed.");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main();
}
