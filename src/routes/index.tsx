import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { DEV_AUTH_BYPASS } from "@/lib/dev-auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Temporary login bypass - see src/lib/dev-auth.ts
    if (DEV_AUTH_BYPASS) throw redirect({ to: "/today" });
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/today" });
    throw redirect({ to: "/auth" });
  },
});
