/**
 * Mail links: the one place that says which link a mail button carries and which screen it opens.
 * The server builds its button URLs from this table (the bid mails put the bid *message* id after
 * `/m/`), the app resolves them here, and the association files and the web fallback under
 * `apps/web/public` cover exactly these paths (tests/mail-link-web.test.ts keeps them in step).
 *
 * | Link path                         | Opens                                  | Mail buttons |
 * | --------------------------------- | -------------------------------------- | ------------ |
 * | `/c/:conversationId`              | The conversation                       | 08           |
 * | `/c/:conversationId/m/:messageId` | The conversation, scrolled to that bid | 05, 06       |
 * | `/j/:jerseyId`                    | Someone else's jersey                  | 09           |
 * | `/j/:jerseyId/bud`                | Send bud for that jersey               | 07           |
 * | `/plus`                           | The KitCollective+ paywall             | 10, 11       |
 *
 * Host `kitcollective.app` (or `www.`), https only. Only opaque ids: `[A-Za-z0-9_-]{1,64}`. Never
 * an e-mail, an amount or a handle. Any other link opens the app's home screen.
 */
export type MailLinkTarget =
  | { kind: "conversation"; conversationId: string; messageId?: string }
  | { kind: "foreign-jersey"; jerseyId: string }
  | { kind: "send-bid"; jerseyId: string }
  | { kind: "paywall" }
  | { kind: "home" };

export type MailLinkHref = { pathname: string; params?: Record<string, string> };

const HOSTS = ["kitcollective.app", "www.kitcollective.app"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Route = {
  path: string;
  build: (id: (name: string) => string) => MailLinkTarget;
};

const ROUTES: readonly Route[] = [
  {
    path: "/c/:conversationId",
    build: (id) => ({ kind: "conversation", conversationId: id("conversationId") }),
  },
  {
    path: "/c/:conversationId/m/:messageId",
    build: (id) => ({
      kind: "conversation",
      conversationId: id("conversationId"),
      messageId: id("messageId"),
    }),
  },
  { path: "/j/:jerseyId", build: (id) => ({ kind: "foreign-jersey", jerseyId: id("jerseyId") }) },
  { path: "/j/:jerseyId/bud", build: (id) => ({ kind: "send-bid", jerseyId: id("jerseyId") }) },
  { path: "/plus", build: () => ({ kind: "paywall" }) },
];

export const MAIL_LINK_PATHS: readonly string[] = ROUTES.map((route) => route.path);

const HOME: MailLinkTarget = { kind: "home" };

function matchRoute(route: Route, segments: readonly string[]): MailLinkTarget | null {
  const pattern = route.path.split("/").slice(1);
  if (pattern.length !== segments.length) {
    return null;
  }
  const ids: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const segment = segments[index] ?? "";
    if (part.startsWith(":")) {
      if (!ID.test(segment)) {
        return null;
      }
      ids[part.slice(1)] = segment;
    } else if (part !== segment) {
      return null;
    }
  }
  return route.build((name) => ids[name] ?? "");
}

/** A full mail link or a bare path (what Expo Router hands to `+native-intent`). Never throws. */
export function resolveMailLink(input: string): MailLinkTarget {
  try {
    const url = input.startsWith("/") ? new URL(input, `https://${HOSTS[0]}`) : new URL(input);
    if (url.protocol !== "https:" || !HOSTS.includes(url.hostname)) {
      return HOME;
    }
    const segments = url.pathname.replace(/\/$/, "").split("/").slice(1);
    for (const route of ROUTES) {
      const target = matchRoute(route, segments);
      if (target) {
        return target;
      }
    }
    return HOME;
  } catch {
    return HOME;
  }
}

/** The in-app route of a target. The paywall is a sheet over Profil, opened by the gate. */
export function mailLinkHref(target: MailLinkTarget): MailLinkHref {
  switch (target.kind) {
    case "conversation":
      return {
        pathname: "/(tabs)/inbox/[conversationId]",
        params: {
          conversationId: target.conversationId,
          ...(target.messageId ? { messageId: target.messageId } : {}),
        },
      };
    case "foreign-jersey":
      return { pathname: "/(tabs)/search/[jerseyId]", params: { jerseyId: target.jerseyId } };
    case "send-bid":
      return {
        pathname: "/(tabs)/search/send-bid/[jerseyId]",
        params: { jerseyId: target.jerseyId },
      };
    case "paywall":
      return { pathname: "/(tabs)/profile" };
    case "home":
      return { pathname: "/" };
  }
}

/**
 * The screens to push, in order. Send bud opens over the jersey it bids on, so back and the sent-bid
 * Toast behave as when the Collector came from Søg (src/search/foreign-jersey-route.ts).
 */
export function mailLinkStack(target: MailLinkTarget): MailLinkHref[] {
  if (target.kind === "home") {
    return [];
  }
  if (target.kind === "send-bid") {
    return [
      mailLinkHref({ kind: "foreign-jersey", jerseyId: target.jerseyId }),
      mailLinkHref(target),
    ];
  }
  return [mailLinkHref(target)];
}
