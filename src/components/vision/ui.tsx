import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
}: {
  title: string;
  description?: string | undefined;
  count?: number | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  tone?: "default" | "warning" | "success" | undefined;
}) {
  return (
    <Card
      className={cn(
        tone === "warning" && "border-warning/50",
        tone === "success" && "border-success/40",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {title}
            {count !== undefined && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {count}
              </span>
            )}
          </CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground/60" />
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

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-3xl font-semibold tabular-nums tracking-tight", toneClass)}>
            {value}
          </p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground/70" />}
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
    <Badge variant="outline" className={cn("font-medium", TONE_CLASS[tone], className)}>
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
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
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
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="text-warning-foreground">{children}</div>
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
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
        "whitespace-nowrap border-b bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
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
  return <td className={cn("border-b px-3 py-2 align-middle", className)}>{children}</td>;
}
