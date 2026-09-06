import { describe, expect, it } from "vitest";
import { startCaptureFromSource } from "../src/capture/captureSourceFlow";

type PushArg = { pathname: string; params?: Record<string, string> };

function fakeRouter() {
  const pushes: PushArg[] = [];
  // Only `push` is exercised by startCaptureFromSource; cast keeps the fake minimal.
  const router = {
    push: (arg: PushArg) => {
      pushes.push(arg);
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal router fake for a unit test.
  } as any;
  return { router, pushes };
}

describe("startCaptureFromSource", () => {
  it("routes Upload billeder through the (capture) loading screen, not the picker inline", () => {
    const { router, pushes } = fakeRouter();

    startCaptureFromSource("gallery", { router });

    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.pathname).toBe("/(capture)/loading");
  });

  it("routes Tag billede straight to the camera screen", () => {
    const { router, pushes } = fakeRouter();

    startCaptureFromSource("camera", { router });

    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.pathname).toBe("/(capture)/capture");
  });

  it("forwards a prefilled club to the loading screen", () => {
    const { router, pushes } = fakeRouter();

    startCaptureFromSource("gallery", {
      router,
      prefilledClub: { id: "club-1", label: "F.C. København" },
    });

    expect(pushes[0]?.params).toEqual({
      prefilledClubId: "club-1",
      prefilledClubLabel: "F.C. København",
    });
  });

  it("omits params when no club is prefilled", () => {
    const { router, pushes } = fakeRouter();

    startCaptureFromSource("gallery", { router });

    expect(pushes[0]?.params).toBeUndefined();
  });
});
