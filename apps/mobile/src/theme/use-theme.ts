import { useColorScheme } from "react-native";
import { getThemeColors, type ThemeColors } from "@/theme/tokens";

export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return getThemeColors(scheme);
}
