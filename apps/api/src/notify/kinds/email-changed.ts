import { maskEmail } from "../mask-email.js";
import type { MailDefinition } from "../template/types.js";
import { accountFooter, gap, supportNote } from "./account-copy.js";

export type EmailChangedMailData = { newEmail: string };

/**
 * Mail 03, e-mail changed, sent to the old address (docs/design-system.md → Transactional e-mail):
 * board 2, no button, body Fact row Ny e-mail (masked) and Note. Subject and headline come from the
 * lock; Paper `Lys / 03` was not readable, so the other sentences are flagged gaps.
 */
export const emailChangedMail: MailDefinition<EmailChangedMailData> = {
  board: 2,
  subject: () => "Din e-mail er ændret",
  preheader: () => gap("underlinje"),
  headline: "Din e-mail er ændret",
  supportingLine: () => gap("underlinje"),
  parts: ({ newEmail }) => [
    { part: "factRows", rows: [{ label: "Ny e-mail", value: maskEmail(newEmail) }] },
    { part: "note", text: supportNote() },
  ],
  footerReason: accountFooter(gap("fodnotens årsag")),
};
