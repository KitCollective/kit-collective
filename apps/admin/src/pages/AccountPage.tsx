import { type AuthEvents, authEventsSchema } from "@kit/api-contract";
import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import { formatAuthDateTime, formatAuthEventKind } from "./auth-event-labels.js";

export function AccountPage() {
  const { token, logout } = useAuth();
  const [events, setEvents] = useState<AuthEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    apiFetch<AuthEvents>("/identity/auth-events", { token })
      .then((body) => {
        if (cancelled) {
          return;
        }
        setEvents(authEventsSchema.parse(body));
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setEvents(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load Auth events");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirmRevoke() {
    if (!token) {
      return;
    }
    setRevoking(true);
    try {
      await apiFetch("/identity/sessions/revoke-all", { token, method: "POST" });
      setRevokeOpen(false);
      logout();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke sessions");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="drill-page">
      <div className="drill-header">
        <h2>Account</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      <section className="section-block">
        <div className="toolbar toolbar--actions">
          <button type="button" className="btn btn-destructive" onClick={() => setRevokeOpen(true)}>
            Revoke sessions
          </button>
        </div>
      </section>

      <section className="section-block">
        <h3 className="section-title">Auth events</h3>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Provider</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {!events || events.events.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state data-table-empty">
                      <h2>No Auth events yet</h2>
                      <p>Your login, logout, failure, reset, and provider link will appear here.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                events.events.map((row) => (
                  <tr key={row.id}>
                    <td className="data-table-primary">{formatAuthEventKind(row.kind)}</td>
                    <td className="data-table-mono">{row.provider ?? "—"}</td>
                    <td className="data-table-meta">{formatAuthDateTime(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmSheet
        open={revokeOpen}
        title="Revoke all sessions?"
        description="You will be signed out on every browser and device, including this one."
        confirmLabel="Revoke sessions"
        confirming={revoking}
        onClose={() => {
          if (!revoking) {
            setRevokeOpen(false);
          }
        }}
        onConfirm={() => void confirmRevoke()}
      />
    </div>
  );
}
