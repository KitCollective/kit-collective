import { type AdminKitDrill, adminKitDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";

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
        <Link to="/stamdata" className="btn btn-secondary">
          Back
        </Link>
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
        <dl className="meta-grid">
          <dt>Kit type</dt>
          <dd>{kit.kitType}</dd>
          <dt>Club</dt>
          <dd>{kit.clubLabel ?? "—"}</dd>
          <dt>Season</dt>
          <dd>{kit.seasonLabel}</dd>
        </dl>
      ) : null}
    </div>
  );
}
