import { Logger } from "@nestjs/common";
import { requireBetterAuthUrl } from "../config/better-auth-env.js";

const logger = new Logger("EmailConfig");
const warned = new Set<string>();

/** Shown in the mail itself until the real value is supplied, so a gap cannot ship unseen. */
export const SUPPORT_PLACEHOLDER = "[MANGLER: supportadresse]";
export const LEGAL_PLACEHOLDER = "[MANGLER: juridisk afsenderlinje]";

export type EmailConfig = {
  /** Public base URL the mail images are fetched from, no trailing slash. */
  assetBaseUrl: string;
  supportAddress: string;
  legalLine: string;
};

function configured(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (value) {
    return value;
  }
  if (!warned.has(key)) {
    warned.add(key);
    // Names the key only: the lines this module logs never carry a mail, a code or an address.
    logger.warn(`${key} is not set; the mail footer shows a flagged placeholder.`);
  }
  return undefined;
}

export function readEmailConfig(): EmailConfig {
  const explicit = process.env.EMAIL_ASSET_BASE_URL?.trim();
  const assetBaseUrl = (explicit || `${requireBetterAuthUrl()}/v1/email/assets`).replace(/\/$/, "");
  return {
    assetBaseUrl,
    supportAddress: configured("EMAIL_SUPPORT_ADDRESS") ?? SUPPORT_PLACEHOLDER,
    legalLine: configured("EMAIL_LEGAL_LINE") ?? LEGAL_PLACEHOLDER,
  };
}
