import type { PhotoRole } from "@kit/domain";
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearDevicePhotoPrepareCacheForTests,
  DISPLAY_MAX_EDGE_OTHER,
  DISPLAY_MAX_EDGE_UNIVERSAL,
  GROUPING_THUMB_MAX_EDGE,
  maxEdgeForPrepare,
  prepareDevicePhoto,
  readPreparedDevicePhotoBase64,
  resizeActionForMaxLongEdge,
  scheduleDevicePhotoPrepare,
  VISION_IDENTITY_MAX_EDGE,
  type PhotoManipulatorAdapter,
} from "../src/capture/photoPrepare";

function createFakeAdapter(
  info: { width: number; height: number },
  base64 = "ZmFrZS1qcGVn",
): PhotoManipulatorAdapter & {
  calls: Array<{
    uri: string;
    actions: unknown[];
    options: { compress: number; format: string; includeBase64: boolean };
  }>;
} {
  const calls: Array<{
    uri: string;
    actions: unknown[];
    options: { compress: number; format: string; includeBase64: boolean };
  }> = [];

  const adapter = {
    async getImageInfo() {
      return info;
    },
    async manipulateAsync(
      uri: string,
      actions: unknown[],
      options: { compress: number; format: "jpeg"; includeBase64: boolean },
    ) {
      calls.push({ uri, actions, options });
      const resize = (actions[0] as { resize?: { width?: number; height?: number } })?.resize;
      const width = resize?.width ?? info.width;
      const height = resize?.height ?? info.height;
      return {
        uri: `${uri}.prepared.jpg`,
        width,
        height,
        base64: options.includeBase64 ? base64 : undefined,
      };
    },
    calls,
  };

  return adapter;
}

describe("maxEdgeForPrepare", () => {
  it("targets ~1600 px long edge for universal display roles", () => {
    for (const role of ["front", "back", "left", "right"] as PhotoRole[]) {
      expect(maxEdgeForPrepare("display", role)).toBe(DISPLAY_MAX_EDGE_UNIVERSAL);
    }
  });

  it("targets ~2400 px long edge for Andet display", () => {
    expect(maxEdgeForPrepare("display", "other")).toBe(DISPLAY_MAX_EDGE_OTHER);
  });

  it("targets Vision identity at ≤1536 px", () => {
    expect(maxEdgeForPrepare("visionIdentity", "front")).toBe(VISION_IDENTITY_MAX_EDGE);
    expect(maxEdgeForPrepare("visionIdentity", "other")).toBe(VISION_IDENTITY_MAX_EDGE);
  });

  it("targets grouping thumbs at ≤384 px", () => {
    expect(maxEdgeForPrepare("groupingThumb", "front")).toBe(GROUPING_THUMB_MAX_EDGE);
  });
});

describe("resizeActionForMaxLongEdge", () => {
  it("returns null when the long edge is already within the cap", () => {
    expect(resizeActionForMaxLongEdge(1200, 800, 1600)).toBeNull();
    expect(resizeActionForMaxLongEdge(800, 1200, 1600)).toBeNull();
  });

  it("scales landscape photos by width", () => {
    expect(resizeActionForMaxLongEdge(4000, 3000, 1600)).toEqual({
      resize: { width: 1600 },
    });
  });

  it("scales portrait photos by height", () => {
    expect(resizeActionForMaxLongEdge(3000, 4000, 1600)).toEqual({
      resize: { height: 1600 },
    });
  });
});

describe("prepareDevicePhoto", () => {
  beforeEach(() => {
    clearDevicePhotoPrepareCacheForTests();
  });

  it("always requests JPEG output (HEIC/PNG become JPEG)", async () => {
    const adapter = createFakeAdapter({ width: 1200, height: 900 });
    const prepared = await prepareDevicePhoto(
      "file:///photos/front.heic",
      "front",
      "display",
      adapter,
    );

    expect(prepared.format).toBe("jpeg");
    expect(adapter.calls[0]).toMatchObject({
      options: { format: "jpeg" },
    });
    expect(prepared.base64).toBe("ZmFrZS1qcGVn");
  });

  it("does not emit PNG for gallery/camera/files paths", async () => {
    const adapter = createFakeAdapter({ width: 800, height: 600 });
    await prepareDevicePhoto("file:///photos/input.png", "back", "display", adapter);

    const call = adapter.calls[0];
    expect(call?.options.format).toBe("jpeg");
    expect(call?.options.format).not.toBe("png");
  });

  it("resizes when the long edge exceeds the role cap", async () => {
    const adapter = createFakeAdapter({ width: 3200, height: 2400 });
    const prepared = await prepareDevicePhoto(
      "file:///photos/detail.heic",
      "other",
      "display",
      adapter,
    );

    expect(adapter.calls[0]?.actions).toEqual([
      { resize: { width: DISPLAY_MAX_EDGE_OTHER } },
    ]);
    expect(prepared.width).toBe(DISPLAY_MAX_EDGE_OTHER);
  });

  it("re-encodes without resize when already under the cap (HEIC → JPEG)", async () => {
    const adapter = createFakeAdapter({ width: 1024, height: 768 });
    await prepareDevicePhoto("file:///photos/front.heic", "front", "display", adapter);

    expect(adapter.calls[0]?.actions).toEqual([]);
  });

  it("uses the Vision identity cap before bytes leave the device", async () => {
    const adapter = createFakeAdapter({ width: 3000, height: 2000 });
    await prepareDevicePhoto("file:///photos/front.jpg", "front", "visionIdentity", adapter);

    expect(adapter.calls[0]?.actions).toEqual([
      { resize: { width: VISION_IDENTITY_MAX_EDGE } },
    ]);
  });
});

describe("scheduleDevicePhotoPrepare", () => {
  beforeEach(() => {
    clearDevicePhotoPrepareCacheForTests();
  });

  it("warms the cache without blocking later Save/Vision reads", async () => {
    const adapter = createFakeAdapter({ width: 4000, height: 3000 });
    scheduleDevicePhotoPrepare("file:///photos/camera-shot.heic", "front", "display", adapter);
    const base64 = await readPreparedDevicePhotoBase64(
      "file:///photos/camera-shot.heic",
      "front",
      "display",
      adapter,
    );

    expect(base64).toBe("ZmFrZS1qcGVn");
    expect(adapter.calls).toHaveLength(1);
  });
});
