import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldQuestion, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { claimFirstOwner, getMe, requestAccess } from "@/lib/vision/session.functions";

export const meQueryOptions = () =>
  queryOptions({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 30_000 });

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(meQueryOptions()),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions());

  // An auth.users row on its own grants nothing.
  if (!me.staff) return <NoAccess me={me} />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar role={me.staff.role} name={me.staff.full_name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Vision CRM</span>
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

function NoAccess({ me }: { me: Awaited<ReturnType<typeof getMe>> }) {
  const router = useRouter();
  const claim = useServerFn(claimFirstOwner);
  const request = useServerFn(requestAccess);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(me.email ?? "");
  const [busy, setBusy] = useState(false);

  async function handleClaim() {
    setBusy(true);
    try {
      await claim({ data: { full_name: fullName || "Owner" } });
      toast.success("You are set up as an owner.");
      await router.invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest() {
    setBusy(true);
    try {
      await request({ data: { full_name: fullName, email, note: "" } });
      toast.success("Request sent. An owner can approve it on the Staff screen.");
      await router.invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            {me.needsBootstrap ? (
              <Sparkles className="h-5 w-5 text-primary" />
            ) : (
              <ShieldQuestion className="h-5 w-5 text-primary" />
            )}
          </div>
          <CardTitle>{me.needsBootstrap ? "Set up Vision CRM" : "No access yet"}</CardTitle>
          <CardDescription>
            {me.needsBootstrap
              ? "Nobody has been set up yet. Claim owner access to get started — this is only possible while the staff list is empty."
              : me.deactivated
                ? "This account has been deactivated. An owner can re-enable it on the Staff screen."
                : "Signing in does not grant access on its own. Ask an owner to approve you."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {me.needsBootstrap ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Your name</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Justin"
                />
              </div>
              <Button className="w-full" disabled={busy} onClick={handleClaim}>
                Claim owner access
              </Button>
            </>
          ) : me.deactivated ? null : me.hasRequested ? (
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Your request is waiting for an owner to approve it.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="req_name">Your name</Label>
                <Input
                  id="req_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req_email">Email</Label>
                <Input id="req_email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button
                className="w-full"
                disabled={busy || !fullName || !email}
                onClick={handleRequest}
              >
                Request access
              </Button>
            </>
          )}

          <Button variant="ghost" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
