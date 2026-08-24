import { type AdminKitDrill, adminKitDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { BackLink } from "../components/BackLink.js";

export function KitDrillPage() {
  const { kitId } = useParams();
  const { token } = useAuth();
  const [kit, setKit] = useState<AdminKitDrill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !kitId) {
      return;
    }
    apiFetch<AdminKitDrill>(`/admin/catalog/kits/${kitId}`, { token })
      .then((body) => setKit(adminKitDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load kit");
      });
  }, [token, kitId]);

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/stamdata" />
        <h2>{kit?.label ?? "Kit"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {kit?.hasPhoto && kit.photoPath && token ? (
        <AuthenticatedImage
          path={kit.photoPath}
          token={token}
          className="drill-photo"
          alt={kit.label}
        />
      ) : (
        <p>No KitPhoto on file.</p>
      )}

      {kit ? (
        <section className="summary-panel">
          <dl className="stats-row">
            <div>
              <dt>Kit type</dt>
              <dd className="type-mono">{kit.kitType}</dd>
            </div>
            <div>
              <dt>Club</dt>
              <dd>{kit.clubLabel ?? "—"}</dd>
            </div>
            <div>
              <dt>Season</dt>
              <dd className="type-mono">{kit.seasonLabel}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
