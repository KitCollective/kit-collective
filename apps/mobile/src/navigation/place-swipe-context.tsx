import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { Gesture } from "react-native-gesture-handler";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { INBOX_TABS, type InboxTab, inboxTabIndex, type PlaceId } from "./place-swipe";

type InboxInnerPan = ReturnType<typeof Gesture.Pan>;

type PlaceSwipeContextValue = {
  hostedPlace: PlaceId | null;
  setHostedPlace: (place: PlaceId) => void;
  inboxTab: InboxTab;
  setInboxTab: (tab: InboxTab) => void;
  inboxInnerTabIndex: SharedValue<number>;
  inboxInnerConsumesSwipe: SharedValue<boolean>;
  inboxInnerPan: InboxInnerPan | null;
  setInboxInnerPan: (gesture: InboxInnerPan | null) => void;
};

const PlaceSwipeContext = createContext<PlaceSwipeContextValue | null>(null);

export function PlaceSwipeProvider({ children }: { children: ReactNode }) {
  const [hostedPlace, setHostedPlace] = useState<PlaceId | null>(null);
  const [inboxTab, setInboxTabState] = useState<InboxTab>(INBOX_TABS[0]);
  const inboxInnerTabIndex = useSharedValue(0);
  const inboxInnerConsumesSwipe = useSharedValue(false);
  const [inboxInnerPan, setInboxInnerPan] = useState<InboxInnerPan | null>(null);

  const setInboxTab = useCallback(
    (tab: InboxTab) => {
      setInboxTabState(tab);
      inboxInnerTabIndex.set(inboxTabIndex(tab));
    },
    [inboxInnerTabIndex],
  );

  const value = useMemo(
    () => ({
      hostedPlace,
      setHostedPlace,
      inboxTab,
      setInboxTab,
      inboxInnerTabIndex,
      inboxInnerConsumesSwipe,
      inboxInnerPan,
      setInboxInnerPan,
    }),
    [
      hostedPlace,
      inboxInnerConsumesSwipe,
      inboxInnerPan,
      inboxInnerTabIndex,
      inboxTab,
      setInboxTab,
    ],
  );

  return <PlaceSwipeContext.Provider value={value}>{children}</PlaceSwipeContext.Provider>;
}

export function usePlaceSwipe(): PlaceSwipeContextValue {
  const context = useContext(PlaceSwipeContext);
  if (!context) {
    throw new Error("usePlaceSwipe must be used within PlaceSwipeProvider");
  }
  return context;
}

export function usePlaceSwipeOptional(): PlaceSwipeContextValue | null {
  return useContext(PlaceSwipeContext);
}
