import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";
import { PlaceHome, PlaceHomeLiveProvider } from "./place-homes";
import { PlacePager } from "./place-pager";
import type { PlaceId } from "./place-swipe";
import { usePlaceSwipe } from "./place-swipe-context";

const WIDE_BREAKPOINT = 1024;

type PlacePagerScreenProps = {
  place: PlaceId;
};

/**
 * Parent-overview swipe: the five bottom-nav homes page with the finger.
 * Drill screens live in each tab's stack, so they never mount this.
 */
export function PlacePagerScreen({ place }: PlacePagerScreenProps) {
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const { setHostedPlace } = usePlaceSwipe();
  const theme = useTheme();
  const isWide = width >= WIDE_BREAKPOINT;
  const livePlace = focused ? place : null;

  useEffect(() => {
    if (focused) {
      setHostedPlace(place);
    }
  }, [focused, place, setHostedPlace]);

  const tree =
    reduceMotion || isWide || Platform.OS === "web" ? (
      <PlaceHome place={place} />
    ) : (
      <PlacePager hostedPlace={place} focused={focused} />
    );

  return (
    <PlaceHomeLiveProvider livePlace={livePlace}>
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>{tree}</View>
    </PlaceHomeLiveProvider>
  );
}
