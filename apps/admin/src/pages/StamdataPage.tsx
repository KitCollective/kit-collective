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
import { useAdminChrome } from "../components/AdminShell.js";
import { AuthenticatedImage } from "../components/AuthenticatedImage.js";
import { FiltersSheet } from "../components/FiltersSheet.js";

type StamdataTable = (typeof ADMIN_STAMDATA_LIST_ENTITY_TYPES)[number];

function tableLabel(table: StamdataTable): string {
  switch (table) {
    case "club":
      return "Clubs";
    case "season":
      return "Seasons";
    case "club_season":
      return "Club seasons";
    case "kit":
      return "Kits";
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function tableSearchPlaceholder(table: StamdataTable): string {
  switch (table) {
    case "club":
      return "Search clubs";
    case "season":
      return "Search seasons";
    case "club_season":
      return "Search club seasons";
    case "kit":
      return "Search kits";
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function columnCount(table: StamdataTable): number {
  switch (table) {
    case "club":
    case "season":
      return 2;
    case "club_season":
      return 4;
    case "kit":
      return 5;
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

export function StamdataPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { search, setSearch, setSearchPlaceholder } = useAdminChrome();
  const [table, setTable] = useState<StamdataTable>("club");
  const [filters, setFilters] = useState<AdminStamdataQuery>({});
  const [filterOptions, setFilterOptions] = useState<AdminFilterOptions | null>(null);
  const [rows, setRows] = useState<AdminStamdataList | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

  const query = useMemo(
    () => ({
      ...filters,
      q: search.trim() || undefined,
    }),
    [filters, search],
  );

  useEffect(() => {
    setSearchPlaceholder(tableSearchPlaceholder(table));
  }, [setSearchPlaceholder, table]);

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
        setFocusedRowIndex(0);
        setError(null);
      })
      .catch((fetchError) => {
        setRows(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load stamdata");
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  const visibleRows = useMemo(
    () => (rows ? rows.rows.filter((row) => row.entityType === table) : []),
    [rows, table],
  );

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

  // Ratchet: ADMIN_STAMDATA_LIST_ENTITY_TYPES must each have navigation in openRow above.
  void ADMIN_STAMDATA_LIST_ENTITY_TYPES;

  const hasCatalogFilters = Boolean(
    filters.countryId ||
      filters.leagueId ||
      filters.seasonId ||
      filters.kitType ||
      filters.hasPhoto,
  );
  const hasActiveFilters = Boolean(hasCatalogFilters || search.trim());

  const columns = columnCount(table);

  return (
    <div className="list-page">
      <div className="toolbar">
        <div className="chip-group toolbar-chips" role="group" aria-label="Master Data tables">
          {ADMIN_STAMDATA_LIST_ENTITY_TYPES.map((entityType) => (
            <button
              key={entityType}
              type="button"
              className="chip"
              aria-pressed={table === entityType}
              onClick={() => {
                setTable(entityType);
                setFocusedRowIndex(0);
              }}
            >
              {tableLabel(entityType)}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={hasCatalogFilters}
            onClick={() => setFiltersOpen(true)}
          >
            Filters
          </button>
        </div>
        <span className="record-count">
          {loading ? "Loading…" : `${visibleRows.length} ${tableLabel(table).toLowerCase()}`}
        </span>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-table-mark" scope="col">
                {table === "kit" ? "Thumb" : "Mark"}
              </th>
              <th scope="col">Name</th>
              {table === "kit" ? <th scope="col">Type</th> : null}
              {table === "club_season" || table === "kit" ? <th scope="col">Season</th> : null}
              {table === "club_season" ? (
                <th className="data-table-numeric" scope="col">
                  Players
                </th>
              ) : null}
              {table === "kit" ? <th scope="col">Meta</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">Loading stamdata…</div>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns}>
                  <div className="empty-state data-table-empty">
                    <h2>No records match</h2>
                    <p>Try a different search or clear your filters.</p>
                    {hasActiveFilters ? (
                      <button type="button" className="btn btn-tertiary" onClick={clearFilters}>
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => (
                <tr
                  key={`${row.entityType}:${row.id}`}
                  tabIndex={rowIndex === focusedRowIndex ? 0 : -1}
                  onClick={() => openRow(row)}
                  onFocus={() => setFocusedRowIndex(rowIndex)}
                  onKeyDown={(event) => handleRowKeyDown(event, row, rowIndex)}
                >
                  <td className="data-table-mark">
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
                  <td className="data-table-primary">{row.label}</td>
                  {table === "kit" ? (
                    <td className="data-table-mono">{row.kitType ?? "—"}</td>
                  ) : null}
                  {table === "club_season" || table === "kit" ? (
                    <td className="data-table-mono">{row.seasonLabel ?? "—"}</td>
                  ) : null}
                  {table === "club_season" ? (
                    <td className="data-table-mono data-table-numeric">
                      {row.squadCount !== undefined ? `${row.squadCount} players` : "—"}
                    </td>
                  ) : null}
                  {table === "kit" ? (
                    <td className="data-table-meta">{row.hasPhoto === false ? "No photo" : "—"}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filterOptions ? (
        <FiltersSheet
          open={filtersOpen}
          options={filterOptions}
          value={filters}
          onClose={() => setFiltersOpen(false)}
          onApply={setFilters}
        />
      ) : null}
    </div>
  );
}
