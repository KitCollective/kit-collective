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
