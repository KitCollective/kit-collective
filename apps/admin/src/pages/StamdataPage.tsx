import {
  ADMIN_STAMDATA_LIST_ENTITY_TYPES,
  type AdminFilterOptions,
  type AdminStamdataList,
  type AdminStamdataQuery,
  type AdminStamdataRow,
  adminFilterOptionsSchema,
  adminStamdataListSchema,
} from "@kit/api-contract";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { FiltersSheet } from "../components/FiltersSheet.js";

export function StamdataPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<AdminStamdataQuery>({});
  const [filterOptions, setFilterOptions] = useState<AdminFilterOptions | null>(null);
  const [rows, setRows] = useState<AdminStamdataList | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      ...filters,
      q: search.trim() || undefined,
    }),
    [filters, search],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    apiFetch<AdminFilterOptions>("/admin/catalog/filter-options", { token })
      .then((body) => setFilterOptions(adminFilterOptionsSchema.parse(body)))
      .catch(() => setFilterOptions(null));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) {
        params.set(key, String(value));
      }
    }
    apiFetch<AdminStamdataList>(`/admin/catalog/stamdata?${params.toString()}`, { token })
      .then((body) => {
        setRows(adminStamdataListSchema.parse(body));
        setError(null);
      })
      .catch((fetchError) => {
        setRows(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load stamdata");
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  function clearFilters() {
    setFilters({});
    setSearch("");
  }

  function openRow(row: AdminStamdataRow) {
    if (row.entityType === "kit") {
      navigate(`/stamdata/kits/${row.id}`);
      return;
    }
    if (row.entityType === "club") {
      navigate(`/stamdata/clubs/${row.id}`);
      return;
    }
    if (row.entityType === "season") {
      navigate(`/stamdata/seasons/${row.id}`);
      return;
    }
    if (row.entityType === "club_season" && row.clubId && row.seasonId) {
      navigate(`/stamdata/club-seasons/${row.clubId}/${row.seasonId}`);
    }
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    row: AdminStamdataRow,
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
      const next = rowElements.item(rowIndex + 1);
      if (next instanceof HTMLTableRowElement) {
        next.focus();
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const previous = rowElements.item(rowIndex - 1);
      if (previous instanceof HTMLTableRowElement) {
        previous.focus();
      }
    }
  }

  // Ratchet: ADMIN_STAMDATA_LIST_ENTITY_TYPES must each have navigation in openRow above.
  void ADMIN_STAMDATA_LIST_ENTITY_TYPES;

  const hasActiveFilters = Boolean(
    filters.countryId ||
      filters.leagueId ||
      filters.seasonId ||
      filters.kitType ||
      filters.hasPhoto ||
      search.trim(),
  );

  return (
    <>
      <div className="toolbar">
        <input
          className="search-field"
          type="search"
          placeholder="Search clubs, kits, or collectors"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search stamdata"
        />
        <button type="button" className="btn btn-secondary" onClick={() => setFiltersOpen(true)}>
          Filters
        </button>
        <span className="record-count">
          {rows ? `${rows.total} records` : loading ? "Loading…" : "0 records"}
        </span>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      {loading ? (
        <div className="empty-state">Loading stamdata…</div>
      ) : !rows || rows.rows.length === 0 ? (
        <div className="empty-state">
          <h2>No records match</h2>
          <p>Try a different search or clear your filters.</p>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-tertiary" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Mark</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Season</th>
                <th scope="col">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.rows.map((row, rowIndex) => (
                <tr
                  key={`${row.entityType}:${row.id}`}
                  tabIndex={0}
                  onClick={() => openRow(row)}
                  onKeyDown={(event) => handleRowKeyDown(event, row, rowIndex)}
                >
                  <td>
                    {row.entityType === "kit" ? (
                      row.photoPath && token ? (
                        <span className="thumb-slot">
                          <AuthenticatedImage path={row.photoPath} token={token} />
                        </span>
                      ) : (
                        <span className="thumb-slot" aria-hidden />
                      )
                    ) : (
                      <span className="monogram-slot">{row.monogram ?? "?"}</span>
                    )}
                  </td>
                  <td>{row.label}</td>
                  <td>
                    {row.entityType === "kit" ? row.kitType : row.entityType.replace("_", " ")}
                  </td>
                  <td>{row.seasonLabel ?? "—"}</td>
                  <td>
                    {row.entityType === "club_season" && row.squadCount !== undefined
                      ? `${row.squadCount} players`
                      : row.hasPhoto === false
                        ? "No photo"
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filterOptions ? (
        <FiltersSheet
          open={filtersOpen}
          options={filterOptions}
          value={filters}
          onClose={() => setFiltersOpen(false)}
          onApply={setFilters}
        />
      ) : null}
    </>
  );
}
