import {
  type AdminCollectorList,
  type AdminCollectorRow,
  adminCollectorListSchema,
} from "@kit/api-contract";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";

export function CollectorsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminCollectorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

  const query = useMemo(() => ({ q: search.trim() || undefined }), [search]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (query.q) {
      params.set("q", query.q);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    apiFetch<AdminCollectorList>(`/admin/collectors${suffix}`, { token })
      .then((body) => {
        setRows(adminCollectorListSchema.parse(body));
        setFocusedRowIndex(0);
        setError(null);
      })
      .catch((fetchError) => {
        setRows(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load collectors");
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  function openRow(row: AdminCollectorRow) {
    navigate(`/collectors/${row.id}`);
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    row: AdminCollectorRow,
    rowIndex: number,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(row);
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

  return (
    <>
      <div className="toolbar">
        <input
          className="search-field"
          type="search"
          placeholder="Search collectors"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search collectors"
        />
        <span className="record-count">
          {rows ? `${rows.total} collectors` : loading ? "Loading…" : "0 collectors"}
        </span>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Mark</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Jerseys</th>
              <th scope="col">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state data-table-empty">Loading collectors…</div>
                </td>
              </tr>
            ) : !rows || rows.rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state data-table-empty">
                    <h2>No collectors yet</h2>
                    <p>Registered users will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onClick={() => openRow(row)}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                  onKeyDown={(event) => handleRowKeyDown(event, row, rowIndex)}
                >
                  <td>
                    <span className="monogram-slot">{row.monogram}</span>
                  </td>
                  <td>{row.email}</td>
                  <td>{row.role}</td>
                  <td>{row.jerseyCount}</td>
                  <td>{formatDate(row.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
