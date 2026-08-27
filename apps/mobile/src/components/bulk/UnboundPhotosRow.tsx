import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = 44;
const THUMB_HEIGHT = (THUMB_WIDTH * 5) / 4;

type UnboundPhotosRowProps = {
  uris: string[];
  activeTabLabel: string;
  onPressPhoto: (uri: string) => void;
};

export function UnboundPhotosRow({ uris, activeTabLabel, onPressPhoto }: UnboundPhotosRowProps) {
  const theme = useTheme();
  const typography = useTypography();

  if (uris.length === 0) {
    return null;
  }

  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={`Uredigerede fotos, ${uris.length} stk.`}
      style={[styles.container, { borderBottomColor: theme.borderSubtle }]}
    >
      <Text style={[typography.label, { color: theme.contentPrimary }]}>
        Uredigerede · {uris.length}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="list"
        contentContainerStyle={styles.strip}
      >
        {uris.map((uri, index) => (
          <Pressable
            key={uri}
            accessibilityRole="button"
            accessibilityLabel={`Uredigeret foto ${index + 1} af ${uris.length}`}
            accessibilityHint={`Tilføjer fotoet til ${activeTabLabel}`}
            onPress={() => onPressPhoto(uri)}
            style={({ pressed }) => [styles.thumbPressable, pressed && styles.thumbPressed]}
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
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.gapSm,
    paddingBottom: space.gapSm,
    borderBottomWidth: 1,
  },
  strip: {
    gap: space.gapSm,
    paddingVertical: space.gapSm,
  },
  thumbPressable: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbPressed: {
    opacity: 0.9,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
