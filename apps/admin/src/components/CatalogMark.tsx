import { AuthenticatedImage } from "./AuthenticatedImage.js";

type CatalogMarkProps = {
  markPath?: string;
  monogram: string;
  token: string | null;
  size?: "md" | "lg";
};

export function CatalogMark({ markPath, monogram, token, size = "md" }: CatalogMarkProps) {
  const slotClass = size === "lg" ? "monogram-slot monogram-slot--lg" : "monogram-slot";
  if (markPath && token) {
    return (
      <span className={slotClass}>
        <AuthenticatedImage
          path={markPath}
          token={token}
          alt=""
          fallback={<span aria-hidden="true">{monogram}</span>}
        />
      </span>
    );
  }
  return (
    <span className={slotClass} aria-hidden="true">
      {monogram}
    </span>
  );
}
