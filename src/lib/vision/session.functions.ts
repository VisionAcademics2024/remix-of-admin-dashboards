import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { db, requireOwner, requireStaff } from "./guard";
import type { Staff } from "./types";

/**
 * Who am I, and may I be here?
 *
 * Deliberately uses the bare auth middleware rather than requireStaff, because
 * its whole job is to report the "signed in but no staff row" case rather than
 * throw on it.
 */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const { data: staff, error } = await client
      .from("staff")
      .select("user_id, full_name, email, role, tutor_id, is_active, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;

    if (staff && staff.is_active) {
      return { staff: staff as Staff, needsBootstrap: false, hasRequested: false };
    }

    // Is this a brand new database with nobody in it yet? A signed-in user may
    // claim owner access exactly once, while `staff` is empty.
    const { count, error: countError } = await client
      .from("staff")
      .select("user_id", { count: "exact", head: true });
    if (countError) throw countError;

    const { data: request } = await client
      .from("access_requests")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      staff: null,
      needsBootstrap: (count ?? 0) === 0,
      hasRequested: !!request,
      // Present but deactivated is a different message from never invited.
      deactivated: !!staff && !staff.is_active,
      email: (context.claims as { email?: string }).email ?? null,
    };
  });

/** First run only. bootstrap_first_owner() is inert once any staff row exists. */
export const claimFirstOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ full_name: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await db(context.supabase).rpc("bootstrap_first_owner", {
      p_full_name: data.full_name,
    });
    if (error) throw error;
    return row as Staff;
  });

export const requestAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        full_name: z.string().min(1),
        email: z.string().email(),
        note: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("access_requests")
      .upsert(
        {
          user_id: context.userId,
          full_name: data.full_name,
          email: data.email,
          note: data.note || null,
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return { success: true };
  });

/* ---------------------------------------------------------------- Staff screen */

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const { data: staff, error } = await client
      .from("staff")
      .select("user_id, full_name, email, role, tutor_id, is_active, created_at")
      .order("full_name");
    if (error) throw error;

    // Only owners can read the request queue; admins get an empty list.
    const { data: requests } = await client
      .from("access_requests")
      .select("user_id, full_name, email, note, requested_at")
      .order("requested_at");

    // The tutors an account can be pointed at. A tutor account teaches as one
    // of these, and more than one account may point at the same tutor - which
    // is how a test login shares a real tutor's lessons and pay.
    const { data: tutors } = await client
      .from("tutors")
      .select("id, code, full_name, status")
      .eq("status", "active")
      .order("full_name");

    return {
      staff: (staff ?? []) as Staff[],
      requests: requests ?? [],
      tutors: tutors ?? [],
      canManage: context.staff.role === "owner",
    };
  });

export const approveAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        full_name: z.string().min(1),
        email: z.string().email(),
        role: z.enum(["owner", "admin"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { error } = await client.from("staff").insert({
      user_id: data.user_id,
      full_name: data.full_name,
      email: data.email,
      role: data.role,
      is_active: true,
    });
    if (error) throw error;

    await client.from("access_requests").delete().eq("user_id", data.user_id);
    return { success: true };
  });

export const declineAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("access_requests")
      .delete()
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { success: true };
  });

/**
 * Deactivating is is_active = false, never a delete - deleting the row loses the
 * audit trail on session_pay_adjustments.created_by.
 */
export const updateStaffMember = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["owner", "admin", "tutor"]).optional(),
        /** Which tutor this account teaches as. Required when role is tutor. */
        tutor_id: z.string().uuid().nullable().optional(),
        is_active: z.boolean().optional(),
        full_name: z.string().min(1).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { user_id, ...patch } = data;

    // Never let the last active owner remove their own access. Any role that is
    // not owner counts, so demoting yourself to tutor is caught the same way
    // demoting to admin always was.
    if ((patch.role !== undefined && patch.role !== "owner") || patch.is_active === false) {
      const { count } = await db(context.supabase)
        .from("staff")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);
      if ((count ?? 0) <= 1 && user_id === context.staff.user_id) {
        throw new Error("This is the only active owner - promote someone else first.");
      }
    }

    // A tutor account is meaningless without a tutor to be: it would see no
    // lessons and no pay, and read as broken rather than restricted. The
    // database refuses it too; this says so in words first.
    if (patch.role === "tutor" && !patch.tutor_id) {
      const { data: existing } = await db(context.supabase)
        .from("staff")
        .select("tutor_id")
        .eq("user_id", user_id)
        .maybeSingle();
      if (!existing?.tutor_id) {
        throw new Error("Choose which tutor this account teaches as before making it a tutor.");
      }
    }

    // Promoting out of the tutor role drops the link, so an owner or admin is
    // never left pointing at somebody's lessons.
    const values: Record<string, unknown> =
      patch.role === "owner" || patch.role === "admin" ? { ...patch, tutor_id: null } : patch;

    const { error } = await db(context.supabase)
      .from("staff")
      .update(values)
      .eq("user_id", user_id);
    if (error) throw error;
    return { success: true };
  });
