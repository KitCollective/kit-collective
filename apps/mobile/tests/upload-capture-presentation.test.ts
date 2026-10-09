import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  scheduleUploadWhenPresented,
  type TransitionNavigation,
} from "../src/capture/upload-capture-presentation";

type TransitionListener = Parameters<TransitionNavigation["addListener"]>[1];

function fakeNavigation() {
  const listeners = new Set<TransitionListener>();
  const navigation: TransitionNavigation = {
    addListener: (_type, callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
  return {
    navigation,
    listeners,
    transitionEnd: (closing = false) => {
      for (const listener of listeners) {
        listener({ data: { closing } });
      }
    },
  };
}

describe("scheduleUploadWhenPresented", () => {
  let frames: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames[id - 1] = () => {};
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const flushFrames = () => {
    while (frames.length > 0) {
      frames.shift()?.();
    }
  };

  it("runs on transitionEnd when motion is on", async () => {
    const { navigation, transitionEnd } = fakeNavigation();
    const run = vi.fn();
    scheduleUploadWhenPresented(navigation, async () => false, run);
    await vi.advanceTimersByTimeAsync(0);
    flushFrames();
    expect(run).not.toHaveBeenCalled();
    transitionEnd(true);
    expect(run).not.toHaveBeenCalled();
    transitionEnd();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs after two frames, without waiting for the backstop, once Reduce Motion is known to be on", async () => {
    const { navigation } = fakeNavigation();
    const run = vi.fn();
    scheduleUploadWhenPresented(navigation, async () => true, run);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    flushFrames();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("falls back to the backstop when neither signal arrives", async () => {
    const { navigation } = fakeNavigation();
    const run = vi.fn();
    scheduleUploadWhenPresented(navigation, () => new Promise<boolean>(() => {}), run);
    await vi.advanceTimersByTimeAsync(1_199);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancels the listener, the backstop and a late Reduce Motion answer", async () => {
    const { navigation, listeners, transitionEnd } = fakeNavigation();
    const run = vi.fn();
    let answer: (value: boolean) => void = () => {};
    const task = scheduleUploadWhenPresented(
      navigation,
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
      run,
    );
    task.cancel();
    expect(listeners.size).toBe(0);
    answer(true);
    await vi.advanceTimersByTimeAsync(2_000);
    flushFrames();
    transitionEnd();
    expect(run).not.toHaveBeenCalled();
  });
});
