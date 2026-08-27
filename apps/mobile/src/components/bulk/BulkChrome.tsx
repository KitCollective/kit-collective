import type { CaptureSessionState } from "@/capture/captureSessionTypes";
import { JerseyTabBar } from "./JerseyTabBar";
import { UnboundPhotosRow } from "./UnboundPhotosRow";

type BulkChromeProps = {
  state: CaptureSessionState;
  onSelectDraft: (draftId: string) => void;
  onAddJersey: () => void;
  onBindUnboundPhoto: (uri: string) => void;
};

export function BulkChrome({
  state,
  onSelectDraft,
  onAddJersey,
  onBindUnboundPhoto,
}: BulkChromeProps) {
  const activeIndex = state.drafts.findIndex((draft) => draft.id === state.activeDraftId);
  const activeTabLabel = activeIndex >= 0 ? `Trøje ${activeIndex + 1}` : "Trøje";

  return (
    <>
      <UnboundPhotosRow
        uris={state.unboundUris}
        activeTabLabel={activeTabLabel}
        onPressPhoto={onBindUnboundPhoto}
      />
      <JerseyTabBar
        drafts={state.drafts}
        activeDraftId={state.activeDraftId}
        onSelectDraft={onSelectDraft}
        onAddJersey={onAddJersey}
      />
    </>
  );
}
