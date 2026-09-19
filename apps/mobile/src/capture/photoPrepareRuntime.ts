import type { CaptureJerseyDraft } from "./captureSessionTypes";
import { expoPhotoManipulatorAdapter } from "./expoPhotoManipulatorAdapter";
import { warmDevicePrepareForDraft } from "./photoPrepare";

export function warmDevicePrepareForDraftRuntime(draft: CaptureJerseyDraft): void {
  warmDevicePrepareForDraft(draft, expoPhotoManipulatorAdapter);
}
