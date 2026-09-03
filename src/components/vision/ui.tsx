import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react";

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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-7 sm:gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[1.6rem] font-semibold leading-[1.15] text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[0.875rem] leading-relaxed text-muted-foreground sm:mt-2.5 sm:text-[0.95rem]">
            {description}
          </p>
        )}
      </div>
      {/* On a phone the actions take the full width and split it evenly, so
          they are thumb-sized instead of two chips squeezed at the right. */}
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
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
        "p-4 sm:p-6",
        // A tone is a hint, not an alarm. A full-strength amber outline around
        // a whole card reads as an error state; a soft edge with a trace of
        // warmth in the surface says "worth a look" without shouting.
        tone === "warning" && "border-warning/25 bg-warning/[0.045]",
        tone === "success" && "border-success/22 bg-success/[0.035]",
        className,
      )}
    >
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row">
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
        {actions && (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
            {actions}
          </div>
        )}
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

/**
 * A number worth looking at.
 *
 * The card lifts toward the pointer only when it actually goes somewhere. A
 * surface that rises to meet you and then does nothing when you click it is a
 * promise the interface does not keep, and those are the details that quietly
 * cost trust.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
  tone?: "default" | "warning" | "success" | "danger" | undefined;
  icon?: typeof Inbox | undefined;
  /** Where this number lives in full. Given one, the whole card is the link. */
  to?: string | undefined;
}) {
  const toneClass = {
    default: "text-foreground",
    warning: "text-warning",
    success: "text-success",
    danger: "text-destructive",
  }[tone];

  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {/* Small type gets tracking back - it is read at a glance, not word by
            word, and the body's negative tracking closes it up. */}
        <p className="text-[0.78rem] font-medium tracking-[0.004em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            // Large numerals tighten as they grow, the way Apple's optical
            // sizing does. tabular-nums so a ticking value never re-flows.
            // A step down on a phone so two cards fit across without a money
            // value wrapping mid-figure.
            // Sized so a formatted money value fits a half-width card on a
            // phone without breaking across two lines mid-figure.
            "mt-1.5 whitespace-nowrap text-[1.3rem] font-semibold leading-[1] tabular-nums tracking-[-0.03em] sm:text-[2.125rem] sm:tracking-[-0.035em]",
            toneClass,
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-2 line-clamp-2 text-[0.75rem] leading-snug tracking-[0.004em] text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      {Icon && (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--mat-thick)]",
            tone !== "default" && toneClass,
          )}
        >
          <Icon
            className={cn("h-4 w-4", tone === "default" && "text-muted-foreground")}
            strokeWidth={1.7}
          />
        </span>
      )}
    </div>
  );

  if (!to) {
    return (
      <Glass material="regular" className="p-5">
        {body}
      </Glass>
    );
  }

  return (
    <Link to={to} className="focus-spatial block rounded-[var(--radius-2xl)]">
      <Glass material="regular" interactive className="p-5">
        {body}
      </Glass>
    </Link>
  );
}

/**
 * A bar that says how far through something you are.
 *
 * Status is one of the four kinds of feedback an interface owes you, and a
 * count alone ("12 to mark") does not say whether that is nearly done or barely
 * started. The fill is a transform rather than a width, so it animates on the
 * compositor instead of forcing layout on every change.
 */
export function Meter({
  value,
  total,
  tone = "default",
  label,
}: {
  value: number;
  total: number;
  tone?: "default" | "warning" | "success" | undefined;
  label?: string | undefined;
}) {
  const fraction = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
  const fill = {
    default: "bg-primary",
    warning: "bg-warning",
    success: "bg-success",
  }[tone];

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-baseline justify-between gap-3 text-[0.75rem] tracking-[0.004em] text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums">
            {value} / {total}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label ?? "Progress"}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--mat-thick)] shadow-[inset_0_1px_0_0_var(--edge-top)]"
      >
        <div
          className={cn("h-full w-full origin-left rounded-full", fill)}
          style={{
            transform: `scaleX(${fraction})`,
            transition: "transform var(--dur-slow) var(--ease-out)",
          }}
        />
      </div>
    </div>
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
    "lead:new": "info",
    "lead:contacted": "neutral",
    "lead:nurturing": "neutral",
    "lead:trial_booked": "warning",
    "lead:converted": "success",
    "lead:lost": "muted",
    "trial:proposed": "neutral",
    "trial:scheduled": "info",
    "trial:attended": "success",
    "trial:no_show": "warning",
    "trial:converted": "success",
    "trial:declined": "muted",
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
 * exception to the glass rule - see the note at the top of this file.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="glass glass--solid scroll-x rounded-2xl">
      {/* min-w keeps the columns readable rather than letting them squeeze to
          nothing; the shell scrolls sideways instead. */}
      <table className="table-zebra w-full min-w-[36rem] text-sm">{children}</table>
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
  colSpan,
}: {
  children?: ReactNode | undefined;
  className?: string | undefined;
  /** For a row that spans the table, such as a group heading inside a body. */
  colSpan?: number | undefined;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-[var(--edge)] px-3.5 py-2.5 align-middle last:border-b-0",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ==========================================================================
 * SORTING
 *
 * Tables long enough to need sorting appear in several places, so the rule
 * lives here once: a header you click cycles ascending, descending, and back
 * to the table's own order. Comparison is by a value the caller extracts, not
 * by the rendered cell - a date column sorts by its timestamp, not by the text
 * "3 Sept".
 * ======================================================================= */

export type SortDirection = "asc" | "desc";

export type SortState = { key: string; direction: SortDirection } | null;

/** What a column sorts by. `null`/`undefined` always sort last, either way. */
export type SortValue = string | number | null | undefined;

export function compareSortValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-AU", { numeric: true, sensitivity: "base" });
}

/**
 * Sorted rows, and the header state that drives them.
 *
 * `accessors` maps a column key to the value that column sorts by. Rows come
 * back untouched when nothing is selected, so a table keeps whatever order the
 * query gave it until someone asks for another.
 */
export function useTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => SortValue>,
  initial: SortState = null,
) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    const accessor = sort ? accessors[sort.key] : undefined;
    if (!sort || !accessor) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    // Sorting a copy: the query cache owns the array that came in.
    return [...rows].sort((a, b) => compareSortValues(accessor(a), accessor(b)) * factor);
    // `accessors` is rebuilt every render by callers; the keys are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  /** Click a header: ascending, then descending, then back to no sort. */
  const toggle = (key: string) =>
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });

  return { rows: sorted, sort, toggle, setSort };
}

/** A column header you can click to sort by. */
export function SortableTh({
  children,
  sortKey,
  sort,
  onToggle,
  className,
  align = "left",
}: {
  children: ReactNode;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  className?: string | undefined;
  align?: "left" | "right" | undefined;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <Th className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`Sort by ${typeof children === "string" ? children : sortKey}`}
        // aria-sort belongs on the th, but the th is this component's own
        // wrapper - so the live state is announced through the label instead.
        title={
          active
            ? `Sorted ${sort.direction === "asc" ? "ascending" : "descending"} - click to ${
                sort.direction === "asc" ? "reverse" : "clear"
              }`
            : "Click to sort"
        }
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 px-3.5 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-[0.1em] transition-colors focus-spatial",
          align === "right" && "justify-end",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="truncate">{children}</span>
        <Icon
          className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-45")}
          strokeWidth={2.2}
        />
      </button>
    </Th>
  );
}
