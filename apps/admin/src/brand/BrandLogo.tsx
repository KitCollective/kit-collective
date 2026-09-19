type BrandLogoProps = {
  variant: "wordmark" | "lockup";
  className?: string;
};

/**
 * KitCollective product logo (brand kit v1.0).
 * Admin is light-only: black wordmark / black lockup.
 * Source files: `public/assets/kitcollective-*.svg`.
 * Inlined so page-loaded Archivo applies (SVG-as-<img> cannot use the webfont).
 */
export function BrandLogo({ variant, className }: BrandLogoProps) {
  const variantClass = variant === "wordmark" ? "brand-logo--wordmark" : "brand-logo--lockup";
  const classes = ["brand-logo", variantClass, className].filter(Boolean).join(" ");
  switch (variant) {
    case "wordmark":
      return <WordmarkBlack className={classes} />;
    case "lockup":
      return <LockupBlack className={classes} />;
    default: {
      const exhaustive: never = variant;
      return exhaustive;
    }
  }
}

function WordmarkBlack({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 2434 353"
      role="img"
      aria-label="KitCollective"
    >
      <text
        x="0"
        y="353"
        fontFamily="Archivo, 'Archivo Semi Expanded', 'Helvetica Neue', Arial, sans-serif"
        fontSize={480}
        letterSpacing={-23.04}
        fill="#0A0A0A"
      >
        <tspan fontWeight={400}>Kit</tspan>
        <tspan fontWeight={600}>Collective</tspan>
      </text>
    </svg>
  );
}

function LockupBlack({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 2592 480"
      role="img"
      aria-label="KitCollective"
    >
      <rect x="0" y="0" width="480" height="480" fill="#0A0A0A" />
      <text
        x="240"
        y="322"
        textAnchor="middle"
        fontFamily="Archivo, 'Archivo Semi Expanded', 'Helvetica Neue', Arial, sans-serif"
        fontSize={214}
        fontWeight={700}
        letterSpacing={-12.84}
        fill="#FFFFFF"
      >
        KC
      </text>
      <text
        x="632"
        y="380"
        fontFamily="Archivo, 'Archivo Semi Expanded', 'Helvetica Neue', Arial, sans-serif"
        fontSize={380}
        letterSpacing={-18.24}
        fill="#0A0A0A"
      >
        <tspan fontWeight={400}>Kit</tspan>
        <tspan fontWeight={600}>Collective</tspan>
      </text>
    </svg>
  );
}
