/** iOS exponential-decay projection of a flick. Shared by sheet dismiss and door mode-swipe. */
export function project(velocity: number, decelerationRate = 0.998): number {
  "worklet";
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Rubber-band an overshoot so travel falls off as it leaves the edge. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  "worklet";
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
