import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { galleryMultiSelectQuality } from "./photoBytes";
import { type DocumentPickerAdapter, pickDocumentImages } from "./pickDocumentImages";
import { type GalleryPickerAdapter, pickGalleryPhotos } from "./pickGalleryPhotos";
import type { UploadFilesAdapter } from "./pickUploadFiles";

export const expoDocumentPickerAdapter: DocumentPickerAdapter = {
  getDocumentAsync: async (request) => {
    const result = await DocumentPicker.getDocumentAsync(request);
    if (result.canceled) {
      return { canceled: true };
    }
    return { canceled: false, assets: result.assets };
  },
};

export const expoGalleryPickerAdapter: GalleryPickerAdapter = {
  os: Platform.OS,
  launchImageLibraryAsync: async (request) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: request.mediaTypes,
      allowsMultipleSelection: request.allowsMultipleSelection,
      orderedSelection: request.orderedSelection,
      selectionLimit: request.selectionLimit,
      quality: request.quality,
    });
    if (result.canceled) {
      return { canceled: true, assets: [] };
    }
    return { canceled: false, assets: result.assets };
  },
};

export const expoUploadFilesAdapter: UploadFilesAdapter = {
  os: Platform.OS,
  showActionSheet: (request, callback) => {
    ActionSheetIOS.showActionSheetWithOptions(request, callback);
  },
  showAlert: (title, message, buttons) => {
    Alert.alert(title, message, buttons);
  },
  pickGalleryPhotos: (options) => pickGalleryPhotos(options, expoGalleryPickerAdapter),
  pickDocumentImages: (options) => pickDocumentImages(options, expoDocumentPickerAdapter),
  galleryMultiSelectQuality,
};

/**
 * Takes down the upload source sheet if it is still up and says whether it may be opened
 * again. Only iOS has a sheet that can be taken down: an Android alert cannot, so a second
 * one would stack on the first.
 */
export function dismissUploadSourcePicker(): boolean {
  if (Platform.OS !== "ios") {
    return false;
  }
  ActionSheetIOS.dismissActionSheet();
  return true;
}
