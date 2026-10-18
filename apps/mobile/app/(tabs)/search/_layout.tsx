import { Stack } from "expo-router";
import { stackRouteMotion } from "@/navigation/stack-motion";
import { FOREIGN_JERSEY_ROUTE, sitsAboveForeignJersey } from "@/search/foreign-jersey-route";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export default function SearchLayout() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route, navigation }) => {
        const routes = navigation.getState().routes;
        const index = routes.findIndex((candidate) => candidate.key === route.key);
        return {
          headerShown: false,
          animation: stackRouteMotion(route.name, reduceMotion),
          contentStyle: { backgroundColor: theme.canvas },
          // Above the foreign detail every route is a modal anyway; name it, or iOS shows a page sheet.
          ...(sitsAboveForeignJersey(
            routes.map((candidate) => candidate.name),
            index,
          )
            ? { presentation: "fullScreenModal" as const }
            : {}),
        };
      }}
    >
      {/* Declared first: the first declared screen is the Stack's initial route. */}
      <Stack.Screen name="index" />
      {/*
        A foreign UserJersey hides the Tab bar (docs/design-system.md → Foreign UserJersey detail).
        The bar is hidden the way the capture flow hides it: the route is presented as a full-screen
        modal (Tab bar → Hide behavior), not with NativeTabs `hidden`, which remounts the navigator.
        On Android a full-screen modal falls back to a push inside the tab, so the bar stays there.
      */}
      <Stack.Screen name={FOREIGN_JERSEY_ROUTE} options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );
}
