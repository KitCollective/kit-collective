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

type BrandFontsState = {
  brandEnabled: boolean;
  /** Saira Extra Condensed loads in its own useFonts call and can fail on its own. */
  numeralEnabled: boolean;
};

const BrandFontsContext = createContext<BrandFontsState>({
  brandEnabled: true,
  numeralEnabled: true,
});

type BrandFontsProviderProps = {
  enabled: boolean;
  /** Defaults to `enabled`. */
  numeralEnabled?: boolean;
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

export function BrandFontsProvider({
  enabled,
  numeralEnabled = enabled,
  children,
}: BrandFontsProviderProps) {
  const value = useMemo(
    () => ({ brandEnabled: enabled, numeralEnabled }),
    [enabled, numeralEnabled],
  );
  return <BrandFontsContext.Provider value={value}>{children}</BrandFontsContext.Provider>;
}

export function useBrandFontsEnabled(): boolean {
  return useContext(BrandFontsContext).brandEnabled;
}

export function useTypography(): ResolvedTypeRoles {
  const { brandEnabled, numeralEnabled } = useContext(BrandFontsContext);
  const systemFallback = getNativeSystemFallback();
  return useMemo(
    () => resolveTypeRolesBase(brandEnabled, systemFallback, numeralEnabled),
    [brandEnabled, numeralEnabled, systemFallback],
  );
}
