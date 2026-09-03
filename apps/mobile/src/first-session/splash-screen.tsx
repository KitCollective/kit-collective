import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buttonLayoutStyles } from "@/components/button-layout";
import {
  SPLASH_CAPTION,
  SPLASH_LOGIN_LABEL,
  SPLASH_REGISTER_LABEL,
} from "@/first-session/door-copy";
import { useTypography } from "@/theme/brand-fonts";
import { color, space, withAlpha } from "@/theme/tokens";

const LOCKUP_MIN_WIDTH = 132;
const LOCKUP_WIDTH = 220;
const LOCKUP_ASPECT = 1296 / 240;
const INVERSE_MUTED_ALPHA = 0.64;

const lockupWhite = require("../../assets/brand/kitcollective-lockup-white.png");

type SplashScreenProps = {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onContinue?: () => void;
};

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
        <Image
          source={lockupWhite}
          accessibilityLabel="KitCollective"
          resizeMode="contain"
          style={styles.lockup}
        />
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
    width: LOCKUP_WIDTH,
    height: LOCKUP_WIDTH / LOCKUP_ASPECT,
    minWidth: LOCKUP_MIN_WIDTH,
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
