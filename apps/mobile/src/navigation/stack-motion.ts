/**
 * Default in-app stack transition (docs/design-system.md → Motion).
 * Push/pop uses the platform animation so every drill feels the same.
 * Reduced motion keeps a fade (no travel) instead of a slide.
 *
 * Overview **index** screens must use `none`. A parent-overview swipe already
 * followed the finger; playing `default` behind `router.navigate` is a second
 * sideshift on the incoming tab.
 */
export type StackScreenMotion = "default" | "fade" | "none";

export function stackScreenMotion(reduceMotion: boolean): Exclude<StackScreenMotion, "none"> {
  return reduceMotion ? "fade" : "default";
}

export function stackRouteMotion(routeName: string, reduceMotion: boolean): StackScreenMotion {
  if (routeName === "index") {
    return "none";
  }
  return stackScreenMotion(reduceMotion);
}
