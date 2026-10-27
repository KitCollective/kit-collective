import { esc } from "../template/escape.js";
import type { RenderedMail } from "../template/types.js";

/**
 * @deprecated Password-era verify and reset mails. KIT-276 took the password out of the collector
 * app only; the admin app still signs in, verifies and resets through these API routes, so the
 * mails stay. They carry the old subject and link with no template, no new copy and no layout,
 * and leave with the admin password flow.
 */
function linkMail(subject: string, url: string): RenderedMail {
  return {
    subject,
    preheader: "",
    html: `<!doctype html><html lang="da"><body><p><a href="${esc(url)}">${esc(url)}</a></p></body></html>`,
    text: url,
  };
}

/** @deprecated see {@link linkMail}. */
export const verifyMail = (data: { url: string }): RenderedMail =>
  linkMail("Bekræft din e-mail", data.url);

/** @deprecated see {@link linkMail}. */
export const resetMail = (data: { url: string }): RenderedMail =>
  linkMail("Nulstil adgangskode", data.url);
