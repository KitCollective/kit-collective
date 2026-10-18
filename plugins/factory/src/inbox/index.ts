// The Inbox: what waits for a person, read from Linear on every call. `createInbox` gives the
// area's RPC handler and CLI command; server.ts builds it and registers each with one line, and
// src/contract.ts spreads the area's `inboxContract`.
import { type BbPluginApi, cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import { CHANGED } from "../contract.js";
import { parseRegistry } from "../loop-registry.js";
import { alarmCards, buildCards, mentionCards, withNotices } from "./cards.js";
import { type InboxCardDto, type InboxConfig, inboxConfig } from "./contract.js";
import { fetchWaiting, settleIssue } from "./linear.js";
import { fetchAlarmThread, fetchMentions, markMentionRead } from "./notices.js";

const CONFIG_KEY = "inbox";

/** What the Inbox reads from the rest of the plugin; `Board` is the stored board config. */
export interface InboxDeps<Board extends { teamKey: string; projectId: string }> {
  bb: Pick<BbPluginApi, "storage" | "realtime">;
  /** The stored board config, or null when the Board was never set up; the Inbox does not need it. */
  storedScheduler: () => Promise<Board | null>;
  /** The text of a bb project's `factory.config.json`; throws when it cannot be read. */
  projectConfigText: (projectId: string) => Promise<string>;
  linearApiKey: () => Promise<string>;
  /** The review gate record: the newest run for an issue. */
  gateRuns: { latestReview(issue: string, since: number): { verdictLine: string | null } | null };
}

const SETUP = "bb optio inbox --state <state> --labels <question labels> --project <bb project id>";

function describe(cards: InboxCardDto[]): string {
  if (cards.length === 0) return "The Inbox is empty";
  return [
    `${cards.length} waiting in the Inbox`,
    ...cards.map((card) => {
      const pull = card.pullRequest === null ? "" : ` PR #${card.pullRequest.number}`;
      const detail = {
        question: () =>
          `${card.label ?? "question"}: ${card.waiting?.ask ?? "no question in the workpad"}`,
        review: () => `review: ${card.review?.verdict ?? "no verdict recorded"}`,
        mention: () =>
          `mention by ${card.mention?.author ?? "someone"}: ${card.mention?.comment ?? ""}`,
        alarm: () => `alarm: ${card.alarm?.problems.join("; ") || "no problem listed"}`,
      }[card.kind]();
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

  /** Where the Inbox looks and who it asks: its setting, the registry and the Linear team. */
  async function resolve() {
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
    return { setting, registry: registry.registry, teamKey };
  }

  /**
   * The cards, read from Linear now; nothing is kept between calls. The waiting issues, the mentions
   * and the alarms are three reads: one that fails is named in `error` and the others still show.
   */
  async function list() {
    try {
      const { setting, registry, teamKey } = await resolve();
      const key = await deps.linearApiKey();
      const [waiting, mentions, alarm] = await Promise.allSettled([
        fetchWaiting(key, teamKey, setting.state),
        fetchMentions(key),
        setting.alarmIssue === undefined
          ? Promise.resolve(null)
          : fetchAlarmThread(key, setting.alarmIssue),
      ]);
      const errors: string[] = [];
      const failed = (what: string, outcome: PromiseSettledResult<unknown>) => {
        if (outcome.status === "rejected") {
          const reason: unknown = outcome.reason;
          errors.push(`${what}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      };
      failed("waiting issues", waiting);
      failed("mentions", mentions);
      failed("alarms", alarm);
      const issueCards =
        waiting.status === "fulfilled"
          ? buildCards(waiting.value, {
              config: setting,
              workpadHeading: registry.workpadHeading,
              verdictOf: (identifier) =>
                deps.gateRuns.latestReview(identifier, 0)?.verdictLine ?? null,
            })
          : [];
      const notices = [
        ...(mentions.status === "fulfilled" ? mentionCards(mentions.value) : []),
        ...(alarm.status === "fulfilled" && alarm.value !== null ? alarmCards(alarm.value) : []),
      ];
      return {
        error: errors.length === 0 ? null : errors.join("; "),
        cards: withNotices(issueCards, notices),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), cards: [] };
    }
  }

  /**
   * Hands the issue back to the Loop that starts issues: the comment is the key owner's (the Linear key
   * is theirs), the question label goes, the Loop's label and state come. A failed write is reported
   * and leaves the issue as it was, so the card stays.
   */
  async function settle(identifier: string, comment: string, expectQuestion: boolean) {
    try {
      const text = comment.trim();
      if (text === "") {
        throw new Error(expectQuestion ? "write an answer first" : "a rejection needs a comment");
      }
      const { setting, registry, teamKey } = await resolve();
      const loop = registry.loops.find((one) => one.enabled && one.trigger.kind === "issue");
      if (loop === undefined || loop.trigger.kind !== "issue") {
        throw new Error("factory.config.json has no enabled Loop to hand the issue back to");
      }
      await settleIssue(await deps.linearApiKey(), {
        identifier,
        teamKey,
        comment: text,
        waitingState: setting.state,
        dropLabels: setting.questionLabels,
        expectQuestion,
        toState: loop.trigger.state,
        toLabel: loop.trigger.label,
      });
      deps.bb.realtime.publish(CHANGED, {}); // open pages read again
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Handling a mention (opening it or dismissing it) marks its notification read in Linear. */
  async function read({ notificationId }: { notificationId: string }) {
    try {
      if ((await config()) === null) {
        throw new Error(`the Inbox is not set up: run \`${SETUP}\` (docs/agents/optio.md)`);
      }
      await markMentionRead(await deps.linearApiKey(), notificationId);
      deps.bb.realtime.publish(CHANGED, {}); // open pages read again
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const answer = ({ identifier, answer }: { identifier: string; answer: string }) =>
    settle(identifier, answer, true);
  const reject = ({ identifier, comment }: { identifier: string; comment: string }) =>
    settle(identifier, comment, false);

  const command = cliCommand({
    summary:
      "List what waits for a person in the Inbox: reviews first, then questions, mentions and alarms",
    description: `With --state and --labels it sets where the Inbox looks instead: the state issues wait in, and the labels that mark a question. --project names the bb project whose factory.config.json gives the Linear team; without it the Board's project is used. --alarm-issue names the issue the watchdog comments on; without it there are no alarm cards. --off switches the Inbox off.`,
    options: {
      json: { type: "boolean", description: "Emit machine-readable JSON" },
      state: { type: "string", description: "Set the state issues wait in" },
      labels: { type: "string", description: "Set the question labels, comma separated" },
      project: {
        type: "string",
        description: "Set the bb project to read factory.config.json from",
      },
      "alarm-issue": {
        type: "string",
        description: "Set the issue whose watchdog alarm comments show as cards",
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
            ...(options["alarm-issue"] === undefined ? {} : { alarmIssue: options["alarm-issue"] }),
          });
          if (!parsed.success) {
            throw new PluginCliError(
              "--state, --project, --alarm-issue and every label must be non-empty",
              { code: "invalid_config" },
            );
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

  return { list, answer, reject, read, command };
}
