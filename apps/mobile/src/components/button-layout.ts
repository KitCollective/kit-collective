import { radius, space } from "@/theme/tokens";

export type ButtonWidth = "hug" | "fill";

/** Layout styles for Button width variants — testable without React Native renderer. */
export function buttonLayoutStyles(width: ButtonWidth) {
  return {
    minHeight: width === "fill" ? 48 : 44,
    borderRadius: radius.sm,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: space.insetMd,
    ...(width === "fill" ? { alignSelf: "stretch" as const, width: "100%" as const } : {}),
  };
}
