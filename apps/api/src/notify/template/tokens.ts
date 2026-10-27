/**
 * Colour and size tokens for the `email` surface (docs/design-system.md → Transactional e-mail).
 * Values come from the lock's gray primitives and the dark aliases; none are invented here.
 */
export type Scheme = {
  canvas: string;
  field: string;
  block: string;
  primary: string;
  secondary: string;
  muted: string;
  hairline: string;
  buttonFill: string;
  buttonText: string;
};

export const LIGHT: Scheme = {
  canvas: "#FFFFFF",
  field: "#F4F4F4", // fill.secondary → gray.50
  block: "#F4F4F4",
  primary: "#000000",
  secondary: "#5E5E5E", // gray.600
  muted: "#6B6B6B", // gray.400
  hairline: "#E8E8E8", // border.subtle → gray.100
  buttonFill: "#000000",
  buttonText: "#FFFFFF",
};

export const DARK: Scheme = {
  canvas: "#000000",
  field: "#1F1F1F", // Dark: the field is #1F1F1F on a #000000 canvas
  block: "#2A2A2A", // fill.secondary (dark)
  primary: "#FFFFFF",
  secondary: "#C2C2C2",
  muted: "#8A8A8A",
  hairline: "#333333",
  buttonFill: "#FFFFFF", // the button is white with black text
  buttonText: "#000000",
};

export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
export const FONT_MONO = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export const WIDTH = 600;
export const PHONE_WIDTH = 375;
export const INSET = 40;
export const PHONE_INSET = 20;
export const TEXT_BLOCK_WIDTH = 356;
/** Board beside the text on desktop: what is left of the 520 content width. Not a locked size. */
export const BOARD_WIDTH = 164;
export const BOARD_HEIGHT = 153;
export const PHONE_BOARD_WIDTH = 160;
export const PHONE_BOARD_HEIGHT = 149;
export const GAP = 24;
export const GAP_AFTER_JERSEY_OPENER = 28;
