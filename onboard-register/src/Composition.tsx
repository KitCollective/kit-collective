import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const still = staticFile("register-still.png");
const back = staticFile("register-back.png");
const blackFront = staticFile("register-front-black.png");

/**
 * The picker selects three thumbnails in turn: the white front is baked into the
 * still, then the back and the black front cross-fade on top of it.
 */
const BEAT = {
  frontHold: 36,
  backIn: 48,
  backHold: 78,
  blackIn: 90,
  blackHold: 120,
  home: 138,
} as const;

/** Measured x offsets of the three thumbnail centres, relative to the first. */
const RING_STOPS = [0, 115.5, 229] as const;

const RING_SIZE = 100;
const CANVAS = { width: 1024, height: 1536 } as const;

const EASE = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

const layerStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  ...CANVAS,
} as const;

export const OnboardRegister = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const last = durationInFrames - 1;

  const backOpacity = interpolate(
    frame,
    [0, BEAT.frontHold, BEAT.backIn, BEAT.backHold, BEAT.blackIn, last],
    [0, 0, 1, 1, 0, 0],
    EASE,
  );
  const blackFrontOpacity = interpolate(
    frame,
    [0, BEAT.backHold, BEAT.blackIn, BEAT.blackHold, BEAT.home, last],
    [0, 0, 1, 1, 0, 0],
    EASE,
  );
  const ringX = interpolate(
    frame,
    [
      0,
      BEAT.frontHold,
      BEAT.backIn,
      BEAT.backHold,
      BEAT.blackIn,
      BEAT.blackHold,
      BEAT.home,
      last,
    ],
    [
      RING_STOPS[0],
      RING_STOPS[0],
      RING_STOPS[1],
      RING_STOPS[1],
      RING_STOPS[2],
      RING_STOPS[2],
      RING_STOPS[0],
      RING_STOPS[0],
    ],
    EASE,
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFFFF",
      }}
    >
      <Img name="Front" src={still} style={layerStyle} />
      <Img
        name="Back"
        src={back}
        cropBottom={0.3}
        style={{...layerStyle, opacity: backOpacity}}
      />
      <Img
        name="BlackFront"
        src={blackFront}
        cropBottom={0.3}
        style={{...layerStyle, opacity: blackFrontOpacity}}
      />
      <Interactive.Div
        name="SelectRing"
        style={{
          position: "absolute",
          left: 589,
          top: 1108,
          width: RING_SIZE,
          height: RING_SIZE,
          boxSizing: "border-box",
          borderWidth: 2,
          borderStyle: "solid",
          borderColor: "#000000",
          borderRadius: 999,
          translate: `${ringX}px 0px`,
        }}
      />
    </AbsoluteFill>
  );
};
