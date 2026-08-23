import { type AdminClubSeasonDrill, adminClubSeasonDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";

export function ClubSeasonDrillPage() {
  const { clubId, seasonId } = useParams();
  const { token } = useAuth();
  const [drill, setDrill] = useState<AdminClubSeasonDrill | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !clubId || !seasonId) {
      return;
    }
    const params = expanded ? "?expand=true" : "";
    apiFetch<AdminClubSeasonDrill>(`/admin/catalog/club-seasons/${clubId}/${seasonId}${params}`, {
      token,
    })
      .then((body) => setDrill(adminClubSeasonDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load squad");
      });
  }, [token, clubId, seasonId, expanded]);

  return (
    <div className="drill-page">
      <div className="drill-header">
        <Link to="/stamdata" className="btn btn-secondary">
          Back
        </Link>
        <h2>{drill ? `${drill.clubLabel} · ${drill.seasonLabel}` : "Club season"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {drill ? (
        <>
          <p>{drill.squadCount} players in squad</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide squad" : "Expand squad"}
          </button>
          {expanded && drill.squad && drill.squad.length > 0 ? (
            <ul className="squad-list">
              {drill.squad.map((player) => (
                <li key={player.id}>
                  {player.squadNumber !== null ? `#${player.squadNumber} ` : ""}
                  {player.label}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
