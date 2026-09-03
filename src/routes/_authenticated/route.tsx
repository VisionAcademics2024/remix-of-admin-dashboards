import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";

import { AppSidebar } from "@/components/app-sidebar";
import { meQueryOptions } from "@/lib/vision/me";
import { formatDay, sydToday } from "@/lib/format";
import { DataModeBadge } from "@/components/vision/data-mode-badge";
import { EnvironmentButton } from "@/components/vision/environment";
import { MobileNav } from "@/components/vision/mobile-nav";
import { sectionTitleFor, tutorMayOpen } from "@/components/vision/nav-items";

export { meQueryOptions };

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    // getSession reads the token already held locally; getUser posts it to the
    // auth server to be validated. This runs before every authenticated page,
    // so the difference was a full network round trip on each navigation - paid
    // to re-check something the server checks anyway: every server function
    // goes through requireSupabaseAuth, which verifies the JWT's claims itself.
    //
    // So the local read decides only whether to bother asking. A token that is
    // present but no longer valid gets past it and is refused by getMe below,
    // which lands in the same place: the sign-in screen.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/auth" });
    }

    // No page data may be requested before an active staff row exists, so the
    // "signed in but not approved" case is settled here, before child loaders.
    const loadMe = () => context.queryClient.ensureQueryData(meQueryOptions());
    let me: Awaited<ReturnType<typeof loadMe>>;
    try {
      me = await loadMe();
    } catch {
      // The server refused the token. Only this call is inside the try, so the
      // redirects below are not swallowed by it.
      throw redirect({ to: "/auth" });
    }

    if (!me.staff) {
      throw redirect({ to: "/access" });
    }

    // A tutor typing a URL gets the same answer as a tutor reading the nav.
    // The database would refuse the rows anyway, so this is not the security
    // boundary - it is the difference between being told no and being shown an
    // empty page that looks broken.
    if (me.staff.role === "tutor" && !tutorMayOpen(location.pathname)) {
      throw redirect({ to: "/today" });
    }

    return { user: session.user, staff: me.staff };
  },
  component: AuthenticatedLayout,
});

/**
 * The window.
 *
 * visionOS floats a single pane in space with its navigation hung alongside,
 * so there is no full-height chrome column here - the ornament is absolutely
 * positioned and the content simply keeps clear of it.
 *
 * A phone has no width to give away and no pointer to widen the rail with, so
 * below `lg` the rail is gone entirely: the pane runs edge to edge and the
 * sections live behind the menu button at the top-right of the header.
 */
function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions());
  const [navExpanded, setNavExpanded] = useState(false);
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  if (!me.staff) return null;

  const initials = me.staff.full_name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      style={{ transitionTimingFunction: "var(--ease-spatial)" }}
      className={cn(
        // From lg up the page makes room for the rail rather than being covered
        // by it. Below that there is no rail at all, so the pane keeps only the
        // small gutter every phone layout wants.
        "min-h-screen px-3 transition-[padding] duration-[320ms] lg:pr-5",
        navExpanded ? "lg:pl-[17.25rem]" : "lg:pl-[6.25rem]",
      )}
    >
      <AppSidebar
        role={me.staff.role}
        name={me.staff.full_name}
        expanded={navExpanded}
        onExpandedChange={setNavExpanded}
      />

      {/* Content passes under the floating header. This is the soft edge it
          dissolves into, instead of being sliced by the pill's border. */}
      <div className="scroll-edge" aria-hidden />

      <header className="glass glass--thick animate-materialize sticky top-3 z-30 mt-3 flex h-14 items-center gap-2 rounded-full px-3 sm:gap-3 sm:px-4">
        {/* On a phone the header says where you are, since the rail that used to
            say so is behind the menu button. */}
        <span className="min-w-0 truncate text-[0.9rem] font-semibold tracking-[-0.01em] lg:hidden">
          {sectionTitleFor(currentPath)}
        </span>

        <span className="hidden items-baseline gap-2.5 lg:flex">
          <span className="text-[0.82rem] font-semibold tracking-[-0.01em]">
            {formatDay(sydToday())}
          </span>
          <span className="text-[0.72rem] text-muted-foreground">Sydney</span>
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Environment and data-mode chips are desk tools; a phone header has
              no room for them and they are not needed on the move. */}
          <span className="hidden items-center gap-3 sm:flex">
            <DataModeBadge />
            <EnvironmentButton />
          </span>

          <span className="hidden text-right lg:block">
            <span className="block text-[0.78rem] font-semibold leading-tight">
              {me.staff.full_name}
            </span>
            <span className="block text-[0.68rem] capitalize leading-tight text-muted-foreground">
              {me.staff.role}
            </span>
          </span>
          <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-[var(--mat-thick)] text-[0.72rem] font-semibold shadow-[inset_0_1px_0_0_var(--edge-top)] lg:flex">
            {initials}
          </span>

          <MobileNav role={me.staff.role} name={me.staff.full_name} />
        </span>
      </header>

      <main className="mx-auto w-full max-w-[104rem] pb-14 pt-5 sm:pt-7">
        <Outlet />
      </main>
    </div>
  );
}
