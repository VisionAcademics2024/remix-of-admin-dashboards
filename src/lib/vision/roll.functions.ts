import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import type { Row } from "./types";

const ROLL_SELECT =
  "*, sessions(code, starts_at, ends_at, status, tutors(full_name, colour), class_offerings(code, programs(name))), enrolments(code, method, students(id, code, full_name))";

export const ROLL_FILTERS = [
  "today",
  "unmarked",
  "this_week",
  "absences_owed",
  "makeups_booked",
  "trials",
  "all",
] as const;

export type RollFilter = (typeof ROLL_FILTERS)[number];

/**
 * Every filter computes "today" in Sydney and compares against
 * v_attendance.session_date — never a raw timestamp comparison. The old
 * system's Today screen showed tomorrow's 8am lessons because a rollup
 * defaulted to GMT.
 */
export const listRoll = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        filter: z.enum(ROLL_FILTERS).default("today"),
        today: z.string().min(1),
        week_start: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    let query = client.from("v_attendance").select(ROLL_SELECT);

    switch (data.filter) {
      case "today":
        query = query.eq("session_date", data.today);
        break;
      case "unmarked":
        query = query.eq("status", "not_marked").lte("session_date", data.today);
        break;
      case "this_week":
        query = query
          .gte("session_date", data.week_start)
          .lte("session_date", shift(data.week_start, 6));
        break;
      case "absences_owed":
      case "makeups_booked":
        query = query.eq("status", "absent");
        break;
      case "trials":
        query = query.eq("att_type", "trial");
        break;
      case "all":
        query = query.gte("session_date", shift(data.today, -120));
        break;
    }

    const { data: rows, error } = await query
      .order("lesson_starts_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    let result = rows ?? [];
    // make_up_state is derived in the view, so these two filter in memory.
    if (data.filter === "absences_owed") {
      result = result.filter((r: Row) => r.make_up_state === "outstanding");
    }
    if (data.filter === "makeups_booked") {
      result = result.filter((r: Row) => r.make_up_state === "scheduled");
    }

    return result;
  });

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Marking a student present is the act that spends their money. Nothing else
 * does — and un-marking refunds automatically, because the balance is a view.
 */
export const markAttendance = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["not_marked", "present", "absent"]),
        correction_note: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.correction_note !== undefined) patch["correction_note"] = data.correction_note || null;

    const { error } = await db(context.supabase).from("attendance").update(patch).eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/** Mark a whole roll in one go, for the common "everyone turned up" case. */
export const markRollBulk = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        status: z.enum(["present", "absent", "not_marked"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("attendance")
      .update({ status: data.status })
      .in("id", data.ids);
    if (error) throw error;
    return { updated: data.ids.length };
  });

/**
 * Which package pays. The database refuses a package belonging to another
 * student or one this enrolment is not eligible for; this surfaces why.
 */
export const setAttendancePackage = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), package_id: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("attendance")
      .update({ package_id: data.package_id })
      .eq("id", data.id);
    if (error) {
      throw new Error(
        error.message.includes("not eligible")
          ? "That package is not eligible for this enrolment. Tick the enrolment on the package first (Enrolments & Hours)."
          : error.message,
      );
    }
    return { success: true };
  });

/* --------------------------------------------------------------------- Make-ups */

/** Outstanding absences, booked make-ups, and make-ups waiting to be marked. */
export const listMakeUps = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [absences, makeups] = await Promise.all([
      client
        .from("v_attendance")
        .select(ROLL_SELECT)
        .eq("status", "absent")
        .order("lesson_starts_at", { ascending: false })
        .limit(400),
      client
        .from("v_attendance")
        .select(ROLL_SELECT)
        .eq("att_type", "make_up")
        .order("lesson_starts_at")
        .limit(400),
    ]);

    const rows = absences.data ?? [];
    return {
      outstanding: rows.filter((r: Row) => r.make_up_state === "outstanding"),
      scheduled: rows.filter((r: Row) => r.make_up_state === "scheduled"),
      completed: rows.filter((r: Row) => r.make_up_state === "completed"),
      toMark: (makeups.data ?? []).filter((r: Row) => r.status === "not_marked"),
    };
  });

/**
 * A make-up is a new roll entry on a different lesson, linked back to the
 * absence it settles. It consumes hours like any other lesson.
 */
export const createMakeUp = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({ source_attendance_id: z.string().uuid(), session_id: z.string().uuid() })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: source, error: sourceError } = await client
      .from("attendance")
      .select("enrolment_id, package_id, session_id")
      .eq("id", data.source_attendance_id)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new Error("That absence no longer exists.");
    if (source.session_id === data.session_id) {
      throw new Error("A make-up has to sit on a different lesson from the absence.");
    }

    const { error } = await client.from("attendance").insert({
      session_id: data.session_id,
      enrolment_id: source.enrolment_id,
      att_type: "make_up",
      status: "not_marked",
      package_id: source.package_id,
      source_attendance_id: data.source_attendance_id,
    });
    if (error) {
      throw new Error(
        error.message.includes("attendance_unique")
          ? "That student is already on the roll for that lesson."
          : error.message,
      );
    }
    return { success: true };
  });

/** Candidate lessons a make-up could be booked onto. */
export const listMakeUpCandidates = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ from: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await db(context.supabase)
      .from("v_sessions")
      .select(
        "id, code, starts_at, ends_at, session_date, status, class_offerings(code, programs(name))",
      )
      .gte("starts_at", `${data.from}T00:00:00Z`)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });
