import { useCallback } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { loadPersistedCaptureSession } from "@/capture/captureFlow";
import {
  shouldOpenBulkOverview,
  shouldOpenUnassigned,
  visionOnForCapture,
} from "@/capture/captureOverview";
import { resolveVisionEnabled } from "@/capture/chooserVision";
import { visionMatcherRemainingToOutOfQuota } from "@/capture/confirmVisionQuota";
import { visionRequestToken } from "@/capture/identitySuggestRequest";
import { useVisionSwitch } from "@/prefs/vision-switch-device";

export type CaptureLanding = {
  pathname: "/(capture)/overview" | "/(capture)/unassigned" | "/(capture)/confirm";
  params: { sessionId: string };
};

/**
 * Where a freshly captured session lands. Four or more photos with Vision on open the bulk
 * overview; four or more with Vision off open the photos without a jersey; three or fewer go
 * straight to Confirm.
 */
export function useCaptureLanding(): (sessionId: string) => CaptureLanding {
  const { accessToken: sessionToken, entitlement } = useAuth();
  const visionRemembered = useVisionSwitch();
  const visionEnabled = resolveVisionEnabled(visionRemembered, entitlement?.visionMatcher);
  const visionOn = visionOnForCapture({
    accessToken: visionRequestToken(sessionToken, visionEnabled),
    outOfQuota: visionMatcherRemainingToOutOfQuota(entitlement?.visionMatcher),
  });

  return useCallback(
    (sessionId) => {
      const branch = loadPersistedCaptureSession(sessionId)?.branch ?? "single";
      if (shouldOpenBulkOverview({ branch, visionOn })) {
        return { pathname: "/(capture)/overview", params: { sessionId } };
      }
      if (shouldOpenUnassigned({ branch, visionOn })) {
        return { pathname: "/(capture)/unassigned", params: { sessionId } };
      }
      return { pathname: "/(capture)/confirm", params: { sessionId } };
    },
    [visionOn],
  );
}
