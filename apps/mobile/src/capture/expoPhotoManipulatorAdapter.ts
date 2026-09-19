import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Image } from "react-native";
import type { PhotoManipulatorAction, PhotoManipulatorAdapter } from "./photoPrepare";

export const expoPhotoManipulatorAdapter: PhotoManipulatorAdapter = {
  getImageInfo(uri) {
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        (error) => reject(error),
      );
    });
  },
  async manipulateAsync(uri, actions: PhotoManipulatorAction[], options) {
    const result = await manipulateAsync(uri, actions, {
      compress: options.compress,
      format: SaveFormat.JPEG,
      base64: options.includeBase64,
    });
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      base64: result.base64,
    };
  },
};
