/**
 * Before/after comparison of device-flow screenshots (KIT-267). Deterministic,
 * no model call: pairs steps by flow and step name and marks each pair
 * `same`, `changed`, `new` or `removed` by pixel difference.
 */
import { decodePng } from "./png.mjs";

/**
 * A channel may drift this much (0-255) before a pixel counts as different.
 * Absorbs antialiasing and image-decode noise between two runs.
 */
export const CHANNEL_TOLERANCE = 16;

/**
 * A step is `changed` when more than this share of the compared pixels differ.
 */
export const MAX_DIFF_RATIO = 0.001;

/**
 * The top strip is the iOS status bar (clock, battery, signal). It is never app
 * content and differs between any two runs, so it is not compared.
 */
export const IGNORE_TOP_RATIO = 0.075;

const KEY_SEPARATOR = "/";

/**
 * @param {string} flow
 * @param {string} step
 */
export function stepKey(flow, step) {
  return `${flow}${KEY_SEPARATOR}${step}`;
}

/**
 * @param {Buffer} beforePng
 * @param {Buffer} afterPng
 */
export function diffImages(beforePng, afterPng) {
  const before = decodePng(beforePng);
  const after = decodePng(afterPng);
  if (before.width !== after.width || before.height !== after.height) {
    return { sizeMismatch: true, differingPixels: 0, comparedPixels: 0, ratio: 1 };
  }
  const { width, height } = before;
  const firstRow = Math.round(height * IGNORE_TOP_RATIO);
  let differingPixels = 0;
  for (let i = firstRow * width * 4; i < width * height * 4; i += 4) {
    if (
      Math.abs(before.data[i] - after.data[i]) > CHANNEL_TOLERANCE ||
      Math.abs(before.data[i + 1] - after.data[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(before.data[i + 2] - after.data[i + 2]) > CHANNEL_TOLERANCE
    ) {
      differingPixels++;
    }
  }
  const comparedPixels = width * (height - firstRow);
  return {
    sizeMismatch: false,
    differingPixels,
    comparedPixels,
    ratio: comparedPixels === 0 ? 0 : differingPixels / comparedPixels,
  };
}

/**
 * @typedef {{ flow: string, step: string, status: "same" | "changed" | "new" | "removed", ratio: number | null }} StepPair
 */

/**
 * @param {Map<string, Buffer>} before screenshots keyed by `stepKey`
 * @param {Map<string, Buffer>} after screenshots keyed by `stepKey`
 * @returns {StepPair[]} sorted by flow, then step
 */
export function compareRuns(before, after) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return keys.map((key) => {
    const cut = key.indexOf(KEY_SEPARATOR);
    const flow = key.slice(0, cut);
    const step = key.slice(cut + 1);
    const beforePng = before.get(key);
    const afterPng = after.get(key);
    if (!beforePng) {
      return { flow, step, status: "new", ratio: null };
    }
    if (!afterPng) {
      return { flow, step, status: "removed", ratio: null };
    }
    const diff = diffImages(beforePng, afterPng);
    const changed = diff.sizeMismatch || diff.ratio > MAX_DIFF_RATIO;
    return { flow, step, status: changed ? "changed" : "same", ratio: diff.ratio };
  });
}
