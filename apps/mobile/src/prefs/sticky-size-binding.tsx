import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import "./sticky-size-device";
import { stickySize } from "./stickySizeStore";

/** Renders nothing. Hydrates the sticky size for whoever is signed in. */
export function StickySizeBinding() {
  const { user } = useAuth();
  const collectorId = user?.id ?? null;

  useEffect(() => {
    void stickySize.bind(collectorId);
  }, [collectorId]);

  return null;
}
