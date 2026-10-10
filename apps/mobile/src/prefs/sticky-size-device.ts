import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { StickySizeStorage } from "./stickySize";
import { setStickySizeStorage } from "./stickySizeStore";

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

setStickySizeStorage(deviceStorage);
