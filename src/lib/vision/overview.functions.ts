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

/**
 * A read-only look at whether the data behind Today is worth building on.
 *
 * Today is being rebuilt around the day itself - who is teaching, who did not
 * turn up, what is owed - and each of those blocks rests on a field that may or
 * may not be filled in across a real term of history. A lesson with no tutor, a
 * make-up nobody rebooked, an invoice from six weeks ago: the schema allows all
 * three, and the schema cannot say how many there are.
 *
 * So this counts them before anything is designed around them. It writes
 * nothing and decides nothing; it reports what is there, including the shape of
 * the "needs attention" list, which is the one number in the app that has been
 * visible all along without ever being broken down.
 *
 * Every query throws on failure rather than returning an empty list. A
 * diagnostic that quietly reports zero because it could not read is worse than
 * no diagnostic at all.
 */
export const getDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ date: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const today = data.date;
    const tomorrow = shift(today, 1);
    const weekAhead = shift(today, 7);
    // Far enough back to cover a term, so an old unrebooked make-up still shows.
    const since = shift(today, -120);

    const [attention, sessions, absences, charges, tutors] = await Promise.all([
      client.from("v_needs_attention").select("entity, issue"),
      // Today and the week ahead: enough to see whether tutor cover is set.
      client
        .from("v_sessions")
        .select("id, code, session_date, starts_at, tutor_id, status, duration_hours")
        .gte("session_date", today)
        .lte("session_date", weekAhead)
        .neq("status", "cancelled"),
      // Absences and what became of them.
      client
        .from("v_attendance")
        .select("id, session_date, make_up_state")
        .eq("status", "absent")
        .gte("session_date", since),
      client.from("v_charges").select("id, status, final_amount, invoice_date"),
      client.from("tutors").select("id, full_name, status"),
    ]);

    for (const [what, result] of [
      ["needs attention", attention],
      ["sessions", sessions],
      ["absences", absences],
      ["charges", charges],
      ["tutors", tutors],
    ] as const) {
      if (result.error) {
        throw new Error(`Diagnostics could not read ${what}: ${result.error.message}`);
      }
    }

    const sessionRows = (sessions.data ?? []) as Row[];
    const chargeRows = (charges.data ?? []) as Row[];
    const absenceRows = (absences.data ?? []) as Row[];

    const countBy = <T>(rows: T[], key: (row: T) => string | null) => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const k = key(row);
        if (k == null) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const onDay = (day: string) => sessionRows.filter((s) => s.session_date === day);
    const coverage = (rows: Row[]) => ({
      lessons: rows.length,
      noTutor: rows.filter((s) => !s.tutor_id).length,
      hours: rows.reduce((sum, s) => sum + Number(s.duration_hours ?? 0), 0),
    });

    const unpaid = chargeRows.filter((c) => c.status === "invoiced");
    const oldestUnpaid = unpaid
      .map((c) => c.invoice_date)
      .filter(Boolean)
      .sort()[0] as string | undefined;

    return {
      date: today,
      // The 55 in the sidebar, finally itemised.
      attention: {
        total: (attention.data ?? []).length,
        byIssue: countBy((attention.data ?? []) as Row[], (r) => r.issue ?? null),
      },
      // Does the timetable know who is teaching?
      coverage: {
        today: coverage(onDay(today)),
        tomorrow: coverage(onDay(tomorrow)),
        weekAhead: coverage(sessionRows),
        activeTutors: (tutors.data ?? []).filter((t: Row) => t.status === "active").length,
      },
      // Absences, and whether anyone rebooked them.
      absences: {
        since,
        total: absenceRows.length,
        byState: countBy(absenceRows, (r) => (r.make_up_state as string) ?? "no state"),
      },
      // What the money block would have to show.
      money: {
        toInvoice: chargeRows.filter((c) => c.status === "to_invoice").length,
        unpaidCount: unpaid.length,
        unpaidValue: unpaid.reduce((sum, c) => sum + Number(c.final_amount ?? 0), 0),
        oldestUnpaidInvoiceDate: oldestUnpaid ?? null,
        byStatus: countBy(chargeRows, (c) => (c.status as string) ?? null),
      },
    };
  });
