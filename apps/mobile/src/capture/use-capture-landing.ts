import { useCallback } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { loadPersistedCaptureSession } from "@/capture/captureFlow";
import { shouldOpenBulkOverview, visionOnForCapture } from "@/capture/captureOverview";
import { visionMatcherRemainingToOutOfQuota } from "@/capture/confirmVisionQuota";

export type CaptureLanding = {
  pathname: "/(capture)/overview" | "/(capture)/confirm";
  params: { sessionId: string };
};

/**
 * Where a freshly captured session lands. Four or more photos with Vision on open the bulk
 * overview; three or fewer, or Vision off, go straight to Confirm.
 */
export function useCaptureLanding(): (sessionId: string) => CaptureLanding {
  const { accessToken, entitlement } = useAuth();
  const visionOn = visionOnForCapture({
    accessToken,
    outOfQuota: visionMatcherRemainingToOutOfQuota(entitlement?.visionMatcher),
  });

  return useCallback(
    (sessionId) => {
      const branch = loadPersistedCaptureSession(sessionId)?.branch ?? "single";
      return {
        pathname: shouldOpenBulkOverview({ branch, visionOn })
          ? "/(capture)/overview"
          : "/(capture)/confirm",
        params: { sessionId },
      };
    },
    [visionOn],
  );
}
