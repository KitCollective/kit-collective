import { useColorScheme } from "react-native";
import { useAppearanceOptional } from "@/theme/appearance";
import { getThemeColors, type ThemeColors } from "@/theme/tokens";

export function useTheme(): ThemeColors {
  const appearanceContext = useAppearanceOptional();
  const systemScheme = useColorScheme();
  const scheme = appearanceContext?.effectiveScheme ?? systemScheme;
  return getThemeColors(scheme);
}
