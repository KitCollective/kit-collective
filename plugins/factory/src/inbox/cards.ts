// One card for every issue waiting for a person, built from what Linear says now.
import type { InboxCardDto, InboxConfig } from "./contract.js";
import type { WaitingIssue } from "./linear.js";

/** What the Inbox needs besides the issues: the config, the workpad heading and the recorded verdict. */
interface InboxContext {
  config: InboxConfig;
  /** `agent.workpadHeading`: what the single workpad comment starts with; null when the registry sets none. */
  workpadHeading: string | null;
  /** The newest recorded review verdict line for the issue, or null. */
  verdictOf: (identifier: string) => string | null;
}

/** The ask and stage under `### Waiting` of a workpad body; null when the section holds neither. */
function parseWaiting(body: string): InboxCardDto["waiting"] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === "### Waiting");
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,3}\s/.test(line));
  const items = (end === -1 ? rest : rest.slice(0, end))
    .map((line) => /^\s*-\s+(.*\S)\s*$/.exec(line)?.[1])
    .filter((item): item is string => item !== undefined);
  const stageLine = items.find((item) => /^Stage:/.test(item));
  const ask = items.find((item) => !/^Stage:/.test(item));
  if (ask === undefined || ask === "(none)") return null;
  const stage = /^Stage:\s*(.*?)(?:\.\s*Asked:\s*(.*))?$/.exec(stageLine ?? "");
  return { ask, stage: stage?.[1] ?? "", asked: stage?.[2]?.trim() || null };
}

/**
 * The lettered choices an ask offers: `A)`, `(A)`, `A:` or `A.` markers that run A, B, … in order.
 * Fewer than two letters is no choice, so a stray "A." in a sentence offers none.
 */
export function parseChoices(ask: string): InboxCardDto["choices"] {
  const found: { letter: string; start: number; textStart: number }[] = [];
  let from = 0;
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    const marker = new RegExp(`(?:^|[\\s;,])(\\(${letter}\\)|${letter}[).:])(?=\\s)`, "g");
    marker.lastIndex = from;
    const match = marker.exec(ask);
    if (match === null) break;
    const start = match.index + match[0].length - match[1].length;
    found.push({ letter, start, textStart: match.index + match[0].length });
    from = match.index + match[0].length;
  }
  if (found.length < 2) return [];
  return found.map((choice, index) => ({
    letter: choice.letter,
    text: ask
      .slice(choice.textStart, found[index + 1]?.start ?? ask.length)
      .replace(/[\s;,]*(?:\bor)?[\s;,]*$/i, "")
      .trim(),
  }));
}

/** The last pull request among an issue's attachments, or null. */
export function pullRequestOf(issue: Pick<WaitingIssue, "attachments">) {
  const found = issue.attachments.flatMap((attachment) => {
    const match = /\/pull\/(\d+)(?:[/?#]|$)/.exec(attachment.url);
    return match === null
      ? []
      : [{ number: Number(match[1]), url: attachment.url, title: attachment.title }];
  });
  return found.at(-1) ?? null;
}

/** When the issue last moved into the state; its creation when no move is listed. */
function sinceOf(issue: WaitingIssue, state: string): string {
  const moves = issue.history
    .filter((entry) => entry.toState === state)
    .map((entry) => Date.parse(entry.createdAt));
  return new Date(
    moves.length > 0 ? Math.max(...moves) : Date.parse(issue.createdAt),
  ).toISOString();
}

/** Reviews first, then questions, oldest first inside each kind. */
export function buildCards(issues: WaitingIssue[], context: InboxContext): InboxCardDto[] {
  const { config, workpadHeading, verdictOf } = context;
  const cards = issues.map((issue): InboxCardDto => {
    const pull = pullRequestOf(issue);
    const common = {
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      pullRequest: pull === null ? null : { number: pull.number, url: pull.url },
      since: sinceOf(issue, config.state),
      landing: null,
    };
    const label = config.questionLabels.find((name) => issue.labels.includes(name)) ?? null;
    if (label !== null) {
      const workpad =
        workpadHeading === null
          ? undefined
          : issue.comments.find((body) => body.trimStart().startsWith(workpadHeading));
      const waiting = workpad === undefined ? null : parseWaiting(workpad);
      return {
        ...common,
        kind: "question",
        label,
        choices: waiting === null ? [] : parseChoices(waiting.ask),
        waiting,
        review: null,
      };
    }
    const title = pull?.title.trim() ?? "";
    return {
      ...common,
      kind: "review",
      label: null,
      choices: [],
      waiting: null,
      // An untitled link carries its URL as the title, which says nothing about the change.
      review: {
        verdict: verdictOf(issue.identifier),
        change: title === "" || title === pull?.url ? null : title,
      },
    };
  });
  const rank = (card: InboxCardDto) => (card.kind === "review" ? 0 : 1);
  return cards.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Date.parse(a.since) - Date.parse(b.since) ||
      a.identifier.localeCompare(b.identifier),
  );
}
