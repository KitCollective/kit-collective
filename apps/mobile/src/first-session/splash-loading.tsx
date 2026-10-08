import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SplashDockReserve, SplashFrame } from "@/first-session/splash-frame";
import { color } from "@/theme/tokens";

/** Boot / auth hold — same jersey plate as splash, spinner parked on the caption line. */
export function LoadingScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <SplashFrame
      alive={false}
      caption={
        <View style={styles.captionSlot}>
          <ActivityIndicator color={color.contentInverse} />
        </View>
      }
      dock={<SplashDockReserve />}
    />
  );
}

const styles = StyleSheet.create({
  captionSlot: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
