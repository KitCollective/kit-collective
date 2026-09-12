import { type ReactNode, useEffect, useState } from "react";
import { loadAuthenticatedBlob, peekAuthenticatedBlob } from "./authenticated-image-cache.js";

type AuthenticatedImageProps = {
  path: string;
  token: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
};

export function AuthenticatedImage({
  path,
  token,
  alt = "",
  className,
  fallback,
}: AuthenticatedImageProps) {
  const [src, setSrc] = useState<string | null>(() => peekAuthenticatedBlob(path, token));
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = peekAuthenticatedBlob(path, token);
    if (cached) {
      setSrc(cached);
      setFadeIn(false);
      return;
    }
    setSrc(null);
    setFadeIn(false);
    loadAuthenticatedBlob(path, token)
      .then((objectUrl) => {
        if (cancelled) {
          return;
        }
        setSrc(objectUrl);
        setFadeIn(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, token]);

  if (!src) {
    return fallback ?? <span className={className ?? "thumb-slot"} aria-hidden />;
  }

  const imageClass = [className, fadeIn ? "auth-image-in" : null].filter(Boolean).join(" ");
  return <img src={src} alt={alt} className={imageClass} />;
}
