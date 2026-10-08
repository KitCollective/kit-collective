/**
 * Before/after comparison of device-flow screenshots (KIT-267). Deterministic,
 * no model call: pairs steps by flow and step name and marks each pair
 * `same`, `changed`, `new` or `removed` by pixel difference.
 */
import { decodePng } from "./png.mjs";

/**
 * A channel may drift this much (0-255) before a pixel counts as different.
 * Two runs of one build differ by nothing at all, so this only has to absorb
 * rounding; a one-step change of a surface token is larger and must show.
 */
const CHANNEL_TOLERANCE = 3;

/**
 * A step is `changed` when more than this many pixels differ. A count, not a
 * share of the screen: an icon or a short label is a few hundred pixels on a
 * three-million-pixel screenshot.
 */
const MAX_DIFFERING_PIXELS = 24;

/**
 * The top strip is the iOS status bar (clock, battery, signal). It is never app
 * content and differs between any two runs, so it is not compared.
 */
const IGNORE_TOP_RATIO = 0.075;

const KEY_SEPARATOR = "/";

/**
 * @param {string} flow
 * @param {string} step
 */
export function stepKey(flow, step) {
  return `${flow}${KEY_SEPARATOR}${step}`;
}

/**
 * The flow a step key belongs to.
 * @param {string} key
 */
export function flowOfKey(key) {
  return key.split(KEY_SEPARATOR)[0];
}

/**
 * @param {Buffer} beforePng
 * @param {Buffer} afterPng
 */
export function diffImages(beforePng, afterPng) {
  const before = decodePng(beforePng);
  const after = decodePng(afterPng);
  if (before.width !== after.width || before.height !== after.height) {
    return { sizeMismatch: true, differingPixels: 0, comparedPixels: 0 };
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
  };
}

/**
 * @typedef {{ flow: string, step: string, status: "same" | "changed" | "new" | "removed" }} StepPair
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
      return { flow, step, status: "new" };
    }
    if (!afterPng) {
      return { flow, step, status: "removed" };
    }
    const diff = diffImages(beforePng, afterPng);
    const changed = diff.sizeMismatch || diff.differingPixels > MAX_DIFFERING_PIXELS;
    return { flow, step, status: changed ? "changed" : "same" };
  });
}
