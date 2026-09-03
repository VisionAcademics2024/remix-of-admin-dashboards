import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import { ageing } from "./today";
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

    const [toMark, todaySessions, todayRoll, makeUps, lowPackages, charges, uncharged] =
      await Promise.all([
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
        // Today's whole roll, marked or not. The unmarked half already comes back
        // in toMark; this is here so a lesson can say how much of its roll is
        // taken, which is what separates "done" from "half done".
        client
          .from("v_attendance")
          .select(
            "id, session_id, status, att_type, enrolments(students(id, code, full_name)), sessions(code, class_offerings(programs(name)))",
          )
          .eq("session_date", today),
        // Absences nobody rebooked, oldest first - the longest-owed lesson is the
        // one most likely to be forgotten entirely.
        client
          .from("v_attendance")
          .select(
            "id, session_date, make_up_state, enrolments(students(id, code, full_name)), sessions(code, class_offerings(programs(name)))",
          )
          .eq("status", "absent")
          .eq("make_up_state", "outstanding")
          .order("session_date", { ascending: true })
          .limit(100),
        client
          .from("v_hours_packages")
          .select("*, students(id, code, full_name)")
          .eq("status", "active")
          .order("hours_remaining"),
        client.from("v_charges").select("id, status, final_amount, invoice_date"),
        client
          .from("v_attendance")
          .select("id")
          .eq("billing_method", "payg")
          .eq("status", "present")
          .limit(500),
      ]);

    // A failed read must not arrive as an empty list. Today saying "no lessons,
    // nothing owed" because a query broke is the same failure Billing had, and
    // it is worse here: this is the page you trust to tell you the day is clear.
    for (const [what, result] of [
      ["the roll", toMark],
      ["today's lessons", todaySessions],
      ["today's attendance", todayRoll],
      ["make-ups", makeUps],
      ["hours packages", lowPackages],
      ["charges", charges],
    ] as const) {
      if (result.error) throw new Error(`Today could not read ${what}: ${result.error.message}`);
    }

    const chargeRows = charges.data ?? [];
    const chargedIds = new Set<string>();
    const { data: chargeLinks } = await client
      .from("charges")
      .select("attendance_id")
      .not("attendance_id", "is", null);
    for (const c of chargeLinks ?? []) chargedIds.add(c.attendance_id);

    const allSessions = (todaySessions.data ?? []) as Row[];
    const sessions = allSessions.filter((s: Row) => s.session_date === today);
    const tomorrow = allSessions.filter((s: Row) => s.session_date === shift(today, 1));
    const roll = (todayRoll.data ?? []) as Row[];
    const unpaid = chargeRows.filter((c: Row) => c.status === "invoiced");

    return {
      today,
      toMark: toMark.data ?? [],
      sessions,
      // Tomorrow, only far enough to catch a lesson with nobody teaching it.
      tomorrow,
      // The whole of today's roll, so a lesson can report how much of it is taken.
      roll,
      // Marked absent today: the make-up is easiest to book while the reason is
      // still fresh, which is the one moment nobody is at a screen.
      absentToday: roll.filter((a: Row) => a.status === "absent"),
      makeUpsOwed: makeUps.data ?? [],
      lowPackages: (lowPackages.data ?? []).filter((p: Row) => p.is_low || p.is_overdrawn),
      toInvoiceCount: chargeRows.filter((c: Row) => c.status === "to_invoice").length,
      toInvoiceValue: chargeRows
        .filter((c: Row) => c.status === "to_invoice")
        .reduce((sum: number, c: Row) => sum + Number(c.final_amount ?? 0), 0),
      unpaidCount: unpaid.length,
      unpaidValue: unpaid.reduce((sum: number, c: Row) => sum + Number(c.final_amount ?? 0), 0),
      // Enough to say whether the unpaid pile is this month's or a problem.
      unpaidAgeing: ageing(unpaid, today),
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
