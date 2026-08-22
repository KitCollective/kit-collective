// Primitives — only referenced inside this token file (docs/design-system.md).
const primitive = {
  gray0: "#FFFFFF",
  gray50: "#F4F4F4",
  gray100: "#E8E8E8",
  gray400: "#6B6B6B",
  gray600: "#5E5E5E",
  gray900: "#000000",
  gray900Alpha40: "rgba(0,0,0,0.4)",
  danger500: "#B42318",
  warning500: "#F5A623",
  success500: "#0E8345",
  info500: "#276EF1",
  identityWashStart: "#00D4F5",
  identityWashEnd: "#6B2FFF",
} as const;

/** Semantic color tokens (light mode). */
export const color = {
  canvas: primitive.gray0,
  surface: primitive.gray0,
  surfaceRaised: primitive.gray0,
  scrim: primitive.gray900Alpha40,
  contentPrimary: primitive.gray900,
  contentSecondary: primitive.gray600,
  contentMuted: primitive.gray400,
  contentInverse: primitive.gray0,
  borderSubtle: primitive.gray100,
  fillPrimary: primitive.gray900,
  fillSecondary: primitive.gray50,
  danger: primitive.danger500,
  warning: primitive.warning500,
  success: primitive.success500,
  info: primitive.info500,
  identityWashStart: primitive.identityWashStart,
  identityWashEnd: primitive.identityWashEnd,
} as const;

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

export const type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  label: { fontSize: 16, lineHeight: 20, fontWeight: "500" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
} as const;

/** docs/design-system.md Motion */
export const motion = {
  fast: 200,
  base: 300,
  slow: 400,
} as const;
