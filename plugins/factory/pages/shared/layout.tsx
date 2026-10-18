// The pieces several pages are built from.
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { PANEL } from "./common";

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-3xl px-4 pb-8 pt-3 md:px-5 md:pt-4">
        {children}
      </div>
    </div>
  );
}

export function Problem({ message }: { message: string | null }) {
  return message === null ? null : (
    <p role="alert" className="mt-3 text-sm text-destructive">
      {message}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One form control under its label; the control gets the id the label points at. */
export function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="mt-3 block text-sm">
      <label htmlFor={id} className="mb-1 block text-foreground">
        {label}
      </label>
      {cloneElement(children, { id })}
      {hint === undefined ? null : (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

/** A checkbox and the label text that toggles it. */
export function CheckboxRow({
  checked,
  onCheckedChange,
  className,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2 text-sm", className)}>
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <label htmlFor={id}>{children}</label>
    </div>
  );
}

export function Back({ to, label }: { to: string; label: string }) {
  const navigate = useBbNavigate();
  return (
    <button
      type="button"
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      onClick={() => navigate.toPluginPanel(PANEL, { subPath: to })}
    >
      <Icon name="ChevronLeft" className="size-4" />
      {label}
    </button>
  );
}

export function Rows({ rows, empty }: { rows: ReactNode[]; empty: string }) {
  return rows.length === 0 ? (
    <p className="text-sm text-muted-foreground">{empty}</p>
  ) : (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {rows.map((row, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-2 text-sm">
          {row}
        </li>
      ))}
    </ul>
  );
}
