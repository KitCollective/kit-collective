import { Image, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { radius } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

export type AvatarSize = "lg" | "md";

const AVATAR_SIZES: Record<AvatarSize, number> = {
  lg: 64,
  md: 56,
};

type AvatarProps = {
  handle: string;
  uri?: string | null;
  uriHeaders?: Record<string, string>;
  size?: AvatarSize;
};

function initialsFromHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

/**
 * Avatar primitive (docs/design-system.md → Components → Avatar).
 * Photo or handle initials on fill.secondary — never the KC monogram.
 */
export function Avatar({ handle, uri, uriHeaders, size = "lg" }: AvatarProps) {
  const theme = useTheme();
  const typography = useTypography();
  const dimension = AVATAR_SIZES[size];

  if (uri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri, headers: uriHeaders }}
        style={[
          styles.circle,
          {
            width: dimension,
            height: dimension,
            backgroundColor: theme.fillSecondary,
          },
        ]}
      />
    );
  }

  return (
    <View
      accessibilityLabel={`Profilbillede for ${handle}`}
      style={[
        styles.circle,
        styles.initials,
        {
          width: dimension,
          height: dimension,
          backgroundColor: theme.fillSecondary,
        },
      ]}
    >
      <Text
        style={[
          typography.headingSm,
          {
            color: theme.contentPrimary,
          },
        ]}
      >
        {initialsFromHandle(handle)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  initials: {
    alignItems: "center",
    justifyContent: "center",
  },
});
