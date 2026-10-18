// The Inbox: what waits for a person, read from Linear on every call. `createInbox` gives the
// area's RPC handler and CLI command; server.ts builds it and registers each with one line, and
// src/contract.ts spreads the area's `inboxContract`.
import { type BbPluginApi, cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import { CHANGED } from "../contract.js";
import type { Core } from "../core.js";
import { GATE_CALL_TIMEOUT_MS, LAND_HOST_TIMEOUT_MS } from "../host-contract.js";
import { parseRegistry } from "../loop-registry.js";
import { alarmCards, buildCards, mentionCards, pullRequestOf, withNotices } from "./cards.js";
import {
  type InboxCardDto,
  type InboxConfig,
  type InboxDto,
  type InboxListCardDto,
  type InboxListDto,
  inboxConfig,
} from "./contract.js";
import { createLandings, landingCard } from "./landing.js";
import { approveIssue, fetchWaiting, settleIssue } from "./linear.js";
import { fetchAlarmThread, fetchMentions, markMentionRead } from "./notices.js";

const CONFIG_KEY = "inbox";

/** What the Inbox reads from the rest of the plugin; `Board` is the stored board config. */
export interface InboxDeps<Board extends { teamKey: string; projectId: string }> {
  bb: Pick<BbPluginApi, "storage" | "realtime" | "log" | "server">;
  /** The stored board config, or null when the Board was never set up; the Inbox does not need it. */
  storedScheduler: () => Promise<Board | null>;
  /** The text of a bb project's `factory.config.json`; throws when it cannot be read. */
  projectConfigText: (projectId: string) => Promise<string>;
  linearApiKey: () => Promise<string>;
  /** The review gate record: the newest run for an issue. */
  gateRuns: { latestReview(issue: string, since: number): { verdictLine: string | null } | null };
  /** The questions Staff members have put to the person in their Staff chats and that are still open. */
  staffQuestions: () => Promise<
    {
      id: string;
      agentId: string;
      name: string;
      question: string;
      askedAt: number;
      chatThreadId: string;
      chatHref: string;
    }[]
  >;
  /** The host bundle's client: the landing script runs on the runs machine through it. */
  hostClient: Pick<Core["hostClient"], "call">;
}

const SETUP = "bb optio inbox --state <state> --labels <question labels> --project <bb project id>";
const LANDING_SETUP =
  "bb optio inbox --approve-to <merge state> --land-host <runs machine host id> --land-checkout <its main checkout>";

function describe(cards: InboxListCardDto[]): string {
  if (cards.length === 0) return "The Inbox is empty";
  return [
    `${cards.length} waiting in the Inbox`,
    ...cards.map((card) => {
      const pull = card.pullRequest === null ? "" : ` PR #${card.pullRequest.number}`;
      const landing = card.landing === null ? "" : ` [landing ${card.landing.phase}]`;
      const detail = {
        question: () =>
          `${card.label ?? "question"}: ${card.waiting?.ask ?? "no question in the workpad"}`,
        review: () => `review: ${card.review?.verdict ?? "no verdict recorded"}`,
        mention: () =>
          `mention by ${card.mention?.author ?? "someone"}: ${card.mention?.comment ?? ""}`,
        alarm: () => `alarm: ${card.alarm?.problems.join("; ") || "no problem listed"}`,
        landing: () => `approved: ${card.landing?.line ?? "not started yet"}`,
      }[card.kind]();
      return `${card.identifier}${pull} ${card.title} (${detail})${landing}`;
    }),
  ].join("\n");
}

export function createInbox<Board extends { teamKey: string; projectId: string }>(
  deps: InboxDeps<Board>,
) {
  const landings = createLandings({
    kv: deps.bb.storage.kv,
    runLand: (hostId, input) =>
      deps.hostClient.call(
        "run_land",
        { ...input, timeoutMs: GATE_CALL_TIMEOUT_MS },
        { hostId, timeoutMs: LAND_HOST_TIMEOUT_MS },
      ),
    changed: () => deps.bb.realtime.publish(CHANGED, {}),
    now: () => Date.now(),
    log: (message) => deps.bb.log.error(message),
  });

  async function config(): Promise<InboxConfig | null> {
    const stored = await deps.bb.storage.kv.get<unknown>(CONFIG_KEY);
    return stored === undefined || stored === null ? null : inboxConfig.parse(stored);
  }

  /** One card per open Staff question, oldest first, linking to the chat it was asked in. */
  async function staffCards(): Promise<InboxCardDto[]> {
    const base = (deps.bb.server.experimental_appUrl ?? deps.bb.server.loopbackBaseUrl).replace(
      /\/+$/,
      "",
    );
    return (await deps.staffQuestions())
      .sort((a, b) => a.askedAt - b.askedAt)
      .map(
        (question): InboxCardDto => ({
          // Unique per question: the page keys and opens a card by it.
          id: `question:${question.id}`,
          identifier: `${question.name}-${question.id}`,
          title: `Question in ${question.name}'s Staff chat`,
          url: `${base}${question.chatHref}`,
          pullRequest: null,
          // A question, so the page shows it as one and never as a review that is ready to merge.
          kind: "question",
          label: question.name,
          choices: [],
          waiting: {
            ask: question.question,
            stage: "Staff chat",
            asked: new Date(question.askedAt).toISOString().slice(0, 10),
          },
          review: null,
          mention: null,
          alarm: null,
          since: new Date(question.askedAt).toISOString(),
          chat: { threadId: question.chatThreadId },
        }),
      );
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
    const text = await deps.projectConfigText(projectId);
    const registry = parseRegistry(text);
    if (!registry.ok) throw new Error(registry.error);
    const teamKey = registry.registry.teamKey ?? board?.teamKey;
    if (teamKey === undefined) {
      throw new Error("factory.config.json names no Linear team: set linear.teamKey");
    }
    return { setting, registry: registry.registry, teamKey, approver: approverOf(text) };
  }

  /** `approver` of factory.config.json: the person whose approval the comment names. */
  function approverOf(text: string): string | null {
    const parsed: unknown = JSON.parse(text);
    const approver =
      typeof parsed === "object" && parsed !== null && "approver" in parsed
        ? parsed.approver
        : null;
    return typeof approver === "string" && approver.trim() !== "" ? approver.trim() : null;
  }

  const verdictOf = (identifier: string) =>
    deps.gateRuns.latestReview(identifier, 0)?.verdictLine ?? null;

  /**
   * The cards, read from Linear now. The waiting issues, the mentions and the alarms are three reads:
   * one that fails is named in `error` and the others still show. `waitingRead` says whether the
   * waiting issues were read.
   */
  async function readCards() {
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
            verdictOf,
          })
        : [];
    const notices = [
      ...(mentions.status === "fulfilled" ? mentionCards(mentions.value) : []),
      ...(alarm.status === "fulfilled" && alarm.value !== null ? alarmCards(alarm.value) : []),
    ];
    return {
      error: errors.length === 0 ? null : errors.join("; "),
      issueCards,
      notices,
      waitingRead: waiting.status === "fulfilled",
    };
  }

  const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

  /** The Staff questions as cards; a read that fails is named in `error` and gives none. */
  async function staffRead(): Promise<{ error: string | null; cards: InboxCardDto[] }> {
    try {
      return { error: null, cards: await staffCards() };
    } catch (error) {
      return { error: failure(error), cards: [] };
    }
  }

  /** What waits for a person, as Home lists it: the cards without the landings, which it leaves alone. */
  async function waiting(): Promise<InboxDto> {
    try {
      const read = await readCards();
      const staff = await staffRead();
      return {
        error: read.error ?? staff.error,
        cards: [...withNotices(read.issueCards, read.notices), ...staff.cards],
      };
    } catch (error) {
      const staff = await staffRead();
      return { error: failure(error), cards: staff.cards };
    }
  }

  /**
   * The cards and the landings approved here, as the Inbox page shows them: the landings of their own
   * first, oldest first, then the cards in their order: Linear's, then the Staff questions.
   *
   * A landing whose issue is in the Inbox state rides on that issue's card, which keeps its own
   * actions. A landing still on its way shows as a card of its own (kind `landing`, no Inbox action),
   * and a done one shows once. A stopped landing whose issue is not in the Inbox state any more was
   * taken up elsewhere, so it is dropped. A landing without a driver (after a plugin reload, or a
   * failed slice) gets one again. When the waiting issues cannot be read, the landings are shown and
   * driven but none is dropped, since nothing says where their issues are. The Staff questions are a
   * read of their own: one that fails is named in `error` and the other cards still show.
   */
  async function list(): Promise<InboxListDto> {
    try {
      const read = await readCards();
      const { issueCards, notices, waitingRead } = read;
      const staffOut = await staffRead();
      const error = read.error ?? staffOut.error;
      const staff = staffOut.cards;
      const records = await landings.all();
      landings.resume(records);
      const cards: InboxListCardDto[] = [...withNotices(issueCards, notices), ...staff].map(
        (card) => ({ ...card, landing: null }),
      );
      const own: InboxListCardDto[] = [];
      for (const record of records) {
        // Only a waiting issue's card: a mention or an alarm on the issue is not the issue.
        const card = cards.find(
          (one) =>
            (one.kind === "review" || one.kind === "question") &&
            one.identifier === record.identifier,
        );
        if (card !== undefined) {
          card.landing = { phase: record.phase, line: record.line, at: record.at };
        } else if (record.phase !== "stopped") {
          own.push(landingCard(record, verdictOf(record.identifier)));
        }
        const over =
          record.phase === "done" ||
          (record.phase === "stopped" && card === undefined && waitingRead);
        if (over) await landings.remove(record.identifier);
      }
      own.sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.id.localeCompare(b.id));
      return { error, cards: [...own, ...cards] };
    } catch (error) {
      const staff = await staffRead();
      return {
        error: failure(error),
        cards: staff.cards.map((card) => ({ ...card, landing: null })),
      };
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
      // The issue is handed back, so a landing that stopped on it is over.
      await landings.remove(identifier);
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

  /**
   * Approves a green review: the approver's comment, the move to the merge-permission state with the
   * labels unchanged, and a landing record. The landing runs in the background on the runs machine;
   * the call returns once Linear has the move.
   */
  async function approve({ identifier }: { identifier: string }) {
    try {
      const { setting, approver } = await resolve();
      const { approveTo, landHost, landCheckout } = setting;
      if (approveTo === undefined || landHost === undefined || landCheckout === undefined) {
        throw new Error(
          `Approve needs the landing settings: run \`${LANDING_SETUP}\` (docs/agents/optio.md)`,
        );
      }
      if (approver === null) {
        throw new Error("factory.config.json names no approver: set approver");
      }
      const approved = await approveIssue(await deps.linearApiKey(), {
        identifier,
        comment: `${approver} approved it from the Inbox.`,
        waitingState: setting.state,
        questionLabels: setting.questionLabels,
        toState: approveTo,
      });
      const pull = pullRequestOf(approved);
      if (pull === null) throw new Error(`${identifier} has no pull request attached`);
      const at = new Date().toISOString();
      const title = pull.title.trim();
      await landings.begin({
        identifier,
        title: approved.title,
        url: approved.url,
        pullRequest: { number: pull.number, url: pull.url },
        change: title === "" || title === pull.url ? null : title,
        hostId: landHost,
        checkout: landCheckout,
        phase: "approved",
        line: null,
        approvedAt: at,
        at,
      });
      deps.bb.realtime.publish(CHANGED, {}); // open pages read again
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const command = cliCommand({
    summary:
      "List what waits for a person in the Inbox: landings, reviews, then questions, mentions and alarms",
    description: `With --state and --labels it sets where the Inbox looks instead: the state issues wait in, and the labels that mark a question. --project names the bb project whose factory.config.json gives the Linear team; without it the Board's project is used. --alarm-issue names the issue the watchdog comments on; without it there are no alarm cards. --approve-to, --land-host and --land-checkout set what Approve does: the merge-permission state, and the runs machine and the main checkout the landing script runs in; given alone they change only those. --off switches the Inbox off.`,
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
      "approve-to": {
        type: "string",
        description: "Set the merge-permission state Approve moves an issue to",
      },
      "land-host": {
        type: "string",
        description: "Set the host id of the runs machine the landing script runs on",
      },
      "land-checkout": {
        type: "string",
        description: "Set the absolute path of that machine's main checkout",
      },
    },
    async run({ options }) {
      const landing = {
        ...(options["approve-to"] === undefined ? {} : { approveTo: options["approve-to"] }),
        ...(options["land-host"] === undefined ? {} : { landHost: options["land-host"] }),
        ...(options["land-checkout"] === undefined
          ? {}
          : { landCheckout: options["land-checkout"] }),
      };
      const setsLanding = Object.keys(landing).length > 0;
      if (
        options.off === true ||
        options.state !== undefined ||
        options.labels !== undefined ||
        setsLanding
      ) {
        if (options.off === true) {
          await deps.bb.storage.kv.delete(CONFIG_KEY);
        } else {
          const current = await config();
          const keepsWhere = options.state === undefined && options.labels === undefined;
          if (!keepsWhere && (options.state === undefined || options.labels === undefined)) {
            throw new PluginCliError("give both --state and --labels", { code: "missing_option" });
          }
          if (keepsWhere && current === null) {
            throw new PluginCliError(`set up the Inbox first: \`${SETUP}\``, {
              code: "missing_option",
            });
          }
          // Setting where the Inbox looks keeps the landing settings, and the other way round.
          const { approveTo, landHost, landCheckout } = current ?? {};
          const parsed = inboxConfig.safeParse({
            ...(keepsWhere
              ? current
              : {
                  state: options.state,
                  questionLabels: options.labels?.split(",").map((label) => label.trim()),
                  ...(options.project === undefined ? {} : { projectId: options.project }),
                  ...(options["alarm-issue"] === undefined
                    ? {}
                    : { alarmIssue: options["alarm-issue"] }),
                  ...(approveTo === undefined ? {} : { approveTo }),
                  ...(landHost === undefined ? {} : { landHost }),
                  ...(landCheckout === undefined ? {} : { landCheckout }),
                }),
            ...landing,
          });
          if (!parsed.success) {
            throw new PluginCliError(
              "--state, --project, --alarm-issue, --approve-to, --land-host and every label must be non-empty, and --land-checkout an absolute path",
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

  return { list, waiting, answer, reject, read, approve, command };
}
