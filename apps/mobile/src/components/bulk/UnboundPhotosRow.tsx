import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = space.insetLg * 3;
const THUMB_HEIGHT = (THUMB_WIDTH * 5) / 4;

type UnboundPhotosRowProps = {
  uris: string[];
  activeTabLabel: string;
  onPressPhoto: (uri: string) => void;
  onDiscardPhoto: (uri: string) => void;
  onUpload: () => void;
};

export function UnboundPhotosRow({
  uris,
  activeTabLabel,
  onPressPhoto,
  onDiscardPhoto,
  onUpload,
}: UnboundPhotosRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel={`Uredigerede fotos, ${uris.length} stk.`}
      contentContainerStyle={styles.strip}
    >
      {uris.map((uri, index) => (
        <View key={uri} style={styles.thumbWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Uredigeret foto ${index + 1} af ${uris.length}`}
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
        </View>
      ))}

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
    </ScrollView>
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
