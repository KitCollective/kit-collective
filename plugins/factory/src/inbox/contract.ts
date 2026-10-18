// The Inbox's part of the RPC contract.
import { z } from "zod";
import { type InboxCardDto, inboxCard } from "../shared/contract.js";

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

/**
 * A card of the Inbox page: the card Home also lists, plus the landing after an approval. Home lists
 * no landing (nothing waits for a person on it), so the landing stays out of the shared card: a
 * `landing` card is an approved issue on its way to done, out of the Inbox state, with nothing to
 * answer, and `since` is when it was approved. `landing` is information only, never an action; null
 * when nobody approved the issue here.
 */
const inboxListCard = inboxCard.extend({
  kind: z.enum([...inboxCard.shape.kind.options, "landing"]),
  landing: landing.nullable(),
});

/**
 * Where the Inbox looks: `state` is where issues wait for a person, a label of `questionLabels`
 * marks a question. `projectId` is the bb project whose `factory.config.json` names the Linear team
 * and the workpad heading; without it the Inbox uses the Board's project. `alarmIssue` is the issue
 * the watchdog comments on; without it the Inbox shows no alarm cards. Approve needs the landing
 * settings: `approveTo` is the merge-permission state an approval moves the issue to, `landHost` the
 * runs machine's host id and `landCheckout` the absolute path of its main checkout, where the
 * landing script runs.
 */
export const inboxConfig = z
  .object({
    state: z.string().trim().min(1),
    questionLabels: z.array(z.string().trim().min(1)),
    projectId: z.string().trim().min(1).optional(),
    alarmIssue: z.string().trim().min(1).optional(),
    approveTo: z.string().trim().min(1).optional(),
    landHost: z.string().trim().min(1).optional(),
    landCheckout: z.string().trim().startsWith("/").optional(),
  })
  .strict();

/** What an action answers: why the Linear write failed, or null when it went through. */
const settled = z.object({ error: z.string().nullable() });

export const inboxContract = {
  inbox_list: {
    input: z.null(),
    output: z.object({
      /** Why the cards could not be read, when they could not. */
      error: z.string().nullable(),
      cards: z.array(inboxListCard),
    }),
  },
  /** Writes `answer` as a comment, swaps the question label for the Loop's ready label and moves the issue to the Loop's state. */
  inbox_answer: {
    input: z.object({ identifier: z.string().min(1), answer: z.string() }),
    output: settled,
  },
  /** Marks a mention's notification read in Linear, as the key owner. */
  inbox_read: {
    input: z.object({ notificationId: z.string().min(1) }),
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
export type { InboxCardDto };
export type LandingDto = z.infer<typeof landing>;
export type InboxListCardDto = z.infer<typeof inboxListCard>;
/** What the Inbox page reads: its cards with the landings. */
export type InboxListDto = z.infer<typeof inboxContract.inbox_list.output>;
/** What Home reads: the cards that wait for a person, without the landings. */
export type InboxDto = { error: string | null; cards: InboxCardDto[] };
