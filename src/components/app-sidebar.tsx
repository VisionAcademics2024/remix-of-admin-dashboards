import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  LogOut,
  Moon,
  Receipt,
  Repeat,
  Settings,
  Sun,
  Sunrise,
  Users,
  UserCog,
  Wallet,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import { EnvironmentBadge } from "@/components/vision/environment-badge";
import { supabase } from "@/integrations/supabase/client";
import { getNeedsAttentionCount } from "@/lib/vision/overview.functions";
import type { StaffRole } from "@/lib/vision/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * Four groups: what you do all day, what you manage, what you check, what you
 * configure. Paths stay as they are — the specified sub-route hierarchy arrives
 * with the screens that need it.
 */
const OPERATE = [
  { title: "Today", url: "/today", icon: Sunrise },
  { title: "Timetable", url: "/timetable", icon: CalendarDays },
  { title: "Attendance", url: "/roll", icon: ClipboardCheck },
  { title: "Make-Ups", url: "/make-ups", icon: Repeat },
  { title: "Class Builder", url: "/classes/new", icon: Wrench },
];

const MANAGE = [
  { title: "Students & Families", url: "/students", icon: GraduationCap },
  { title: "Classes", url: "/classes", icon: LayoutGrid },
  { title: "Enrolments & Hours", url: "/enrolments", icon: Wallet },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Tutor Pay", url: "/tutor-pay", icon: BadgeDollarSign, ownerOnly: true },
];

const UNDERSTAND = [
  { title: "Needs Attention", url: "/needs-attention", icon: ListChecks, badge: true },
];

const CONFIGURE = [
  { title: "Setup", url: "/setup", icon: Settings },
  { title: "Staff", url: "/staff", icon: UserCog, ownerOnly: true },
];

export function AppSidebar({ role, name }: { role: StaffRole; name: string }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  // An exception count in the nav beats a screen nobody visits.
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

  const renderItems = (
    items: {
      title: string;
      url: string;
      icon: typeof Users;
      badge?: boolean;
      ownerOnly?: boolean;
    }[],
  ) =>
    items
      .filter((item) => !item.ownerOnly || role === "owner")
      .map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.url)}
            tooltip={item.title}
            className="h-10 rounded-xl px-3 text-[0.82rem] data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:shadow-[inset_0_1px_0_oklch(1_0_0/34%),0_8px_22px_-14px_var(--color-sidebar-primary)] data-[active=true]:[&>svg]:text-sidebar-primary"
          >
            <Link to={item.url}>
              <item.icon />
              {!collapsed && (
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{item.title}</span>
                  {item.badge && (attention?.count ?? 0) > 0 && (
                    <span className="rounded-full bg-warning px-1.5 text-xs font-semibold text-warning-foreground">
                      {attention!.count}
                    </span>
                  )}
                </span>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ));

  return (
    <Sidebar variant="floating" collapsible="icon" className="vision-sidebar">
      <SidebarHeader className="p-3 pb-2">
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-white/35 bg-background/25 px-3 shadow-sm backdrop-blur-xl">
          <div className="spatial-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-primary-foreground">
            <span className="text-sm font-bold tracking-[-0.04em]">V</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">Vision CRM</p>
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[0.7rem] text-muted-foreground">Operations · {name}</p>
                <EnvironmentBadge />
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="py-2">
          {!collapsed && (
            <SidebarGroupLabel className="px-3 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
              Operate
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(OPERATE)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-2">
          {!collapsed && (
            <SidebarGroupLabel className="px-3 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
              Manage
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(MANAGE)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-2">
          {!collapsed && (
            <SidebarGroupLabel className="px-3 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
              Understand
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(UNDERSTAND)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-2">
          {!collapsed && (
            <SidebarGroupLabel className="px-3 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
              Configure
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(CONFIGURE)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* The legacy /prototype/* screens are no longer linked from the
            navigation: they read renamed proto_* tables that are not present
            in the database. The code is retained for reference pending a
            separately reviewed cleanup. */}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/30 p-3">
        <SidebarMenu>
          <ThemeToggleItem collapsed={collapsed} />
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign out"
              className="h-10 rounded-xl px-3"
            >
              <LogOut />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ThemeToggleItem({ collapsed }: { collapsed: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("vision-theme");
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored ? stored === "dark" : prefers;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("vision-theme", next ? "dark" : "light");
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={toggle}
        tooltip={dark ? "Light mode" : "Dark mode"}
        className="h-10 rounded-xl px-3"
      >
        {dark ? <Sun /> : <Moon />}
        {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
