import "react-native-gesture-handler";
import {
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from "@expo-google-fonts/archivo";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { AuthProvider } from "@/auth/AuthProvider";
import { CaptureChooserProvider } from "@/capture/capture-chooser";
import { toastConfig } from "@/components/toast-config";
import { LoadingScreen } from "@/first-session/splash-loading";
import { AppearanceProvider } from "@/theme/appearance";
import { BrandFontsProvider } from "@/theme/brand-fonts";

export { LoadingScreen };

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  const fontsReady = fontsLoaded || fontError != null;
  const brandFontsEnabled = fontsLoaded && fontError == null;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <BrandFontsProvider enabled={brandFontsEnabled}>
        <AppearanceProvider>
          <AuthProvider>
            <CaptureChooserProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(first-session)" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(capture)" options={{ presentation: "fullScreenModal" }} />
              </Stack>
            </CaptureChooserProvider>
            {/*
              Standard-library toast host (react-native-toast-message). Rendered at the
              app root — after the navigators, NOT inside a React Native Modal — so it
              layers above tabs and first-session. The (capture) fullScreenModal is a
              separate native surface, so it mounts its own host (see
              app/(capture)/_layout.tsx); the library's ref-priority stack routes shows
              to the topmost mounted host. docs/design-system.md → Toast.
            */}
            <Toast config={toastConfig} position="bottom" bottomOffset={insets.bottom + 72} />
          </AuthProvider>
        </AppearanceProvider>
      </BrandFontsProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
