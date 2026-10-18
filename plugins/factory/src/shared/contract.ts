// RPC output shapes more than one area returns.
import { z } from "zod";

export const ok = z.object({ ok: z.literal(true) });

/**
 * How far the landing of an approved issue got: `approved` (not in the merge queue yet), `queued`,
 * `merged` (the land gate is waiting), `done`, or `stopped` (the line says why).
 */
const LANDING_PHASES = ["approved", "queued", "merged", "done", "stopped"] as const;
export type LandingPhase = (typeof LANDING_PHASES)[number];

const landing = z.object({
  phase: z.enum(LANDING_PHASES),
  /** What the last slice said (the verdict without its tag, or why Optio could not run it); null before its first answer. */
  line: z.string().nullable(),
  /** When the phase was last written (ISO). */
  at: z.string(),
});

/** One card of the Inbox. Home lists the same cards, so both areas read this shape. */
export const inboxCard = z.object({
  /** Unique among the cards and stable between reads: the identifier, or `kind:` and the source's id. */
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  pullRequest: z.object({ number: z.number(), url: z.string() }).nullable(),
  /**
   * A review waits for the merge; a question waits for an answer; a mention and an alarm wait to be
   * seen; a landing is an approved issue on its way to done, out of the Inbox state, with nothing to answer.
   */
  kind: z.enum(["review", "question", "mention", "alarm", "landing"]),
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
  /** When the issue entered the state, or the mention or alarm was raised (ISO); for a landing card, when it was approved. */
  since: z.string(),
  /** The landing after an approval, until the issue is done; information only, never an action. Null when nobody approved it here. */
  landing: landing.nullable(),
});

export type InboxCardDto = z.infer<typeof inboxCard>;
export type LandingDto = z.infer<typeof landing>;
