import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow = "Vision Admin",
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  eyebrow?: string | undefined;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="spatial-kicker mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="h-3 w-3" />
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
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
    <Card
      className={cn(
        "group/section overflow-hidden",
        tone === "warning" && "border-warning/40",
        tone === "success" && "border-success/35",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-5 pb-4 sm:p-6 sm:pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {title}
            {count !== undefined && (
              <span className="rounded-full border border-white/30 bg-muted/65 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                {count}
              </span>
            )}
          </CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">{children}</CardContent>
    </Card>
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-foreground/15 bg-background/20 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/35 bg-muted/55 shadow-sm backdrop-blur-xl">
        <Icon className="h-5 w-5 text-muted-foreground/70" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
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
  const glowClass = {
    default: "bg-primary/20",
    warning: "bg-warning/25",
    success: "bg-success/20",
    danger: "bg-destructive/20",
  }[tone];

  return (
    <Card className="group relative overflow-hidden">
      <div
        className={cn(
          "pointer-events-none absolute -right-7 -top-9 h-28 w-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-125",
          glowClass,
        )}
      />
      <CardContent className="relative flex items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn("mt-2 text-3xl font-semibold tabular-nums tracking-[-0.04em]", toneClass)}
          >
            {value}
          </p>
          {hint && <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-background/35 text-primary shadow-sm backdrop-blur-xl transition-transform duration-300 group-hover:scale-105">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/20 text-warning-foreground border-warning/40",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
  muted: "bg-muted text-muted-foreground",
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
    <Badge
      variant="outline"
      className={cn("rounded-full px-2.5 py-1 font-medium shadow-sm", TONE_CLASS[tone], className)}
    >
      {children}
    </Badge>
  );
}

/** One place decides what colour a status is, so the whole app agrees. */
export function toneForStatus(kind: string, value: string | null | undefined): BadgeTone {
  if (!value) return "muted";
  const key = `${kind}:${value}`;
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
  return map[key] ?? "neutral";
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
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/60 shadow-sm"
        style={{ backgroundColor: colour ?? "transparent" }}
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
    <div className="flex items-start gap-2 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm backdrop-blur-xl">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="text-warning-foreground">{children}</div>
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/45 bg-background/18 shadow-[inset_0_1px_0_oklch(1_0_0/22%)]">
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
        "whitespace-nowrap border-b border-white/35 bg-muted/35 px-3.5 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
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
    <td className={cn("border-b border-white/30 px-3.5 py-3 align-middle", className)}>
      {children}
    </td>
  );
}
