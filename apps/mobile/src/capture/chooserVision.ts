import type { VisionMatcherUsage } from "@kit/api-contract";
import { visionMatcherRemainingToOutOfQuota } from "./confirmVisionQuota";

/**
 * View-model for the Vision row and caption on the capture Chooser (docs/design-system.md →
 * Capture session, Revision 2026-10-09, items 1-2). Pure so the copy and the quota rules are
 * tested without React Native.
 */
export type ChooserVisionModel = {
  /** What the Switch shows. Out of quota it reads off whatever the remembered choice is. */
  switchOn: boolean;
  switchDisabled: boolean;
  /** Hidden for Plus and while the entitlement is unknown. */
  quotaLine: string | null;
  quotaTone: "mono" | "danger";
  helper: string;
  /** Out of quota the helper links to KitCollective+. */
  helperIsLink: boolean;
  caption: string;
};

export const CHOOSER_VISION_COPY = {
  label: "Vision",
  helper: "Læser trøjen og udfylder for dig.",
  helperUpgrade: "Få mere med KitCollective+",
  captionOn: "Én trøje eller en hel bunke. Vision sorterer dem.",
  captionOff: "Én trøje eller en hel bunke. Du sorterer selv.",
  exhaustedNoDate: "Brugt op denne måned",
} as const;

const MONTHS_DA = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

/** "14. nov" in the collector's own calendar day. */
export function formatRenewalDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getDate()}. ${MONTHS_DA[date.getMonth()]}`;
}

export function chooserQuotaLine(usage: VisionMatcherUsage): string {
  return `${usage.remaining} af ${usage.cap} tilbage denne måned`;
}

/** The remembered choice, unless the free allowance is spent. This gates every Vision request. */
export function resolveVisionEnabled(
  remembered: boolean,
  usage: VisionMatcherUsage | null | undefined,
): boolean {
  return remembered && !visionMatcherRemainingToOutOfQuota(usage);
}

export function resolveChooserVision(
  remembered: boolean,
  usage: VisionMatcherUsage | null | undefined,
): ChooserVisionModel {
  const outOfQuota = visionMatcherRemainingToOutOfQuota(usage);
  const switchOn = resolveVisionEnabled(remembered, usage);
  const caption = switchOn ? CHOOSER_VISION_COPY.captionOn : CHOOSER_VISION_COPY.captionOff;

  if (!usage || usage.unlimited) {
    return {
      switchOn,
      switchDisabled: false,
      quotaLine: null,
      quotaTone: "mono",
      helper: CHOOSER_VISION_COPY.helper,
      helperIsLink: false,
      caption,
    };
  }

  if (outOfQuota) {
    const renewal = usage.renewsAt ? formatRenewalDate(usage.renewsAt) : null;
    return {
      switchOn: false,
      switchDisabled: true,
      quotaLine: renewal ? `Brugt op · fornyes ${renewal}` : CHOOSER_VISION_COPY.exhaustedNoDate,
      quotaTone: "danger",
      helper: CHOOSER_VISION_COPY.helperUpgrade,
      helperIsLink: true,
      caption,
    };
  }

  return {
    switchOn,
    switchDisabled: false,
    quotaLine: chooserQuotaLine(usage),
    quotaTone: "mono",
    helper: CHOOSER_VISION_COPY.helper,
    helperIsLink: false,
    caption,
  };
}
