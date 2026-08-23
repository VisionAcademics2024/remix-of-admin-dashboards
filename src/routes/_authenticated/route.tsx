import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { meQueryOptions } from "@/lib/vision/me";

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

function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions());
  if (!me.staff) return null;

  return (
    <SidebarProvider className="bg-transparent">
      <AppSidebar role={me.staff.role} name={me.staff.full_name} />
      <SidebarInset className="min-w-0 bg-transparent md:pr-2">
        <header className="spatial-topbar sticky top-3 z-30 mx-3 mt-3 flex h-14 shrink-0 items-center gap-3 rounded-2xl px-3.5 sm:px-4 lg:mx-4">
          <SidebarTrigger className="h-9 w-9 rounded-full border border-white/35 bg-background/25 shadow-sm backdrop-blur-xl" />
          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-success)_14%,transparent)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Operations workspace
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold leading-tight">{me.staff.full_name}</p>
              <p className="mt-0.5 text-[0.68rem] capitalize text-muted-foreground">
                {me.staff.role}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/45 bg-secondary/75 text-xs font-bold text-secondary-foreground shadow-sm backdrop-blur-xl">
              {me.staff.full_name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-8 pt-7 lg:px-8 lg:pb-10 lg:pt-9">
          <div className="mx-auto w-full max-w-[100rem]">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
