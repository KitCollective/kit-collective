import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Platform } from "react-native";
import {
  type ResolvedTypeRoles,
  resolveTypeRoles as resolveTypeRolesBase,
} from "@/theme/brand-fonts-resolve";

export {
  resolveFontFamily,
  resolveTypeRoles,
} from "@/theme/brand-fonts-resolve";

const BrandFontsContext = createContext(true);

type BrandFontsProviderProps = {
  enabled: boolean;
  children: ReactNode;
};

function getNativeSystemFallback(): string {
  return (
    Platform.select({
      web: "system-ui",
      ios: "System",
      android: "sans-serif",
      default: "system-ui",
    }) ?? "system-ui"
  );
}

export function BrandFontsProvider({ enabled, children }: BrandFontsProviderProps) {
  return <BrandFontsContext.Provider value={enabled}>{children}</BrandFontsContext.Provider>;
}

export function useBrandFontsEnabled(): boolean {
  return useContext(BrandFontsContext);
}

export function useTypography(): ResolvedTypeRoles {
  const brandEnabled = useBrandFontsEnabled();
  const systemFallback = getNativeSystemFallback();
  return useMemo(
    () => resolveTypeRolesBase(brandEnabled, systemFallback),
    [brandEnabled, systemFallback],
  );
}
