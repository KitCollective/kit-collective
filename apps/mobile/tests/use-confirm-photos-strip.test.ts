import { PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { describe, expect, it, vi } from "vitest";
import { type ConfirmStripSources, createConfirmStripPhotos } from "../src/capture/confirmPhotoUri";

function sources(partial: Partial<ConfirmStripSources>): ConfirmStripSources {
  const empty = Object.fromEntries(PHOTO_ROLES.map((role) => [role, undefined]));
  // SAFETY: PHOTO_ROLES lists every PhotoRole, so `empty` has every key.
  return { ...(empty as ConfirmStripSources), ...partial };
}

/** A fake prepare whose every call stays pending until the test settles it. */
function pendingPrepare() {
  const calls: {
    uri: string;
    role: PhotoRole;
    resolve: (uri: string) => void;
    reject: () => void;
  }[] = [];
  const prepare = vi.fn(
    (uri: string, role: PhotoRole) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ uri, role, resolve, reject: () => reject(new Error("prepare failed")) });
      }),
  );
  return { prepare, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createConfirmStripPhotos", () => {
  it("shows the draft URI on the first render, before any prepare settles", () => {
    const { prepare } = pendingPrepare();
    const strip = createConfirmStripPhotos(prepare, vi.fn());
    const current = sources({ front: "file:///front.jpg", back: "file:///back.jpg" });

    expect(strip.uris(current)).toEqual(current);
    strip.update(current);
    expect(strip.uris(current)).toEqual(current);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("swaps one role to its prepared URI and leaves the pending role on the draft URI", async () => {
    const { prepare, calls } = pendingPrepare();
    const onChange = vi.fn();
    const strip = createConfirmStripPhotos(prepare, onChange);
    const current = sources({ front: "file:///front.jpg", back: "file:///back.jpg" });
    strip.update(current);

    calls.find((call) => call.role === "front")?.resolve("file:///front-strip.jpg");
    await flush();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(strip.uris(current)).toEqual(
      sources({ front: "file:///front-strip.jpg", back: "file:///back.jpg" }),
    );
  });

  it("keeps the draft URI when a prepare fails", async () => {
    const { prepare, calls } = pendingPrepare();
    const strip = createConfirmStripPhotos(prepare, vi.fn());
    const current = sources({ front: "file:///front.jpg" });
    strip.update(current);

    calls[0]?.reject();
    await flush();

    expect(strip.uris(current)).toEqual(current);
  });

  it("starts no prepare for a new draft object with the same URIs", async () => {
    const { prepare, calls } = pendingPrepare();
    const strip = createConfirmStripPhotos(prepare, vi.fn());
    strip.update(sources({ front: "file:///front.jpg", back: "file:///back.jpg" }));
    calls.find((call) => call.role === "front")?.resolve("file:///front-strip.jpg");
    await flush();

    const again = sources({ front: "file:///front.jpg", back: "file:///back.jpg" });
    strip.update(again);

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(strip.uris(again).front).toBe("file:///front-strip.jpg");
  });

  it("re-prepares only the role whose URI changed", async () => {
    const { prepare, calls } = pendingPrepare();
    const strip = createConfirmStripPhotos(prepare, vi.fn());
    strip.update(sources({ front: "file:///front.jpg", back: "file:///back.jpg" }));
    for (const call of calls) {
      call.resolve(`${call.uri}.strip`);
    }
    await flush();

    const next = sources({ front: "file:///front.jpg", back: "file:///back-2.jpg" });
    strip.update(next);

    expect(prepare).toHaveBeenCalledTimes(3);
    expect(prepare).toHaveBeenLastCalledWith("file:///back-2.jpg", "back");
    expect(strip.uris(next)).toEqual(
      sources({ front: "file:///front.jpg.strip", back: "file:///back-2.jpg" }),
    );
  });

  it("ignores a prepare that settles after its URI was replaced", async () => {
    const { prepare, calls } = pendingPrepare();
    const onChange = vi.fn();
    const strip = createConfirmStripPhotos(prepare, onChange);
    strip.update(sources({ front: "file:///old.jpg" }));
    const next = sources({ front: "file:///new.jpg" });
    strip.update(next);

    calls.find((call) => call.uri === "file:///old.jpg")?.resolve("file:///old-strip.jpg");
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(strip.uris(next).front).toBe("file:///new.jpg");

    calls.find((call) => call.uri === "file:///new.jpg")?.resolve("file:///new-strip.jpg");
    await flush();
    expect(strip.uris(next).front).toBe("file:///new-strip.jpg");
  });

  it("drops the prepared URI of a role whose photo is gone", async () => {
    const { prepare, calls } = pendingPrepare();
    const strip = createConfirmStripPhotos(prepare, vi.fn());
    strip.update(sources({ front: "file:///front.jpg" }));
    calls[0]?.resolve("file:///front-strip.jpg");
    await flush();

    const removed = sources({});
    strip.update(removed);

    expect(strip.uris(removed).front).toBeUndefined();
    const restored = sources({ front: "file:///front.jpg" });
    expect(strip.uris(restored).front).toBe("file:///front.jpg");
  });

  it("ignores settles after dispose and starts fresh on the next update", async () => {
    const { prepare, calls } = pendingPrepare();
    const onChange = vi.fn();
    const strip = createConfirmStripPhotos(prepare, onChange);
    const current = sources({ front: "file:///front.jpg" });
    strip.update(current);
    strip.dispose();

    calls[0]?.resolve("file:///front-strip.jpg");
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(strip.uris(current).front).toBe("file:///front.jpg");

    // React strict mode runs the effect, its cleanup, then the effect again.
    strip.update(current);
    expect(prepare).toHaveBeenCalledTimes(2);
    calls[1]?.resolve("file:///front-strip.jpg");
    await flush();
    expect(strip.uris(current).front).toBe("file:///front-strip.jpg");
  });
});
