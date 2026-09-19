import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthenticatedBlobCache,
  loadAuthenticatedBlob,
  peekAuthenticatedBlob,
} from "./authenticated-image-cache.js";

const originalFetch = globalThis.fetch;

describe("authenticated image cache", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearAuthenticatedBlobCache();
  });

  it("reuses one fetch for the same path", async () => {
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
    };
    const createObjectURL = vi.fn(() => "blob:kit-photo");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const first = loadAuthenticatedBlob("/admin/catalog/kits/k/photos/p", "token");
    const second = loadAuthenticatedBlob("/admin/catalog/kits/k/photos/p", "token");
    expect(await first).toBe("blob:kit-photo");
    expect(await second).toBe("blob:kit-photo");
    expect(fetches).toBe(1);
    expect(peekAuthenticatedBlob("/admin/catalog/kits/k/photos/p", "token")).toBe("blob:kit-photo");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
