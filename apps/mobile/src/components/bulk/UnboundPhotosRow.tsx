import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeOut, LinearTransition } from "react-native-reanimated";
import { useTypography } from "@/theme/brand-fonts";
import { motion, radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = space.insetLg * 3;
const THUMB_HEIGHT = (THUMB_WIDTH * 5) / 4;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

type UnboundPhotosRowProps = {
  uris: string[];
  activeTabLabel: string;
  onPressPhoto: (uri: string) => void;
  onDiscardPhoto: (uri: string) => void;
  /** When omitted there is no Upload tile (Confirm; the Foto tile on the photo strip adds). */
  onUpload?: () => void;
};

type UnboundPhotoThumbProps = {
  uri: string;
  index: number;
  total: number;
  activeTabLabel: string;
  layout?: ComponentProps<typeof Animated.View>["layout"];
  exiting?: ComponentProps<typeof Animated.View>["exiting"];
  onPressPhoto: (uri: string) => void;
  onDiscardPhoto: (uri: string) => void;
};

function UnboundPhotoThumb({
  uri,
  index,
  total,
  activeTabLabel,
  layout,
  exiting,
  onPressPhoto,
  onDiscardPhoto,
}: UnboundPhotoThumbProps) {
  const theme = useTheme();

  return (
    <Animated.View style={styles.thumbWrap} exiting={exiting} layout={layout}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Uredigeret foto ${index + 1} af ${total}`}
        accessibilityHint={`Tilføjer fotoet til ${activeTabLabel}.`}
        onPress={() => onPressPhoto(uri)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Image
          source={{ uri }}
          style={[
            styles.thumb,
            {
              backgroundColor: theme.fillSecondary,
              borderColor: theme.borderSubtle,
            },
          ]}
          accessibilityIgnoresInvertColors
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fjern foto ${index + 1} fra sandkassen`}
        onPress={() => onDiscardPhoto(uri)}
        style={({ pressed }) => [styles.discardHit, pressed && styles.pressed]}
      >
        <View style={[styles.discardBadge, { backgroundColor: theme.surface }]}>
          <Ionicons
            name="close-circle"
            size={22}
            color={theme.danger}
            accessibilityElementsHidden
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function UnboundPhotosRow({
  uris,
  activeTabLabel,
  onPressPhoto,
  onDiscardPhoto,
  onUpload,
}: UnboundPhotosRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const layout = reduceMotion
    ? undefined
    : LinearTransition.duration(motion.slow).easing(LOCK_EASE);
  const exiting = reduceMotion ? undefined : FadeOut.duration(motion.slow).easing(LOCK_EASE);

  return (
    <Animated.ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel={`Uredigerede fotos, ${uris.length} stk.`}
      contentContainerStyle={styles.strip}
    >
      {uris.map((uri, index) => (
        <UnboundPhotoThumb
          key={uri}
          uri={uri}
          index={index}
          total={uris.length}
          activeTabLabel={activeTabLabel}
          layout={layout}
          exiting={exiting}
          onPressPhoto={onPressPhoto}
          onDiscardPhoto={onDiscardPhoto}
        />
      ))}

      {onUpload ? (
        <Animated.View layout={layout}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload fotos"
            accessibilityHint="Åbner vælger til fotos eller filer"
            onPress={onUpload}
            style={({ pressed }) => [
              styles.uploadTile,
              {
                backgroundColor: theme.fillSecondary,
                borderColor: theme.borderSubtle,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[typography.caption, { color: theme.contentSecondary }]}>Upload</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: space.gapSm,
    alignItems: "center",
  },
  thumbWrap: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    overflow: "hidden",
    borderRadius: radius.md,
  },
  pressed: {
    opacity: 0.9,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  discardHit: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 2,
    minWidth: 44,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  discardBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTile: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
