import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import {
  assertReschedulable,
  assertRollUnmarked,
  reschedulePatch,
  validateProposedTimes,
  type RescheduleCurrent,
} from "./schedule.rules";
import type { Row } from "./types";

const SESSION_SELECT =
  "*, tutors(id, full_name, colour), class_offerings(id, code, room, capacity, programs(name, code), operating_periods(name, code))";

/**
 * A week of lessons. Bounds are Sydney calendar dates; the query widens them by
 * a day on each side and filters on session_date so no lesson is lost to the
 * UTC offset at the edges of the window.
 */
export const listWeek = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ week_start: z.string().min(1), tutor_id: z.string().uuid().nullish() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const from = shiftDate(data.week_start, -1);
    const to = shiftDate(data.week_start, 8);

    let query = client
      .from("v_sessions")
      .select(SESSION_SELECT)
      .gte("starts_at", `${from}T00:00:00Z`)
      .lte("starts_at", `${to}T00:00:00Z`)
      .order("starts_at");

    if (data.tutor_id) query = query.eq("tutor_id", data.tutor_id);

    const { data: sessions, error } = await query;
    if (error) throw error;

    const weekEnd = shiftDate(data.week_start, 6);
    const inWeek = (sessions ?? []).filter(
      (s: Row) => s.session_date >= data.week_start && s.session_date <= weekEnd,
    );

    const ids = inWeek.map((s: Row) => s.id);
    const counts = new Map<string, { marked: number; total: number }>();
    if (ids.length) {
      const { data: roll } = await client
        .from("attendance")
        .select("session_id, status")
        .in("session_id", ids);
      for (const r of roll ?? []) {
        const c = counts.get(r.session_id) ?? { marked: 0, total: 0 };
        c.total += 1;
        if (r.status !== "not_marked") c.marked += 1;
        counts.set(r.session_id, c);
      }
    }

    return inWeek.map((s: Row) => ({
      ...s,
      roll_marked: counts.get(s.id)?.marked ?? 0,
      roll_total: counts.get(s.id)?.total ?? 0,
    }));
  });

/**
 * Any span of days, for the calendar's day, week and month views. Same shape
 * and same roll counts as listWeek; only the window differs.
 */
export const listRange = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        tutor_id: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    let query = client
      .from("v_sessions")
      .select(SESSION_SELECT)
      // Widened by a day either side, then filtered on session_date, so nothing
      // is lost to the UTC offset at the edges of the window.
      .gte("starts_at", `${shiftDate(data.from, -1)}T00:00:00Z`)
      .lte("starts_at", `${shiftDate(data.to, 2)}T00:00:00Z`)
      .order("starts_at");

    if (data.tutor_id) query = query.eq("tutor_id", data.tutor_id);

    const { data: sessions, error } = await query;
    if (error) throw error;

    const inRange = (sessions ?? []).filter(
      (s: Row) => s.session_date >= data.from && s.session_date <= data.to,
    );

    const ids = inRange.map((s: Row) => s.id);
    const counts = new Map<string, { marked: number; total: number }>();
    if (ids.length) {
      const { data: roll } = await client
        .from("attendance")
        .select("session_id, status")
        .in("session_id", ids);
      for (const r of roll ?? []) {
        const c = counts.get(r.session_id) ?? { marked: 0, total: 0 };
        c.total += 1;
        if (r.status !== "not_marked") c.marked += 1;
        counts.set(r.session_id, c);
      }
    }

    // A class with exactly one enrolled student reads by that student's name on
    // the grid, so the sole student per offering in view is looked up once.
    const soleStudent = await soleStudentByOffering(
      client,
      inRange.map((s: Row) => s.class_offering_id),
    );

    // v_sessions predates the Google mapping columns, and the database is not
    // being changed for this stage, so the four mapping fields are read once for
    // the lessons already in hand and merged in here.
    const mapping = await calendarMappingBySession(client, ids);

    return inRange.map((s: Row) => ({
      ...s,
      roll_marked: counts.get(s.id)?.marked ?? 0,
      roll_total: counts.get(s.id)?.total ?? 0,
      sole_student_name: soleStudent.get(s.class_offering_id) ?? null,
      ...(mapping.get(s.id) ?? {
        google_calendar_id: null,
        google_event_id: null,
        calendar_sync_status: "not_synced",
        calendar_last_synced_at: null,
      }),
    }));
  });

export type CalendarMapping = {
  google_calendar_id: string | null;
  google_event_id: string | null;
  calendar_sync_status: string;
  calendar_last_synced_at: string | null;
};

/** The Google mapping for the lessons already returned by the timetable read. */
async function calendarMappingBySession(
  client: ReturnType<typeof db>,
  sessionIds: string[],
): Promise<Map<string, CalendarMapping>> {
  const result = new Map<string, CalendarMapping>();
  if (!sessionIds.length) return result;

  const { data, error } = await client
    .from("sessions")
    .select(
      "id, google_calendar_id, google_event_id, calendar_sync_status, calendar_last_synced_at",
    )
    .in("id", sessionIds);
  if (error) throw error;

  for (const row of data ?? []) {
    result.set(row.id, {
      google_calendar_id: row.google_calendar_id ?? null,
      google_event_id: row.google_event_id ?? null,
      calendar_sync_status: row.calendar_sync_status ?? "not_synced",
      calendar_last_synced_at: row.calendar_last_synced_at ?? null,
    });
  }
  return result;
}


/**
 * The one enrolled student for each offering that has exactly one - null for
 * classes with none or with two or more. A closed enrolment does not count.
 */
async function soleStudentByOffering(
  client: ReturnType<typeof db>,
  offeringIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const unique = [...new Set(offeringIds.filter(Boolean))];
  if (!unique.length) return result;

  const { data: enrolments } = await client
    .from("enrolments")
    .select("class_offering_id, status, students(full_name)")
    .in("class_offering_id", unique);

  const counts = new Map<string, number>();
  for (const e of enrolments ?? []) {
    if (e.status === "closed") continue;
    const n = (counts.get(e.class_offering_id) ?? 0) + 1;
    counts.set(e.class_offering_id, n);
    result.set(e.class_offering_id, n === 1 ? ((e as Row).students?.full_name ?? null) : null);
  }
  return result;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's lessons, in Sydney. */
export const listToday = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ date: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: sessions, error } = await db(context.supabase)
      .from("v_sessions")
      .select(SESSION_SELECT)
      .gte("starts_at", `${shiftDate(data.date, -1)}T00:00:00Z`)
      .lte("starts_at", `${shiftDate(data.date, 2)}T00:00:00Z`)
      .order("starts_at");
    if (error) throw error;
    return (sessions ?? []).filter((s: Row) => s.session_date === data.date);
  });

const sessionPatch = z.object({
  id: z.string().uuid(),
  tutor_id: z.string().uuid().nullish(),
  room: z.string().optional().or(z.literal("")),
  status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]).optional(),
  notes: z.string().optional().or(z.literal("")),
});

/**
 * Everything about a lesson except when it happens: tutor, room, notes and a
 * deliberate status change.
 *
 * Times are deliberately absent from the patch. `rescheduleSession` is the one
 * operation allowed to move a lesson, so its protections (future only, roll
 * unmarked, same row, same id) cannot be bypassed by sending starts_at here.
 */
export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => sessionPatch.parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const payload = Object.fromEntries(
      Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, v === "" ? null : v]),
    );
    const { error } = await db(context.supabase).from("sessions").update(payload).eq("id", id);
    if (error) throw error;
    return { success: true };
  });

/**
 * Move one lesson to a new time, in place.
 *
 * The canonical - and only - way a lesson's time changes. The same row is
 * updated, so its id survives and every roll entry, hour, charge and pay figure
 * that hangs off `session_id` follows the lesson without being rewritten.
 *
 * What it will not do:
 *  - move a lesson that has already started, or into the past;
 *  - move a lesson whose roll has been marked (that is history, not a plan);
 *  - change session_type or status. An ordinary move stays an ordinary lesson.
 *    A make-up is a student-level decision on attendance, never a side effect
 *    of dragging a block on the timetable.
 *
 * The first move remembers the slot the lesson came from; later moves keep that
 * first memory. `session_date` is derived in the view from the new starts_at.
 */
export const rescheduleSession = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        starts_at: z.string().min(1),
        ends_at: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const now = Date.now();

    validateProposedTimes(data.starts_at, data.ends_at, now);

    const { data: current, error: readError } = await client
      .from("sessions")
      .select("id, starts_at, ends_at, original_starts_at, original_ends_at")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("That lesson no longer exists.");

    assertReschedulable(current as RescheduleCurrent, now);

    const { data: marked, error: rollError } = await client
      .from("attendance")
      .select("id")
      .eq("session_id", data.id)
      .neq("status", "not_marked")
      .limit(1);
    if (rollError) throw rollError;
    assertRollUnmarked((marked ?? []).length);

    const payload = reschedulePatch(current as RescheduleCurrent, data.starts_at, data.ends_at);

    const { data: saved, error } = await client
      .from("sessions")
      .update(payload)
      .eq("id", data.id)
      .select(
        "id, starts_at, ends_at, session_type, status, google_calendar_id, google_event_id, calendar_sync_status",
      )
      .single();
    if (error) {
      throw new Error(
        error.message.includes("sessions_regular_slot") || error.message.includes("duplicate")
          ? "There is already a lesson for this class at that time."
          : error.message,
      );
    }

    // A lesson that already lives on the Google test calendar is now out of date
    // there, so it is marked pending. A lesson with no mapping stays
    // `not_synced`: nothing is queued and nothing is sent.
    const mapped = isMappedSession(saved as unknown as Row);
    if (mapped) {
      const { error: pendingError } = await client
        .from("sessions")
        .update({ calendar_sync_status: "pending" })
        .eq("id", data.id);
      if (pendingError) throw pendingError;
    }

    return { ...saved, calendar_sync_status: mapped ? "pending" : saved.calendar_sync_status };
  });


/** Cancelling preserves the roll. Cancelled lessons pay nobody and consume nothing. */
export const cancelSession = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), notes: z.string().optional().or(z.literal("")) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("sessions")
      .update({ status: "cancelled", notes: data.notes || null })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/**
 * Delete a lesson.
 *
 * Only ever a lesson with no roll. Attendance is the service-delivery record
 * and is never deleted here - a lesson that has a roll is cancelled, which
 * keeps the history intact. There is no force option, by design.
 */
export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { count, error: countError } = await client
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error(
        "This lesson has a roll, so it cannot be deleted. Cancel it instead - that keeps the attendance record.",
      );
    }

    const { error } = await client.from("sessions").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/** A one-off lesson added by hand, seeded straight away. */
export const createSession = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        class_offering_id: z.string().uuid(),
        tutor_id: z.string().uuid().nullish(),
        starts_at: z.string().min(1),
        ends_at: z.string().min(1),
        room: z.string().optional().or(z.literal("")),
        session_type: z.enum(["regular", "dedicated_make_up"]).default("regular"),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: row, error } = await client
      .from("sessions")
      .insert({
        ...data,
        tutor_id: data.tutor_id || null,
        room: data.room || null,
        notes: data.notes || null,
      })
      .select("id, code")
      .single();
    if (error) throw error;

    await client.rpc("seed_roll", { p_session_id: row.id });
    return row;
  });

/** The roll for one lesson, ready to mark. */
export const getSessionRoll = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const [session, roll, trials] = await Promise.all([
      client.from("v_sessions").select(SESSION_SELECT).eq("id", data.session_id).maybeSingle(),
      client
        .from("v_attendance")
        .select("*, enrolments(code, method, students(id, code, full_name))")
        .eq("session_id", data.session_id),
      // Trial students booked onto this exact lesson. They have no enrolment or
      // attendance row - they live on the trials table until their lead converts
      // - so they are read separately and shown alongside the enrolled roll.
      client
        .from("trials")
        .select("id, code, status, session_id, scheduled_for, leads(id, code, student_name)")
        .eq("session_id", data.session_id)
        .eq("kind", "class_trial")
        .not("status", "in", "(declined,converted)"),
    ]);

    const entries = (roll.data ?? []).sort((a: Row, b: Row) =>
      (a.enrolments?.students?.full_name ?? "").localeCompare(
        b.enrolments?.students?.full_name ?? "",
      ),
    );
    const trialEntries = (trials.data ?? []).sort((a: Row, b: Row) =>
      (a.leads?.student_name ?? "").localeCompare(b.leads?.student_name ?? ""),
    );

    return { session: session.data, roll: entries, trials: trialEntries };
  });

/** Seeding is idempotent, so this is safe to offer as a button on every lesson. */
export const seedRoll = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: created, error } = await db(context.supabase).rpc("seed_roll", {
      p_session_id: data.session_id,
    });
    if (error) throw error;
    return { created: created ?? 0 };
  });
