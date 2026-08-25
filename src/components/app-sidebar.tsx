import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardCheck,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  LogOut,
  Receipt,
  Settings,
  Sunrise,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getNeedsAttentionCount } from "@/lib/vision/overview.functions";
import type { StaffRole } from "@/lib/vision/types";
import { cn } from "@/lib/utils";

/**
 * The ornament.
 *
 * visionOS hangs navigation beside a window rather than inside it: a floating
 * glass rail, icons only, that widens to show labels when you look at it. A
 * pointer replaces the gaze, so it widens on hover instead.
 *
 * Icons are Lucide, already in the project. SF Symbols is the obvious visual
 * match but its licence does not permit use outside Apple platforms, so the
 * stroke weight here is tuned to sit close to it instead - see
 * docs/DESIGN-SYSTEM.md.
 */

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  badge?: boolean;
}

const OPERATE: NavItem[] = [
  { title: "Today", url: "/today", icon: Sunrise },
  { title: "Timetable", url: "/timetable", icon: CalendarDays },
  { title: "Attendance", url: "/roll", icon: ClipboardCheck },
  { title: "Class Builder", url: "/classes/new", icon: Wrench },
];

const MANAGE: NavItem[] = [
  { title: "Students & Families", url: "/students", icon: GraduationCap },
  { title: "Classes", url: "/classes", icon: LayoutGrid },
  { title: "Enrolments & Hours", url: "/enrolments", icon: Wallet },
  { title: "Tutors", url: "/tutors", icon: Users },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Tutor Pay", url: "/tutor-pay", icon: BadgeDollarSign, ownerOnly: true },
];

const UNDERSTAND: NavItem[] = [
  { title: "Needs Attention", url: "/needs-attention", icon: ListChecks, badge: true },
];

const CONFIGURE: NavItem[] = [
  { title: "Setup", url: "/setup", icon: Settings },
  { title: "Staff", url: "/staff", icon: UserCog, ownerOnly: true },
  { title: "Prototype", url: "/prototype/dashboard", icon: FlaskConical },
];

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Operate", items: OPERATE },
  { label: "Manage", items: MANAGE },
  { label: "Understand", items: UNDERSTAND },
  { label: "Configure", items: CONFIGURE },
];

export function AppSidebar({
  role,
  name,
  expanded,
  onExpandedChange,
}: {
  role: StaffRole;
  name: string;
  expanded: boolean;
  /** Lifted so the main content can make room instead of being covered. */
  onExpandedChange: (expanded: boolean) => void;
}) {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const { data: attention } = useQuery({
    queryKey: ["needs-attention-count"],
    queryFn: () => getNeedsAttentionCount(),
    refetchInterval: 120_000,
  });

  const isActive = (path: string) =>
    path === "/classes"
      ? currentPath === "/classes"
      : currentPath === path || currentPath.startsWith(`${path}/`);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <nav
      aria-label="Primary"
      onPointerEnter={() => onExpandedChange(true)}
      onPointerLeave={() => onExpandedChange(false)}
      onFocusCapture={() => onExpandedChange(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) onExpandedChange(false);
      }}
      data-expanded={expanded}
      style={{ transitionTimingFunction: "var(--ease-spatial)" }}
      className={cn(
        "ornament animate-ornament-in fixed left-3 top-1/2 z-40 flex max-h-[calc(100vh-1.5rem)] -translate-y-1/2 flex-col gap-1 overflow-y-auto overflow-x-hidden rounded-[2rem] p-2.5 transition-[width] duration-[320ms] lg:left-4",
        expanded ? "w-[15.5rem]" : "w-[4.25rem]",
      )}
    >
      {/* Identity */}
      <div className="mb-1 flex h-10 shrink-0 items-center gap-2.5 px-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-4 text-[0.8rem] font-bold text-primary-foreground shadow-[inset_0_1px_0_0_var(--edge-top)]">
          V
        </span>
        <span
          className={cn(
            "min-w-0 transition-opacity duration-200",
            expanded ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <span className="block truncate text-[0.82rem] font-semibold leading-tight">
            Vision CRM
          </span>
          <span className="block truncate text-[0.68rem] capitalize text-muted-foreground">
            {name} · {role}
          </span>
        </span>
      </div>

      {GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.ownerOnly || role === "owner");
        if (items.length === 0) return null;

        return (
          <div key={group.label} className="shrink-0">
            <p
              className={cn(
                "overflow-hidden px-3 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-all duration-200",
                expanded ? "mb-0.5 mt-1.5 h-3.5 opacity-100" : "mt-1 h-0 opacity-0",
              )}
            >
              {group.label}
            </p>

            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isActive(item.url);
                const count = item.badge ? (attention?.count ?? 0) : 0;

                return (
                  <li key={item.url}>
                    <Link
                      to={item.url}
                      data-active={active}
                      title={expanded ? undefined : item.title}
                      className="ornament-item focus-spatial flex h-10 items-center gap-3 px-[0.6875rem]"
                    >
                      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                        <item.icon
                          className={cn(
                            "h-[1.15rem] w-[1.15rem] transition-colors",
                            active ? "text-primary" : "text-foreground/70",
                          )}
                          strokeWidth={active ? 2.1 : 1.7}
                        />
                        {/* Collapsed, the badge becomes a dot on the icon. */}
                        {count > 0 && !expanded && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning ring-2 ring-[var(--mat-thick)]" />
                        )}
                      </span>

                      <span
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 transition-opacity duration-200",
                          expanded ? "opacity-100" : "pointer-events-none opacity-0",
                        )}
                      >
                        <span
                          className={cn(
                            "truncate text-[0.83rem]",
                            active ? "font-semibold text-foreground" : "text-foreground/80",
                          )}
                        >
                          {item.title}
                        </span>
                        {count > 0 && (
                          <span className="shrink-0 rounded-full bg-warning px-1.5 text-[0.68rem] font-semibold tabular-nums text-warning-foreground">
                            {count}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <div className="mt-auto shrink-0 pt-2">
        <button
          type="button"
          onClick={handleSignOut}
          title={expanded ? undefined : "Sign out"}
          className="ornament-item focus-spatial flex h-10 w-full items-center gap-3 px-[0.6875rem]"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <LogOut className="h-[1.15rem] w-[1.15rem] text-foreground/70" strokeWidth={1.7} />
          </span>
          <span
            className={cn(
              "truncate text-[0.83rem] text-foreground/80 transition-opacity duration-200",
              expanded ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            Sign out
          </span>
        </button>
      </div>
    </nav>
  );
}
