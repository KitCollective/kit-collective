import type { IdentityPrefs } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import { fetchPrefs, updatePrefs } from "@/api/identity";
import { useAuth } from "@/auth/AuthProvider";
import { useAppearance } from "@/theme/appearance";

export function useIdentityPrefs() {
  const { accessToken } = useAuth();
  const { setAppearance } = useAppearance();
  const [prefs, setPrefs] = useState<IdentityPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setPrefs(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await fetchPrefs(accessToken);
      setPrefs(next);
      setAppearance(next.appearance);
    } catch {
      setError("Kunne ikke hente indstillinger");
    } finally {
      setLoading(false);
    }
  }, [accessToken, setAppearance]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchPrefs = useCallback(
    async (update: Partial<IdentityPrefs>) => {
      if (!accessToken || !prefs) {
        return;
      }

      const next = await updatePrefs(accessToken, update);
      setPrefs(next);
      if (update.appearance !== undefined) {
        setAppearance(next.appearance);
      }
      return next;
    },
    [accessToken, prefs, setAppearance],
  );

  return { prefs, loading, error, reload, patchPrefs };
}
