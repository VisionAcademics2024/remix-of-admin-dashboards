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
          <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 px-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-bold">V</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">Vision CRM</p>
              <p className="truncate text-xs text-muted-foreground">{name}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Every day</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(DAILY)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Records</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(RECORDS)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Admin</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(ADMIN)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* The legacy /prototype/* screens are no longer linked from the
            navigation: they read renamed proto_* tables that are not present
            in the database. The code is retained for reference pending a
            separately reviewed cleanup. */}

      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <ThemeToggleItem collapsed={collapsed} />
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip="Sign out">
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
      <SidebarMenuButton onClick={toggle} tooltip={dark ? "Light mode" : "Dark mode"}>
        {dark ? <Sun /> : <Moon />}
        {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
