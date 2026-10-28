import { identityCodeExpiryMinutes } from "../../config/identity-code-env.js";
import type { MailDefinition } from "../template/types.js";
import type { CodeMailData } from "./code.js";

/**
 * Mail 02, confirm new e-mail (docs/design-system.md → Transactional e-mail): board 2, no button,
 * body Code, Text, Note. Subject and headline come from the lock. Paper `Lys / 02` is not drawn
 * for Text and Note, so they repeat mail 01's sentences and footer reason (flagged on KIT-510).
 */
const lasts = () => `Gælder i ${identityCodeExpiryMinutes()} minutter.`;

export const emailChangeCodeMail: MailDefinition<CodeMailData> = {
  board: 2,
  subject: ({ code }) => `${code} bekræfter din nye e-mail`,
  preheader: lasts,
  headline: "Bekræft din nye e-mail",
  supportingLine: lasts,
  parts: ({ code }) => [
    { part: "code", code },
    { part: "text", text: "Skriv koden i appen for at fortsætte." },
    { part: "note", text: "Har du ikke bedt om en kode? Så kan du se bort fra mailen." },
  ],
  footerReason:
    "Du får denne mail, fordi nogen bad om en kode til denne adresse. Den kan ikke slås fra.",
};
