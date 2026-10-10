import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { CaptureLoadingScreen } from "@/capture/capture-loading-screen";
import { createPersistedCaptureSession, readPrefilledClub } from "@/capture/captureFlow";
import { expoUploadFilesAdapter } from "@/capture/expoPickerAdapters";
import {
  scheduleUploadWhenPresented,
  type TransitionNavigation,
} from "@/capture/upload-capture-presentation";
import { runUploadCapture, startUploadCaptureWhenPresented } from "@/capture/uploadCaptureSession";
import { useCaptureLanding } from "@/capture/use-capture-landing";
import { readReduceMotion } from "@/theme/use-reduce-motion";

const PICKING_CAPTION = "Åbner dine billeder …";
const BUILDING_CAPTION = "Forbereder trøjen …";

type CaptureTransitionNavigation = ReturnType<typeof useNavigation> & TransitionNavigation;

/**
 * Upload loading route. The presentation scheduler guarantees loading paints before
 * Photos/Files opens; this route only maps the settled result to navigation.
 */
export default function CaptureLoadingRoute() {
  const router = useRouter();
  const navigation = useNavigation<CaptureTransitionNavigation>();
  const landingFor = useCaptureLanding();
  // The effect below runs once; keep the latest landing rule without re-running it.
  const landingForRef = useRef(landingFor);
  landingForRef.current = landingFor;
  const params = useLocalSearchParams<{
    prefilledClubId?: string;
    prefilledClubLabel?: string;
  }>();
  // Read once so the effect below runs exactly once (params identity changes per render).
  const [prefilledClub] = useState(() => readPrefilledClub(params));
  const [caption, setCaption] = useState(PICKING_CAPTION);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    let active = true;
    const cleanup = startUploadCaptureWhenPresented({
      scheduleWhenPresented: (run) =>
        scheduleUploadWhenPresented(navigation, readReduceMotion, run),
      runPick: () =>
        runUploadCapture(expoUploadFilesAdapter, createPersistedCaptureSession, {
          prefilledClub,
          onBuildStart: () => {
            if (active) {
              setCaption(BUILDING_CAPTION);
            }
          },
        }),
      onResult: (result) => {
        if (result.status === "cancelled") {
          router.dismiss();
          return;
        }
        router.replace(landingForRef.current(result.sessionId));
      },
    });

    return () => {
      active = false;
      cleanup();
    };
  }, [navigation, prefilledClub, router]);

  return <CaptureLoadingScreen caption={caption} />;
}
