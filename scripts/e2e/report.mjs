/**
 * The device-flow evidence a person reads (KIT-267): one PR comment, updated in
 * place, and the same links under `### Evidence` in the Linear workpad.
 */
import { isFinding } from "./review.mjs";

export const COMMENT_MARKER = "<!-- kit-device-flows -->";
const THUMBNAIL_WIDTH = 220;

/**
 * @param {string} baseUrl public evidence base, e.g. `https://pub-xxxx.r2.dev/e2e`
 * @param {string} sha
 * @param {string} flow
 * @param {string} file `<step>.png` or `video.mp4`
 */
function evidenceUrl(baseUrl, sha, flow, file) {
  return `${baseUrl.replace(/\/+$/, "")}/${sha}/${flow}/${file}`;
}

function cell(text) {
  return text.replaceAll("|", "\\|").replace(/\s*\n\s*/g, " ");
}

function verdictCell(review) {
  if (!review) {
    return "Not reviewed.";
  }
  if (review.error) {
    return `Review unavailable: ${cell(review.error)}`;
  }
  const { verdict } = review;
  const asked = {
    yes: "Asked for by the issue",
    no: "**Not asked for by the issue**",
    unclear: "Unclear whether the issue asked for it",
  }[verdict.askedFor];
  const parts = [cell(verdict.whatChanged), `${asked}.`];
  if (verdict.designLock.breaks) {
    parts.push(`**Breaks the design lock:** ${cell(verdict.designLock.rule ?? "")}`);
  }
  if (verdict.suggestion) {
    parts.push(`_Opinion:_ ${cell(verdict.suggestion)}`);
  }
  return `${isFinding(verdict) ? "⚠️ " : ""}${parts.join(" ")}`;
}

/**
 * @param {{
 *   evidenceBaseUrl: string, afterSha: string, beforeSha: string | null,
 *   flowsStatus: string, flows: string[],
 *   pairs: import("./compare.mjs").StepPair[],
 *   reviews: Map<string, { verdict?: import("./review.mjs").Verdict, error?: string }>,
 * }} input `reviews` is keyed by `<flow>/<step>`.
 */
export function renderComment({
  evidenceBaseUrl,
  afterSha,
  beforeSha,
  flowsStatus,
  flows,
  pairs,
  reviews,
}) {
  const image = (sha, pair) => {
    const url = evidenceUrl(evidenceBaseUrl, sha, pair.flow, `${pair.step}.png`);
    return `<a href="${url}"><img src="${url}" width="${THUMBNAIL_WIDTH}"></a>`;
  };
  const lines = [COMMENT_MARKER, "## Device flows", ""];
  lines.push(
    flowsStatus === "success"
      ? "All flows passed on the iOS Simulator."
      : `**Flows did not pass (${flowsStatus}).** A red flow blocks; the recordings below show where each flow stopped.`,
  );
  lines.push("");
  if (!beforeSha) {
    lines.push(
      "No passed `development` run at or before this PR's merge base, so there is nothing to compare against yet.",
      "",
    );
  }
  const different = pairs.filter((pair) => pair.status !== "same");
  if (beforeSha) {
    const same = pairs.length - different.length;
    lines.push(
      `Compared \`${afterSha.slice(0, 7)}\` with \`development\` at \`${beforeSha.slice(0, 7)}\`: ${different.length} step${different.length === 1 ? "" : "s"} differ, ${same} unchanged.`,
      "",
    );
    if (different.length > 0) {
      lines.push(
        "| Step | Status | Before | After | Review (advisory) |",
        "| --- | --- | --- | --- | --- |",
      );
      for (const pair of different) {
        const before = pair.status === "new" ? "" : image(beforeSha, pair);
        const after = pair.status === "removed" ? "" : image(afterSha, pair);
        const review = reviews.get(`${pair.flow}/${pair.step}`);
        lines.push(
          `| ${pair.flow} / ${pair.step} | ${pair.status} | ${before} | ${after} | ${verdictCell(review)} |`,
        );
      }
      lines.push("");
    }
  }
  lines.push(
    "Recordings: " +
      flows
        .map((flow) => `[${flow}](${evidenceUrl(evidenceBaseUrl, afterSha, flow, "video.mp4")})`)
        .join(" · "),
  );
  lines.push(
    "",
    "Design findings are advisory and do not fail the check. Evidence expires after 30 days.",
  );
  return lines.join("\n");
}

/**
 * Lines for `### Evidence` in the Linear workpad.
 * @param {{ evidenceBaseUrl: string, afterSha: string, flows: string[], commentUrl: string | null }} input
 */
export function evidenceLines({ evidenceBaseUrl, afterSha, flows, commentUrl }) {
  const lines = flows.map(
    (flow) =>
      `- Device flow ${flow} (\`${afterSha.slice(0, 7)}\`): [recording](${evidenceUrl(evidenceBaseUrl, afterSha, flow, "video.mp4")})`,
  );
  if (commentUrl) {
    lines.push(`- Before/after comparison: [PR comment](${commentUrl})`);
  }
  return lines;
}

/**
 * Replaces the body of `### Evidence` in a workpad comment, leaving every other
 * section as it is. Returns null when the workpad has no such section.
 * @param {string} workpad
 * @param {string[]} lines
 */
export function replaceEvidenceSection(workpad, lines) {
  const all = workpad.split("\n");
  const start = all.findIndex((line) => /^###\s+Evidence\s*$/.test(line));
  if (start === -1) {
    return null;
  }
  const after = all.slice(start + 1);
  const next = after.findIndex((line) => /^#{1,3}\s/.test(line));
  const tail = next === -1 ? [] : after.slice(next);
  return [...all.slice(0, start + 1), "", ...lines, "", ...tail].join("\n").trimEnd();
}

/**
 * Creates the PR comment, or updates the one this script wrote before.
 * @param {{ repository: string, pullNumber: number, token: string, body: string }} input
 * @returns {Promise<string>} the comment's URL
 */
export async function upsertPrComment({ repository, pullNumber, token, body }) {
  const api = `https://api.github.com/repos/${repository}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "kit-device-flows",
  };
  const github = async (url, init) => {
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      throw new Error(
        `GitHub answered HTTP ${response.status} for ${init?.method ?? "GET"} ${url}`,
      );
    }
    return response.json();
  };
  let existing = null;
  for (let page = 1; !existing; page++) {
    const comments = await github(`${api}/issues/${pullNumber}/comments?per_page=100&page=${page}`);
    existing = comments.find((comment) => comment.body?.startsWith(COMMENT_MARKER)) ?? null;
    if (comments.length < 100) {
      break;
    }
  }
  const saved = existing
    ? await github(`${api}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      })
    : await github(`${api}/issues/${pullNumber}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
  return saved.html_url;
}
