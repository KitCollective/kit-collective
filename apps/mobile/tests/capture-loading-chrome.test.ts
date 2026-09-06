import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const loadingRoutePath = join(__dirname, "../app/(capture)/loading.tsx");
const loadingScreenPath = join(__dirname, "../src/capture/capture-loading-screen.tsx");
const layoutPath = join(__dirname, "../app/(capture)/_layout.tsx");
const sourceFlowPath = join(__dirname, "../src/capture/captureSourceFlow.ts");
const presentationPath = join(__dirname, "../src/capture/upload-capture-presentation.ts");

describe("Capture loading transition", () => {
  it("registers the loading route in the (capture) group with a fade", () => {
    const layout = readFileSync(layoutPath, "utf8");

    expect(layout).toContain('name="loading"');
    // Same fade / reduced-motion treatment as the camera capture screen.
    expect(layout).toContain('animation: reduceMotion ? "none" : "fade"');
  });

  it("shows a tasteful token-composed loading surface, not the splash plate or Vision screen", () => {
    const screen = readFileSync(loadingScreenPath, "utf8");

    expect(screen).toContain("ActivityIndicator");
    expect(screen).toContain("theme.canvas");
    expect(screen).toContain("theme.contentPrimary");
    // Composes locked tokens only — no raw color / fontSize.
    expect(screen).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(screen).not.toMatch(/fontSize:/);
    // Not the branded boot plate and not the first-session analysing screen.
    expect(screen).not.toContain("SplashFrame");
    expect(screen).not.toContain("AnalysingScreen");
  });

  it("gates the picker on the native transitionEnd present signal, then replaces to Confirm or dismisses", () => {
    const route = readFileSync(loadingRoutePath, "utf8");
    const presentation = readFileSync(presentationPath, "utf8");

    expect(route).toContain("CaptureLoadingScreen");
    expect(route).toContain("runUploadCapture");
    expect(route).toContain("createPersistedCaptureSession");
    // The picker is gated on the native-stack present signal, not fired inline on mount
    // and NOT on an InteractionManager tick (that cleared before the native present
    // finished, so the picker opened while Samling was the top VC).
    expect(route).toContain("startUploadCaptureWhenPresented");
    expect(route).toContain("useNavigation");
    expect(route).toContain("scheduleUploadWhenPresented");
    expect(presentation).toContain('addListener("transitionEnd"');
    expect(presentation).toContain("event.data?.closing");
    // No InteractionManager gate anymore (it cleared before the native present finished).
    expect(route).not.toContain("InteractionManager.runAfterInteractions");
    expect(route).not.toContain('from "react-native"');
    // Reduced motion enters with animation: "none" (no transitionEnd to await) → rAF paint.
    expect(route).toContain("reduceMotion");
    expect(presentation).toContain("requestAnimationFrame");
    // Success: same-stack replace into Confirm (no modal hop).
    expect(route).toContain('pathname: "/(capture)/confirm"');
    expect(route).toContain("router.replace");
    // Cancel: single dismiss out of the (capture) modal back to Samling.
    expect(route).toContain("router.dismiss()");
    // Runs exactly once even though params identity changes per render.
    expect(route).toContain("startedRef");
  });

  it("routes Upload billeder through the loading screen and never opens the picker inline", () => {
    const flow = readFileSync(sourceFlowPath, "utf8");

    expect(flow).toContain('pathname: "/(capture)/loading"');
    expect(flow).toContain('pathname: "/(capture)/capture"');
    // The inline pick + session build moved to the loading route.
    expect(flow).not.toContain("pickUploadFiles");
    expect(flow).not.toContain("createPersistedCaptureSession");
  });
});
