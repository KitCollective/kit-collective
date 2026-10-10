import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createStickySizeStore, type StickySizeStorage } from "./stickySize";

/** Same storage split as the session: SecureStore on device, localStorage on Expo Web. */
const deviceStorage: StickySizeStorage = {
  get: async (key) => {
    if (Platform.OS === "web") {
      return globalThis.localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  set: async (key, value) => {
    if (Platform.OS === "web") {
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
};

/** The one device-wide store. `StickySizeBinding` binds it to the signed-in collector. */
export const stickySize = createStickySizeStore(deviceStorage);
