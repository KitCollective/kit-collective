import { identityCodeExpiryMinutes } from "../../config/identity-code-env.js";
import type { MailDefinition } from "../template/types.js";

export type CodeMailData = { code: string };

/**
 * Mail 01, the login code (docs/design-system.md → Transactional e-mail): board 2, no button,
 * body Code, Text, Note. The lock fixes subject, headline and parts, not the sentences.
 *
 * PROVISIONAL COPY: the supporting line, Text and Note below are placeholders built only from the
 * spec's facts (how long the code lasts; ignore it if it was not you). They have not been checked
 * against Paper `Lys / 01`. Replace them there, in these three strings, before this mail ships.
 */
export const codeMail: MailDefinition<CodeMailData> = {
  board: 2,
  subject: ({ code }) => `${code} er din kode`,
  preheader: () => "Brug koden til at logge ind på KitCollective.",
  headline: "Din kode",
  supportingLine: () => "Brug den til at logge ind på KitCollective.",
  parts: ({ code }) => [
    { part: "code", code },
    { part: "text", text: `Koden virker i ${identityCodeExpiryMinutes()} minutter.` },
    { part: "note", text: "Var det ikke dig, kan du bare ignorere denne mail." },
  ],
  footerReason: "Den kan ikke slås fra.",
};
