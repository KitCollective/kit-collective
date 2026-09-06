import { expoPhotoManipulatorAdapter } from "./expoPhotoManipulatorAdapter";
import type { CaptureJerseyDraft } from "./captureSessionTypes";
import { warmDevicePrepareForDraft } from "./photoPrepare";

export function warmDevicePrepareForDraftRuntime(draft: CaptureJerseyDraft): void {
  warmDevicePrepareForDraft(draft, expoPhotoManipulatorAdapter);
}
