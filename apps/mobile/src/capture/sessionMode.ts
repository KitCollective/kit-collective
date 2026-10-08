import { Platform } from "react-native";
import { isRepeatCaptureSession } from "@/session/addSession";

export type CaptureMode = "gallery" | "camera";

export function resolveCaptureMode(): CaptureMode {
  if (Platform.OS === "web") {
    return "gallery";
  }
  return isRepeatCaptureSession() ? "camera" : "gallery";
}
