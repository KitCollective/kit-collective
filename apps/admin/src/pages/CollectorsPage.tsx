import {
  type AdminAuthEvents,
  type AdminCollectorJerseyIndex,
  type AdminCollectorJerseyIndexRow,
  type AdminCollectorList,
  type AdminCollectorRow,
  type AuthSecurityDetections,
  adminAuthEventsSchema,
  adminCollectorJerseyIndexSchema,
  adminCollectorListSchema,
  authSecurityDetectionsSchema,
} from "@kit/api-contract";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { useAdminChrome } from "../components/AdminShell.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { formatAuthDateTime, formatAuthEventKind } from "./auth-event-labels.js";

const USER_DATA_TABLES = ["user", "jersey", "auth-events", "auth-security"] as const;

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
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

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
    } else {
      request = apiFetch<AuthSecurityDetections>("/admin/auth/security", { token }).then((body) => {
        if (cancelled) {
          return;
        }
        clearTables();
        setAuthSecurity(authSecurityDetectionsSchema.parse(body));
      });
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
  }, [token, query, table]);

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
    const total = authSecurity?.detections.length ?? 0;
    return `${total} detections`;
  })();

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
            ) : (
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Summary</th>
                <th scope="col">User</th>
                <th scope="col">When</th>
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
