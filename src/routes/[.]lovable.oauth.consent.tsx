import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import visionLogo from "@/assets/vision-logo.png.asset.json";
import { DEV_AUTH_BYPASS, ensureDevSession } from "@/lib/dev-auth";

/**
 * OAuth 2.1 consent screen. Lovable's connector flow (and any MCP client) sends
 * the signed-in staff member here to approve a client connecting as them.
 */

type AuthorizationDetails = {
  client?: { name?: string | null; client_uri?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

// The `auth.oauth` namespace is beta and not yet in the generated client types.
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    if (DEV_AUTH_BYPASS) await ensureDevSession();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-6 py-20 text-sm text-muted-foreground">
      Could not load this authorization request: {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "this app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: failure } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (failure) {
      setBusy(false);
      setError(failure.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect was returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass glass--thick w-full max-w-md rounded-[2rem] p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-white via-[#FBF7F0] to-[#EDE6DA]">
            <img src={visionLogo.url} alt="Vision Academics" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-[-0.025em]">Vision CRM</p>
            <p className="text-xs text-muted-foreground">Connection request</p>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.035em]">Connect {clientName}?</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {clientName} is asking to use the Vision CRM tools as you. It will see the students,
          lessons and enquiries your own account can see, and can record new enquiries.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={() => void decide(true)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => void decide(false)}
          >
            Deny
          </Button>
        </div>

        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Access follows your staff permissions. You can revoke it at any time by removing the
          connection in the connecting app.
        </p>
      </div>
    </main>
  );
}
