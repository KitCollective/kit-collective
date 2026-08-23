import { createContext, type ReactNode, useContext } from "react";
import { Platform } from "react-native";

const BrandFontsContext = createContext(true);

type BrandFontsProviderProps = {
  enabled: boolean;
  children: ReactNode;
};

export function BrandFontsProvider({ enabled, children }: BrandFontsProviderProps) {
  return <BrandFontsContext.Provider value={enabled}>{children}</BrandFontsContext.Provider>;
}

export function useBrandFontsEnabled(): boolean {
  return useContext(BrandFontsContext);
}

/** system-ui fallback when brand webfonts fail (docs/design-system.md Typography). */
export function resolveFontFamily(brandFamily: string, brandEnabled: boolean): string {
  if (brandEnabled) {
    return brandFamily;
  }

  return Platform.select({
    web: "system-ui",
    ios: "System",
    android: "sans-serif",
    default: "system-ui",
  }) as string;
}
