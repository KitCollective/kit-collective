import type { MailDefinition } from "../template/types.js";
import { accountFooter, gap, supportNote } from "./account-copy.js";

/**
 * Mail 04, account deleted, sent to the address the account had (docs/design-system.md →
 * Transactional e-mail): board 2, no button, body Text and Note. It carries nothing of the account:
 * no handle, jersey or message. Paper `Lys / 04` was not readable, so the sentences are flagged gaps.
 */
export const accountDeletedMail: MailDefinition<Record<string, never>> = {
  board: 2,
  subject: () => "Din konto er slettet",
  preheader: () => gap("underlinje"),
  headline: "Din konto er slettet",
  supportingLine: () => gap("underlinje"),
  parts: () => [
    { part: "text", text: gap("tekst") },
    { part: "note", text: supportNote() },
  ],
  footerReason: accountFooter(gap("fodnotens årsag")),
};
