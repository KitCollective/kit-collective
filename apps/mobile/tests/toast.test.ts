import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const saveFailurePath = join(__dirname, "../src/capture/saveFailureToast.ts");
const toastConfigPath = join(__dirname, "../src/components/toast-config.tsx");
const rootLayoutPath = join(__dirname, "../app/_layout.tsx");
const captureLayoutPath = join(__dirname, "../app/(capture)/_layout.tsx");
const capturePath = join(__dirname, "../src/capture/useConfirmSave.ts");
const confirmPath = join(__dirname, "../app/(capture)/confirm.tsx");
const firstSessionPath = join(__dirname, "../src/first-session/jersey-details-screen.tsx");
const packageJsonPath = join(__dirname, "../package.json");

describe("standard toast library (react-native-toast-message)", () => {
  it("is a workspace dependency of apps/mobile", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["react-native-toast-message"]).toBeDefined();
  });
});

describe("save-failure toast calls the library API", () => {
  const source = readFileSync(saveFailurePath, "utf8");

  it("shows an `error`-type toast with the locked Danish string", () => {
    expect(source).toContain('from "react-native-toast-message"');
    expect(source).toContain("Toast.show");
    expect(source).toContain('type: "error"');
    expect(source).toContain("Kunne ikke gemme trøjen");
  });

  it("keeps the Prøv igen retry as fire-and-forget props (Save never waits)", () => {
    // Retry travels through the library's custom-toast `props` and is rendered by the
    // config renderer's Prøv igen action.
    expect(source).toContain("onRetry");
    expect(source).toContain("props: { onRetry }");
    expect(source).not.toContain("await Toast");
  });

  it("has no Alert fallback", () => {
    expect(source).not.toContain("Alert.alert");
  });
});

describe("custom toast config keeps the app danger/content/surface tokens", () => {
  const source = readFileSync(toastConfigPath, "utf8");

  it("registers an `error` renderer via the library ToastConfig", () => {
    expect(source).toContain("ToastConfig");
    expect(source).toContain("error:");
  });

  it("renders the Prøv igen action wired to onRetry", () => {
    expect(source).toContain("Prøv igen");
    expect(source).toContain("onRetry");
  });

  it("uses locked semantic tokens, never raw hex/rgba (design-token ratchet)", () => {
    expect(source).toContain("theme.danger");
    expect(source).toContain("theme.contentPrimary");
    expect(source).toContain("radius.md");
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
  });
});

describe("library host is mounted at the app root, not inside a Modal", () => {
  const source = readFileSync(rootLayoutPath, "utf8");

  it("imports and renders exactly one root <Toast> host with the custom config", () => {
    expect(source).toContain('from "react-native-toast-message"');
    expect(source).toContain("toastConfig");
    expect(source.match(/<Toast\b/g) ?? []).toHaveLength(1);
  });

  it("renders the host after the navigators and outside any React Native Modal", () => {
    const stackCloseIdx = source.lastIndexOf("</Stack>");
    const toastIdx = source.indexOf("<Toast");
    expect(toastIdx).toBeGreaterThan(stackCloseIdx);
    expect(source).not.toContain("<Modal");
  });

  it("no longer wraps the tree in the bespoke ToastProvider", () => {
    expect(source).not.toContain("ToastProvider");
  });
});

describe("(capture) fullScreenModal mounts its own host so toasts layer above it", () => {
  const source = readFileSync(captureLayoutPath, "utf8");

  it("renders a capture-scoped <Toast> using the shared config", () => {
    expect(source).toContain('from "react-native-toast-message"');
    expect(source).toContain("toastConfig");
    expect(source).toContain("<Toast");
  });
});

describe("save flow uses the library helper, no alert or inline banner", () => {
  it("useConfirmSave fires showSaveFailureToast, not the bespoke provider", () => {
    const source = readFileSync(capturePath, "utf8");
    expect(source).toContain("showSaveFailureToast");
    expect(source).not.toContain("useToast");
    expect(source).not.toContain("saveJerseyFailureToast");
    expect(source).not.toContain("Alert.alert");
    expect(source).not.toContain("setSaveError");
  });

  it("confirm hub no longer renders the inline save-error banner or reserves a toast inset", () => {
    const source = readFileSync(confirmPath, "utf8");
    expect(source).not.toContain("Kunne ikke gemme");
    expect(source).not.toContain("Alert.alert");
    expect(source).not.toContain('activeBanner === "saveError"');
    expect(source).not.toContain("useToastBottomInset");
    expect(source).not.toContain("resolveConfirmBanner");
  });

  it("first-session jersey details fires the library helper, not an inline banner", () => {
    const source = readFileSync(firstSessionPath, "utf8");
    expect(source).toContain("showSaveFailureToast");
    expect(source).not.toContain("useToast");
    expect(source).not.toContain("Alert.alert");
    expect(source).not.toContain("Kunne ikke gemme");
    expect(source).not.toContain('activeBanner === "saveError"');
  });
});

describe("bespoke toast system is removed", () => {
  it("deletes the provider, queue, and chrome modules", () => {
    expect(existsSync(join(__dirname, "../src/components/toast/toast-provider.tsx"))).toBe(false);
    expect(existsSync(join(__dirname, "../src/components/toast/toastQueue.ts"))).toBe(false);
    expect(existsSync(join(__dirname, "../src/components/toast/toastChrome.ts"))).toBe(false);
  });
});
