import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar role={me.staff.role} name={me.staff.full_name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Vision Admin</span>
            <span className="ml-auto text-sm text-muted-foreground">
              {me.staff.full_name}
              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs capitalize text-secondary-foreground">
                {me.staff.role}
              </span>
            </span>
          </header>
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
