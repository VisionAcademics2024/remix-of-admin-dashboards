import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sydneyLocalToInstant } from "@/lib/format";

import { db, requireStaff } from "./guard";
import type { Row } from "./types";

const ROLL_SELECT =
  "*, sessions(code, starts_at, ends_at, status, tutors(full_name, colour), class_offerings(code, programs(name))), enrolments(code, method, students(id, code, full_name))";

export const ROLL_FILTERS = [
  "today",
  "unmarked",
  "this_week",
  "make_ups",
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
      case "make_ups":
        // Both halves of a make-up: the absence still owed one, and the
        // make-up entry itself once a day has been picked.
        query = query.or("status.eq.absent,att_type.eq.make_up");
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

    const result = rows ?? [];
    // make_up_state is derived in the view, so a settled absence — one whose
    // make-up has already been attended — drops out here rather than in SQL.
    if (data.filter === "make_ups") {
      return result.filter((r: Row) => r.att_type === "make_up" || r.make_up_state !== "completed");
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

/**
 * A make-up is deliberately not a workflow.
 *
 * There are two states worth recording and no more: the student was away and
 * is owed one, or a day has been picked. "Owed" is not a stored flag — it is
 * simply an absence with no make-up attached, which v_attendance already
 * derives — so holding one is just marking the absence and writing down why.
 */
export const holdMakeUp = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), note: z.string().optional().or(z.literal("")) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("attendance")
      .update({
        status: "absent",
        correction_note: data.note?.trim()
          ? data.note.trim()
          : "Make-up owed — day not decided yet.",
      })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/** The lessons already on a given Sydney date for this student's class. */
export const listLessonsOnDate = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ date: z.string().min(1), attendance_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: source } = await client
      .from("attendance")
      .select("enrolment_id, enrolments(class_offering_id)")
      .eq("id", data.attendance_id)
      .maybeSingle();

    const { data: rows, error } = await client
      .from("v_sessions")
      .select("id, code, starts_at, ends_at, session_date, status, tutor_id, tutors(full_name)")
      .eq("session_date", data.date)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(50);
    if (error) throw error;

    const offeringId = (source as Row | null)?.enrolments?.class_offering_id ?? null;
    return { lessons: rows ?? [], class_offering_id: offeringId };
  });

/**
 * Book the make-up on a day.
 *
 * Either onto a lesson that already exists, or — the common case, because a
 * make-up rarely lines up with a scheduled class — onto a new one created for
 * it. That new lesson may have no tutor: who teaches it is often decided after
 * the day is, and refusing to record the day until a tutor exists is what made
 * the old flow unusable.
 */
export const bookMakeUp = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        source_attendance_id: z.string().uuid(),
        /** An existing lesson, or null to create one on `date`. */
        session_id: z.string().uuid().nullable().default(null),
        /** Sydney date and wall-clock start for a new lesson. */
        date: z.string().min(1).nullable().default(null),
        start_time: z.string().min(1).nullable().default(null),
        duration_hours: z.number().positive().max(12).default(1),
        tutor_id: z.string().uuid().nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: source, error: sourceError } = await client
      .from("attendance")
      .select("enrolment_id, package_id, session_id, enrolments(class_offering_id)")
      .eq("id", data.source_attendance_id)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new Error("That absence no longer exists.");

    let sessionId = data.session_id;

    if (!sessionId) {
      if (!data.date || !data.start_time) {
        throw new Error("Pick a day and a time for the make-up lesson.");
      }
      const offeringId = (source as Row).enrolments?.class_offering_id;
      if (!offeringId) {
        throw new Error("This enrolment has no class, so a make-up lesson cannot be created.");
      }

      const startsAt = sydneyLocalToInstant(`${data.date}T${data.start_time}`);
      const endsAt = new Date(Date.parse(startsAt) + data.duration_hours * 3_600_000).toISOString();

      const { data: created, error: createError } = await client
        .from("sessions")
        .insert({
          class_offering_id: offeringId,
          tutor_id: data.tutor_id,
          session_type: "dedicated_make_up",
          status: "scheduled",
          starts_at: startsAt,
          ends_at: endsAt,
          notes: "Created for a make-up.",
        })
        .select("id")
        .single();
      if (createError) throw createError;
      sessionId = created.id;
    } else if (sessionId === source.session_id) {
      throw new Error("A make-up has to sit on a different lesson from the absence.");
    }

    // The absence is the thing being settled, so make sure it reads as one.
    await client
      .from("attendance")
      .update({ status: "absent" })
      .eq("id", data.source_attendance_id)
      .eq("status", "not_marked");

    const { error } = await client.from("attendance").insert({
      session_id: sessionId,
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

/**
 * Who taught it, set from the roll. A make-up lesson is usually created before
 * anyone knows, and this is where you find out.
 */
export const setLessonTutor = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ session_id: z.string().uuid(), tutor_id: z.string().uuid().nullable() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("sessions")
      .update({ tutor_id: data.tutor_id })
      .eq("id", data.session_id);
    if (error) throw error;
    return { success: true };
  });
