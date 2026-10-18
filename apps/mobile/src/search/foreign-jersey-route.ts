/** Route name of the foreign UserJersey detail inside the Søg stack. */
export const FOREIGN_JERSEY_ROUTE = "[jerseyId]";

/**
 * True when a route in the Søg stack sits above a foreign UserJersey detail.
 * The detail is a full-screen modal (the Tab bar is hidden); react-native-screens presents every
 * route above a modal as a modal too, as an iOS page sheet unless the route names its own
 * presentation. Those routes are presented full screen so the photo does not show behind rounded
 * corners (docs/design-system.md → Tab bar → Hide behavior).
 */
export function sitsAboveForeignJersey(routeNames: readonly string[], index: number): boolean {
  return routeNames.slice(0, index).includes(FOREIGN_JERSEY_ROUTE);
}

type StackRoute = { name: string; params?: object };

/**
 * True when the route at `index` sits directly on top of the detail of this same jersey, so
 * going back lands on it. Send bud also opens from an Indbakke thread (Send nyt bud), where
 * going back lands on the thread and the detail, if any, shows another jersey.
 */
export function sitsDirectlyAboveForeignJerseyOf(
  routes: readonly StackRoute[],
  index: number,
  jerseyId: string,
): boolean {
  const below = routes[index - 1];
  if (!below || below.name !== FOREIGN_JERSEY_ROUTE) {
    return false;
  }
  const params = below.params;
  return !!params && "jerseyId" in params && params.jerseyId === jerseyId;
}
