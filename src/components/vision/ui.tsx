import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Glass } from "@/components/vision/glass";

/**
 * The shared surfaces every screen is built from.
 *
 * Rule of thumb for material: chrome is sheer, data is solid. A table over
 * thin glass looks extraordinary in a screenshot and is unreadable after ten
 * minutes of marking a roll, so anything carrying rows gets `solid`.
 */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  eyebrow?: string | undefined;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[2rem] font-semibold leading-[1.1] text-foreground sm:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2.5 max-w-3xl text-[0.95rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  count,
  actions,
  children,
  tone,
  className,
}: {
  title: string;
  description?: string | undefined;
  count?: number | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  tone?: "default" | "warning" | "success" | undefined;
  className?: string | undefined;
}) {
  return (
    <Glass
      material="regular"
      className={cn(
        "p-5 sm:p-6",
        tone === "warning" && "border-warning/40",
        tone === "success" && "border-success/35",
        className,
      )}
    >
      <div className="mb-4 flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.015em]">
            {title}
            {count !== undefined && (
              <span className="rounded-full bg-[var(--mat-thick)] px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {count}
              </span>
            )}
          </h2>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Glass>
  );
}

/** Empty states say what to do next, never just "no records". */
export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  hint?: string | undefined;
  icon?: typeof Inbox | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--edge)] px-6 py-12 text-center">
      <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--mat-thick)]">
        <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{hint}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
  tone?: "default" | "warning" | "success" | "danger" | undefined;
  icon?: typeof Inbox | undefined;
}) {
  const toneClass = {
    default: "text-foreground",
    warning: "text-warning",
    success: "text-success",
    danger: "text-destructive",
  }[tone];

  return (
    <Glass material="regular" interactive className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8rem] font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1.5 text-[2rem] font-semibold leading-none tabular-nums tracking-[-0.03em]",
              toneClass,
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--mat-thick)]">
            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
          </span>
        )}
      </div>
    </Glass>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-[var(--mat-thick)] text-foreground/85 border-[var(--edge)]",
  success: "bg-success/16 text-success border-success/30",
  warning: "bg-warning/18 text-warning border-warning/35",
  danger: "bg-destructive/16 text-destructive border-destructive/32",
  info: "bg-info/16 text-info border-info/30",
  muted: "bg-[var(--mat-thin)] text-muted-foreground border-[var(--edge)]",
};

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium capitalize leading-5",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** One place decides what colour a status is, so the whole app agrees. */
export function toneForStatus(kind: string, value: string | null | undefined): BadgeTone {
  if (!value) return "muted";
  const map: Record<string, BadgeTone> = {
    "attendance:present": "success",
    "attendance:absent": "danger",
    "attendance:not_marked": "warning",
    "attendance:cancelled": "muted",
    "session:scheduled": "info",
    "session:completed": "success",
    "session:cancelled": "muted",
    "session:rescheduled": "warning",
    "enrolment:active": "success",
    "enrolment:trial": "info",
    "enrolment:closed": "muted",
    "charge:to_invoice": "warning",
    "charge:invoiced": "info",
    "charge:paid": "success",
    "charge:cancelled": "muted",
    "package:active": "success",
    "package:draft": "warning",
    "package:closed": "muted",
    "package:expired": "muted",
    "offering:active": "success",
    "offering:planned": "info",
    "offering:closed": "muted",
    "offering:cancelled": "muted",
    "person:active": "success",
    "person:inactive": "muted",
    "payout:paid": "success",
    "payout:approved": "info",
    "payout:draft": "warning",
    "makeup:outstanding": "danger",
    "makeup:scheduled": "info",
    "makeup:completed": "success",
  };
  return map[`${kind}:${value}`] ?? "neutral";
}

export function TutorDot({
  colour,
  name,
}: {
  colour?: string | null | undefined;
  name?: string | null | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-white/25"
        style={{
          backgroundColor: colour ?? "transparent",
          boxShadow: colour ? `0 0 10px -1px ${colour}` : undefined,
        }}
        aria-hidden
      />
      <span className="truncate">{name ?? "Unassigned"}</span>
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <span className="code-chip">{children}</span>;
}

export function WarningNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.8} />
      <div className="leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

/**
 * Tables sit on their own near-opaque surface. This is the deliberate
 * exception to the glass rule — see the note at the top of this file.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="glass glass--solid overflow-x-auto rounded-2xl">
      <table className="table-zebra w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-[var(--edge)] px-3.5 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <td
      className={cn(
        "border-b border-[var(--edge)] px-3.5 py-2.5 align-middle last:border-b-0",
        className,
      )}
    >
      {children}
    </td>
  );
}
