import {
  type AdminAuthEvents,
  type AdminCollectorJerseyIndex,
  type AdminCollectorJerseyIndexRow,
  type AdminCollectorList,
  type AdminCollectorRow,
  type AdminVisionImproveRow,
  type AdminVisionImproves,
  type AdminVisionLabelFieldHits,
  type AdminVisionLabelIdentity,
  type AdminVisionLabelRow,
  type AdminVisionLabels,
  type AuthSecurityDetections,
  adminAuthEventsSchema,
  adminCollectorJerseyIndexSchema,
  adminCollectorListSchema,
  adminVisionImproveRowSchema,
  adminVisionImprovesSchema,
  adminVisionLabelsSchema,
  authSecurityDetectionsSchema,
  VISION_EVAL_CLASSES,
  VISION_EVAL_FIELD_HIT_KEYS,
  VISION_USER_ACTIONS,
  type VisionEvalClass,
  type VisionUserAction,
} from "@kit/api-contract";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { useAdminChrome } from "../components/AdminShell.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { formatAuthDateTime, formatAuthEventKind } from "./auth-event-labels.js";

const USER_DATA_TABLES = [
  "user",
  "jersey",
  "auth-events",
  "auth-security",
  "vision-labels",
  "vision-improve",
] as const;

const FIELD_HIT_ORDER = VISION_EVAL_FIELD_HIT_KEYS;

type UserDataTable = (typeof USER_DATA_TABLES)[number];

function tableLabel(table: UserDataTable): string {
  switch (table) {
    case "user":
      return "Users";
    case "jersey":
      return "Jerseys";
    case "auth-events":
      return "Auth events";
    case "auth-security":
      return "Auth security";
    case "vision-labels":
      return "Vision labels";
    case "vision-improve":
      return "Vision improve";
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function tableSearchPlaceholder(table: UserDataTable): string {
  switch (table) {
    case "user":
      return "Search users";
    case "jersey":
      return "Search jerseys";
    case "auth-events":
      return "Search Auth events";
    case "auth-security":
      return "Search Auth security";
    case "vision-labels":
      return "Search Vision labels";
    case "vision-improve":
      return "Search Vision improve";
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function columnCount(table: UserDataTable): number {
  switch (table) {
    case "user":
      return 5;
    case "jersey":
      return 5;
    case "auth-events":
      return 4;
    case "auth-security":
      return 4;
    case "vision-labels":
      return 7;
    case "vision-improve":
      return 6;
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function titleCaseToken(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatEvalClass(value: VisionEvalClass): string {
  return titleCaseToken(value);
}

function formatUserAction(value: VisionUserAction | null): string {
  return value == null ? "—" : titleCaseToken(value);
}

function formatIdentityLabels(identity: AdminVisionLabelIdentity): string {
  const parts = [
    identity.clubLabel,
    identity.nationalTeamLabel,
    identity.seasonLabel,
    identity.type,
    identity.catalogKitLabel,
    identity.playerLabel,
    identity.patchLabel,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatFieldHits(hits: AdminVisionLabelFieldHits): string {
  const labels = FIELD_HIT_ORDER.filter((key) => hits[key]).map((key) =>
    key === "catalogKitId" ? "kit" : key,
  );
  return labels.length > 0 ? labels.join(" · ") : "—";
}

function formatHitRateCaption(caption: string): string {
  return caption.startsWith("Hit rate") ? caption : `Hit rate ${caption}`;
}

function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs == null ? "—" : `${latencyMs} ms`;
}

export function CollectorsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { search, setSearchPlaceholder } = useAdminChrome();
  const [table, setTable] = useState<UserDataTable>("user");
  const [users, setUsers] = useState<AdminCollectorList | null>(null);
  const [jerseys, setJerseys] = useState<AdminCollectorJerseyIndex | null>(null);
  const [authEvents, setAuthEvents] = useState<AdminAuthEvents | null>(null);
  const [authSecurity, setAuthSecurity] = useState<AuthSecurityDetections | null>(null);
  const [visionLabels, setVisionLabels] = useState<AdminVisionLabels | null>(null);
  const [visionImprove, setVisionImprove] = useState<AdminVisionImproves | null>(null);
  const [classFilter, setClassFilter] = useState<VisionEvalClass | "">("");
  const [userActionFilter, setUserActionFilter] = useState<VisionUserAction | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [pendingImproveId, setPendingImproveId] = useState<string | null>(null);

  const query = useMemo(() => ({ q: search.trim() || undefined }), [search]);

  useEffect(() => {
    setSearchPlaceholder(tableSearchPlaceholder(table));
  }, [setSearchPlaceholder, table]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.q) {
      params.set("q", query.q);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";

    function clearTables() {
      setUsers(null);
      setJerseys(null);
      setAuthEvents(null);
      setAuthSecurity(null);
      setVisionLabels(null);
      setVisionImprove(null);
    }

    let request: Promise<void>;
    if (table === "user") {
      request = apiFetch<AdminCollectorList>(`/admin/collectors${suffix}`, { token }).then(
        (body) => {
          if (cancelled) {
            return;
          }
          clearTables();
          setUsers(adminCollectorListSchema.parse(body));
        },
      );
    } else if (table === "jersey") {
      request = apiFetch<AdminCollectorJerseyIndex>(`/admin/collectors/jerseys${suffix}`, {
        token,
      }).then((body) => {
        if (cancelled) {
          return;
        }
        clearTables();
        setJerseys(adminCollectorJerseyIndexSchema.parse(body));
      });
    } else if (table === "auth-events") {
      request = apiFetch<AdminAuthEvents>("/admin/auth/events", { token }).then((body) => {
        if (cancelled) {
          return;
        }
        clearTables();
        setAuthEvents(adminAuthEventsSchema.parse(body));
      });
    } else if (table === "auth-security") {
      request = apiFetch<AuthSecurityDetections>("/admin/auth/security", { token }).then((body) => {
        if (cancelled) {
          return;
        }
        clearTables();
        setAuthSecurity(authSecurityDetectionsSchema.parse(body));
      });
    } else if (table === "vision-labels") {
      const params = new URLSearchParams();
      if (classFilter) {
        params.set("class", classFilter);
      }
      if (userActionFilter) {
        params.set("user_action", userActionFilter);
      }
      const visionSuffix = params.toString() ? `?${params.toString()}` : "";
      request = apiFetch<AdminVisionLabels>(`/admin/vision/labels${visionSuffix}`, { token }).then(
        (body) => {
          if (cancelled) {
            return;
          }
          clearTables();
          setVisionLabels(adminVisionLabelsSchema.parse(body));
        },
      );
    } else if (table === "vision-improve") {
      request = apiFetch<AdminVisionImproves>("/admin/vision/improve", { token }).then((body) => {
        if (cancelled) {
          return;
        }
        clearTables();
        setVisionImprove(adminVisionImprovesSchema.parse(body));
      });
    } else {
      const exhaustive: never = table;
      request = Promise.reject(new Error(`Unknown user data table: ${exhaustive}`));
    }

    request
      .then(() => {
        if (cancelled) {
          return;
        }
        setFocusedRowIndex(0);
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setUsers(null);
        setJerseys(null);
        setAuthEvents(null);
        setAuthSecurity(null);
        setVisionLabels(null);
        setVisionImprove(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load user data");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, query, table, classFilter, userActionFilter]);

  function openUser(row: AdminCollectorRow) {
    navigate(`/collectors/${row.id}`);
  }

  function openJersey(row: AdminCollectorJerseyIndexRow) {
    navigate(`/collectors/${row.userId}/jerseys/${row.id}`);
  }

  function handleUserRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    row: AdminCollectorRow,
    rowIndex: number,
  ) {
    handleRowKeyDown(event, rowIndex, () => openUser(row));
  }

  function handleJerseyRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    row: AdminCollectorJerseyIndexRow,
    rowIndex: number,
  ) {
    handleRowKeyDown(event, rowIndex, () => openJersey(row));
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    rowIndex: number,
    activate: () => void,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const columns = columnCount(table);
  const recordCount = (() => {
    if (loading) {
      return "Loading…";
    }
    if (table === "user") {
      return users ? `${users.total} ${tableLabel(table).toLowerCase()}` : "0 users";
    }
    if (table === "jersey") {
      return jerseys ? `${jerseys.total} ${tableLabel(table).toLowerCase()}` : "0 jerseys";
    }
    if (table === "auth-events") {
      const total = authEvents?.events.length ?? 0;
      return `${total} auth events`;
    }
    if (table === "auth-security") {
      const total = authSecurity?.detections.length ?? 0;
      return `${total} detections`;
    }
    if (table === "vision-improve") {
      if (!visionImprove) {
        return "0 vision improve";
      }
      const proposedCount = visionImprove.rows.filter((row) => row.status === "proposed").length;
      return `${proposedCount} vision improve`;
    }
    if (!visionLabels) {
      return "0 vision labels";
    }
    return `${visionLabels.total} vision labels · ${formatHitRateCaption(visionLabels.hitRateCaption)}`;
  })();
  const visionFiltersActive = classFilter !== "" || userActionFilter !== "";

  function clearVisionFilters() {
    setClassFilter("");
    setUserActionFilter("");
    setFocusedRowIndex(0);
  }

  async function mutateVisionImprove(id: string, action: "apply" | "dismiss") {
    if (!token) {
      return;
    }
    setPendingImproveId(id);
    setError(null);
    try {
      const body = await apiFetch(`/admin/vision/improve/${id}/${action}`, {
        token,
        method: "POST",
      });
      if (body !== undefined) {
        adminVisionImproveRowSchema.parse(body);
      }
      setVisionImprove((current) => {
        if (!current) {
          return current;
        }
        return {
          total: Math.max(0, current.total - 1),
          rows: current.rows.filter((row) => row.id !== id),
        };
      });
    } catch (mutateError) {
      setError(
        mutateError instanceof Error
          ? mutateError.message
          : action === "apply"
            ? "Failed to apply Vision improve"
            : "Failed to dismiss Vision improve",
      );
    } finally {
      setPendingImproveId(null);
    }
  }

  return (
    <div className="list-page">
      <div className="toolbar">
        <fieldset className="chip-group toolbar-chips">
          <legend className="chip-group-legend">User Data tables</legend>
          {USER_DATA_TABLES.map((entityType) => (
            <button
              key={entityType}
              type="button"
              className="chip"
              aria-pressed={table === entityType}
              onClick={() => {
                setTable(entityType);
                setFocusedRowIndex(0);
                navigate("/collectors");
              }}
            >
              {tableLabel(entityType)}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={false}
            onClick={() => navigate("/collectors/offers")}
          >
            Offers
          </button>
        </fieldset>
        {table === "vision-labels" ? (
          <>
            <fieldset className="chip-group toolbar-chips">
              <legend className="chip-group-legend">Class</legend>
              <button
                type="button"
                className="chip"
                aria-pressed={classFilter === ""}
                onClick={() => {
                  setClassFilter("");
                  setFocusedRowIndex(0);
                }}
              >
                All classes
              </button>
              {VISION_EVAL_CLASSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={classFilter === value}
                  onClick={() => {
                    setClassFilter(value);
                    setFocusedRowIndex(0);
                  }}
                >
                  {formatEvalClass(value)}
                </button>
              ))}
            </fieldset>
            <fieldset className="chip-group toolbar-chips">
              <legend className="chip-group-legend">User action</legend>
              <button
                type="button"
                className="chip"
                aria-pressed={userActionFilter === ""}
                onClick={() => {
                  setUserActionFilter("");
                  setFocusedRowIndex(0);
                }}
              >
                All actions
              </button>
              {VISION_USER_ACTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={userActionFilter === value}
                  onClick={() => {
                    setUserActionFilter(value);
                    setFocusedRowIndex(0);
                  }}
                >
                  {formatUserAction(value)}
                </button>
              ))}
            </fieldset>
          </>
        ) : null}
        <span className="record-count">{recordCount}</span>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            {table === "user" ? (
              <tr>
                <th className="data-table-mark" scope="col">
                  Mark
                </th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th className="data-table-numeric" scope="col">
                  Jerseys
                </th>
                <th scope="col">Joined</th>
              </tr>
            ) : table === "jersey" ? (
              <tr>
                <th className="data-table-mark" scope="col">
                  Thumb
                </th>
                <th scope="col">Club</th>
                <th scope="col">Season</th>
                <th scope="col">Type</th>
                <th scope="col">User</th>
              </tr>
            ) : table === "auth-events" ? (
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">User</th>
                <th scope="col">Provider</th>
                <th scope="col">When</th>
              </tr>
            ) : table === "auth-security" ? (
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Summary</th>
                <th scope="col">User</th>
                <th scope="col">When</th>
              </tr>
            ) : table === "vision-improve" ? (
              <tr>
                <th scope="col">Fingerprint</th>
                <th className="data-table-numeric" scope="col">
                  Count
                </th>
                <th scope="col">Suggested</th>
                <th scope="col">Selected</th>
                <th scope="col">Last seen</th>
                <th scope="col">Actions</th>
              </tr>
            ) : (
              <tr>
                <th scope="col">Class</th>
                <th scope="col">User action</th>
                <th scope="col">Suggested</th>
                <th scope="col">Selected</th>
                <th className="data-table-numeric" scope="col">
                  Latency
                </th>
                <th scope="col">Model</th>
                <th scope="col">Field hits</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    Loading {tableLabel(table).toLowerCase()}…
                  </div>
                </td>
              </tr>
            ) : table === "user" && (!users || users.rows.length === 0) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>No users yet</h2>
                    <p>Registered users will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : table === "jersey" && (!jerseys || jerseys.rows.length === 0) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>No jerseys yet</h2>
                    <p>Saved collector jerseys will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : table === "auth-events" && (!authEvents || authEvents.events.length === 0) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>No Auth events yet</h2>
                    <p>Login, logout, failure, reset, and provider link will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : table === "auth-security" &&
              (!authSecurity || authSecurity.detections.length === 0) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>No Auth security detections</h2>
                    <p>Sentinel detections upserted into Postgres will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : table === "vision-labels" && (!visionLabels || visionLabels.rows.length === 0) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>
                      {visionFiltersActive ? "No Vision labels match" : "No Vision labels yet"}
                    </h2>
                    <p>
                      {visionFiltersActive
                        ? "Try a different class or user action, or clear your filters."
                        : "Identity Vision labels from collector Save will appear here."}
                    </p>
                    {visionFiltersActive ? (
                      <button
                        type="button"
                        className="btn btn-tertiary"
                        onClick={clearVisionFilters}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : table === "vision-improve" &&
              (!visionImprove ||
                visionImprove.rows.filter((row) => row.status === "proposed").length === 0) ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>No Vision improve yet</h2>
                    <p>
                      Alias, coverage, and model proposals from collector Save will appear here.
                    </p>
                  </div>
                </td>
              </tr>
            ) : table === "user" && users ? (
              users.rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onClick={() => openUser(row)}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                  onKeyDown={(event) => handleUserRowKeyDown(event, row, rowIndex)}
                >
                  <td className="data-table-mark">
                    <span className="monogram-slot">{row.monogram}</span>
                  </td>
                  <td className="data-table-primary">{row.email}</td>
                  <td className="data-table-mono">{row.role}</td>
                  <td className="data-table-mono data-table-numeric">{row.jerseyCount}</td>
                  <td className="data-table-meta">{formatDate(row.createdAt)}</td>
                </tr>
              ))
            ) : table === "auth-events" && authEvents ? (
              authEvents.events.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                >
                  <td className="data-table-primary">{formatAuthEventKind(row.kind)}</td>
                  <td className="data-table-mono">{row.userId ?? "—"}</td>
                  <td className="data-table-mono">{row.provider ?? "—"}</td>
                  <td className="data-table-meta">{formatAuthDateTime(row.createdAt)}</td>
                </tr>
              ))
            ) : table === "auth-security" && authSecurity ? (
              authSecurity.detections.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                >
                  <td className="data-table-primary">{row.kind}</td>
                  <td>{row.summary}</td>
                  <td className="data-table-mono">{row.userId ?? "—"}</td>
                  <td className="data-table-meta">{formatAuthDateTime(row.detectedAt)}</td>
                </tr>
              ))
            ) : table === "vision-labels" && visionLabels ? (
              visionLabels.rows.map((row: AdminVisionLabelRow, rowIndex) => (
                <tr
                  key={row.jobId}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                >
                  <td className="data-table-primary">{formatEvalClass(row.class)}</td>
                  <td className="data-table-mono">{formatUserAction(row.userAction)}</td>
                  <td>{formatIdentityLabels(row.suggested)}</td>
                  <td>{formatIdentityLabels(row.selected)}</td>
                  <td className="data-table-mono data-table-numeric">
                    {formatLatency(row.latencyMs)}
                  </td>
                  <td className="data-table-mono">{row.model ?? "—"}</td>
                  <td className="data-table-meta">{formatFieldHits(row.fieldHits)}</td>
                </tr>
              ))
            ) : table === "vision-improve" && visionImprove ? (
              visionImprove.rows
                .filter((row) => row.status === "proposed")
                .map((row: AdminVisionImproveRow, rowIndex) => {
                  const pending = pendingImproveId === row.id;
                  return (
                    <tr
                      key={row.id}
                      tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                      onFocus={() => setFocusedRowIndex(rowIndex)}
                    >
                      <td className="data-table-mono">{row.fingerprint}</td>
                      <td className="data-table-mono data-table-numeric">{row.count}</td>
                      <td>{formatIdentityLabels(row.suggested)}</td>
                      <td>{formatIdentityLabels(row.selected)}</td>
                      <td className="data-table-meta">{formatAuthDateTime(row.lastSeenAt)}</td>
                      <td className="data-table-row-actions">
                        <div className="data-table-row-actions-cluster">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={pendingImproveId !== null}
                            aria-busy={pending}
                            aria-label={`Apply ${row.fingerprint}`}
                            onClick={() => {
                              void mutateVisionImprove(row.id, "apply");
                            }}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            className="btn btn-tertiary"
                            disabled={pendingImproveId !== null}
                            aria-busy={pending}
                            aria-label={`Dismiss ${row.fingerprint}`}
                            onClick={() => {
                              void mutateVisionImprove(row.id, "dismiss");
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
            ) : jerseys ? (
              jerseys.rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onClick={() => openJersey(row)}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                  onKeyDown={(event) => handleJerseyRowKeyDown(event, row, rowIndex)}
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
                  <td className="data-table-meta">{row.userEmail}</td>
                </tr>
              ))
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
