/**
 * The Device flow of one issue (ADR-0049): `apps/mobile/.maestro/slices/<KEY>.yaml`.
 * Its screenshots are named `kc__<key>__<step>`, with the key in lower case.
 */

const SECTIONS_LINE = /^#\s*design-sections:(.*)$/m;

/**
 * The `docs/design-system.md` sections a slice flow asks the review to read,
 * from its header comment `# design-sections: Sheet, Button dock`.
 * @param {string} flowYaml
 * @returns {string[]}
 */
export function sliceDesignSections(flowYaml) {
  const match = SECTIONS_LINE.exec(flowYaml);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

const PHOTOS_LINE = /^#[ \t]*simulator-photos:[ \t]*(.*)$/m;

/**
 * The fixture photos a slice flow asks for, in order, from its header comment
 * `# simulator-photos: fck-white-home-front, fck-white-home-back`. The names are those of
 * apps/mobile/.maestro/fixtures/photos/catalog.json; simulator.sh reads the same line.
 * @param {string} flowYaml
 * @returns {string[]}
 */
export function sliceSimulatorPhotos(flowYaml) {
  const match = PHOTOS_LINE.exec(flowYaml);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * The flow name a slice file has in screenshot names: `KIT-279` gives `kit-279`.
 * @param {string} issueKey
 */
export function sliceFlowName(issueKey) {
  return issueKey.toLowerCase();
}

/**
 * Screenshots of the flows a run covers only. A "before" run holds other
 * flows (a slice flow has no before), and those must not show as `removed`.
 * @template T
 * @param {Map<string, T>} screenshots keyed by `stepKey`
 * @param {Set<string>} flows
 * @param {(key: string) => string} flowOfKey
 * @returns {Map<string, T>}
 */
export function onlyFlows(screenshots, flows, flowOfKey) {
  return new Map([...screenshots].filter(([key]) => flows.has(flowOfKey(key))));
}
