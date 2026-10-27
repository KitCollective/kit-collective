import type { Board } from "../assets.js";

/** The body parts a mail is built from. The Button is not here: a definition carries at most one. */
export type BodyPart =
  | { part: "code"; code: string }
  | { part: "jersey"; photoUrl?: string; club: string; meta: string }
  | { part: "factRows"; rows: { label: string; value: string; mono?: boolean }[] }
  | { part: "message"; text: string }
  | { part: "text"; text: string }
  | { part: "note"; text: string };

/** One mail kind: everything that differs between mails. Layout lives in the renderer. */
export type MailDefinition<D> = {
  board: Board;
  subject: (data: D) => string;
  preheader: (data: D) => string;
  headline: string;
  supportingLine: (data: D) => string;
  parts: (data: D) => BodyPart[];
  button?: { label: string; target: (data: D) => string };
  footerReason: string;
};

export type RenderedMail = { subject: string; preheader: string; html: string; text: string };

/** A part's two renderings: a table row for HTML and plain lines for the text body. */
export type PartOutput = { html: string; text: string };
