#!/usr/bin/env node
/**
 * The visual review of a mobile PR: the slice flow's screenshots and recording on the PR head
 * ("after") and on its merge base ("before"), side by side (docs/agents/device-flows.md).
 *
 * The hosted Device flows run writes both passes, then calls this to put them in one folder that
 * it uploads as the artifact `visual-review-<head sha>`:
 *
 *   manifest.json   { version: 1, headSha, baseSha, runUrl, flow, after: {status, failure?}, before: {status, note?, failure?},
 *                     steps: [{ id, label, after, before }], videos: { after?, before? }, dropped: [...] }
 *   after/<step>.png, before/<step>.png, after/failure.png, before/failure.png, after.mp4, before.mp4
 *
 * Paths in the manifest are relative to the folder. A reader (the software factory's `visual-review`
 * gate check) needs nothing else: no Maestro names, no flow text.
 *
 * Usage: node scripts/e2e/visual-review.mjs --flow kit-509 --after <dir> --before <dir> --out <dir>
 *          --head <sha> --base <sha> --run-url <url> --after-status passed|failed
 *          --before-status passed|failed|skipped [--before-note <text>]
 * Exit: 0 written, 2 usage.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findArtifacts } from "./artifacts.mjs";

/** Paperclip's default attachment cap (PAPERCLIP_ATTACHMENT_MAX_BYTES): a bigger file is left out. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const STATUSES = new Set(["passed", "failed", "skipped"]);

/** `03-own-detail` reads "Own detail" on the card; the number stays in the id for the order. */
export function stepLabel(step) {
  const words = step.replace(/^\d+-/, "").replace(/-/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : step;
}

/**
 * The steps of one flow, paired by step id, in step order. A step only on the head is new or not
 * reached on the base; one only on the base is gone on the head. Both are shown, never dropped.
 * @param {{ flow: string, after: Array<{flow: string, step: string|null, kind: string}>, before: Array<{flow: string, step: string|null, kind: string}> }} input
 */
export function pairSteps({ flow, after, before }) {
  const shots = (list) =>
    new Set(list.filter((a) => a.flow === flow && a.kind === "screenshot").map((a) => a.step));
  const a = shots(after);
  const b = shots(before);
  return [...new Set([...a, ...b])].sort().map((id) => ({
    id,
    label: stepLabel(id),
    after: a.has(id) ? `after/${id}.png` : null,
    before: b.has(id) ? `before/${id}.png` : null,
  }));
}

/** The screen at the step where a Maestro run stopped: the last of its own failure screenshots. */
export function failureScreenshot(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { recursive: true }).map(String);
  } catch {
    return null;
  }
  const shots = entries
    .filter(
      (e) =>
        basename(dirname(e)) === "screenshots" &&
        e.endsWith(".png") &&
        !basename(e).startsWith("kc__"),
    )
    .sort();
  return shots.length > 0 ? join(dir, shots[shots.length - 1]) : null;
}

/** A recording cut to 720 wide H.264 without sound; null when ffmpeg is missing or fails. */
function cutVideo(from, to) {
  const ffmpeg = process.env.KC_FFMPEG || "ffmpeg";
  const done = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      from,
      "-vf",
      "scale='min(720,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      to,
    ],
    { stdio: "inherit", timeout: 300_000 },
  );
  return done.status === 0 ? to : null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--") || argv[i + 1] === undefined) return null;
    out[key.slice(2)] = argv[i + 1];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    "flow",
    "after",
    "before",
    "out",
    "head",
    "base",
    "run-url",
    "after-status",
    "before-status",
  ];
  if (
    !args ||
    required.some((k) => args[k] === undefined) ||
    !/^[a-z0-9-]+$/.test(args.flow) ||
    !STATUSES.has(args["after-status"]) ||
    !STATUSES.has(args["before-status"])
  ) {
    process.stderr.write(
      `usage: visual-review.mjs ${required.map((k) => `--${k} <v>`).join(" ")} [--before-note <text>]\n`,
    );
    process.exit(2);
  }
  const { flow, out } = args;
  const after = findArtifacts([args.after]);
  const before = args["before-status"] === "skipped" ? [] : findArtifacts([args.before]);
  const dropped = [];
  mkdirSync(join(out, "after"), { recursive: true });
  mkdirSync(join(out, "before"), { recursive: true });

  /** Copies a file in unless it is over the cap; returns the manifest path or null. */
  const put = (from, rel) => {
    const { size } = statSync(from);
    if (size === 0) {
      dropped.push(`${rel}: empty`);
      return null;
    }
    if (size > MAX_FILE_BYTES) {
      dropped.push(`${rel}: over ${MAX_FILE_BYTES / 1024 / 1024} MB`);
      return null;
    }
    copyFileSync(from, join(out, rel));
    return rel;
  };

  const steps = pairSteps({ flow, after, before }).map((step) => {
    const from = (list) =>
      list.find((a) => a.flow === flow && a.step === step.id && a.kind === "screenshot")?.path;
    return {
      ...step,
      after: step.after && put(from(after), step.after),
      before: step.before && put(from(before), step.before),
    };
  });

  const videos = {};
  for (const [side, list] of [
    ["after", after],
    ["before", before],
  ]) {
    const video = list.find((a) => a.flow === flow && a.kind === "video");
    if (!video) continue;
    const cut = cutVideo(video.path, join(out, `${side}.cut.mp4`));
    const path = put(cut ?? video.path, `${side}.mp4`);
    if (cut) rmSync(cut, { force: true });
    if (path) videos[side] = path;
  }

  // A pass that stopped shows where: on the head that is a bug in the PR, on the base the new screens.
  const sideOf = (side, dir) => {
    const out = { status: args[`${side}-status`] };
    if (side === "before" && args["before-note"]) out.note = args["before-note"];
    if (out.status === "failed") {
      const shot = failureScreenshot(dir);
      const path = shot && put(shot, `${side}/failure.png`);
      if (path) out.failure = path;
    }
    return out;
  };
  const afterSide = sideOf("after", args.after);
  const beforeSide = sideOf("before", args.before);

  const manifest = {
    version: 1,
    headSha: args.head,
    baseSha: args.base,
    runUrl: args["run-url"],
    flow,
    after: afterSide,
    before: beforeSide,
    steps,
    videos,
    dropped,
  };
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `visual review: ${steps.length} step(s), ${steps.filter((s) => s.before).length} with a before, videos ${Object.keys(videos).join(", ") || "none"}\n`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
