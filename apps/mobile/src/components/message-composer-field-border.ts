import type { ThemeColors } from "@/theme/tokens";

export type ComposerFieldBorder = {
  borderColor: string;
  borderWidth: number;
};

/** docs/design-system.md Message composer States — rest vs focus. */
export function composerFieldBorder(theme: ThemeColors, focused: boolean): ComposerFieldBorder {
  if (focused) {
    return {
      borderColor: theme.contentPrimary,
      borderWidth: 2,
    };
  }

  return {
    borderColor: theme.borderSubtle,
    borderWidth: 1,
  };
}
