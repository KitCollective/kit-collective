import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buttonLayoutStyles } from "@/components/button-layout";
import {
  SPLASH_CAPTION,
  SPLASH_LOGIN_LABEL,
  SPLASH_REGISTER_LABEL,
} from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { color, fontFamily, space, withAlpha } from "@/theme/tokens";

const LOCKUP_MIN_WIDTH = 132;
const INVERSE_MUTED_ALPHA = 0.64;

type SplashScreenProps = {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onContinue?: () => void;
};

function BrandLockupWhite() {
  const typography = useTypography();
  const plateSize = typography.display.lineHeight;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="KitCollective"
      style={styles.lockup}
    >
      <View
        style={[
          styles.lockupPlate,
          {
            width: plateSize,
            height: plateSize,
            backgroundColor: color.contentInverse,
          },
        ]}
      >
        <Text
          style={[
            typography.headingSm,
            { fontFamily: fontFamily.displayBold, color: color.fillPrimary },
          ]}
        >
          KC
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.lockupWordmark}>
        <Text
          style={[
            typography.display,
            { fontFamily: fontFamily.displayRegular, color: color.contentInverse },
          ]}
        >
          Kit
        </Text>
        <Text style={[typography.display, { color: color.contentInverse }]}>Collective</Text>
      </Text>
    </View>
  );
}

export function SplashScreen({ onOpenLogin, onOpenRegister, onContinue }: SplashScreenProps) {
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const captionColor = withAlpha(color.contentInverse, INVERSE_MUTED_ALPHA);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: color.fillPrimary,
          paddingTop: insets.top,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SPLASH_CAPTION}
        onPress={onContinue}
        style={styles.plate}
      >
        <BrandLockupWhite />
        <Text style={[typography.mono, { color: captionColor }]}>{SPLASH_CAPTION}</Text>
      </Pressable>
      <View
        style={[
          styles.dock,
          {
            paddingBottom: Math.max(insets.bottom, space.insetMd),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SPLASH_LOGIN_LABEL}
          onPress={onOpenLogin}
          style={({ pressed }) => [
            buttonLayoutStyles("fill"),
            styles.invertedLogin,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[typography.label, { color: color.contentPrimary }]}>
            {SPLASH_LOGIN_LABEL}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SPLASH_REGISTER_LABEL}
          onPress={onOpenRegister}
          style={({ pressed }) => [
            buttonLayoutStyles("fill"),
            styles.tertiaryInverse,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[typography.label, { color: color.contentInverse }]}>
            {SPLASH_REGISTER_LABEL}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  plate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapLg,
    paddingHorizontal: space.insetLg,
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    minWidth: LOCKUP_MIN_WIDTH,
    maxWidth: "100%",
  },
  lockupPlate: {
    alignItems: "center",
    justifyContent: "center",
  },
  lockupWordmark: {
    flexShrink: 1,
  },
  dock: {
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
  invertedLogin: {
    backgroundColor: color.surface,
  },
  tertiaryInverse: {
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.9,
  },
});
