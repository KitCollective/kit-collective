import { useEffect, useState } from "react";
import {
  type PlaceOverviewSnapshot,
  readPlaceOverview,
  subscribePlaceOverviews,
} from "./place-overview-cache";
import type { PlaceId } from "./place-swipe";

/** Live snapshot so a prefetch that finishes after mount can drop the spinner. */
export function usePlaceOverview<K extends PlaceId>(
  place: K,
): PlaceOverviewSnapshot[K] | undefined {
  const [snapshot, setSnapshot] = useState(() => readPlaceOverview(place));

  useEffect(() => {
    return subscribePlaceOverviews(() => {
      setSnapshot(readPlaceOverview(place));
    });
  }, [place]);

  return snapshot;
}
