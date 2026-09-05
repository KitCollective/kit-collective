import { Ionicons } from "@expo/vector-icons";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSheetDismiss } from "@/components/use-sheet-dismiss";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type SheetVariant = "form" | "door";

type SheetChromeMode = "close" | "back";

function SheetChromeButton({ mode, onPress }: { mode: SheetChromeMode; onPress: () => void }) {
  const theme = useTheme();
  const isBack = mode === "back";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isBack ? "Tilbage" : "Luk"}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetChromeButton,
        { backgroundColor: withAlpha(theme.contentPrimary, 0.06) },
        pressed && styles.sheetChromePressed,
      ]}
    >
      <Ionicons
        name={isBack ? "chevron-back" : "close"}
        size={22}
        color={theme.contentPrimary}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

type SheetScrollControls = Pick<
  ReturnType<typeof useSheetDismiss>,
  "scrollGesture" | "scrollHandler"
>;

const SheetScrollContext = createContext<SheetScrollControls | null>(null);

export function useSheetScroll(): SheetScrollControls | null {
  return useContext(SheetScrollContext);
}

type SheetProps = {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
  variant?: SheetVariant;
  sentence?: string;
  titleContent?: ReactNode;
  headerAction?: ReactNode;
  onBack?: () => void;
};

export function Sheet({
  visible,
  title,
  onDismiss,
  children,
  variant = "form",
  sentence,
  titleContent,
  headerAction,
  onBack,
}: SheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const isDoor = variant === "door";
  const {
    pan,
    scrollGesture,
    scrollHandler,
    sheetStyle,
    backdropStyle,
    requestDismiss,
    onSheetLayout,
    onViewportLayout,
  } = useSheetDismiss({ visible, onDismiss, reduceMotion });

  const scrollControls = useMemo<SheetScrollControls>(
    () => ({ scrollGesture, scrollHandler }),
    [scrollGesture, scrollHandler],
  );

  return (
    <Modal animationType="none" transparent visible={visible} onRequestClose={requestDismiss}>
      <GestureHandlerRootView
        style={styles.sheetRoot}
        onLayout={(event) => onViewportLayout(event.nativeEvent.layout.height)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestDismiss}
          accessibilityLabel="Luk"
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, backdropStyle]}
          />
        </Pressable>
        <View style={styles.sheetStage} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.sheet,
                { backgroundColor: theme.surfaceRaised },
                isDoor && [styles.sheetDoor, { marginTop: insets.top + space.insetSm }],
                sheetStyle,
              ]}
              onLayout={(event) => onSheetLayout(event.nativeEvent.layout.height)}
            >
              <View style={styles.sheetHandleHit} accessibilityElementsHidden>
                <View
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.sheetHandle,
                    { backgroundColor: withAlpha(theme.contentPrimary, 0.14) },
                  ]}
                />
              </View>
              <View style={styles.sheetHeader}>
                <SheetChromeButton
                  mode={onBack ? "back" : "close"}
                  onPress={onBack ?? requestDismiss}
                />
                {headerAction ? (
                  <View style={styles.sheetHeaderAction}>{headerAction}</View>
                ) : null}
              </View>
              {titleContent ? (
                <View style={styles.sheetTitleRegion}>{titleContent}</View>
              ) : (
                <Text
                  accessibilityRole="header"
                  style={[typography.title, styles.sheetTitleRegion, { color: theme.contentPrimary }]}
                >
                  {title}
                </Text>
              )}
              {sentence ? (
                <Text
                  style={[typography.body, styles.sheetSentence, { color: theme.contentSecondary }]}
                >
                  {sentence}
                </Text>
              ) : null}
              <SheetScrollContext.Provider value={scrollControls}>
                <View style={[styles.sheetBody, isDoor && styles.sheetBodyDoor]}>{children}</View>
              </SheetScrollContext.Provider>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetRoot: {
    flex: 1,
  },
  sheetStage: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.insetLg,
    maxHeight: "80%",
    overflow: "hidden",
  },
  sheetDoor: {
    flex: 1,
    maxHeight: "100%",
  },
  sheetHandleHit: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: space.insetSm,
    paddingBottom: space.gapSm,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: radius.pill,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetLg,
    paddingTop: space.gapSm,
    paddingBottom: space.gapSm,
    gap: space.gapSm,
  },
  sheetHeaderAction: {
    marginLeft: "auto",
  },
  sheetChromeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetChromePressed: {
    opacity: 0.9,
  },
  sheetTitleRegion: {
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetMd,
  },
  sheetSentence: {
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetMd,
  },
  sheetBody: {
    paddingHorizontal: space.insetLg,
    gap: space.gapMd,
  },
  sheetBodyDoor: {
    flex: 1,
  },
});
