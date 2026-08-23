import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Staff } from "./types";

/**
 * The generated Database type still describes the prototype tables, so queries
 * against the spec schema go through a loosely-typed client. Row shapes are
 * enforced at the boundary by the interfaces in ./types.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, "public", any>;

export function db(client: unknown): AnyClient {
  return client as AnyClient;
}

/**
 * 05-auth-and-permissions.md: an auth.users row on its own grants nothing.
 * Access requires an active `staff` row. RLS enforces this at the database —
 * this middleware exists so the API refuses with a clear message instead of
 * silently returning zero rows.
 */
export const requireStaff = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await db(context.supabase)
      .from("staff")
      .select("user_id, full_name, email, role, is_active, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.is_active) {
      throw new Error("No access: this account is not an active staff member.");
    }

    return next({ context: { staff: data as Staff } });
  });

/**
 * Owner-only. The spec offers a choice between showing an admin zeroes and
 * refusing outright; refusing is the kinder of the two, so every pay endpoint
 * uses this.
 */
export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireStaff])
  .server(async ({ next, context }) => {
    if (context.staff.role !== "owner") {
      throw new Error("Forbidden: tutor pay is visible to owners only.");
    }
    return next();
  });
