import { supabase } from "@/integrations/supabase/client";

/**
 * TEMPORARY LOGIN BYPASS.
 *
 * While this flag is true the app never shows the sign-in screen: it silently
 * signs in as the owner account below so server functions still receive a real
 * bearer token. Set DEV_AUTH_BYPASS to false (or delete this file and its two
 * call sites) to restore normal login.
 */
export const DEV_AUTH_BYPASS = true;

const DEV_EMAIL = "admin@visionacademics.com.au";
const DEV_PASSWORD = "JahJosh2024!";

let pending: Promise<boolean> | null = null;

/** Returns true when a session is available (existing or freshly created). */
export async function ensureDevSession(): Promise<boolean> {
  if (!DEV_AUTH_BYPASS) return false;
  if (!pending) {
    pending = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
      const { error } = await supabase.auth.signInWithPassword({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (error) {
        console.error("[dev-auth] automatic sign-in failed:", error.message);
        return false;
      }
      return true;
    })();
  }
  const ok = await pending;
  if (!ok) pending = null;
  return ok;
}
