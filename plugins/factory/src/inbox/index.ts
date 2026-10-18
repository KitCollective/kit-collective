// The Inbox: what waits for a person, read from Linear on every call. `createInbox` gives the
// area's RPC handler and CLI command; server.ts builds it and registers each with one line, and
// src/contract.ts spreads the area's `inboxContract`.
import { type BbPluginApi, cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import { CHANGED } from "../contract.js";
import { parseRegistry } from "../loop-registry.js";
import { buildCards } from "./cards.js";
import { type InboxCardDto, type InboxConfig, inboxConfig } from "./contract.js";
import { fetchWaiting } from "./linear.js";

const CONFIG_KEY = "inbox";

/** What the Inbox reads from the rest of the plugin; `Board` is the stored board config. */
export interface InboxDeps<Board extends { teamKey: string; projectId: string }> {
  bb: Pick<BbPluginApi, "storage" | "realtime" | "server">;
  /** The stored board config, or null when the Board was never set up; the Inbox does not need it. */
  storedScheduler: () => Promise<Board | null>;
  /** The text of a bb project's `factory.config.json`; throws when it cannot be read. */
  projectConfigText: (projectId: string) => Promise<string>;
  linearApiKey: () => Promise<string>;
  /** The review gate record: the newest run for an issue. */
  gateRuns: { latestReview(issue: string, since: number): { verdictLine: string | null } | null };
  /** The questions Staff members have put to the person in their Staff chats and that are still open. */
  staffQuestions: () => Promise<
    { agentId: string; name: string; question: string; askedAt: number; chatThreadId: string }[]
  >;
}

const SETUP = "bb optio inbox --state <state> --labels <question labels> --project <bb project id>";

function describe(cards: InboxCardDto[]): string {
  if (cards.length === 0) return "The Inbox is empty";
  return [
    `${cards.length} waiting in the Inbox`,
    ...cards.map((card) => {
      const pull = card.pullRequest === null ? "" : ` PR #${card.pullRequest.number}`;
      const detail =
        card.kind === "question"
          ? `${card.label ?? "question"}: ${card.waiting?.ask ?? "no question in the workpad"}`
          : `review: ${card.review?.verdict ?? "no verdict recorded"}`;
      return `${card.identifier}${pull} ${card.title} (${detail})`;
    }),
  ].join("\n");
}

export function createInbox<Board extends { teamKey: string; projectId: string }>(
  deps: InboxDeps<Board>,
) {
  async function config(): Promise<InboxConfig | null> {
    const stored = await deps.bb.storage.kv.get<unknown>(CONFIG_KEY);
    return stored === undefined || stored === null ? null : inboxConfig.parse(stored);
  }

  /** One card per open Staff question, oldest first, linking to the chat it was asked in. */
  async function staffCards(): Promise<InboxCardDto[]> {
    const base = deps.bb.server.experimental_appUrl ?? deps.bb.server.loopbackBaseUrl;
    return (await deps.staffQuestions())
      .sort((a, b) => a.askedAt - b.askedAt)
      .map(
        (question): InboxCardDto => ({
          identifier: question.name,
          title: `Question in ${question.name}'s Staff chat`,
          url: `${base}/thread/${question.chatThreadId}`,
          pullRequest: null,
          // A question, so the page shows it as one and never as a review that is ready to merge.
          kind: "question",
          label: question.name,
          waiting: {
            ask: question.question,
            stage: "Staff chat",
            asked: new Date(question.askedAt).toISOString().slice(0, 10),
          },
          review: null,
          since: new Date(question.askedAt).toISOString(),
          chat: { threadId: question.chatThreadId },
        }),
      );
  }

  /** The cards: Linear's, read now, then the Staff questions; nothing is kept between calls. */
  async function list() {
    const linear = await linearCards();
    try {
      return { error: linear.error, cards: [...linear.cards, ...(await staffCards())] };
    } catch (error) {
      return {
        error: linear.error ?? (error instanceof Error ? error.message : String(error)),
        cards: linear.cards,
      };
    }
  }

  async function linearCards() {
    try {
      const setting = await config();
      if (setting === null) {
        throw new Error(`the Inbox is not set up: run \`${SETUP}\` (docs/agents/optio.md)`);
      }
      // The Inbox's own project first, the Board's when it has none: it never needs the Board.
      const board = setting.projectId === undefined ? await deps.storedScheduler() : null;
      const projectId = setting.projectId ?? board?.projectId;
      if (projectId === undefined) {
        throw new Error(`the Inbox has no project: run \`${SETUP}\` (docs/agents/optio.md)`);
      }
      const registry = parseRegistry(await deps.projectConfigText(projectId));
      if (!registry.ok) throw new Error(registry.error);
      const teamKey = registry.registry.teamKey ?? board?.teamKey;
      if (teamKey === undefined) {
        throw new Error("factory.config.json names no Linear team: set linear.teamKey");
      }
      const issues = await fetchWaiting(await deps.linearApiKey(), teamKey, setting.state);
      const cards = buildCards(issues, {
        config: setting,
        workpadHeading: registry.registry.workpadHeading,
        verdictOf: (identifier) => deps.gateRuns.latestReview(identifier, 0)?.verdictLine ?? null,
      });
      return { error: null, cards };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), cards: [] };
    }
  }

  const command = cliCommand({
    summary: "List what waits for a person in the Inbox: reviews first, then questions",
    description: `With --state and --labels it sets where the Inbox looks instead: the state issues wait in, and the labels that mark a question. --project names the bb project whose factory.config.json gives the Linear team; without it the Board's project is used. --off switches the Inbox off.`,
    options: {
      json: { type: "boolean", description: "Emit machine-readable JSON" },
      state: { type: "string", description: "Set the state issues wait in" },
      labels: { type: "string", description: "Set the question labels, comma separated" },
      project: {
        type: "string",
        description: "Set the bb project to read factory.config.json from",
      },
      off: { type: "boolean", description: "Switch the Inbox off" },
    },
    async run({ options }) {
      if (options.off === true || options.state !== undefined || options.labels !== undefined) {
        if (options.off === true) {
          await deps.bb.storage.kv.delete(CONFIG_KEY);
        } else if (options.state === undefined || options.labels === undefined) {
          throw new PluginCliError("give both --state and --labels", { code: "missing_option" });
        } else {
          const parsed = inboxConfig.safeParse({
            state: options.state,
            questionLabels: options.labels.split(",").map((label) => label.trim()),
            ...(options.project === undefined ? {} : { projectId: options.project }),
          });
          if (!parsed.success) {
            throw new PluginCliError("--state, --project and every label must be non-empty", {
              code: "invalid_config",
            });
          }
          await deps.bb.storage.kv.set(CONFIG_KEY, parsed.data);
        }
        deps.bb.realtime.publish(CHANGED, {}); // open pages read again
        return {
          exitCode: 0,
          stdout: options.off === true ? "The Inbox is off" : "The Inbox is set",
        };
      }
      const { error, cards } = await list();
      return {
        exitCode: error === null ? 0 : 1,
        stdout: options.json ? JSON.stringify({ error, cards }) : (error ?? describe(cards)),
      };
    },
  });

  return { list, command };
}
