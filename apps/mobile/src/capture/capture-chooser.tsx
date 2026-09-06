import { useRouter } from "expo-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { CaptureSourceSheet } from "@/components/capture-source-sheet";
import type { PrefilledClub } from "./captureFlow";
import { type CaptureSource, startCaptureFromSource } from "./captureSourceFlow";

type CaptureChooserValue = {
  /** Present the Chooser Sheet over whatever place the collector is on. */
  open: (prefilledClub?: PrefilledClub | null) => void;
};

const CaptureChooserContext = createContext<CaptureChooserValue | null>(null);

/**
 * Owns the one capture Chooser Sheet (docs/design-system.md → Patterns →
 * Capture session). Hosted above the tab navigator so both the tab-bar plus
 * and the post-Save re-entry present the same face.
 */
export function CaptureChooserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<{ prefilledClub: PrefilledClub | null } | null>(null);
  // A chosen source waits here until the Sheet's Modal has fully left the screen, so the
  // system picker (iOS ActionSheet / Photos / camera) never presents on top of a closing
  // Modal — iOS would otherwise flash and cancel it, dropping the collector on a blank screen.
  const queued = useRef<{ source: CaptureSource; prefilledClub: PrefilledClub | null } | null>(
    null,
  );

  const open = useCallback((prefilledClub: PrefilledClub | null = null) => {
    queued.current = null;
    setPending({ prefilledClub });
  }, []);

  const runQueued = useCallback(() => {
    const next = queued.current;
    if (!next) {
      return;
    }
    queued.current = null;
    void startCaptureFromSource(next.source, { router, prefilledClub: next.prefilledClub });
  }, [router]);

  const value = useMemo<CaptureChooserValue>(() => ({ open }), [open]);

  return (
    <CaptureChooserContext.Provider value={value}>
      {children}
      <CaptureSourceSheet
        visible={pending !== null}
        onDismiss={() => {
          // Plain cancel (Annuller / swipe / scrim): drop any queued source, start nothing.
          queued.current = null;
          setPending(null);
        }}
        onConfirm={(source) => {
          const prefilledClub = pending?.prefilledClub ?? null;
          // Close the Sheet first: the system picker cannot present while the Modal is up.
          setPending(null);
          if (Platform.OS === "ios") {
            // Wait for Modal.onDismiss (runQueued) so the picker presents on a clear screen.
            queued.current = { source, prefilledClub };
            return;
          }
          // No layering race off iOS — launch the flow straight away.
          void startCaptureFromSource(source, { router, prefilledClub });
        }}
        onModalHide={runQueued}
      />
    </CaptureChooserContext.Provider>
  );
}

export function useCaptureChooser(): CaptureChooserValue {
  const value = useContext(CaptureChooserContext);
  if (!value) {
    throw new Error("useCaptureChooser must be used inside CaptureChooserProvider");
  }
  return value;
}
