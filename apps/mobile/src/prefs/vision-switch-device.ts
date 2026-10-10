import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createVisionSwitchStore, type VisionSwitchStorage } from "./visionSwitch";

/** Same storage split as the sticky size: SecureStore on device, localStorage on Expo Web. */
const deviceStorage: VisionSwitchStorage = {
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

/** The one device-wide switch. Hydrated when the app first imports this module. */
export const visionSwitch = createVisionSwitchStore(deviceStorage);
void visionSwitch.hydrate();

export function useVisionSwitch(): boolean {
  return useSyncExternalStore(visionSwitch.subscribe, visionSwitch.get, () => true);
}
