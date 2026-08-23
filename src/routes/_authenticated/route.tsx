import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { meQueryOptions } from "@/lib/vision/me";
import { formatDay, sydToday } from "@/lib/format";
import { DataModeBadge } from "@/components/vision/data-mode-badge";
import { EnvironmentButton } from "@/components/vision/environment";

export { meQueryOptions };

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    // No page data may be requested before an active staff row exists, so the
    // "signed in but not approved" case is settled here, before child loaders.
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (!me.staff) {
      throw redirect({ to: "/access" });
    }
    return { user: data.user, staff: me.staff };
  },
  component: AuthenticatedLayout,
});

/**
 * The window.
 *
 * visionOS floats a single pane in space with its navigation hung alongside,
 * so there is no full-height chrome column here — the ornament is absolutely
 * positioned and the content simply keeps clear of it.
 */
function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions());
  const [navExpanded, setNavExpanded] = useState(false);
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
        // by it. Below that there is no width to give away, so it overlays and
        // the rail thickens instead — see .ornament[data-expanded] in styles.css.
        "min-h-screen pl-[5.5rem] pr-3 transition-[padding] duration-[320ms] lg:pr-5",
        navExpanded ? "lg:pl-[17.25rem]" : "lg:pl-[6.25rem]",
      )}
    >
      <AppSidebar
        role={me.staff.role}
        name={me.staff.full_name}
        expanded={navExpanded}
        onExpandedChange={setNavExpanded}
      />

      <header className="glass glass--thick animate-spatial-in sticky top-3 z-30 mt-3 flex h-14 items-center gap-3 rounded-full px-4">
        <span className="hidden items-baseline gap-2.5 sm:flex">
          <span className="text-[0.82rem] font-semibold tracking-[-0.01em]">
            {formatDay(sydToday())}
          </span>
          <span className="text-[0.72rem] text-muted-foreground">Sydney</span>
        </span>

        <span className="ml-auto flex items-center gap-3">
          <DataModeBadge />
          <EnvironmentButton />
        </span>

        <span className="flex items-center gap-2.5">
          <span className="hidden text-right sm:block">
            <span className="block text-[0.78rem] font-semibold leading-tight">
              {me.staff.full_name}
            </span>
            <span className="block text-[0.68rem] capitalize leading-tight text-muted-foreground">
              {me.staff.role}
            </span>
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mat-thick)] text-[0.72rem] font-semibold shadow-[inset_0_1px_0_0_var(--edge-top)]">
            {initials}
          </span>
        </span>
      </header>

      <main className="mx-auto w-full max-w-[104rem] pb-14 pt-7">
        <Outlet />
      </main>
    </div>
  );
}
