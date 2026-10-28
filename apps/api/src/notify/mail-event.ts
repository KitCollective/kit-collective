/**
 * A typed thing that happened which should reach someone by mail. Callers pass the event and its
 * facts; they never build subject, copy or markup.
 */
export type MailEvent =
  | { kind: "code"; to: string; data: { code: string } }
  | { kind: "email-change-code"; to: string; data: { code: string } }
  | { kind: "email-changed"; to: string; data: { newEmail: string } }
  | { kind: "account-deleted"; to: string; data: Record<string, never> }
  | {
      kind: "jersey-taken-down";
      to: string;
      data: { club: string; meta: string; reason?: string };
    }
  | {
      kind: "bid-new";
      to: string;
      data: {
        club: string;
        meta: string;
        photoUrl?: string;
        amountDkk: number;
        bidderHandle: string;
        bidderCity?: string;
        conversationId: string;
        messageId: string;
      };
    }
  | {
      kind: "bid-accepted";
      to: string;
      data: {
        club: string;
        meta: string;
        photoUrl?: string;
        amountDkk: number;
        ownerHandle: string;
        conversationId: string;
      };
    }
  | {
      kind: "bid-declined";
      to: string;
      data: {
        club: string;
        meta: string;
        photoUrl?: string;
        amountDkk: number;
        ownerHandle: string;
      } & (
        | { reason: "declined"; userJerseyId: string }
        | { reason: "went-to-another" | "jersey-deleted" }
      );
    }
  /** @deprecated Password-era mail, kept only while the admin app signs in through the API. */
  | { kind: "verify"; to: string; data: { url: string } }
  /** @deprecated Password-era mail, kept only while the admin app signs in through the API. */
  | { kind: "reset"; to: string; data: { url: string } };

export type MailKind = MailEvent["kind"];

type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;

/** The bid mails go to a Collector and are gated by blocks and their e-mail switch (05–07). */
export type CollectorMailEvent = DistributiveOmit<
  Extract<MailEvent, { kind: "bid-new" | "bid-accepted" | "bid-declined" }>,
  "to"
>;
