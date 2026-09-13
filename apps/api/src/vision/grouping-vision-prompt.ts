export const MAX_PHOTOS_PER_GROUP = 10;

export type GroupingPriorGroup = {
  photoIds: string[];
};

export const GROUPING_VISION_SYSTEM_PROMPT = `You are grouping photos of football shirts.

Each photo belongs to exactly one physical shirt (UserJersey). Photos of the SAME shirt (front, back, sleeves, collar, wash label) go in ONE group. Different shirts go in different groups.

Rules:
- Use only the photoId strings given before each image. Never invent ids.
- At most ${MAX_PHOTOS_PER_GROUP} photos per group.
- Do not assign Photo roles (front/back/left/right). Grouping only.
- Empty or unreadable photos: put them in their own group with low confidence rather than forcing a match.
- Prefer conservative splits: two similar white shirts from different clubs are two groups.

Return JSON only.`;

export function groupingVisionUserPrompt(
  photoCount: number,
  priorGroups: GroupingPriorGroup[] = [],
): string {
  const prior =
    priorGroups.length === 0
      ? ""
      : `Existing shirts (keep these photoIds together; you may ADD new photos to them; do not split them):
${priorGroups.map((group, index) => `${index + 1}. ${group.photoIds.join(", ")}`).join("\n")}

Assign every NEW photo to an existing group or a new group. Return the complete groups (existing photoIds plus any new ones).

`;

  return `${prior}Group these ${photoCount} football jersey photo(s) into separate shirts.

{"groups":[{"photoIds":["<uuid>",...],"confidence":0.85}]}

Use the exact photoId strings provided before each image. confidence is 0–1 per group. JSON only.`;
}

/** Combined prompt for Gemini generateContent (no system role). */
export function groupingVisionPrompt(
  photoCount: number,
  priorGroups: GroupingPriorGroup[] = [],
): string {
  return `${GROUPING_VISION_SYSTEM_PROMPT}\n\n${groupingVisionUserPrompt(photoCount, priorGroups)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function groupingConfidencePct(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  if (value <= 1) {
    return Math.round(Math.max(0, value) * 100);
  }
  return Math.min(100, Math.round(value));
}

/**
 * Keep only known photoIds, cap 10 per group, first group wins on duplicates.
 */
export function decodeGroupingVisionGroups(
  text: string | null,
  allowedPhotoIds: string[],
): Array<{ photoIds: string[]; confidence: number }> | null {
  if (!text) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.groups)) {
      return null;
    }

    const allowed = new Set(allowedPhotoIds);
    const seen = new Set<string>();
    const groups: Array<{ photoIds: string[]; confidence: number }> = [];

    for (const entry of parsed.groups) {
      if (!isRecord(entry) || !Array.isArray(entry.photoIds)) {
        continue;
      }
      const photoIds: string[] = [];
      for (const id of entry.photoIds) {
        if (typeof id !== "string" || !allowed.has(id) || seen.has(id)) {
          continue;
        }
        if (photoIds.length >= MAX_PHOTOS_PER_GROUP) {
          break;
        }
        seen.add(id);
        photoIds.push(id);
      }
      if (photoIds.length === 0) {
        continue;
      }
      groups.push({
        photoIds,
        confidence: groupingConfidencePct(entry.confidence),
      });
    }

    return groups.length > 0 ? groups : null;
  } catch {
    return null;
  }
}
