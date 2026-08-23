import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import type { Row } from "./types";

/**
 * Today answers four questions: who needs marking, what is on, who is running
 * out of hours, what is ready to invoice.
 *
 * Every date comparison uses the Sydney calendar date passed in by the caller
 * and v_*.session_date, never a raw timestamp.
 */
export const getToday = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ date: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const today = data.date;

    const [toMark, todaySessions, lowPackages, charges, uncharged] = await Promise.all([
      client
        .from("v_attendance")
        .select(
          "*, sessions(code, starts_at, ends_at, class_offerings(code, programs(name))), enrolments(code, students(id, code, full_name))",
        )
        .eq("status", "not_marked")
        .lte("session_date", today)
        .order("lesson_starts_at", { ascending: false })
        .limit(200),
      client
        .from("v_sessions")
        .select("*, tutors(id, full_name, colour), class_offerings(code, room, programs(name))")
        .gte("starts_at", `${shift(today, -1)}T00:00:00Z`)
        .lte("starts_at", `${shift(today, 2)}T00:00:00Z`)
        .order("starts_at"),
      client
        .from("v_hours_packages")
        .select("*, students(id, code, full_name)")
        .eq("status", "active")
        .order("hours_remaining"),
      client.from("v_charges").select("id, status, final_amount"),
      client
        .from("v_attendance")
        .select("id")
        .eq("billing_method", "payg")
        .eq("status", "present")
        .limit(500),
    ]);

    const chargeRows = charges.data ?? [];
    const chargedIds = new Set<string>();
    const { data: chargeLinks } = await client
      .from("charges")
      .select("attendance_id")
      .not("attendance_id", "is", null);
    for (const c of chargeLinks ?? []) chargedIds.add(c.attendance_id);

    return {
      toMark: toMark.data ?? [],
      sessions: (todaySessions.data ?? []).filter((s: Row) => s.session_date === today),
      lowPackages: (lowPackages.data ?? []).filter((p: Row) => p.is_low || p.is_overdrawn),
      toInvoiceCount: chargeRows.filter((c: Row) => c.status === "to_invoice").length,
      toInvoiceValue: chargeRows
        .filter((c: Row) => c.status === "to_invoice")
        .reduce((sum: number, c: Row) => sum + Number(c.final_amount ?? 0), 0),
      unpaidValue: chargeRows
        .filter((c: Row) => c.status === "invoiced")
        .reduce((sum: number, c: Row) => sum + Number(c.final_amount ?? 0), 0),
      unchargedPaygCount: (uncharged.data ?? []).filter((a: Row) => !chargedIds.has(a.id)).length,
    };
  });

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** One query, grouped by entity. Empty is the goal. */
export const getNeedsAttention = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("v_needs_attention")
      .select("entity, id, code, issue");
    if (error) throw error;
    return data ?? [];
  });

/** Just the number, for the nav badge. */
export const getNeedsAttentionCount = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const { count, error } = await db(context.supabase)
      .from("v_needs_attention")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return { count: count ?? 0 };
  });
