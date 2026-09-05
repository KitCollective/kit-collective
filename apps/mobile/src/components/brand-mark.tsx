import type { SvgProps } from "react-native-svg";
import AppleMark from "../../assets/brand/provider-apple.svg";
import FacebookMark from "../../assets/brand/provider-facebook.svg";
import GoogleMark from "../../assets/brand/provider-google.svg";
import { useTheme } from "@/theme/use-theme";

/** Sign-in provider whose official brand mark we ship as an asset. */
export type BrandMarkProvider = "google" | "facebook" | "apple";

type BrandMarkProps = {
  provider: BrandMarkProvider;
  /** Rendered square size in px. Defaults to 24 to match the social-row glyph. */
  size?: number;
  /**
   * Apple only: render the inverted (light) mark for dark surfaces. Google and
   * Facebook keep their fixed brand colors and ignore this flag.
   */
  inverted?: boolean;
} & Pick<SvgProps, "accessibilityElementsHidden" | "importantForAccessibility">;

const PROVIDER_LABEL: Record<BrandMarkProvider, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
};

/**
 * Official Google / Facebook / Apple sign-in marks rendered from brand SVG
 * assets. Brand hex lives in the `.svg` files; Apple's monochrome mark takes its
 * color from semantic theme tokens so it reads correctly on light and dark
 * surfaces (Apple HIG: black on light, white on dark).
 */
export function BrandMark({
  provider,
  size = 24,
  inverted = false,
  ...accessibility
}: BrandMarkProps) {
  const theme = useTheme();
  const label = PROVIDER_LABEL[provider];

  const shared: SvgProps = {
    width: size,
    height: size,
    accessibilityRole: "image",
    accessibilityLabel: label,
    ...accessibility,
  };

  if (provider === "google") {
    return <GoogleMark {...shared} />;
  }

  if (provider === "facebook") {
    return <FacebookMark {...shared} />;
  }

  // Apple mark uses currentColor so it can invert. contentPrimary already flips
  // black↔white with the theme; `inverted` forces the opposite for a surface
  // that contrasts the active theme.
  return <AppleMark {...shared} color={inverted ? theme.contentInverse : theme.contentPrimary} />;
}
