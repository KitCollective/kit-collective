import { resolveMailLink } from "@/links/mail-link";
import { rememberMailLink } from "@/links/pending-mail-link";

/**
 * Runs before Expo Router matches an incoming link. A mail link (https://kitcollective.app/...) has
 * no file route, so it would land on +not-found. It is held as a target and the app starts at home;
 * MailLinkGate opens the target once the Collector is signed in and Samling shows. Any other path,
 * such as the kitcollective:// sign-in return, goes through unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const target = resolveMailLink(path);
    if (target.kind === "home") {
      return path;
    }
    rememberMailLink(target);
    return "/";
  } catch {
    return "/";
  }
}
