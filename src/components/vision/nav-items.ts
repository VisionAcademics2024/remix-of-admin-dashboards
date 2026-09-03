import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardCheck,
  FlaskConical,
  GraduationCap,
  History,
  LayoutGrid,
  ListChecks,
  Receipt,
  Settings,
  Sparkles,
  Stethoscope,
  Sunrise,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { StaffRole } from "@/lib/vision/types";

/**
 * The one list of sections.
 *
 * Two navigations render from it - the pointer rail on a desktop and the sheet
 * a phone opens from the header - so a section added here appears in both, and
 * they can never drift apart.
 */

export interface NavItem {
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
  { title: "Leads & Trials", url: "/leads", icon: Sparkles },
  { title: "Students & Families", url: "/students", icon: GraduationCap },
  { title: "Classes", url: "/classes", icon: LayoutGrid },
  { title: "Sessions", url: "/sessions", icon: History },
  { title: "Enrolments & Hours", url: "/enrolments", icon: Wallet },
  { title: "Tutors", url: "/tutors", icon: Users },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Tutor Pay", url: "/tutor-pay", icon: BadgeDollarSign, ownerOnly: true },
];

const UNDERSTAND: NavItem[] = [
  { title: "Needs Attention", url: "/needs-attention", icon: ListChecks, badge: true },
  { title: "Data check", url: "/diagnostics", icon: Stethoscope },
];

const CONFIGURE: NavItem[] = [
  { title: "Setup", url: "/setup", icon: Settings },
  { title: "Staff", url: "/staff", icon: UserCog, ownerOnly: true },
  { title: "Prototype", url: "/prototype/dashboard", icon: FlaskConical },
];

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Operate", items: OPERATE },
  { label: "Manage", items: MANAGE },
  { label: "Understand", items: UNDERSTAND },
  { label: "Configure", items: CONFIGURE },
];

/**
 * What a tutor account may open.
 *
 * Everything else in the app reads students, money or settings, none of which a
 * tutor can reach: the database refuses those rows, so leaving the links up
 * would offer a page that can only come back empty. The nav is trimmed to match
 * what actually works.
 *
 * Tutor Pay is on this list and stays owner-only for everyone else - a tutor
 * sees their own, an admin sees none, an owner sees all - so it is filtered by
 * name rather than by the ownerOnly flag.
 */
const TUTOR_URLS = new Set(["/today", "/timetable", "/roll", "/tutor-pay"]);

/** The groups this member of staff may actually see. */
export function navGroupsFor(role: StaffRole) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      role === "tutor" ? TUTOR_URLS.has(item.url) : !item.ownerOnly || role === "owner",
    ),
  })).filter((group) => group.items.length > 0);
}

/** Is this path one a tutor account is allowed to open at all? */
export function tutorMayOpen(path: string): boolean {
  return [...TUTOR_URLS].some((url) => path === url || path.startsWith(`${url}/`));
}

/**
 * Whether a path is the section you are in.
 *
 * "/classes" is an exact match because "/classes/new" is its own section
 * (Class Builder) and lighting both at once would be a lie.
 */
export function isActivePath(itemUrl: string, currentPath: string): boolean {
  if (itemUrl === "/classes") return currentPath === "/classes";
  return currentPath === itemUrl || currentPath.startsWith(`${itemUrl}/`);
}

/** The section name for the current path, for the phone header. */
export function sectionTitleFor(currentPath: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isActivePath(item.url, currentPath)) return item.title;
    }
  }
  return "Vision CRM";
}
