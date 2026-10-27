/**
 * A typed thing that happened which should reach someone by mail. Callers pass the event and its
 * facts; they never build subject, copy or markup.
 */
export type MailEvent =
  | { kind: "code"; to: string; data: { code: string } }
  /** @deprecated Password-era mail, kept only while the admin app signs in through the API. */
  | { kind: "verify"; to: string; data: { url: string } }
  /** @deprecated Password-era mail, kept only while the admin app signs in through the API. */
  | { kind: "reset"; to: string; data: { url: string } };

export type MailKind = MailEvent["kind"];
