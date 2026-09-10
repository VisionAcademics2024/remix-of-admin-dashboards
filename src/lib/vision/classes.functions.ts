import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { addDays, sydneyLocalToInstant, sydToday } from "@/lib/format";
import { db, requireManager, requireStaff } from "./guard";
import { applyTaughtFilters } from "./billing-audit";
import {
  classRemovalConsequences,
  classRemovalRefusal,
  type ClassRemovalFacts,
} from "./class-removal";
import type { Row } from "./types";

const OFFERING_SELECT =
  "*, programs(id, name, code, standard_duration_hours), operating_periods(id, name, code), tutors(id, full_name, colour)";

/** The Classes screen: capacity vs enrolled, per term. */
export const listClassOfferings = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [{ data: offerings, error }, { data: enrolments }, { data: sessions }] =
      await Promise.all([
        client
          .from("class_offerings")
          .select(OFFERING_SELECT)
          .order("starts_on", { ascending: false }),
        client.from("enrolments").select("id, class_offering_id, status, students(full_name)"),
        client.from("sessions").select("id, class_offering_id, status"),
      ]);
    if (error) throw error;

    const enrolledBy = new Map<string, number>();
    // The single enrolled student, kept only while a class has exactly one - a
    // private lesson reads better by who is in it than by a generic class name.
    const soleStudentBy = new Map<string, string | null>();
    for (const e of enrolments ?? []) {
      if (e.status === "closed") continue;
      const count = (enrolledBy.get(e.class_offering_id) ?? 0) + 1;
      enrolledBy.set(e.class_offering_id, count);
      soleStudentBy.set(
        e.class_offering_id,
        count === 1 ? ((e as Row).students?.full_name ?? null) : null,
      );
    }
    const lessonsBy = new Map<string, number>();
    for (const s of sessions ?? []) {
      lessonsBy.set(s.class_offering_id, (lessonsBy.get(s.class_offering_id) ?? 0) + 1);
    }

    return (offerings ?? []).map((o: Row) => ({
      ...o,
      enrolled: enrolledBy.get(o.id) ?? 0,
      lesson_count: lessonsBy.get(o.id) ?? 0,
      sole_student_name: soleStudentBy.get(o.id) ?? null,
    }));
  });

export const getClassOffering = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const [offering, enrolments, sessions] = await Promise.all([
      client.from("class_offerings").select(OFFERING_SELECT).eq("id", data.id).maybeSingle(),
      client
        .from("v_enrolments")
        .select("*, students(id, code, full_name)")
        .eq("class_offering_id", data.id)
        .order("starts_on"),
      client
        .from("v_sessions")
        .select("*, tutors(full_name, colour)")
        .eq("class_offering_id", data.id)
        .order("starts_at"),
    ]);

    return {
      offering: offering.data,
      enrolments: enrolments.data ?? [],
      sessions: sessions.data ?? [],
    };
  });

/**
 * The lessons a mid-term joiner can be put on: the ones still to come, and the
 * backlog behind them.
 *
 * A student who starts half way through a term has usually already sat in a
 * lesson or two before anyone opened the builder, and those are the lessons
 * the family actually owes for. Offering only future dates - which is what the
 * picker used to do - meant the backlog was invisible, so it was never marked,
 * never consumed hours, and never billed.
 *
 * So this reaches backwards as well as forwards. Cancelled lessons are left
 * out because they consume nothing, and a dedicated make-up belongs to the
 * student it was made for, not to whoever is joining now.
 *
 * `student_id` is optional and only used to say which lessons they are already
 * on: attendance is unique per (session, enrolment), so offering one twice
 * would send the database an insert it must refuse.
 */
export const listJoinableSessions = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        class_offering_id: z.string().uuid(),
        student_id: z.string().uuid().optional(),
        /** How far the backlog reaches. A term runs about ten weeks. */
        past_days: z.coerce.number().int().min(0).max(365).default(120),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const today = sydToday();

    const { data: rows, error } = await client
      .from("v_sessions")
      .select(
        "id, code, class_offering_id, starts_at, ends_at, status, session_type, " +
          "session_date, duration_hours, tutors(full_name, colour)",
      )
      .eq("class_offering_id", data.class_offering_id)
      .neq("status", "cancelled")
      .neq("session_type", "dedicated_make_up")
      .gte("session_date", addDays(today, -data.past_days))
      .order("starts_at")
      .limit(300);
    if (error) throw error;

    const sessions = (rows ?? []) as Row[];

    let roll: Row[] = [];
    if (data.student_id && sessions.length > 0) {
      const { data: mine, error: rollError } = await client
        .from("v_attendance")
        .select("id, session_id, status, att_type, package_id")
        .eq("student_id", data.student_id)
        .in(
          "session_id",
          sessions.map((s) => s.id),
        );
      if (rollError) throw rollError;
      roll = mine ?? [];
    }
    const rollBySession = new Map(roll.map((a) => [a.session_id, a]));

    return sessions.map((s) => {
      const mine = rollBySession.get(s.id);
      return {
        ...s,
        duration_hours: Number(s.duration_hours ?? 0),
        /** Already taught, so ticking it is a bill to raise rather than a booking. */
        is_backlog: s.session_date < today,
        on_roll: !!mine,
        roll_status: (mine?.status as string | undefined) ?? null,
      };
    });
  });

const offeringInput = z.object({
  program_id: z.string().uuid(),
  operating_period_id: z.string().uuid(),
  primary_tutor_id: z.string().uuid().nullish(),
  offering_type: z.enum(["group_class", "private_tuition"]),
  capacity: z.coerce.number().int().positive(),
  starts_on: z.string().min(1),
  ends_on: z.string().min(1),
  recurrence: z.enum(["weekly", "fortnightly", "daily", "one_off", "ad_hoc"]),
  /** Sydney wall-clock "YYYY-MM-DDTHH:mm" - fixes both weekday and time of day. */
  recurrence_start_local: z.string().optional().or(z.literal("")),
  session_duration_hours: z.coerce.number().positive(),
  room: z.string().optional().or(z.literal("")),
  status: z.enum(["planned", "active", "closed", "cancelled"]).default("planned"),
  notes: z.string().optional().or(z.literal("")),
});

export const saveClassOffering = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => offeringInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, recurrence_start_local, ...rest } = data;

    const payload: Record<string, unknown> = {
      ...rest,
      primary_tutor_id: rest.primary_tutor_id || null,
      room: rest.room || null,
      notes: rest.notes || null,
      recurrence_start: recurrence_start_local
        ? sydneyLocalToInstant(recurrence_start_local)
        : null,
    };

    const client = db(context.supabase);
    if (id) {
      const { error } = await client.from("class_offerings").update(payload).eq("id", id);
      if (error) throw error;
      return { id };
    }

    const { data: row, error } = await client
      .from("class_offerings")
      .insert(payload)
      .select("id, code")
      .single();
    if (error) throw error;
    return row;
  });

/**
 * Idempotent by construction - the unique index on (class_offering_id,
 * starts_at) plus "on conflict do nothing" inside the function. Re-running
 * never creates duplicates, which is the bug this replaces.
 */
export const generateSessions = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: created, error } = await client.rpc("generate_sessions", {
      p_offering_id: data.offering_id,
    });
    if (error) throw error;

    // Seeding immediately is the point: order stops mattering.
    const { data: seeded, error: seedError } = await client.rpc("seed_roll_for_offering", {
      p_offering_id: data.offering_id,
    });
    if (seedError) throw seedError;

    return { lessons_created: created ?? 0, roll_entries_created: seeded ?? 0 };
  });

/** Exposed as a manual action as well as running on enrolment creation. */
export const seedRollForOffering = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: seeded, error } = await db(context.supabase).rpc("seed_roll_for_offering", {
      p_offering_id: data.offering_id,
    });
    if (error) throw error;
    return { roll_entries_created: seeded ?? 0 };
  });

/**
 * The class's status, and the lessons that follow from it.
 *
 * Setting a class to Cancelled used to change one word on the Classes screen
 * and nothing else: every lesson it had generated stayed on the timetable,
 * because nothing cascaded from a class to its own lessons. So "I cancelled it
 * and it is still there" was exactly right, and the only honest answer to a
 * class that should not be running.
 *
 * Cancelling now takes its lessons with it - but only the ones it is safe to
 * take. A lesson whose roll has been marked is history: `hours_consumed` reads
 * zero for a cancelled lesson, so cancelling one that was taught would silently
 * un-bill it. Those are left alone, and so is anything already in the past.
 * What gets cancelled is what was still going to happen.
 *
 * Nothing is un-cancelled on the way back. Setting a class active again does
 * not know which of its lessons were cancelled by this and which by a person,
 * and guessing wrong puts a lesson back that somebody deliberately called off.
 * A single lesson goes back on from the timetable, where the person doing it
 * can see what they are restoring.
 */
export const closeClassOffering = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["closed", "cancelled", "active", "planned"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { error } = await client
      .from("class_offerings")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;

    if (data.status !== "cancelled") return { success: true, lessons_cancelled: 0 };

    // Lessons still to come, that nobody has marked.
    const { data: upcoming, error: readError } = await client
      .from("v_sessions")
      .select("id, session_date, status")
      .eq("class_offering_id", data.id)
      .eq("status", "scheduled")
      .gte("session_date", sydToday());
    if (readError) throw readError;

    const ids = (upcoming ?? []).map((row: Row) => row.id as string);
    if (!ids.length) return { success: true, lessons_cancelled: 0 };

    const { data: marked } = await client
      .from("attendance")
      .select("session_id")
      .in("session_id", ids)
      .neq("status", "not_marked");
    const untouched = new Set(ids);
    for (const row of marked ?? []) untouched.delete((row as Row).session_id as string);
    if (!untouched.size) return { success: true, lessons_cancelled: 0 };

    const { error: cancelError } = await client
      .from("sessions")
      .update({ status: "cancelled" })
      .in("id", [...untouched]);
    if (cancelError) throw cancelError;

    return { success: true, lessons_cancelled: untouched.size };
  });

/**
 * What deleting this class would take with it, before anyone commits to it.
 *
 * Read separately from the delete so the confirmation states this class's own
 * numbers rather than a generic warning - ten lessons and a student is a very
 * different thing to agree to than an empty shell.
 */
export const getClassOfferingRemoval = createServerFn({ method: "GET" })
  .middleware([requireManager])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: offering, error } = await client
      .from("class_offerings")
      .select("id, code, status, programs(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!offering) throw new Error("That class no longer exists.");

    const facts = await classRemovalFacts(client, data.id);
    return {
      offering: offering as Row,
      facts,
      refusal: classRemovalRefusal(facts),
      consequences: classRemovalConsequences(facts),
    };
  });

/**
 * Delete a class outright - the undo for one built by mistake.
 *
 * Foreign keys onto class_offerings are ON DELETE RESTRICT from both sessions
 * and enrolments, and attendance sits under both, so this unpicks them in the
 * only order that works: roll, then enrolments and lessons, then the class.
 *
 * The same two refusals as the dialog, checked again here: a screen can be out
 * of date by the time the button is pressed, and whether a lesson has been
 * charged must not depend on how fresh it was.
 */
export const deleteClassOffering = createServerFn({ method: "POST" })
  .middleware([requireManager])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const facts = await classRemovalFacts(client, data.id);
    const refusal = classRemovalRefusal(facts);
    if (refusal) throw new Error(refusal);

    const [{ data: sessions }, { data: enrolments }] = await Promise.all([
      client.from("sessions").select("id").eq("class_offering_id", data.id),
      client.from("enrolments").select("id").eq("class_offering_id", data.id),
    ]);
    const sessionIds = (sessions ?? []).map((row: Row) => row.id as string);
    const enrolmentIds = (enrolments ?? []).map((row: Row) => row.id as string);

    // The roll first: attendance restricts the delete of an enrolment and
    // cascades from a session, so clearing it explicitly keeps the order plain
    // rather than relying on which side happens to cascade. Cleared by id from
    // both sides - see rollEntryIds - because an enrolment can be booked onto a
    // make-up that is not one of these lessons.
    const attendanceIds = await rollEntryIds(client, sessionIds, enrolmentIds);
    if (attendanceIds.length) {
      const { error } = await client.from("attendance").delete().in("id", attendanceIds);
      if (error) throw error;
    }

    const { error: enrolError } = await client
      .from("enrolments")
      .delete()
      .eq("class_offering_id", data.id);
    if (enrolError) throw enrolError;

    const { error: sessionError } = await client
      .from("sessions")
      .delete()
      .eq("class_offering_id", data.id);
    if (sessionError) throw sessionError;

    const { error: offeringError } = await client
      .from("class_offerings")
      .delete()
      .eq("id", data.id);
    if (offeringError) throw offeringError;

    return { success: true, ...facts };
  });

/**
 * Every roll entry this class touches, from both sides.
 *
 * Almost always these are the same rows: the roll of this class's own lessons.
 * But a make-up books this class's enrolment onto a lesson of its own, so an
 * enrolment can carry roll entries that sit on none of these sessions - and
 * those would meet the delete below as a foreign-key error rather than a
 * sentence. The union is what the warning counts and what the delete clears.
 */
async function rollEntryIds(
  client: ReturnType<typeof db>,
  sessionIds: string[],
  enrolmentIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();

  if (sessionIds.length) {
    const { data, error } = await client
      .from("attendance")
      .select("id")
      .in("session_id", sessionIds);
    if (error) throw error;
    for (const row of data ?? []) ids.add((row as Row).id as string);
  }

  if (enrolmentIds.length) {
    const { data, error } = await client
      .from("attendance")
      .select("id")
      .in("enrolment_id", enrolmentIds);
    if (error) throw error;
    for (const row of data ?? []) ids.add((row as Row).id as string);
  }

  return [...ids];
}

/** The counts both the warning and the delete are decided from. */
async function classRemovalFacts(
  client: ReturnType<typeof db>,
  offeringId: string,
): Promise<ClassRemovalFacts> {
  const [{ data: sessions }, { data: enrolments }] = await Promise.all([
    client.from("sessions").select("id").eq("class_offering_id", offeringId),
    client.from("enrolments").select("id").eq("class_offering_id", offeringId),
  ]);

  const sessionIds = (sessions ?? []).map((row: Row) => row.id as string);
  const enrolmentIds = (enrolments ?? []).map((row: Row) => row.id as string);
  const attendanceIds = await rollEntryIds(client, sessionIds, enrolmentIds);

  if (!attendanceIds.length) {
    return {
      lessons: sessionIds.length,
      enrolments: enrolmentIds.length,
      rollEntries: 0,
      taughtLessons: 0,
      charges: 0,
    };
  }

  const [taught, charged] = await Promise.all([
    // The same definition of "taught" the billing audit uses, so the refusal
    // and the money agree about which lessons actually happened.
    applyTaughtFilters(
      client
        .from("v_attendance")
        .select("id", { count: "exact", head: true })
        .in("id", attendanceIds),
    ),
    // Charges point at attendance, so the roll ids are what decides whether any
    // money has been asked for against this class.
    client
      .from("charges")
      .select("id", { count: "exact", head: true })
      .in("attendance_id", attendanceIds)
      .neq("status", "cancelled"),
  ]);

  return {
    lessons: sessionIds.length,
    enrolments: enrolmentIds.length,
    rollEntries: attendanceIds.length,
    taughtLessons: taught.count ?? 0,
    charges: charged.count ?? 0,
  };
}
