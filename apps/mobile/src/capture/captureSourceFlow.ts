import type { useRouter } from "expo-router";
import { createPersistedCaptureSession, type PrefilledClub } from "./captureFlow";
import { expoUploadFilesAdapter } from "./expoPickerAdapters";
import { pickUploadFiles } from "./pickUploadFiles";

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
 */
export async function startCaptureFromSource(
  source: CaptureSource,
  { router, prefilledClub = null }: StartCaptureOptions,
): Promise<void> {
  if (source === "camera") {
    router.push({
      pathname: "/(capture)/capture",
      params: prefilledClub
        ? { prefilledClubId: prefilledClub.id, prefilledClubLabel: prefilledClub.label }
        : undefined,
    });
    return;
  }

  const uris = await pickUploadFiles({ allowsMultipleSelection: true }, expoUploadFilesAdapter);
  if (!uris) {
    return;
  }

  const { sessionId } = createPersistedCaptureSession(uris, {
    prefilledClub,
    photoSource: "gallery",
  });
  router.push({ pathname: "/(capture)/confirm", params: { sessionId } });
}
