import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { takeMailLinkOpening } from "@/links/mail-link-opening";

/**
 * Opens the target of a mail link once the Collector is signed in and the tabs are showing. Waiting
 * for the tabs makes signed in and signed out the same path: index, (first-session) and sign-in
 * land on Samling, then the target opens over it and back returns to Samling. The decision lives in
 * takeMailLinkOpening.
 */
export function MailLinkGate() {
  const { user, openPaywall } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const inTabs = segments[0] === "(tabs)";

  useEffect(() => {
    const opening = takeMailLinkOpening({ signedIn: Boolean(user), inTabs });
    if (!opening) {
      return;
    }
    for (const href of opening.hrefs) {
      // SAFETY: mailLinkStack only returns routes that exist under app/(tabs).
      router.push(href as Parameters<typeof router.push>[0]);
    }
    if (opening.paywall) {
      void openPaywall();
    }
  }, [user, inTabs, router, openPaywall]);

  return null;
}
