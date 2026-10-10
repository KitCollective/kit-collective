import { createStickySizeStore, type StickySizeStorage } from "./stickySize";

let deviceStorage: StickySizeStorage | null = null;

/** Called once by the device module. Kept out of here so reducers stay free of native imports. */
export function setStickySizeStorage(storage: StickySizeStorage | null): void {
  deviceStorage = storage;
}

/** The one device-wide store. `StickySizeBinding` binds it to the signed-in collector. */
export const stickySize = createStickySizeStore({
  get: async (key) => (deviceStorage ? deviceStorage.get(key) : null),
  set: async (key, value) => {
    await deviceStorage?.set(key, value);
  },
});
