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
import { CatalogMark } from "../components/CatalogMark.js";
import { FiltersSheet } from "../components/FiltersSheet.js";

const PAGE_SIZE = 50;

type MasterDataTable = (typeof ADMIN_STAMDATA_LIST_ENTITY_TYPES)[number];

function tableLabel(table: MasterDataTable): string {
  switch (table) {
    case "club":
      return "Clubs";
    case "league":
      return "Leagues";
    case "player":
      return "Players";
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function tableSearchPlaceholder(table: MasterDataTable): string {
  switch (table) {
    case "club":
      return "Search clubs";
    case "league":
      return "Search leagues";
    case "player":
      return "Search players";
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

function filterFacets(table: MasterDataTable): Array<"country" | "league"> {
  switch (table) {
    case "league":
      return ["country"];
    case "club":
    case "player":
      return ["country", "league"];
    default: {
      const exhaustive: never = table;
      return exhaustive;
    }
  }
}

export function MasterDataPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { search, setSearch, setSearchPlaceholder } = useAdminChrome();
  const [table, setTable] = useState<MasterDataTable>("club");
  const [filters, setFilters] = useState<AdminStamdataQuery>({});
  const [filterOptions, setFilterOptions] = useState<AdminFilterOptions | null>(null);
  const [rows, setRows] = useState<AdminStamdataList | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

  const query = useMemo(
    () => ({
      ...filters,
      q: search.trim() || undefined,
      entityType: table,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [filters, search, table, page],
  );

  useEffect(() => {
    setSearchPlaceholder(tableSearchPlaceholder(table));
  }, [setSearchPlaceholder, table]);

  useEffect(() => {
    setPage(0);
  }, [search, table, filters]);

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
      if (value === undefined || value === "") {
        continue;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }
        params.set(key, value.join(","));
        continue;
      }
      params.set(key, String(value));
    }
    apiFetch<AdminStamdataList>(`/admin/catalog/stamdata?${params.toString()}`, { token })
      .then((body) => {
        setRows(adminStamdataListSchema.parse(body));
        setFocusedRowIndex(0);
        setError(null);
      })
      .catch((fetchError) => {
        setRows(null);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load master data");
      })
      .finally(() => setLoading(false));
  }, [token, query]);

  function clearFilters() {
    setFilters({});
    setSearch("");
    setPage(0);
  }

  function openRow(row: AdminStamdataRow) {
    if (row.entityType === "club") {
      navigate(`/stamdata/clubs/${row.id}`);
      return;
    }
    if (row.entityType === "league") {
      navigate(`/stamdata/leagues/${row.id}`);
      return;
    }
    if (row.entityType === "player") {
      navigate(`/stamdata/players/${row.id}`);
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

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = ADMIN_STAMDATA_LIST_ENTITY_TYPES.indexOf(table);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = ADMIN_STAMDATA_LIST_ENTITY_TYPES[currentIndex + 1];
      if (next) {
        setTable(next);
        setPage(0);
        setFocusedRowIndex(0);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const previous = ADMIN_STAMDATA_LIST_ENTITY_TYPES[currentIndex - 1];
      if (previous) {
        setTable(previous);
        setPage(0);
        setFocusedRowIndex(0);
      }
    }
  }

  // Ratchet: ADMIN_STAMDATA_LIST_ENTITY_TYPES must each have navigation in openRow above.
  void ADMIN_STAMDATA_LIST_ENTITY_TYPES;

  const hasCatalogFilters = Boolean(
    (filters.countryIds && filters.countryIds.length > 0) ||
      (filters.leagueIds && filters.leagueIds.length > 0),
  );
  const hasActiveFilters = Boolean(hasCatalogFilters || search.trim());
  const visibleRows = rows?.rows ?? [];
  const total = rows?.total ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const canPrev = page > 0;
  const canNext = pageEnd < total;

  const recordCountLabel = loading
    ? "Loading…"
    : total === 0
      ? `0 ${tableLabel(table).toLowerCase()}`
      : `${pageStart}–${pageEnd} of ${total} ${tableLabel(table).toLowerCase()}`;

  return (
    <div className="list-page">
      <div className="toolbar toolbar--table">
        <div
          className="toolbar-tabs"
          role="tablist"
          aria-label="Master Data tables"
          onKeyDown={handleTabKeyDown}
        >
          {ADMIN_STAMDATA_LIST_ENTITY_TYPES.map((entityType) => (
            <button
              key={entityType}
              type="button"
              className="top-tab"
              role="tab"
              aria-selected={table === entityType}
              tabIndex={table === entityType ? 0 : -1}
              onClick={() => {
                setTable(entityType);
                setPage(0);
                setFocusedRowIndex(0);
              }}
            >
              {tableLabel(entityType)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn icon-btn--toolbar"
          aria-label={hasCatalogFilters ? "Filters on" : "Filters"}
          aria-pressed={hasCatalogFilters}
          onClick={() => setFiltersOpen(true)}
        >
          <FilterIcon />
        </button>
      </div>

      {error ? <div className="banner-error">{error}</div> : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-table-mark" scope="col">
                Mark
              </th>
              <th scope="col">Name</th>
              <th scope="col">Country</th>
              {table === "player" ? <th scope="col">Born</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={table === "player" ? 4 : 3}>
                  <div className="empty-state data-table-empty">Loading master data…</div>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={table === "player" ? 4 : 3}>
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
                    <CatalogMark
                      markPath={row.markPath}
                      monogram={row.monogram ?? "?"}
                      token={token}
                    />
                  </td>
                  <td className="data-table-primary">{row.label}</td>
                  <td className="data-table-meta">{row.countryLabel ?? "—"}</td>
                  {table === "player" ? (
                    <td className="data-table-mono">{row.dateOfBirth ?? "—"}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <span className="record-count" aria-live="polite">
          {recordCountLabel}
        </span>
        <div className="table-pagination-actions">
          <button
            type="button"
            className="btn btn-tertiary"
            disabled={!canPrev || loading}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-tertiary"
            disabled={!canNext || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {filterOptions ? (
        <FiltersSheet
          open={filtersOpen}
          options={filterOptions}
          value={filters}
          facets={filterFacets(table)}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setFilters(next);
            setPage(0);
          }}
        />
      ) : null}
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h11L9.75 8.25v3.5L6.25 13.5V8.25L2.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
