import type { AdminFilterOptions, AdminStamdataQuery } from "@kit/api-contract";
import { useEffect, useRef, useState } from "react";

type FiltersSheetProps = {
  open: boolean;
  options: AdminFilterOptions;
  value: AdminStamdataQuery;
  onClose: () => void;
  onApply: (next: AdminStamdataQuery) => void;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function FiltersSheet({ open, options, value, onClose, onApply }: FiltersSheetProps) {
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

  function toggleHasPhoto(next: "true" | "false" | undefined) {
    setDraft((current) => ({
      ...current,
      hasPhoto: current.hasPhoto === next ? undefined : next,
    }));
  }

  return (
    <div className="sheet-layer">
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <h2>Filters</h2>

        <h3>Country</h3>
        <div className="chip-group">
          {options.countries.map((country) => (
            <button
              key={country.id}
              type="button"
              className="chip"
              aria-pressed={draft.countryId === country.id}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  countryId: current.countryId === country.id ? undefined : country.id,
                }))
              }
            >
              {country.label}
            </button>
          ))}
        </div>

        <h3>League</h3>
        <div className="chip-group">
          {options.leagues.map((league) => (
            <button
              key={league.id}
              type="button"
              className="chip"
              aria-pressed={draft.leagueId === league.id}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  leagueId: current.leagueId === league.id ? undefined : league.id,
                }))
              }
            >
              {league.label}
            </button>
          ))}
        </div>

        <h3>Season</h3>
        <div className="chip-group">
          {options.seasons.map((season) => (
            <button
              key={season.id}
              type="button"
              className="chip"
              aria-pressed={draft.seasonId === season.id}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  seasonId: current.seasonId === season.id ? undefined : season.id,
                }))
              }
            >
              {season.label}
            </button>
          ))}
        </div>

        <h3>Kit type</h3>
        <div className="chip-group">
          {options.kitTypes.map((kitType) => (
            <button
              key={kitType}
              type="button"
              className="chip"
              aria-pressed={draft.kitType === kitType}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  kitType: current.kitType === kitType ? undefined : kitType,
                }))
              }
            >
              {kitType}
            </button>
          ))}
        </div>

        <h3>Has photo</h3>
        <div className="chip-group">
          <button
            type="button"
            className="chip"
            aria-pressed={draft.hasPhoto === "true"}
            onClick={() => toggleHasPhoto("true")}
          >
            Yes
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={draft.hasPhoto === "false"}
            onClick={() => toggleHasPhoto("false")}
          >
            No
          </button>
        </div>

        <div className="toolbar">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-primary--auto"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
