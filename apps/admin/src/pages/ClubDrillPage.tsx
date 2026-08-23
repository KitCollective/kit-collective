import { type AdminClubDrill, adminClubDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { BackLink } from "../components/BackLink.js";

export function ClubDrillPage() {
  const { clubId } = useParams();
  const { token } = useAuth();
  const [club, setClub] = useState<AdminClubDrill | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !clubId) {
      return;
    }
    apiFetch<AdminClubDrill>(`/admin/catalog/clubs/${clubId}`, { token })
      .then((body) => setClub(adminClubDrillSchema.parse(body)))
      .catch((fetchError) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load club");
      });
  }, [token, clubId]);

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/stamdata" />
        <h2>{club?.label ?? "Club"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {club ? (
        <dl className="meta-grid">
          <dt>Country</dt>
          <dd>{club.countryLabel ?? "—"}</dd>
          <dt>Mark</dt>
          <dd>
            <span className="monogram-slot">{club.monogram}</span>
          </dd>
        </dl>
      ) : null}
    </div>
  );
}
