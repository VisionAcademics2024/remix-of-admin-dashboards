import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
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

    return inRange.map((s: Row) => ({
      ...s,
      roll_marked: counts.get(s.id)?.marked ?? 0,
      roll_total: counts.get(s.id)?.total ?? 0,
      sole_student_name: soleStudent.get(s.class_offering_id) ?? null,
    }));
  });

/**
 * The one enrolled student for each offering that has exactly one — null for
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
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  notes: z.string().optional().or(z.literal("")),
});

/**
 * Edit lesson times in place. Never delete and regenerate — that orphans the
 * roll and loses attendance marks.
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
 * Move one lesson on the calendar, and let that mean something.
 *
 * A lesson dragged off the slot it was generated in becomes a make-up: its type
 * flips to `dedicated_make_up` and the slot it came from is remembered. Drag it
 * back onto that exact slot and it becomes an ordinary lesson again, the
 * remembered slot cleared. Only this one lesson changes — every other week's
 * lesson in the class is its own row and stays put.
 *
 * Reading and writing the base table (not the view) so the original slot is
 * available; if the columns that hold it are not present yet, the move and the
 * make-up flag still take effect — only the remembered slot is skipped.
 */
export const moveSession = createServerFn({ method: "POST" })
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

    const { data: current, error: readError } = await client
      .from("sessions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("That lesson no longer exists.");

    const origStart = (current as Row).original_starts_at ?? current.starts_at;
    const origEnd = (current as Row).original_ends_at ?? current.ends_at;
    const home =
      Date.parse(data.starts_at) === Date.parse(origStart) &&
      Date.parse(data.ends_at) === Date.parse(origEnd);

    // A moved lesson becomes a make-up, and make-ups stack — a class may hold a
    // make-up on top of its normal lesson, or several at once — so a move onto
    // an occupied slot is fine and needs no clearing. Only two REGULAR lessons
    // at the same start are still refused (the friendly message below), which a
    // move never causes: it always lands as a make-up.

    const payload: Record<string, unknown> = home
      ? {
          starts_at: origStart,
          ends_at: origEnd,
          session_type: "regular",
          original_starts_at: null,
          original_ends_at: null,
        }
      : {
          starts_at: data.starts_at,
          ends_at: data.ends_at,
          session_type: "dedicated_make_up",
          original_starts_at: origStart,
          original_ends_at: origEnd,
        };

    let { error } = await client.from("sessions").update(payload).eq("id", data.id);
    // If the remembered-slot columns are not in this database yet, still move
    // the lesson and set the make-up flag — just without the memory.
    if (error && /original_(starts|ends)_at/.test(error.message)) {
      const { original_starts_at, original_ends_at, ...rest } = payload;
      void original_starts_at;
      void original_ends_at;
      ({ error } = await client.from("sessions").update(rest).eq("id", data.id));
    }
    if (error) {
      throw new Error(
        error.message.includes("sessions_no_duplicates") || error.message.includes("duplicate")
          ? "There is already a lesson for this class at that time."
          : error.message,
      );
    }

    return { make_up: !home };
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
 * Without `force` this stays deliberately hard to reach — allowed only while the
 * lesson has no roll, so a lesson that has run is cancelled instead. With
 * `force` (an explicit "delete anyway" from the lesson panel) it removes the
 * roll first and then the lesson, for clearing out a spare or duplicate lesson
 * off the calendar even when it carries a roll.
 */
export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), force: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { count } = await client
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.id);
    if ((count ?? 0) > 0) {
      if (!data.force) {
        throw new Error(
          "This lesson has a roll. Cancel it instead — deleting would erase the attendance record.",
        );
      }
      const { error: rollError } = await client
        .from("attendance")
        .delete()
        .eq("session_id", data.id);
      if (rollError) throw rollError;
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

    const [session, roll] = await Promise.all([
      client.from("v_sessions").select(SESSION_SELECT).eq("id", data.session_id).maybeSingle(),
      client
        .from("v_attendance")
        .select("*, enrolments(code, method, students(id, code, full_name))")
        .eq("session_id", data.session_id),
    ]);

    const entries = (roll.data ?? []).sort((a: Row, b: Row) =>
      (a.enrolments?.students?.full_name ?? "").localeCompare(
        b.enrolments?.students?.full_name ?? "",
      ),
    );

    return { session: session.data, roll: entries };
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
