import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { stickySize } from "./sticky-size-device";

/** Renders nothing. Hydrates the sticky size for whoever is signed in. */
export function StickySizeBinding() {
  const { user } = useAuth();
  const collectorId = user?.id ?? null;

  useEffect(() => {
    void stickySize.bind(collectorId);
  }, [collectorId]);

  return null;
}
