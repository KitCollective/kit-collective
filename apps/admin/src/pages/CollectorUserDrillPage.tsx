import {
  type AdminCollectorJerseyList,
  type AdminCollectorUser,
  adminCollectorJerseyListSchema,
  adminCollectorUserSchema,
} from "@kit/api-contract";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { BackLink } from "../components/BackLink.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";

function parseRoleUpdateError(message: string): string {
  try {
    const parsed: unknown = JSON.parse(message);
    if (typeof parsed !== "object" || parsed === null) {
      return message;
    }
    if ("message" in parsed && typeof parsed.message === "string") {
      return parsed.message;
    }
    if (
      "code" in parsed &&
      typeof parsed.code === "string" &&
      "message" in parsed &&
      typeof parsed.message === "string"
    ) {
      return parsed.message;
    }
  } catch {
    return message;
  }
  return message;
}

export function CollectorUserDrillPage() {
  const { userId } = useParams();
  const { token, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [collector, setCollector] = useState<AdminCollectorUser | null>(null);
  const [jerseys, setJerseys] = useState<AdminCollectorJerseyList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<"user" | "admin" | null>(null);
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

  useEffect(() => {
    if (!token || !userId) {
      return;
    }
    Promise.all([
      apiFetch<AdminCollectorUser>(`/admin/collectors/${userId}`, { token }),
      apiFetch<AdminCollectorJerseyList>(`/admin/collectors/${userId}/jerseys`, { token }),
    ])
      .then(([userBody, jerseyBody]) => {
        setCollector(adminCollectorUserSchema.parse(userBody));
        setJerseys(adminCollectorJerseyListSchema.parse(jerseyBody));
        setError(null);
      })
      .catch((fetchError) => {
        setCollector(null);
        setJerseys(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load collector");
      });
  }, [token, userId]);

  const isSelf = currentUser?.id === userId;
  const isLastAdmin = collector?.role === "admin" && (collector?.adminCount ?? 0) <= 1;
  const demoteDisabled = isSelf || isLastAdmin;
  const demoteHelperText = isSelf
    ? "You cannot demote your own Staff access."
    : isLastAdmin
      ? "At least one Staff access account must remain."
      : null;

  function openJersey(jerseyId: string) {
    navigate(`/collectors/${userId}/jerseys/${jerseyId}`);
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    jerseyId: string,
    rowIndex: number,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openJersey(jerseyId);
      return;
    }

    const rowElements = event.currentTarget.parentElement?.children;
    if (!rowElements) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = rowIndex + 1;
      const next = rowElements.item(nextIndex);
      if (next instanceof HTMLTableRowElement) {
        setFocusedRowIndex(nextIndex);
        next.focus();
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const previousIndex = rowIndex - 1;
      const previous = rowElements.item(previousIndex);
      if (previous instanceof HTMLTableRowElement) {
        setFocusedRowIndex(previousIndex);
        previous.focus();
      }
    }
  }

  function requestRoleChange(nextRole: "user" | "admin") {
    setRoleError(null);
    if (isSelf && nextRole === "user") {
      setRoleError("You cannot demote your own Staff access.");
      return;
    }
    if (isLastAdmin && nextRole === "user") {
      setRoleError("At least one Staff access account must remain.");
      return;
    }
    setPendingRole(nextRole);
    setRoleSheetOpen(true);
  }

  async function confirmRoleChange() {
    if (!token || !userId || !pendingRole) {
      return;
    }
    setRoleUpdating(true);
    setRoleError(null);
    try {
      const updated = await apiFetch<AdminCollectorUser>(`/admin/collectors/${userId}/role`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ role: pendingRole }),
      });
      setCollector(adminCollectorUserSchema.parse(updated));
      setRoleSheetOpen(false);
      setPendingRole(null);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Failed to update role";
      setRoleError(parseRoleUpdateError(message));
    } finally {
      setRoleUpdating(false);
    }
  }

  const roleSheetTitle = pendingRole === "admin" ? "Grant Staff access?" : "Remove Staff access?";
  const roleSheetDescription =
    pendingRole === "admin"
      ? `Grant Staff access to ${collector?.email ?? "this user"}? They can sign in to Admin SPA.`
      : `Remove Staff access from ${collector?.email ?? "this user"}? They will no longer access Admin SPA.`;

  return (
    <div className="drill-page">
      <div className="drill-header">
        <BackLink to="/collectors" />
        <h2>{collector?.email ?? "Collector"}</h2>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}
      {roleError ? <div className="banner-error">{roleError}</div> : null}

      {collector ? (
        <section className="summary-panel">
          <dl className="stats-row">
            <div>
              <dt>Role</dt>
              <dd className="type-mono">{collector.role}</dd>
            </div>
            <div>
              <dt>Jerseys</dt>
              <dd className="type-mono">{collector.jerseyCount}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd className="type-mono">
                {new Date(collector.createdAt).toLocaleDateString("en-GB", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>

          <div className="toolbar toolbar--actions">
            {collector.role === "user" ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => requestRoleChange("admin")}
              >
                Grant Staff access
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => requestRoleChange("user")}
                disabled={demoteDisabled}
                title={demoteHelperText ?? undefined}
              >
                Remove Staff access
              </button>
            )}
            {demoteHelperText ? <p className="type-caption toolbar-hint">{demoteHelperText}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="section-block">
        <h3 className="section-title">Jerseys</h3>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="data-table-mark" scope="col">
                  Thumb
                </th>
                <th scope="col">Club</th>
                <th scope="col">Season</th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {!jerseys || jerseys.rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state data-table-empty">
                      <h2>No jerseys</h2>
                      <p>This collector has not saved any jerseys yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                jerseys.rows.map((row, rowIndex) => (
                  <tr
                    key={row.id}
                    tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                    onClick={() => openJersey(row.id)}
                    onFocus={() => setFocusedRowIndex(rowIndex)}
                    onKeyDown={(event) => handleRowKeyDown(event, row.id, rowIndex)}
                  >
                    <td className="data-table-mark">
                      {row.photoPath && token ? (
                        <span className="thumb-slot">
                          <AuthenticatedImage path={row.photoPath} token={token} />
                        </span>
                      ) : (
                        <span className="thumb-slot" aria-hidden />
                      )}
                    </td>
                    <td className="data-table-primary">{row.clubLabel}</td>
                    <td className="data-table-mono">{row.seasonLabel}</td>
                    <td className="data-table-mono">{row.type}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmSheet
        open={roleSheetOpen}
        title={roleSheetTitle}
        description={roleSheetDescription}
        confirmLabel={pendingRole === "admin" ? "Grant access" : "Remove access"}
        onClose={() => {
          if (!roleUpdating) {
            setRoleSheetOpen(false);
            setPendingRole(null);
          }
        }}
        onConfirm={confirmRoleChange}
        confirming={roleUpdating}
      />
    </div>
  );
}
