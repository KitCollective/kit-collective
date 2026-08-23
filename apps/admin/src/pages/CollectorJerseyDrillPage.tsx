import { type AdminCollectorJerseyDrill, adminCollectorJerseyDrillSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { BackLink } from "../components/BackLink.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";

export function CollectorJerseyDrillPage() {
  const { userId, jerseyId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [jersey, setJersey] = useState<AdminCollectorJerseyDrill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [takeDownError, setTakeDownError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [takingDown, setTakingDown] = useState(false);

  useEffect(() => {
    if (!token || !userId || !jerseyId) {
      return;
    }
    apiFetch<AdminCollectorJerseyDrill>(`/admin/collectors/${userId}/jerseys/${jerseyId}`, {
      token,
    })
      .then((body) => setJersey(adminCollectorJerseyDrillSchema.parse(body)))
      .catch((fetchError) => {
        setJersey(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load jersey");
      });
  }, [token, userId, jerseyId]);

  async function confirmTakeDown() {
    if (!token || !userId || !jerseyId) {
      return;
    }
    setTakingDown(true);
    setTakeDownError(null);
    try {
      await apiFetch<void>(`/admin/collectors/${userId}/jerseys/${jerseyId}`, {
        token,
        method: "DELETE",
      });
      navigate(`/collectors/${userId}`);
    } catch (takeDownFailure) {
      setTakeDownError(
        takeDownFailure instanceof Error
          ? takeDownFailure.message
          : "Take-down failed. The jersey was not removed.",
      );
      setConfirmOpen(false);
    } finally {
      setTakingDown(false);
    }
  }

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to={`/collectors/${userId}`} />
        <h2>{jersey ? `${jersey.clubLabel} · ${jersey.seasonLabel}` : "Jersey"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}
      {takeDownError ? <div className="banner-error">{takeDownError}</div> : null}

      {jersey ? (
        <>
          <div className="jersey-photo-grid">
            {jersey.photos.map((photo) =>
              token ? (
                <AuthenticatedImage
                  key={photo.id}
                  path={photo.photoPath}
                  token={token}
                  className="drill-photo"
                  alt={`${photo.role} photo`}
                />
              ) : null,
            )}
          </div>

          <dl className="meta-grid">
            <dt>Type</dt>
            <dd>{jersey.type}</dd>
            <dt>Size</dt>
            <dd>{jersey.size}</dd>
            <dt>Condition</dt>
            <dd>{jersey.condition}</dd>
          </dl>

          <div className="toolbar">
            <button
              type="button"
              className="btn btn-destructive btn-primary--auto"
              onClick={() => setConfirmOpen(true)}
            >
              Take down
            </button>
          </div>
        </>
      ) : null}

      <ConfirmSheet
        open={confirmOpen}
        title="Take down this jersey?"
        description="This permanently deletes the collector's copy and photos. Kit stamdata is not affected."
        confirmLabel="Take down"
        onClose={() => {
          if (!takingDown) {
            setConfirmOpen(false);
          }
        }}
        onConfirm={confirmTakeDown}
        confirming={takingDown}
      />
    </div>
  );
}
