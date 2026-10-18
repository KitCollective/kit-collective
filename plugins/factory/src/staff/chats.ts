// The Staff chats: each Staff member's one standing chat thread, made by Optio the first time and
// found again after that, the header the thread shows, and the questions a Staff member has put to
// the person in it (CONTEXT.md: Staff chat). The chat ids and open questions live in the plugin's
// key-value store; no table is added.
import { z } from "zod";
import type { Agent } from "../agent-store.js";
import type { Core } from "../core.js";
import { type Charter, charterPath, parseCharter } from "./charter.js";

/** Messages Optio sends into a chat begin with this, so they are never taken for the person's answer. */
export const OPTIO_MESSAGE = "[optio";

const chatKey = (agentId: string) => `staffChat:${agentId}`;
const ownerKey = (threadId: string) => `staffChatOf:${threadId}`;
const QUESTIONS_KEY = "staffQuestions";

export interface StaffQuestion {
  agentId: string;
  question: string;
  askedAt: number;
  chatThreadId: string;
}

export type StaffStatus = "on" | "off" | "paused";

/** The title of a Staff member's daily activity thread; the chat's title must never match it. */
const dailyThread = (name: string) => new RegExp(`^${escapeRegExp(name)} · \\d{4}-\\d{2}-\\d{2}`);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const userRow = z.object({
  kind: z.literal("conversation"),
  role: z.literal("user"),
  initiator: z.literal("user").optional(),
  senderThreadId: z.null().optional(),
  text: z.string(),
  createdAt: z.number(),
});
const nested = z.object({ children: z.array(z.unknown()).nullish() });

/** The rows a person wrote in a timeline, nested ones included; a message another thread or an agent sent is not one. */
function userRows(rows: unknown[]): { text: string; createdAt: number }[] {
  return rows.flatMap((row) => {
    const own = userRow.safeParse(row);
    const children = nested.safeParse(row);
    return [
      ...(own.success ? [{ text: own.data.text, createdAt: own.data.createdAt }] : []),
      ...(children.success ? userRows(children.data.children ?? []) : []),
    ];
  });
}

export function createStaffChats(core: Core) {
  const { bb, agents, sessions, settings, changed } = core;
  const kv = bb.storage.kv;

  /** The Charter in the agent's project; null when it has none (or the file cannot be read). */
  async function charterOf(agent: Agent): Promise<Charter | null> {
    try {
      const file = await bb.sdk.projects.fileContent({
        projectId: agent.projectId,
        path: charterPath(agent.id),
      });
      const text =
        file.contentEncoding === "base64"
          ? Buffer.from(file.content, "base64").toString("utf8")
          : file.content;
      return parseCharter(text);
    } catch {
      return null;
    }
  }

  async function staffMember(agentId: string): Promise<{ agent: Agent; charter: Charter }> {
    const agent = agents.get(agentId);
    if (agent === null) throw new Error(`no agent "${agentId}"`);
    const charter = await charterOf(agent);
    if (charter === null) {
      throw new Error(
        `${agent.name} has no Charter (${charterPath(agent.id)} in its project), so it has no Staff chat`,
      );
    }
    return { agent, charter };
  }

  /** The chat saved for the agent, when it still exists and is not archived. */
  async function savedChat(agentId: string): Promise<string | null> {
    const saved = await kv.get<string>(chatKey(agentId));
    if (typeof saved !== "string") return null;
    const thread = await bb.sdk.threads.get({ threadId: saved }).catch(() => null);
    return thread !== null && thread.archivedAt === null ? saved : null;
  }

  const opening = new Map<string, Promise<string>>();
  async function makeChat(agent: Agent): Promise<string> {
    const existing = await savedChat(agent.id);
    if (existing !== null) return existing;
    const run = await sessions.start(agent, {
      source: "chat",
      label: "Staff chat",
      task: `This is your standing Staff chat with the person you report to. It stays open: your daily status and the questions that are theirs to decide arrive and are answered here. Greet them in one line and wait.`,
    });
    if (run === null || run.threadId === null)
      throw new Error(run?.reason ?? "could not start the Staff chat");
    await kv.set(chatKey(agent.id), run.threadId);
    await kv.set(ownerKey(run.threadId), agent.id);
    changed();
    return run.threadId;
  }

  /** The Staff member's chat thread; made on first use. Two opens at once make one. */
  async function open(agentId: string): Promise<string> {
    const { agent } = await staffMember(agentId);
    let pending = opening.get(agent.id);
    if (pending === undefined) {
      pending = makeChat(agent).finally(() => opening.delete(agent.id));
      opening.set(agent.id, pending);
    }
    return pending;
  }

  async function list() {
    const staff: {
      agentId: string;
      name: string;
      title: string;
      chatThreadId: string | null;
    }[] = [];
    const others: { id: string; name: string; description: string; enabled: boolean }[] = [];
    for (const agent of agents.list()) {
      const charter = await charterOf(agent);
      if (charter === null) {
        others.push({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          enabled: agent.enabled,
        });
        continue;
      }
      staff.push({
        agentId: agent.id,
        name: agent.name,
        title: charter.title,
        chatThreadId: await savedChat(agent.id),
      });
    }
    return { staff, others };
  }

  /** The header of a Staff chat; null for any other thread, answered from the store alone. */
  async function header(threadId: string) {
    const agentId = await kv.get<string>(ownerKey(threadId));
    if (typeof agentId !== "string") return null;
    const agent = agents.get(agentId);
    if (agent === null) return null;
    const charter = await charterOf(agent);
    if (charter === null) return null;
    const status: StaffStatus = !agent.enabled
      ? "off"
      : (await settings.get()).paused
        ? "paused"
        : "on";
    const daily = dailyThread(agent.name);
    const threads = await bb.sdk.threads
      .list({ projectId: agent.projectId, limit: 200 })
      .catch(() => []);
    const lastHeartbeat = threads
      .filter((thread) => daily.test(thread.title ?? ""))
      .reduce<number | null>(
        (newest, thread) =>
          newest === null || thread.updatedAt > newest ? thread.updatedAt : newest,
        null,
      );
    return {
      agentId: agent.id,
      name: agent.name,
      title: charter.title,
      status,
      lastHeartbeat,
      // Nothing measures what a Staff member has used yet (staff/max.md, "Not yet").
      budget: { limit: charter.budget, used: null },
    };
  }

  async function storedQuestions(): Promise<StaffQuestion[]> {
    return (await kv.get<StaffQuestion[]>(QUESTIONS_KEY)) ?? [];
  }

  /**
   * Puts a question to the person in the agent's Staff chat. Asked from another thread, the question
   * is first relayed into the chat, so the card links to a chat that shows it.
   */
  async function ask(agentId: string, question: string, fromThreadId: string | undefined) {
    const chatThreadId = await open(agentId);
    const askedAt = Date.now();
    if (fromThreadId !== chatThreadId) {
      await bb.sdk.threads.send({
        threadId: chatThreadId,
        mode: "auto",
        input: [{ type: "text", text: `${OPTIO_MESSAGE} ask] ${question}`, mentions: [] }],
      });
    }
    await kv.set(QUESTIONS_KEY, [
      ...(await storedQuestions()),
      { agentId, question, askedAt, chatThreadId },
    ]);
    changed();
    return { threadId: chatThreadId };
  }

  /** Whether the person wrote in the chat after the question was asked. */
  async function answered(question: StaffQuestion): Promise<boolean> {
    try {
      const { rows } = await bb.sdk.threads.timeline({
        threadId: question.chatThreadId,
        includeNestedRows: "true",
      });
      return userRows(rows).some(
        (row) => row.createdAt > question.askedAt && !row.text.startsWith(OPTIO_MESSAGE),
      );
    } catch {
      return false; // cannot tell: the question stays
    }
  }

  /** The questions still waiting for the person; one they answered in the chat is dropped for good. */
  async function openQuestions() {
    const stored = await storedQuestions();
    if (stored.length === 0) return [];
    const kept: StaffQuestion[] = [];
    for (const question of stored) {
      if (!(await answered(question))) kept.push(question);
    }
    if (kept.length !== stored.length) await kv.set(QUESTIONS_KEY, kept);
    return kept.flatMap((question) => {
      const agent = agents.get(question.agentId);
      return agent === null ? [] : [{ ...question, name: agent.name }];
    });
  }

  return { list, open, header, ask, openQuestions };
}
export type StaffChats = ReturnType<typeof createStaffChats>;
