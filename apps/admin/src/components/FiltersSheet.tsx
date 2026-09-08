import type { AdminFilterOption, AdminFilterOptions, AdminStamdataQuery } from "@kit/api-contract";
import { useEffect, useId, useRef, useState } from "react";

export type FilterFacet = "country" | "league";

type FiltersSheetProps = {
  open: boolean;
  options: AdminFilterOptions;
  value: AdminStamdataQuery;
  facets: FilterFacet[];
  onClose: () => void;
  onApply: (next: AdminStamdataQuery) => void;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function FilterCombobox({
  label,
  options,
  selectedIds,
  searchPlaceholder,
  emptyLabel,
  onChange,
}: {
  label: string;
  options: AdminFilterOption[];
  selectedIds: string[];
  searchPlaceholder: string;
  emptyLabel: string;
  onChange: (ids: string[]) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  const selectedLabels = options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
  const summary =
    selectedLabels.length === 0
      ? emptyLabel
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels[0]} +${selectedLabels.length - 1}`;

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    searchRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle(id: string) {
    onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  return (
    <section className="filter-facet" ref={rootRef}>
      <h3>{label}</h3>
      <button
        type="button"
        className="filter-combobox-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selectedLabels.length === 0 ? "filter-combobox-placeholder" : undefined}>
          {summary}
        </span>
        <span className="filter-combobox-chevron" aria-hidden="true">
          <ChevronGlyph />
        </span>
      </button>
      {open ? (
        <div className="filter-combobox-menu">
          <label className="filter-search-wrap">
            <span className="filter-search-icon" aria-hidden="true">
              <SearchGlyph />
            </span>
            <input
              ref={searchRef}
              className="filter-search"
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={searchPlaceholder}
            />
          </label>
          <ul className="filter-option-list" id={listId}>
            {visible.length === 0 ? (
              <li className="filter-option-empty">No matches</li>
            ) : (
              visible.map((option) => {
                const isSelected = selected.has(option.id);
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      className="filter-option"
                      aria-pressed={isSelected}
                      onClick={() => toggle(option.id)}
                    >
                      <span className="filter-option-mark" aria-hidden="true">
                        {isSelected ? <CheckGlyph /> : null}
                      </span>
                      <span className="filter-option-label">{option.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function FiltersSheet({
  open,
  options,
  value,
  facets,
  onClose,
  onApply,
}: FiltersSheetProps) {
  const [draft, setDraft] = useState(value);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (element) => !element.hasAttribute("disabled"),
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        event.preventDefault();
        first?.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="sheet-layer sheet-layer--end">
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="sheet-panel sheet-panel--end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-sheet-title"
      >
        <div className="sheet-panel-header">
          <h2 id="filters-sheet-title">Filters</h2>
          <button type="button" className="icon-btn" aria-label="Close filters" onClick={onClose}>
            <CloseGlyph />
          </button>
        </div>

        <div className="sheet-panel-body">
          {facets.includes("country") ? (
            <FilterCombobox
              label="Country"
              options={options.countries}
              selectedIds={draft.countryIds ?? []}
              searchPlaceholder="Search countries"
              emptyLabel="Any country"
              onChange={(countryIds) =>
                setDraft((current) => ({
                  ...current,
                  countryIds: countryIds.length > 0 ? countryIds : undefined,
                }))
              }
            />
          ) : null}

          {facets.includes("league") ? (
            <FilterCombobox
              label="League"
              options={options.leagues}
              selectedIds={draft.leagueIds ?? []}
              searchPlaceholder="Search leagues"
              emptyLabel="Any league"
              onChange={(leagueIds) =>
                setDraft((current) => ({
                  ...current,
                  leagueIds: leagueIds.length > 0 ? leagueIds : undefined,
                }))
              }
            />
          ) : null}
        </div>

        <div className="sheet-panel-footer">
          <button type="button" className="btn btn-tertiary" onClick={() => setDraft({})}>
            Clear
          </button>
          <div className="sheet-panel-footer-actions">
            <button type="button" className="btn btn-tertiary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-primary--auto"
              onClick={() => {
                onApply({
                  countryIds: draft.countryIds,
                  leagueIds: facets.includes("league") ? draft.leagueIds : undefined,
                });
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5 13.25 13.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2 6.25 4.75 9 10 3.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4 12 12M12 4 4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6.25 8 10.25 12 6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
