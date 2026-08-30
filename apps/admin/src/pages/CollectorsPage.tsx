import {
  type AdminCollectorJerseyIndex,
  type AdminCollectorJerseyIndexRow,
  type AdminCollectorList,
  type AdminCollectorRow,
  adminCollectorJerseyIndexSchema,
  adminCollectorListSchema,
} from "@kit/api-contract";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { useAdminChrome } from "../components/AdminShell.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";

const USER_DATA_TABLES = ["user", "jersey"] as const;

type UserDataTable = (typeof USER_DATA_TABLES)[number];

function isOffersRoute(pathname: string): boolean {
  return pathname === "/collectors/offers";
}

function tableLabel(table: UserDataTable): string {
  switch (table) {
    case "user":
      return "Users";
    case "jersey":
      return "Jerseys";
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
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

export function CollectorsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { search, setSearchPlaceholder } = useAdminChrome();
  const offersActive = isOffersRoute(location.pathname);
  const [table, setTable] = useState<UserDataTable>("user");
  const [users, setUsers] = useState<AdminCollectorList | null>(null);
  const [jerseys, setJerseys] = useState<AdminCollectorJerseyIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

  const query = useMemo(() => ({ q: search.trim() || undefined }), [search]);

  useEffect(() => {
    if (offersActive) {
      setSearchPlaceholder("Search users");
      return;
    }
    setSearchPlaceholder(tableSearchPlaceholder(table));
  }, [setSearchPlaceholder, table, offersActive]);

  useEffect(() => {
    if (offersActive) {
      return;
    }
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
    const path =
      table === "user" ? `/admin/collectors${suffix}` : `/admin/collectors/jerseys${suffix}`;

    const request =
      table === "user"
        ? apiFetch<AdminCollectorList>(path, { token }).then((body) => {
            if (cancelled) {
              return;
            }
            setUsers(adminCollectorListSchema.parse(body));
            setJerseys(null);
          })
        : apiFetch<AdminCollectorJerseyIndex>(path, { token }).then((body) => {
            if (cancelled) {
              return;
            }
            setJerseys(adminCollectorJerseyIndexSchema.parse(body));
            setUsers(null);
          });

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
  }, [token, query, table, offersActive]);

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
  const recordCount =
    table === "user"
      ? users
        ? `${users.total} ${tableLabel(table).toLowerCase()}`
        : loading
          ? "Loading…"
          : "0 users"
      : jerseys
        ? `${jerseys.total} ${tableLabel(table).toLowerCase()}`
        : loading
          ? "Loading…"
          : "0 jerseys";

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
              aria-pressed={!offersActive && table === entityType}
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
            aria-pressed={offersActive}
            onClick={() => navigate("/collectors/offers")}
          >
            Offers
          </button>
        </fieldset>
        <span className="record-count">{offersActive ? "Offer settings" : recordCount}</span>
      </div>

      {offersActive ? null : error ? <div className="banner-error">{error}</div> : null}

      {offersActive ? null : (
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
              ) : (
                <tr>
                  <th className="data-table-mark" scope="col">
                    Thumb
                  </th>
                  <th scope="col">Club</th>
                  <th scope="col">Season</th>
                  <th scope="col">Type</th>
                  <th scope="col">User</th>
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
      )}
    </div>
  );
}
