import { useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { CaptureSourceSheet } from "@/components/capture-source-sheet";
import type { PrefilledClub } from "./captureFlow";
import { startCaptureFromSource } from "./captureSourceFlow";

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

  const open = useCallback((prefilledClub: PrefilledClub | null = null) => {
    setPending({ prefilledClub });
  }, []);

  const value = useMemo<CaptureChooserValue>(() => ({ open }), [open]);

  return (
    <CaptureChooserContext.Provider value={value}>
      {children}
      <CaptureSourceSheet
        visible={pending !== null}
        onDismiss={() => setPending(null)}
        onConfirm={(source) => {
          const prefilledClub = pending?.prefilledClub ?? null;
          // Dismiss first: the system picker cannot present while the Sheet's Modal is up.
          setPending(null);
          void startCaptureFromSource(source, { router, prefilledClub });
        }}
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
