import { space } from "@/theme/tokens";

/**
 * Composed from spacing scale only (docs/design-system.md Spacing).
 * Design-system Layout constraints say not to invent a named pixel reserve token;
 * flagged on KIT-42 workpad for @Nicklas Eskou sign-off — five call sites need shared clearance math.
 */
export const floatingTabBarLayout = {
  pillHeight: space.insetLg * 2 + space.insetMd,
  bottomOffset: space.insetLg + space.insetSm,
  horizontalInset: space.insetLg,
  contentPaddingExtra: space.insetMd,
} as const;

export function tabBarReserve(bottomInset: number): number {
  const { pillHeight, bottomOffset, contentPaddingExtra } = floatingTabBarLayout;
  return pillHeight + bottomOffset + bottomInset + contentPaddingExtra;
}
