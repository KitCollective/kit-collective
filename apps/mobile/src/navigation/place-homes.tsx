import { type ComponentType, createContext, type ReactNode, useContext } from "react";
import type { PlaceId } from "./place-swipe";

const homes: Partial<Record<PlaceId, ComponentType>> = {};

const PlaceHomeLiveContext = createContext<PlaceId | null | undefined>(undefined);

/**
 * Which overview home is allowed to hit the network. `undefined` means no
 * provider (wide / reduced-motion / standalone) — treat as live.
 * `null` means this pager is blurred. A neighbour copy is any other place.
 */
export function isPlaceHomeLive(livePlace: PlaceId | null | undefined, place: PlaceId): boolean {
  if (livePlace === undefined) {
    return true;
  }
  return livePlace === place;
}

export function PlaceHomeLiveProvider({
  livePlace,
  children,
}: {
  livePlace: PlaceId | null;
  children: ReactNode;
}) {
  return (
    <PlaceHomeLiveContext.Provider value={livePlace}>{children}</PlaceHomeLiveContext.Provider>
  );
}

export function useIsPlaceHomeLive(place: PlaceId): boolean {
  return isPlaceHomeLive(useContext(PlaceHomeLiveContext), place);
}

export function registerPlaceHome(place: PlaceId, Home: ComponentType): void {
  homes[place] = Home;
}

export function PlaceHome({ place }: { place: PlaceId }) {
  const Home = homes[place];
  if (!Home) {
    return null;
  }
  return <Home />;
}
