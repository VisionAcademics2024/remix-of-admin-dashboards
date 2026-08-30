import { supabase } from "@/integrations/supabase/client";

/**
 * TEMPORARY development convenience.
 *
 * While this is true the app signs itself in as the owner account so the
 * system can be edited without hitting the login screen on every change.
 * Set to false (or delete this file's usages) to restore normal auth.
 */
export const DEV_AUTH_BYPASS = true;

const DEV_EMAIL = "admin@visionacademics.com.au";
const DEV_PASSWORD = "JahJosh2024!";

let pending: Promise<boolean> | null = null;

/** Ensure a session exists, signing in silently if needed. */
export async function ensureDevSession(): Promise<boolean> {
  if (!DEV_AUTH_BYPASS) return false;
  const { data } = await supabase.auth.getUser();
  if (data.user) return true;
  pending ??= supabase.auth
    .signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
    .then(({ error }) => !error)
    .finally(() => {
      pending = null;
    });
  return pending;
}
