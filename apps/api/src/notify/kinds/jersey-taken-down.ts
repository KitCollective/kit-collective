import type { MailDefinition } from "../template/types.js";
import { accountFooter, gap, supportNote } from "./account-copy.js";

export type JerseyTakenDownMailData = {
  club: string;
  /** Type · season, as the lock's Jersey part shows it. */
  meta: string;
  /** What the operator wrote. The lock has no reason list, so none is invented. */
  reason?: string;
};

/**
 * Mail 12, jersey taken down (docs/design-system.md → Transactional e-mail): board 2, no button,
 * body Jersey, Fact row Årsag and Note. The photo is already deleted by the take-down, so the Jersey
 * part has none. Paper `Lys / 12` was not readable, so the other sentences are flagged gaps.
 */
export const jerseyTakenDownMail: MailDefinition<JerseyTakenDownMailData> = {
  board: 2,
  subject: () => "Din trøje er fjernet",
  preheader: () => gap("underlinje"),
  headline: "Din trøje er fjernet",
  supportingLine: () => gap("underlinje"),
  parts: ({ club, meta, reason }) => [
    { part: "jersey", club, meta },
    { part: "factRows", rows: [{ label: "Årsag", value: reason ?? gap("årsag") }] },
    { part: "note", text: supportNote() },
  ],
  footerReason: accountFooter(gap("fodnotens årsag")),
};
