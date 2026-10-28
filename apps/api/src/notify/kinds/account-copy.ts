import { readEmailConfig } from "../email-config.js";

/** Copy Paper does not draw for these mails stays visibly flagged until Nicklas supplies it. */
export const gap = (what: string) => `[MANGLER: ${what}]`;

/** The Note of the account mails: names the support address, since nobody can reply to the mail. */
export const supportNote = () => `${gap("note")} ${readEmailConfig().supportAddress}`;

/** Account mails (01–04, 12) cannot be switched off; the lock fixes this sentence. */
export const accountFooter = (reason: string) => `${reason} Den kan ikke slås fra.`;
