import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { DEV_AUTH_BYPASS, ensureDevSession } from "@/lib/dev-auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (DEV_AUTH_BYPASS) {
      await ensureDevSession();
      throw redirect({ to: "/today" });
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/today" });
    throw redirect({ to: "/auth" });
  },
});

