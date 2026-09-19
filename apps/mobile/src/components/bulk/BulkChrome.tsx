import type { CaptureSessionState } from "@/capture/captureSessionTypes";
import { JerseyTabBar } from "./JerseyTabBar";

type BulkChromeProps = {
  state: CaptureSessionState;
  onSelectDraft: (draftId: string) => void;
  onAddJersey: () => void;
};

export function BulkChrome({ state, onSelectDraft, onAddJersey }: BulkChromeProps) {
  return (
    <JerseyTabBar
      drafts={state.drafts}
      activeDraftId={state.activeDraftId}
      onSelectDraft={onSelectDraft}
      onAddJersey={onAddJersey}
    />
  );
}
