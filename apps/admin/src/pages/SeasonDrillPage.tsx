import { type AdminSeasonDrill, adminSeasonDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { BackLink } from "../components/BackLink.js";

export function SeasonDrillPage() {
  const { seasonId } = useParams();
  const { token } = useAuth();
  const [season, setSeason] = useState<AdminSeasonDrill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !seasonId) {
      return;
    }
    apiFetch<AdminSeasonDrill>(`/admin/catalog/seasons/${seasonId}`, { token })
      .then((body) => setSeason(adminSeasonDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load season");
      });
  }, [token, seasonId]);

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/stamdata" />
        <h2>{season?.label ?? "Season"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {season ? (
        <section className="summary-panel">
          <dl className="stats-row">
            <div>
              <dt>League</dt>
              <dd>{season.leagueLabel ?? "—"}</dd>
            </div>
            <div>
              <dt>Mark</dt>
              <dd>
                <span className="monogram-slot">{season.monogram}</span>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
