import type { AppearanceMode } from "@kit/domain";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { ColorSchemeName } from "react-native";
import { useColorScheme } from "react-native";

type AppearanceContextValue = {
  appearance: AppearanceMode;
  setAppearance: (mode: AppearanceMode) => void;
  effectiveScheme: ColorSchemeName;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function resolveEffectiveScheme(
  appearance: AppearanceMode,
  systemScheme: ColorSchemeName,
): ColorSchemeName {
  if (appearance === "system") {
    return systemScheme ?? "light";
  }

  return appearance;
}

export function AppearanceProvider({
  children,
  initialAppearance = "system",
}: {
  children: ReactNode;
  initialAppearance?: AppearanceMode;
}) {
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<AppearanceMode>(initialAppearance);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    setAppearanceState(mode);
  }, []);

  const effectiveScheme = useMemo(
    () => resolveEffectiveScheme(appearance, systemScheme),
    [appearance, systemScheme],
  );

  const value = useMemo(
    () => ({ appearance, setAppearance, effectiveScheme }),
    [appearance, setAppearance, effectiveScheme],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return context;
}

export function useAppearanceOptional(): AppearanceContextValue | null {
  return useContext(AppearanceContext);
}
