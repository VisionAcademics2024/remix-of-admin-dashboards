import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldQuestion, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { claimFirstOwner, requestAccess } from "@/lib/vision/session.functions";
import { meQueryOptions } from "@/lib/vision/me";

/**
 * Signed in but not yet staff. This lives outside the protected layout on
 * purpose: no page data may be requested until an active staff row exists,
 * otherwise every child loader fails the access guard at once.
 */
export const Route = createFileRoute("/access")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const me = await context.queryClient.ensureQueryData(meQueryOptions());
    if (me.staff) throw redirect({ to: "/today" });
  },
  head: () => ({
    meta: [
      { title: "Access — Vision Admin" },
      {
        name: "description",
        content:
          "Claim owner access or request approval to use Vision Admin, the private operations app for Vision Academics.",
      },
      { property: "og:title", content: "Access — Vision Admin" },
      {
        property: "og:description",
        content: "Signing in does not grant access on its own. An owner approves each account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccessPage,
});

function AccessPage() {
  const { data: me } = useSuspenseQuery(meQueryOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const claim = useServerFn(claimFirstOwner);
  const request = useServerFn(requestAccess);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(me.email ?? "");
  const [busy, setBusy] = useState(false);

  async function handleClaim() {
    setBusy(true);
    try {
      await claim({ data: { full_name: fullName || "Owner" } });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("You are set up as an owner.");
      navigate({ to: "/today", replace: true });
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
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Request sent. An owner can approve it on the Staff screen.");
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="spatial-auth-glow -left-48 -top-40" aria-hidden />
      <div
        className="spatial-auth-glow -bottom-52 -right-44 [background:radial-gradient(circle,var(--canvas-glow-b),transparent_68%)]"
        aria-hidden
      />
      <Card className="relative w-full max-w-md rounded-[2rem]">
        <CardHeader>
          <div className="mb-3 flex items-center gap-3">
            <div className="spatial-orb flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground">
              <span className="text-sm font-bold">V</span>
            </div>
            <div>
              <p className="text-sm font-semibold">Vision CRM</p>
              <p className="text-xs text-muted-foreground">Secure staff access</p>
            </div>
          </div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/35 bg-primary/10 shadow-sm">
            {me.needsBootstrap ? (
              <Sparkles className="h-5 w-5 text-primary" />
            ) : (
              <ShieldQuestion className="h-5 w-5 text-primary" />
            )}
          </div>
          <CardTitle>{me.needsBootstrap ? "Set up Vision Admin" : "No access yet"}</CardTitle>
          <CardDescription>
            {me.needsBootstrap
              ? "Nobody has been set up yet. Claim owner access to get started — this is only possible while the staff list is empty."
              : me.deactivated
                ? "This account has been deactivated. An owner can re-enable it on the Staff screen."
                : "Signing in does not grant access on its own. Ask an owner to approve you."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pb-7">
          {me.needsBootstrap ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Your name</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <Button className="w-full" disabled={busy} onClick={handleClaim}>
                Claim owner access
              </Button>
            </>
          ) : me.deactivated ? null : me.hasRequested ? (
            <p className="rounded-2xl border border-white/35 bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
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
