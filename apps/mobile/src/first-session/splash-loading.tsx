import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { color } from "@/theme/tokens";

/** Boot / auth hold. A plain dark plate with a spinner; the welcome wall owns the first impression. */
export function LoadingScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: color.fillPrimary }]}>
      <ActivityIndicator color={color.contentInverse} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
