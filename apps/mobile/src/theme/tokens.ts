import type { ColorSchemeName } from "react-native";

// Primitives — only referenced inside this token file (docs/design-system.md).
export const primitive = {
  black: "#000000",
  gray0: "#FFFFFF",
  gray50: "#F4F4F4",
  gray100: "#E8E8E8",
  gray400: "#6B6B6B",
  gray600: "#5E5E5E",
  gray900: "#000000",
  surfaceDark: "#1A1A1A",
  surfaceRaisedDark: "#2A2A2A",
  contentSecondaryDark: "#C2C2C2",
  contentMutedDark: "#8A8A8A",
  borderSubtleDark: "#333333",
  blackAlpha40: "rgba(0,0,0,0.4)",
  gray900Alpha60: "rgba(0,0,0,0.6)",
  danger500: "#B42318",
  warning500: "#F5A623",
  success500: "#0E8345",
  info500: "#276EF1",
  identityWashStart: "#00D4F5",
  identityWashEnd: "#6B2FFF",
} as const;

export const fontFamily = {
  display: "Archivo_600SemiBold",
  displayRegular: "Archivo_400Regular",
  displayBold: "Archivo_700Bold",
  body: "IBMPlexSans_400Regular",
  label: "IBMPlexSans_500Medium",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const;

const lightColor = {
  canvas: primitive.gray0,
  surface: primitive.gray0,
  surfaceRaised: primitive.gray0,
  scrim: primitive.blackAlpha40,
  contentPrimary: primitive.black,
  contentSecondary: primitive.gray600,
  contentMuted: primitive.gray400,
  contentInverse: primitive.gray0,
  borderSubtle: primitive.gray100,
  fillPrimary: primitive.black,
  fillSecondary: primitive.gray50,
  danger: primitive.danger500,
  warning: primitive.warning500,
  success: primitive.success500,
  info: primitive.info500,
  identityWashStart: primitive.identityWashStart,
  identityWashEnd: primitive.identityWashEnd,
  tabBarFill: "rgba(255,255,255,0.72)",
  tabBarBorder: "rgba(0,0,0,0.07)",
  tabBarBlurOverlay: "rgba(255,255,255,0.5)",
  tabBarShadow: primitive.black,
} as const;

const darkColor = {
  canvas: primitive.gray900,
  surface: primitive.surfaceDark,
  surfaceRaised: primitive.surfaceRaisedDark,
  scrim: primitive.gray900Alpha60,
  contentPrimary: primitive.gray0,
  contentSecondary: primitive.contentSecondaryDark,
  contentMuted: primitive.contentMutedDark,
  contentInverse: primitive.gray900,
  borderSubtle: primitive.borderSubtleDark,
  fillPrimary: primitive.gray0,
  fillSecondary: primitive.surfaceRaisedDark,
  danger: primitive.danger500,
  warning: primitive.warning500,
  success: primitive.success500,
  info: primitive.info500,
  identityWashStart: primitive.identityWashStart,
  identityWashEnd: primitive.identityWashEnd,
  tabBarFill: "rgba(26,26,26,0.78)",
  tabBarBorder: primitive.borderSubtleDark,
  tabBarBlurOverlay: "rgba(26,26,26,0.5)",
  tabBarShadow: primitive.black,
} as const;

export type ThemeColors = {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  scrim: string;
  contentPrimary: string;
  contentSecondary: string;
  contentMuted: string;
  contentInverse: string;
  borderSubtle: string;
  fillPrimary: string;
  fillSecondary: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  identityWashStart: string;
  identityWashEnd: string;
  tabBarFill: string;
  tabBarBorder: string;
  tabBarBlurOverlay: string;
  tabBarShadow: string;
};

/** Semantic color tokens (default light). Prefer `getThemeColors` in UI. */
export const color = lightColor;

export function getThemeColors(scheme: ColorSchemeName): ThemeColors {
  return scheme === "dark" ? darkColor : lightColor;
}

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const space = {
  insetSm: 8,
  insetMd: 16,
  insetLg: 24,
  gapSm: 8,
  gapMd: 12,
  gapLg: 16,
} as const;

/** Reserve space so grid rows clear the floating tab bar (docs/design-system.md Layout). */
export const tabBar = {
  pillHeight: 66,
  bottomOffset: 30,
  horizontalInset: 22,
  contentPaddingExtra: 16,
} as const;

export function tabBarReserve(bottomInset: number): number {
  return tabBar.pillHeight + tabBar.bottomOffset + bottomInset + tabBar.contentPaddingExtra;
}

export const type = {
  displayLarge: {
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.96,
  },
  display: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.84,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.48,
  },
  section: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.4,
  },
  headingSm: {
    fontFamily: fontFamily.display,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamily.label,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
  },
  labelSm: {
    fontFamily: fontFamily.label,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  captionSm: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  monoSm: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
} as const;

/** docs/design-system.md Motion */
export const motion = {
  fast: 200,
  base: 300,
  slow: 400,
} as const;
