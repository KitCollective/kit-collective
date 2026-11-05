import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { mailLinkStack } from "@/links/mail-link";
import { takeMailLink } from "@/links/pending-mail-link";

/**
 * Opens the target of a mail link once the Collector is signed in and the tabs are showing. Waiting
 * for the tabs makes signed in and signed out the same path: index, (first-session) and sign-in
 * land on Samling, then the target opens over it and back returns to Samling.
 */
export function MailLinkGate() {
  const { user, openPaywall } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const inTabs = segments[0] === "(tabs)";

  useEffect(() => {
    if (!user || !inTabs) {
      return;
    }
    const target = takeMailLink();
    if (!target) {
      return;
    }
    for (const href of mailLinkStack(target)) {
      // SAFETY: mailLinkStack only returns routes that exist under app/(tabs).
      router.push(href as Parameters<typeof router.push>[0]);
    }
    if (target.kind === "paywall") {
      void openPaywall();
    }
  }, [user, inTabs, router, openPaywall]);

  return null;
}
