import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps, useEffect, useState } from "react";
import type { ImageSourcePropType } from "react-native";
import { TAB_BAR_ICON_SIZE } from "@/components/tab-bar-metrics";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type TabBarIconSrc = {
  default: ImageSourcePropType;
  selected: ImageSourcePropType;
};

const pending = new Map<string, Promise<ImageSourcePropType | null>>();

function loadTabIcon(name: IoniconName): Promise<ImageSourcePropType | null> {
  const cached = pending.get(name);
  if (cached) {
    return cached;
  }
  const next = Ionicons.getImageSource(name, TAB_BAR_ICON_SIZE, "white");
  pending.set(name, next);
  return next;
}

/**
 * Native tab icon at `TAB_BAR_ICON_SIZE`. RNScreens throws if `selectedIcon`
 * arrives before `icon`, so this waits for both template images before
 * returning. Pass the result to `NativeTabs.Trigger.Icon` as a direct child.
 */
export function useTabBarIconSrc(
  outline: IoniconName,
  filled?: IoniconName,
): TabBarIconSrc | undefined {
  const selectedName = filled ?? outline;
  const [src, setSrc] = useState<TabBarIconSrc | undefined>(undefined);

  useEffect(() => {
    let active = true;

    void Promise.all([loadTabIcon(outline), loadTabIcon(selectedName)]).then(
      ([defaultSrc, selectedSrc]) => {
        if (!active || !defaultSrc || !selectedSrc) {
          return;
        }
        setSrc({ default: defaultSrc, selected: selectedSrc });
      },
    );

    return () => {
      active = false;
    };
  }, [outline, selectedName]);

  return src;
}
