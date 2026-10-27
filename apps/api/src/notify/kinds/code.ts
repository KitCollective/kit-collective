import { identityCodeExpiryMinutes } from "../../config/identity-code-env.js";
import type { MailDefinition } from "../template/types.js";

export type CodeMailData = { code: string };

/**
 * Mail 01, the login code (docs/design-system.md → Transactional e-mail): board 2, no button,
 * body Code, Text, Note. Subject and headline come from the lock; the sentences come from Paper
 * `Lys / 01 Din kode` (approved by Nicklas on 2026-10-28). The preheader repeats how long the code
 * lasts, which Paper does not draw. The minutes follow the configured expiry (10 in Paper).
 */
const lasts = () => `Gælder i ${identityCodeExpiryMinutes()} minutter.`;

export const codeMail: MailDefinition<CodeMailData> = {
  board: 2,
  subject: ({ code }) => `${code} er din kode`,
  preheader: lasts,
  headline: "Din kode",
  supportingLine: lasts,
  parts: ({ code }) => [
    { part: "code", code },
    { part: "text", text: "Skriv koden i appen for at fortsætte." },
    { part: "note", text: "Har du ikke bedt om en kode? Så kan du se bort fra mailen." },
  ],
  // Paper's reason line, then the lock's rule for account mails (01–04, 12): both, per Nicklas.
  footerReason:
    "Du får denne mail, fordi nogen bad om en kode til denne adresse. Den kan ikke slås fra.",
};
