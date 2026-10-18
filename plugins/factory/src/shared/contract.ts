// RPC output shapes more than one area returns.
import { z } from "zod";

export const ok = z.object({ ok: z.literal(true) });

/** One card of the Inbox. Home lists the same cards, so both areas read this shape. */
export const inboxCard = z.object({
  /** Unique among the cards and stable between reads: the identifier, or `kind:` and the source's id. */
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  pullRequest: z.object({ number: z.number(), url: z.string() }).nullable(),
  /** A review waits for the merge; a question waits for an answer; a mention and an alarm wait to be seen. */
  kind: z.enum(["review", "question", "mention", "alarm"]),
  /** The question label the issue carries; null on a review. */
  label: z.string().nullable(),
  /** The lettered choices (A, B, …) the ask offers, in order; empty when it offers none or on a review. */
  choices: z.array(z.object({ letter: z.string(), text: z.string() })),
  /** What the run asked and the stage it came from; null on a review or when the workpad has none. */
  waiting: z
    .object({ ask: z.string(), stage: z.string(), asked: z.string().nullable() })
    .nullable(),
  /** The recorded review verdict and the pull request's title; null on a question. */
  review: z.object({ verdict: z.string().nullable(), change: z.string().nullable() }).nullable(),
  /** The unread Linear notification that mentions the key owner; null on any other kind. */
  mention: z
    .object({ notificationId: z.string(), comment: z.string(), author: z.string().nullable() })
    .nullable(),
  /** The problems an open watchdog alarm lists; null on any other kind. */
  alarm: z.object({ problems: z.array(z.string()) }).nullable(),
  /** When the issue entered the state, or the mention or alarm was raised, or a Staff question asked (ISO). */
  since: z.string(),
  /**
   * Set on a Staff question only: the Staff chat it was asked in, which the person answers in. The
   * card leaves the Inbox once they have.
   */
  chat: z.object({ threadId: z.string() }).optional(),
});

export type InboxCardDto = z.infer<typeof inboxCard>;
