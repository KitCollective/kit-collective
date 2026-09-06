import type { useRouter } from "expo-router";
import type { PrefilledClub } from "./captureSessionPersistence";

export type CaptureSource = "gallery" | "camera";

type CaptureRouter = ReturnType<typeof useRouter>;

type StartCaptureOptions = {
  router: CaptureRouter;
  prefilledClub?: PrefilledClub | null;
};

/**
 * Turns a chosen capture source into the next screen of the capture session
 * (docs/design-system.md → Patterns → Capture session). Shared by the Samling
 * capture header button and the post-Save re-entry so the two entries cannot drift.
 *
 * Both sources hand off to a `(capture)` route rather than opening the system picker
 * inline: **Tag billede** to the camera, **Upload billeder** to the loading route
 * which owns the transition state and only then launches the Photos/Files picker. That
 * keeps the "picker launches only after the Chooser Sheet's Modal dismissed" invariant
 * (the route is pushed from the Modal's onDismiss) and never leaves the collector on a
 * blank Samling while the picker opens.
 */
export function startCaptureFromSource(
  source: CaptureSource,
  { router, prefilledClub = null }: StartCaptureOptions,
): void {
  const params = prefilledClub
    ? { prefilledClubId: prefilledClub.id, prefilledClubLabel: prefilledClub.label }
    : undefined;

  if (source === "camera") {
    router.push({ pathname: "/(capture)/capture", params });
    return;
  }

  router.push({ pathname: "/(capture)/loading", params });
}
