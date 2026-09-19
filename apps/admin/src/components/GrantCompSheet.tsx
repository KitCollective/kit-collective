import { type FormEvent, useEffect, useRef } from "react";

type GrantCompSheetProps = {
  open: boolean;
  expires: string;
  onExpiresChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  error?: string | null;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function GrantCompSheet({
  open,
  expires,
  onExpiresChange,
  onClose,
  onSave,
  saving = false,
  error = null,
}: GrantCompSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
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
  }, [open, onClose, saving]);

  if (!open) {
    return null;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onSave();
  }

  return (
    <div className="sheet-layer">
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Close grant comp form"
        onClick={onClose}
        disabled={saving}
      />
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Grant comp"
      >
        <h2>Grant comp</h2>
        <p className="type-body">Set premium access expiry for this collector.</p>
        {error ? <div className="banner-error">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="grant-comp-expires">Expires</label>
            <input
              id="grant-comp-expires"
              type="datetime-local"
              value={expires}
              onChange={(event) => onExpiresChange(event.target.value)}
              required
              disabled={saving}
            />
          </div>
          <div className="toolbar">
            <button type="button" className="btn btn-tertiary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
