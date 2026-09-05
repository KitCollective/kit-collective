import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buttonLayoutStyles } from "@/components/button-layout";
import { SplashBackdrop } from "@/first-session/splash-backdrop";
import { color, space } from "@/theme/tokens";

type SplashFrameProps = {
  alive?: boolean;
  caption: ReactNode;
  dock: ReactNode;
};

/** Shared splash chrome so boot loading and the ready plate share one geometry. */
export function SplashFrame({ alive = true, caption, dock }: SplashFrameProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: color.fillPrimary }]}>
      <SplashBackdrop alive={alive} />
      <View style={[styles.chrome, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.plate} pointerEvents="box-none">
          {caption}
        </View>
        <View
          style={[
            styles.dock,
            {
              paddingBottom: Math.max(insets.bottom, space.insetMd),
            },
          ]}
        >
          {dock}
        </View>
      </View>
    </View>
  );
}

/** Invisible dock stack matching Login + Opret so the spinner sits on the caption line. */
export function SplashDockReserve() {
  const fillButton = buttonLayoutStyles("fill");

  return (
    <>
      <View style={{ minHeight: fillButton.minHeight }} />
      <View style={{ minHeight: fillButton.minHeight }} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  chrome: {
    flex: 1,
  },
  plate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.gapLg,
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetMd,
  },
  dock: {
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetMd,
    gap: space.gapMd,
  },
});
