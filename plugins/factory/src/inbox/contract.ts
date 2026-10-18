// The Inbox's part of the RPC contract.
import { z } from "zod";

/**
 * Where the Inbox looks: `state` is where issues wait for a person, a label of `questionLabels`
 * marks a question. `projectId` is the bb project whose `factory.config.json` names the Linear team
 * and the workpad heading; without it the Inbox uses the Board's project. Approve needs the landing
 * settings: `approveTo` is the merge-permission state an approval moves the issue to, `landHost` the
 * runs machine's host id and `landCheckout` the absolute path of its main checkout, where the
 * landing script runs.
 */
export const inboxConfig = z
  .object({
    state: z.string().trim().min(1),
    questionLabels: z.array(z.string().trim().min(1)),
    projectId: z.string().trim().min(1).optional(),
    approveTo: z.string().trim().min(1).optional(),
    landHost: z.string().trim().min(1).optional(),
    landCheckout: z.string().trim().startsWith("/").optional(),
  })
  .strict();

/**
 * How far the landing of an approved issue got: `approved` (not in the merge queue yet), `queued`,
 * `merged` (the land gate is waiting), `done`, or `stopped` (the line says why).
 */
export const LANDING_PHASES = ["approved", "queued", "merged", "done", "stopped"] as const;
export type LandingPhase = (typeof LANDING_PHASES)[number];

const landing = z.object({
  phase: z.enum(LANDING_PHASES),
  /** The landing script's last verdict line; null before its first answer. */
  line: z.string().nullable(),
  /** When the phase was last written (ISO). */
  at: z.string(),
});

const inboxCard = z.object({
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  pullRequest: z.object({ number: z.number(), url: z.string() }).nullable(),
  /** A review waits for the merge; a question waits for an answer. */
  kind: z.enum(["review", "question"]),
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
  /** When the issue entered the state (ISO); for a landing card, when it was approved. */
  since: z.string(),
  /** The landing after an approval, until the issue is done; null when nobody approved it here. */
  landing: landing.nullable(),
});

/** What an action answers: why the Linear write failed, or null when it went through. */
const settled = z.object({ error: z.string().nullable() });

export const inboxContract = {
  inbox_list: {
    input: z.null(),
    output: z.object({
      /** Why the cards could not be read, when they could not. */
      error: z.string().nullable(),
      cards: z.array(inboxCard),
    }),
  },
  /** Writes `answer` as a comment, swaps the question label for the Loop's ready label and moves the issue to the Loop's state. */
  inbox_answer: {
    input: z.object({ identifier: z.string().min(1), answer: z.string() }),
    output: settled,
  },
  /** The same for a green review, whose comment is the reason it goes back. */
  inbox_reject: {
    input: z.object({ identifier: z.string().min(1), comment: z.string() }),
    output: settled,
  },
  /** Comments the approval and moves a green review to the merge-permission state, then lands it on the runs machine. */
  inbox_approve: {
    input: z.object({ identifier: z.string().min(1) }),
    output: settled,
  },
};

export type InboxConfig = z.infer<typeof inboxConfig>;
export type InboxCardDto = z.infer<typeof inboxCard>;
export type LandingDto = z.infer<typeof landing>;
export type InboxDto = z.infer<typeof inboxContract.inbox_list.output>;
