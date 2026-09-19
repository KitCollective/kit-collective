import { type AdminPlayerDrill, adminPlayerDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { BackLink } from "../components/BackLink.js";
import { CatalogMark } from "../components/CatalogMark.js";

export function PlayerDrillPage() {
  const { playerId } = useParams();
  const { token } = useAuth();
  const [player, setPlayer] = useState<AdminPlayerDrill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !playerId) {
      return;
    }
    apiFetch<AdminPlayerDrill>(`/admin/catalog/players/${playerId}`, { token })
      .then((body) => setPlayer(adminPlayerDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load player");
      });
  }, [token, playerId]);

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/stamdata" />
        <h2>{player?.label ?? "Player"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {player ? (
        <section className="summary-panel">
          <dl className="stats-row">
            <div>
              <dt>Country</dt>
              <dd>{player.countryLabel ?? "—"}</dd>
            </div>
            <div>
              <dt>Born</dt>
              <dd>{player.dateOfBirth ?? "—"}</dd>
            </div>
            <div>
              <dt>Mark</dt>
              <dd>
                <CatalogMark markPath={player.markPath} monogram={player.monogram} token={token} />
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {player ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Club</th>
                <th scope="col">Season</th>
                <th className="data-table-numeric" scope="col">
                  #
                </th>
              </tr>
            </thead>
            <tbody>
              {player.clubSeasons.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state data-table-empty">
                      No club seasons on this player.
                    </div>
                  </td>
                </tr>
              ) : (
                player.clubSeasons.map((row) => (
                  <tr key={`${row.clubLabel}:${row.seasonLabel}:${row.squadNumber ?? ""}`}>
                    <td className="data-table-primary">{row.clubLabel}</td>
                    <td className="data-table-mono">{row.seasonLabel}</td>
                    <td className="data-table-mono data-table-numeric">{row.squadNumber ?? "—"}</td>
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
