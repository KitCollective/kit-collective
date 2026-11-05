import type { MailLinkTarget } from "@/links/mail-link";

let pending: MailLinkTarget | null = null;

/** Holds a link's target until the collector is signed in and Samling is showing. Memory is
 * enough: a code or social sign-in keeps the process alive. */
export function rememberMailLink(target: MailLinkTarget): void {
  pending = target;
}

export function takeMailLink(): MailLinkTarget | null {
  const target = pending;
  pending = null;
  return target;
}
