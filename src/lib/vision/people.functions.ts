import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import type { Row } from "./types";

const STUDENT_FIELDS =
  "id, code, full_name, status, year_level, current_school, date_of_birth, joined_on, how_they_found_us, default_payer_id, notes";
const GUARDIAN_FIELDS = "id, code, full_name, email, mobile, status, notes";

/* -------------------------------------------------------------------- Students */

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [{ data: students, error }, { data: links }] = await Promise.all([
      client.from("students").select(STUDENT_FIELDS).order("full_name"),
      client
        .from("student_guardians")
        .select("student_id, relationship, guardians(id, code, full_name, email, mobile)"),
    ]);
    if (error) throw error;

    const byStudent = new Map<string, Row[]>();
    for (const link of links ?? []) {
      const list = byStudent.get(link.student_id) ?? [];
      list.push({ ...link.guardians, relationship: link.relationship });
      byStudent.set(link.student_id, list);
    }

    return (students ?? []).map((s: Row) => ({
      ...s,
      guardians: byStudent.get(s.id) ?? [],
      default_payer_name:
        (byStudent.get(s.id) ?? []).find((g: Row) => g.id === s.default_payer_id)?.full_name ??
        null,
    }));
  });

const studentInput = z.object({
  full_name: z.string().min(1, "Name is required"),
  status: z.enum(["active", "inactive"]).default("active"),
  year_level: z.string().optional().or(z.literal("")),
  current_school: z.string().optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  joined_on: z.string().optional().or(z.literal("")),
  how_they_found_us: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

function blankToNull<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "" ? null : v])) as T;
}

/** Creating a student must be as fast as typing a name — everything else optional. */
export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => studentInput.parse(data))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await db(context.supabase)
      .from("students")
      .insert(blankToNull(data))
      .select(STUDENT_FIELDS)
      .single();
    if (error) throw error;
    return row;
  });

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => studentInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await db(context.supabase)
      .from("students")
      .update(blankToNull(patch))
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  });

/**
 * The default payer must already be a guardian of this student — the deferred
 * trigger enforces it, this just gives a readable error first.
 */
export const setDefaultPayer = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({ student_id: z.string().uuid(), guardian_id: z.string().uuid().nullable() })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    if (data.guardian_id) {
      const { data: link } = await client
        .from("student_guardians")
        .select("student_id")
        .eq("student_id", data.student_id)
        .eq("guardian_id", data.guardian_id)
        .maybeSingle();
      if (!link) {
        throw new Error("Link this guardian to the student before making them the payer.");
      }
    }

    const { error } = await client
      .from("students")
      .update({ default_payer_id: data.guardian_id })
      .eq("id", data.student_id);
    if (error) throw error;
    return { success: true };
  });

/* ------------------------------------------------------------------- Guardians */

export const listGuardians = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("guardians")
      .select(GUARDIAN_FIELDS)
      .order("full_name");
    if (error) throw error;
    return data ?? [];
  });

const guardianInput = z.object({
  full_name: z.string().min(1, "Name is required"),
  email: z.string().optional().or(z.literal("")),
  mobile: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().optional().or(z.literal("")),
});

export const createGuardian = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => guardianInput.parse(data))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await db(context.supabase)
      .from("guardians")
      .insert(blankToNull(data))
      .select(GUARDIAN_FIELDS)
      .single();
    if (error) throw error;
    return row;
  });

export const updateGuardian = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => guardianInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await db(context.supabase)
      .from("guardians")
      .update(blankToNull(patch))
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  });

/**
 * Attaching an existing guardian and creating a new one are separate calls on
 * purpose: conflating them is what corrupted records in the old system.
 */
export const linkGuardian = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        student_id: z.string().uuid(),
        guardian_id: z.string().uuid(),
        relationship: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("student_guardians")
      .upsert(
        {
          student_id: data.student_id,
          guardian_id: data.guardian_id,
          relationship: data.relationship || null,
        },
        { onConflict: "student_id,guardian_id" },
      );
    if (error) throw error;
    return { success: true };
  });

/**
 * Create a parent and attach them to a student in one call, optionally making
 * them the payer. Students come first and the family is built onto them, so
 * this is the path taken almost every time; doing it as three separate calls
 * from the browser can leave a guardian on file attached to nobody.
 */
export const addGuardianToStudent = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    guardianInput
      .extend({
        student_id: z.string().uuid(),
        relationship: z.string().optional().or(z.literal("")),
        make_payer: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { student_id, relationship, make_payer, ...guardian } = data;
    const client = db(context.supabase);

    const { data: row, error } = await client
      .from("guardians")
      .insert(blankToNull(guardian))
      .select(GUARDIAN_FIELDS)
      .single();
    if (error) throw error;

    const { error: linkError } = await client
      .from("student_guardians")
      .insert({ student_id, guardian_id: row.id, relationship: relationship || null });
    if (linkError) throw linkError;

    if (make_payer) {
      const { error: payerError } = await client
        .from("students")
        .update({ default_payer_id: row.id })
        .eq("id", student_id);
      if (payerError) throw payerError;
    }

    return row;
  });

export const unlinkGuardian = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z.object({ student_id: z.string().uuid(), guardian_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: student } = await client
      .from("students")
      .select("default_payer_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (student?.default_payer_id === data.guardian_id) {
      throw new Error("This guardian is the default payer. Change the payer first.");
    }

    const { error } = await client
      .from("student_guardians")
      .delete()
      .eq("student_id", data.student_id)
      .eq("guardian_id", data.guardian_id);
    if (error) throw error;
    return { success: true };
  });

/* --------------------------------------------------------------- Student detail */

/** Everything about one student on one page — the screen you open when a parent rings. */
export const getStudentDetail = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const id = data.id;

    const { data: student, error } = await client
      .from("students")
      .select(STUDENT_FIELDS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!student) return null;

    const [guardians, enrolments, packages, attendance, charges] = await Promise.all([
      client
        .from("student_guardians")
        .select("relationship, guardians(id, code, full_name, email, mobile)")
        .eq("student_id", id),
      client
        .from("v_enrolments")
        .select("*, class_offerings(code, room, programs(name), operating_periods(name, code))")
        .eq("student_id", id)
        .order("starts_on", { ascending: false }),
      client
        .from("v_hours_packages")
        .select("*")
        .eq("student_id", id)
        .order("approved_on", { ascending: false }),
      client
        .from("v_attendance")
        .select("*, sessions(code, starts_at, ends_at, status, tutors(full_name))")
        .eq("student_id", id)
        .order("lesson_starts_at", { ascending: false })
        .limit(100),
      client
        .from("v_charges")
        .select("*")
        .eq("student_id", id)
        .order("created_at", { ascending: false }),
    ]);

    const family = (guardians.data ?? []).map((g: Row) => ({
      ...g.guardians,
      relationship: g.relationship,
    }));

    // Siblings are anyone sharing one of these guardians. Worth surfacing:
    // a parent ringing about one child usually means all of theirs.
    const siblings = family.length
      ? ((
          await client
            .from("student_guardians")
            .select("students(id, code, full_name, status)")
            .in(
              "guardian_id",
              family.map((g: Row) => g.id),
            )
        ).data ?? [])
      : [];

    const byId = new Map<string, Row>();
    for (const row of siblings as Row[]) {
      if (row.students && row.students.id !== id) byId.set(row.students.id, row.students);
    }

    return {
      student,
      guardians: family,
      siblings: [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)),
      enrolments: enrolments.data ?? [],
      packages: packages.data ?? [],
      attendance: attendance.data ?? [],
      charges: charges.data ?? [],
    };
  });
