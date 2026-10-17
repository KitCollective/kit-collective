import { Ionicons } from "@expo/vector-icons";
import type { CollectionJersey } from "@kit/api-contract";
import type { RefObject } from "react";
import {
  ActivityIndicator,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolvePhotoUrl } from "@/api/collection";
import { jerseyPhotoCountLabel } from "@/jersey-detail/jersey-detail-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type Photos = CollectionJersey["photos"];

const PHOTO_ASPECT = 5 / 4;
const CHROME_BUTTON = 44;
export const THUMB_WIDTH = 48;
export const THUMB_HEIGHT = 60;
const CURRENT_OUTLINE = 2;
const COUNT_PILL_PADDING_VERTICAL = 4;

type RoundButtonProps = {
  name: string;
  icon: "arrow-back" | "ellipsis-horizontal";
  onPress: () => void;
  testID?: string;
};

/** Round `surface` chrome button over the photo (44 x 44). */
function RoundButton({ name, icon, onPress, testID }: RoundButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.roundButton,
        { backgroundColor: theme.surface, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Ionicons name={icon} size={22} color={theme.contentPrimary} accessibilityElementsHidden />
    </Pressable>
  );
}

type JerseyPhotoPagerProps = {
  pagerRef: RefObject<ScrollView | null>;
  photos: Photos;
  /** Lightbox-variant URL per photo, resolved by the screen. */
  photoUris: string[];
  title: string;
  accessToken: string | null;
  index: number;
  onIndexChange: (index: number) => void;
  onBack: () => void;
  onMore: () => void;
};

/** 4:5 photo at full width, swipe between photos, Back and More over it, count pill, no dots. */
export function JerseyPhotoPager({
  pagerRef,
  photos,
  photoUris,
  title,
  accessToken,
  index,
  onIndexChange,
  onBack,
  onMore,
}: JerseyPhotoPagerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onIndexChange(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={{ width, height: width * PHOTO_ASPECT, backgroundColor: theme.fillSecondary }}>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {photos.map((photo, photoIndex) => (
          <Image
            key={photo.id}
            source={{
              uri: photoUris[photoIndex],
              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            }}
            style={{ width, height: width * PHOTO_ASPECT }}
            resizeMode="cover"
            accessibilityLabel={`${title}, foto ${photoIndex + 1} af ${photos.length}`}
          />
        ))}
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.chrome, { paddingTop: insets.top + space.insetSm }]}
      >
        <RoundButton
          name="Tilbage"
          icon="arrow-back"
          onPress={onBack}
          testID="jersey-detail-back"
        />
        <RoundButton
          name="Mere"
          icon="ellipsis-horizontal"
          onPress={onMore}
          testID="jersey-detail-more"
        />
      </View>

      <View
        style={[styles.countPill, { backgroundColor: theme.surface }]}
        accessible
        accessibilityLabel={`Foto ${index + 1} af ${photos.length}`}
        testID="jersey-detail-photo-count"
      >
        <Text style={[typography.monoSm, { color: theme.contentPrimary }]}>
          {jerseyPhotoCountLabel(index, photos.length)}
        </Text>
      </View>
    </View>
  );
}

type JerseyThumbStripProps = {
  photos: Photos;
  accessToken: string | null;
  index: number;
  onSelect: (index: number) => void;
  /** False at the photo cap: the strip then ends without the add-photo tile. */
  canAddPhoto: boolean;
  /** True while a picked photo uploads: the tile shows a spinner and takes no taps. */
  addingPhoto: boolean;
  onAddPhoto: () => void;
};

/** 48 x 60 thumbs, the current one outlined in fill.primary, ending in an add-photo tile. */
export function JerseyThumbStrip({
  photos,
  accessToken,
  index,
  onSelect,
  canAddPhoto,
  addingPhoto,
  onAddPhoto,
}: JerseyThumbStripProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {photos.map((photo, photoIndex) => {
        const current = photoIndex === index;
        return (
          <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityLabel={`Foto ${photoIndex + 1} af ${photos.length}`}
            accessibilityState={{ selected: current }}
            onPress={() => onSelect(photoIndex)}
            hitSlop={space.gapSm}
            style={[
              styles.thumb,
              {
                borderColor: current ? theme.fillPrimary : "transparent",
                backgroundColor: theme.fillSecondary,
              },
            ]}
          >
            <Image
              source={{
                uri: resolvePhotoUrl(photo.photoUrl, "grid"),
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
              }}
              style={styles.thumbImage}
              resizeMode="cover"
              accessibilityElementsHidden
            />
          </Pressable>
        );
      })}
      {canAddPhoto ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilføj foto"
          accessibilityState={{ busy: addingPhoto, disabled: addingPhoto }}
          disabled={addingPhoto}
          onPress={onAddPhoto}
          hitSlop={space.gapSm}
          testID="jersey-detail-add-photo"
          style={[styles.thumb, styles.addTile, { backgroundColor: theme.fillSecondary }]}
        >
          {addingPhoto ? (
            <ActivityIndicator color={theme.contentPrimary} />
          ) : (
            <Ionicons
              name="add"
              size={24}
              color={theme.contentPrimary}
              accessibilityElementsHidden
            />
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
  },
  roundButton: {
    width: CHROME_BUTTON,
    height: CHROME_BUTTON,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  countPill: {
    position: "absolute",
    right: space.insetMd,
    bottom: space.insetMd,
    // The lock gives the count pill no padding: the smallest scale steps (8 and 4) around the
    // 18 high monoSm line.
    paddingHorizontal: space.insetSm,
    paddingVertical: COUNT_PILL_PADDING_VERTICAL,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  strip: {
    gap: space.gapSm,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.gapSm,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: CURRENT_OUTLINE,
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  addTile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
});
