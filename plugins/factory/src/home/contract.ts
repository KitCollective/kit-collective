// The Home area's part of the RPC contract.
import { z } from "zod";

/** How many of the newest Inbox cards bb's Home lists. */
export const HOME_CARDS = 3;

const homeCard = z.object({
  /** The card's id in the Inbox: what the Inbox panel's `subPath` opens. */
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  kind: z.enum(["review", "question", "mention", "alarm"]),
  /** When the card began to wait (ISO). */
  since: z.string(),
});

export const homeContract = {
  /** The number of Inbox cards and the newest few, read from Linear on each call. */
  home_waiting: {
    input: z.null(),
    output: z.object({
      /** Why the cards could not be read, when they could not. */
      error: z.string().nullable(),
      count: z.number(),
      newest: z.array(homeCard),
    }),
  },
};

export type HomeDto = z.infer<typeof homeContract.home_waiting.output>;
