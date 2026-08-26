import { useEffect, useState } from "react";
import { getApiBase, joinApiPath } from "../api/client.js";

type AuthenticatedImageProps = {
  path: string;
  token: string;
  alt?: string;
  className?: string;
};

export function AuthenticatedImage({ path, token, alt = "", className }: AuthenticatedImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(joinApiPath(getApiBase(), path), {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load image");
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, token]);

  if (!src) {
    return <span className={className ?? "thumb-slot"} aria-hidden />;
  }

  return <img src={src} alt={alt} className={className} />;
}
