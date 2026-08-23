import { space } from "@/theme/tokens";

/** Composed from spacing scale only (docs/design-system.md Spacing). */
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
