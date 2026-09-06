import "./index.css";
import {Composition} from "remotion";
import {OnboardRegister} from "./Composition";

export const RemotionRoot = () => {
  return (
    <Composition
      id="OnboardRegister"
      component={OnboardRegister}
      durationInFrames={150}
      fps={30}
      width={1024}
      height={1536}
    />
  );
};
