/**
 * Design review of changed device-flow steps (KIT-267). The reviewer reads a
 * before/after screenshot pair, the Linear issue's contract and the matching
 * part of `docs/design-system.md`. It flags; it never edits UI, and its
 * findings are advisory.
 */

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const ASKED_FOR = ["yes", "no", "unclear"];

/**
 * The parts of a Linear issue body the reviewer judges against: the
 * write-scope line and the "What to build" section.
 * @param {string} description
 */
export function issueContract(description) {
  const scope = /^write-scope:.*$/m.exec(description)?.[0] ?? "write-scope: (not declared)";
  const lines = description.split("\n");
  const start = lines.findIndex((line) => /^##\s+What to build\s*$/i.test(line));
  if (start === -1) {
    return `${scope}\n\n${description.trim()}`;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return `${scope}\n\n## What to build\n\n${body}`;
}

/**
 * The named `##`/`###` sections of the design system, in document order.
 * @param {string} markdown
 * @param {string[]} headings
 */
export function designExcerpt(markdown, headings) {
  const wanted = new Set(headings.map((heading) => heading.toLowerCase()));
  const out = [];
  let keeping = false;
  let depth = 0;
  for (const line of markdown.split("\n")) {
    const heading = /^(#{2,3})\s+(.*?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (wanted.has(heading[2].toLowerCase())) {
        keeping = true;
        depth = level;
      } else if (keeping && level <= depth) {
        keeping = false;
      }
    }
    if (keeping) {
      out.push(line);
    }
  }
  return out.join("\n").trim();
}

const INSTRUCTIONS = `You review one screen of a mobile app after a code change.
You get the screen before and after (either may be missing), the contract of the issue the change was made for, and the design-system rules for this screen.
The top strip of each screenshot is the iOS status bar; ignore it.
Answer with one JSON object and nothing else:
{
  "whatChanged": "one or two plain sentences on what is visibly different",
  "askedFor": "yes" | "no" | "unclear",
  "designLock": { "breaks": true | false, "rule": "the design-system rule it breaks, quoted or named, or null" },
  "suggestion": "optional improvement, or null"
}
"askedFor" is "yes" only when the issue contract asks for this visible change, and "no" when the contract does not cover this screen or says not to change it.
"designLock.breaks" is true only when you can name the rule from the excerpt.
A suggestion is your opinion, not a rule. Do not propose code.`;

/**
 * @param {{
 *   flow: string, step: string, status: "changed" | "new" | "removed",
 *   contract: string, excerpt: string,
 *   beforePng: Buffer | null, afterPng: Buffer | null,
 * }} input
 */
export function buildReviewMessages({
  flow,
  step,
  status,
  contract,
  excerpt,
  beforePng,
  afterPng,
}) {
  const image = (png) => ({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
  });
  const content = [
    {
      type: "text",
      text: `Flow: ${flow}\nStep: ${step}\nComparison: ${status}\n\n# Issue contract\n\n${contract}\n\n# Design system (excerpt)\n\n${excerpt || "(no matching section)"}`,
    },
  ];
  if (beforePng) {
    content.push({ type: "text", text: "Before:" }, image(beforePng));
  }
  if (afterPng) {
    content.push({ type: "text", text: "After:" }, image(afterPng));
  }
  return [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content },
  ];
}

/**
 * @typedef {{
 *   whatChanged: string, askedFor: "yes" | "no" | "unclear",
 *   designLock: { breaks: boolean, rule: string | null }, suggestion: string | null,
 * }} Verdict
 */

/**
 * @param {string} text the model's reply
 * @returns {Verdict}
 */
export function parseVerdict(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The reviewer did not answer with JSON");
  }
  const raw = JSON.parse(text.slice(start, end + 1));
  if (typeof raw.whatChanged !== "string" || !raw.whatChanged.trim()) {
    throw new Error("The reviewer's answer has no whatChanged");
  }
  if (!ASKED_FOR.includes(raw.askedFor)) {
    throw new Error("The reviewer's answer has no valid askedFor");
  }
  const breaks = raw.designLock?.breaks === true;
  const rule = typeof raw.designLock?.rule === "string" ? raw.designLock.rule.trim() : "";
  return {
    whatChanged: raw.whatChanged.trim(),
    askedFor: raw.askedFor,
    // A break without a named rule is an opinion, not a design-lock finding.
    designLock: { breaks: breaks && rule !== "", rule: breaks && rule !== "" ? rule : null },
    suggestion:
      typeof raw.suggestion === "string" && raw.suggestion.trim() ? raw.suggestion.trim() : null,
  };
}

/**
 * A changed screen the issue did not ask for is a finding by itself.
 * @param {Verdict} verdict
 */
export function isFinding(verdict) {
  return verdict.askedFor === "no" || verdict.designLock.breaks;
}

/**
 * @param {{ apiKey: string, model: string, messages: unknown[] }} input
 * @returns {Promise<Verdict>}
 */
export async function requestVerdict({ apiKey, model, messages }) {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 700 }),
  });
  if (!response.ok) {
    throw new Error(`The review model answered HTTP ${response.status}`);
  }
  const body = await response.json();
  return parseVerdict(String(body.choices?.[0]?.message?.content ?? ""));
}
