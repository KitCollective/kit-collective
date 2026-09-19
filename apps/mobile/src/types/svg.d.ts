// Type SVG imports as React components (provided at runtime by
// react-native-svg-transformer). Mirrors the transformer's shipped declaration.
declare module "*.svg" {
  import type { FC } from "react";
  import type { SvgProps } from "react-native-svg";

  const content: FC<SvgProps>;
  export default content;
}
