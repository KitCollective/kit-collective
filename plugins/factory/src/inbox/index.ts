// The Inbox: what waits for a person, read from Linear on every call. `createInbox` gives the
// area's RPC handler and CLI command; server.ts and src/contract.ts register them in one line each.
import { type BbPluginApi, cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import { parseRegistry } from "../loop-registry.js";
import { buildCards } from "./cards.js";
import { type InboxCardDto, type InboxConfig, inboxConfig } from "./contract.js";
import { fetchWaiting } from "./linear.js";

export { inboxContract } from "./contract.js";

const CONFIG_KEY = "inbox";

/** What the Inbox reads from the rest of the plugin. */
export interface InboxDeps {
  kv: BbPluginApi["storage"]["kv"];
  /** The board's Linear team and the text of `factory.config.json`; throws when the board is not set up. */
  board: () => Promise<{ teamKey: string; registryText: string }>;
  linearApiKey: () => Promise<string>;
  /** The newest recorded review verdict line for the issue, or null. */
  verdictOf: (identifier: string) => string | null;
  /** Tells open pages to read again. */
  changed: () => void;
}

const SETUP = "bb optio inbox --state <state> --labels <question labels>";

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

export function createInbox(deps: InboxDeps) {
  async function config(): Promise<InboxConfig | null> {
    const stored = await deps.kv.get<unknown>(CONFIG_KEY);
    return stored === undefined || stored === null ? null : inboxConfig.parse(stored);
  }

  /** The cards, read from Linear now; nothing is kept between calls. */
  async function list() {
    try {
      const setting = await config();
      if (setting === null) {
        throw new Error(`the Inbox is not set up: run \`${SETUP}\` (docs/agents/optio.md)`);
      }
      const { teamKey, registryText } = await deps.board();
      const registry = parseRegistry(registryText);
      const issues = await fetchWaiting(await deps.linearApiKey(), teamKey, setting.state);
      const cards = buildCards(issues, {
        config: setting,
        workpadHeading: registry.ok ? registry.registry.workpadHeading : null,
        verdictOf: deps.verdictOf,
      });
      return { error: null, cards };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), cards: [] };
    }
  }

  const command = cliCommand({
    summary: "List what waits for a person in the Inbox: reviews first, then questions",
    description: `With --state and --labels it sets where the Inbox looks instead: the state issues wait in, and the labels that mark a question. --off switches the Inbox off.`,
    options: {
      json: { type: "boolean", description: "Emit machine-readable JSON" },
      state: { type: "string", description: "Set the state issues wait in" },
      labels: { type: "string", description: "Set the question labels, comma separated" },
      off: { type: "boolean", description: "Switch the Inbox off" },
    },
    async run({ options }) {
      if (options.off === true || options.state !== undefined || options.labels !== undefined) {
        if (options.off === true) {
          await deps.kv.delete(CONFIG_KEY);
        } else if (options.state === undefined || options.labels === undefined) {
          throw new PluginCliError("give both --state and --labels", { code: "missing_option" });
        } else {
          const parsed = inboxConfig.safeParse({
            state: options.state,
            questionLabels: options.labels.split(",").map((label) => label.trim()),
          });
          if (!parsed.success) {
            throw new PluginCliError("--state and every label must be non-empty", {
              code: "invalid_config",
            });
          }
          await deps.kv.set(CONFIG_KEY, parsed.data);
        }
        deps.changed();
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
