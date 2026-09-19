import { type AdminLeagueDrill, adminLeagueDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { BackLink } from "../components/BackLink.js";
import { CatalogMark } from "../components/CatalogMark.js";

export function LeagueDrillPage() {
  const { leagueId } = useParams();
  const { token } = useAuth();
  const [league, setLeague] = useState<AdminLeagueDrill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !leagueId) {
      return;
    }
    apiFetch<AdminLeagueDrill>(`/admin/catalog/leagues/${leagueId}`, { token })
      .then((body) => setLeague(adminLeagueDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load league");
      });
  }, [token, leagueId]);

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/stamdata" />
        <h2>{league?.label ?? "League"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {league ? (
        <section className="summary-panel">
          <dl className="stats-row">
            <div>
              <dt>Country</dt>
              <dd>{league.countryLabel ?? "—"}</dd>
            </div>
            <div>
              <dt>Mark</dt>
              <dd>
                <CatalogMark markPath={league.markPath} monogram={league.monogram} token={token} />
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {league ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Season</th>
              </tr>
            </thead>
            <tbody>
              {league.seasons.length === 0 ? (
                <tr>
                  <td>
                    <div className="empty-state data-table-empty">No seasons on this league.</div>
                  </td>
                </tr>
              ) : (
                league.seasons.map((season) => (
                  <tr key={season.id}>
                    <td className="data-table-mono">{season.label}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
