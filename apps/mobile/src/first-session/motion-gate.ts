/**
 * Brand-moment screens must not animate until the Reduce Motion setting has
 * loaded: `null` means the OS has not answered yet, so nothing moves.
 */
export type MotionGate = { ready: false } | { ready: true; reduceMotion: boolean };

export function motionGate(setting: boolean | null): MotionGate {
  if (setting === null) {
    return { ready: false };
  }
  return { ready: true, reduceMotion: setting };
}
