import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sydToday } from "@/lib/format";
import { db, requireStaff } from "./guard";
import type { Row } from "./types";

const blank = z.string().optional().or(z.literal(""));

function nullify<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "" ? null : v])) as T;
}

/** Everything the Setup screen needs, in one round trip. */
export const getCatalogue = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [periods, prices, programs, tutors, offerings] = await Promise.all([
      client.from("operating_periods").select("*").order("starts_on", { ascending: false }),
      client.from("standard_prices").select("*").order("effective_from", { ascending: false }),
      client.from("programs").select("*").order("name"),
      client.from("tutors").select("*").order("full_name"),
      // Which terms each program actually runs in.
      //
      // A program is a curriculum template - "Year 5 R/W, 2 hours" - and does
      // not itself belong to a term; what runs in a term is a class offering,
      // which points at both. Reading them here is what lets the programs list
      // say which terms a program is live in without duplicating the program
      // once per term.
      client
        .from("class_offerings")
        .select(
          "id, program_id, status, operating_period_id, operating_periods(code, name, starts_on)",
        )
        .neq("status", "cancelled"),
    ]);

    for (const result of [periods, prices, programs, tutors, offerings]) {
      if (result.error) throw result.error;
    }

    return {
      periods: periods.data ?? [],
      prices: prices.data ?? [],
      programs: programs.data ?? [],
      tutors: tutors.data ?? [],
      offerings: offerings.data ?? [],
    };
  });

/* ------------------------------------------------------------ Operating periods */

const periodInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  period_type: z.enum(["standard_term", "holiday_intensive", "other"]),
  starts_on: z.string().min(1),
  ends_on: z.string().min(1),
  status: z.enum(["planned", "active", "closed"]),
});

export const savePeriod = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => periodInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...values } = data;
    const client = db(context.supabase);
    const { error } = id
      ? await client.from("operating_periods").update(values).eq("id", id)
      : await client.from("operating_periods").insert(values);
    if (error) throw error;
    return { success: true };
  });

/* --------------------------------------------------------------------- Programs */

const programInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  year_level: blank,
  subject: blank,
  exam_focus: blank,
  default_offering_type: z.enum(["group_class", "private_tuition"]).nullish(),
  standard_duration_hours: z.coerce.number().positive(),
  default_price_id: z.string().uuid().nullish(),
  is_active: z.boolean().default(true),
});

/**
 * Save a program, and optionally start it running in a term.
 *
 * A program is a curriculum template and belongs to no term: "Year 5 R/W, two
 * hours, Reading/Writing" is the same thing in Term 3 as in the holidays. What
 * belongs to a term is a class offering, which points at both the program and
 * the period - which is why the same program can run in several terms without
 * being duplicated, and why its enrolments, sessions and billing stay in one
 * place rather than splitting across near-identical rows.
 *
 * But that connection was only reachable from the Class Builder, so creating a
 * program for next term meant making it here and remembering to schedule it
 * somewhere else. `run_in_period_id` closes that: naming a term opens the class
 * for it at the same time, dated from the term and taking its length and type
 * from the program itself.
 *
 * The class lands as `planned` with no day or time, because those are not known
 * yet and guessing them would put lessons on the timetable that nobody agreed
 * to. It is finished in Classes, where the day, time and tutor are set and the
 * sessions generated.
 *
 * Naming a term the program already runs in does nothing, so saving twice never
 * opens a second class for the same term.
 */
export const saveProgram = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    programInput
      .extend({
        id: z.string().uuid().optional(),
        /** Open a planned class for this program in this term. */
        run_in_period_id: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { id, run_in_period_id, ...values } = data;
    const client = db(context.supabase);
    const payload = nullify(values);
    // Return the id so a caller creating a program on the fly (Class Builder)
    // can select it straight away.
    const { data: row, error } = id
      ? await client.from("programs").update(payload).eq("id", id).select("id, code").single()
      : await client.from("programs").insert(payload).select("id, code").single();
    if (error) throw error;

    const programId = row?.id as string;
    let openedIn: string | null = null;

    if (run_in_period_id && programId) {
      const { data: existing, error: existingError } = await client
        .from("class_offerings")
        .select("id")
        .eq("program_id", programId)
        .eq("operating_period_id", run_in_period_id)
        .neq("status", "cancelled")
        .limit(1);
      if (existingError) throw existingError;

      if ((existing ?? []).length === 0) {
        const { data: period, error: periodError } = await client
          .from("operating_periods")
          .select("id, code, starts_on, ends_on")
          .eq("id", run_in_period_id)
          .maybeSingle();
        if (periodError) throw periodError;
        if (!period) throw new Error("That term no longer exists.");

        const type = values.default_offering_type ?? "group_class";
        const { error: offeringError } = await client.from("class_offerings").insert({
          program_id: programId,
          operating_period_id: period.id,
          offering_type: type,
          // A private class is one student by constraint; a group starts at the
          // usual size and is adjusted when the class is finished.
          capacity: type === "private_tuition" ? 1 : 8,
          starts_on: period.starts_on,
          ends_on: period.ends_on,
          recurrence: "weekly",
          session_duration_hours: values.standard_duration_hours,
          status: "planned",
        });
        if (offeringError) throw offeringError;
        openedIn = period.code as string;
      }
    }

    return { success: true, id: programId, code: row?.code as string, openedIn };
  });

/* ----------------------------------------------------------------------- Prices */

const priceInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  year_group: blank,
  scope: blank,
  basis: z.enum(["per_hour", "per_session", "fixed_hours_price"]),
  quantity: z.coerce.number().positive(),
  unit_rate: z.coerce.number().min(0),
  effective_from: z.string().min(1),
  effective_to: blank,
  notes: blank,
});

export const createPrice = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => priceInput.parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("standard_prices")
      .insert({ ...nullify(data), status: "active" });
    if (error) throw error;
    return { success: true };
  });

/**
 * Never edit an old price. "Supersede" closes the current row and opens a new
 * one, so anything that froze the old figure keeps pointing at the old figure.
 */
export const supersedePrice = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => priceInput.extend({ supersedes_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { supersedes_id, ...values } = data;
    const client = db(context.supabase);

    const { error: insertError } = await client
      .from("standard_prices")
      .insert({ ...nullify(values), status: "active" });
    if (insertError) throw insertError;

    const dayBefore = new Date(`${values.effective_from}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

    const { error } = await client
      .from("standard_prices")
      .update({ status: "inactive", effective_to: dayBefore.toISOString().slice(0, 10) })
      .eq("id", supersedes_id);
    if (error) throw error;
    return { success: true };
  });

/* ----------------------------------------------------------------------- Tutors */

const tutorInput = z.object({
  full_name: z.string().min(1),
  email: blank,
  mobile: blank,
  status: z.enum(["active", "inactive"]).default("active"),
  colour: blank,
  notes: blank,
});

/**
 * The tutor database: every tutor with their details and pay-rate history, and
 * the rate in force today worked out for the list. Rates live under owner-only
 * RLS, so a non-owner simply sees them empty - the details are still theirs to
 * read and edit.
 */
export const listTutors = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);
    const today = sydToday();

    const [{ data: tutors, error }, { data: rates }] = await Promise.all([
      client.from("tutors").select("*").order("full_name"),
      client.from("tutor_pay_rates").select("*").order("effective_from", { ascending: false }),
    ]);
    if (error) throw error;

    const byTutor = new Map<string, Row[]>();
    for (const r of rates ?? []) {
      const list = byTutor.get(r.tutor_id) ?? [];
      list.push(r);
      byTutor.set(r.tutor_id, list);
    }

    return (tutors ?? []).map((t: Row) => {
      const history = byTutor.get(t.id) ?? [];
      // History is newest-first, so the first rate already in effect is current.
      const current = history.find((r: Row) => r.effective_from <= today) ?? null;
      return {
        ...t,
        rates: history,
        current_rate: current ? Number(current.hourly_rate) : null,
        current_rate_from: current?.effective_from ?? null,
      };
    });
  });

export const saveTutor = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => tutorInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...values } = data;
    const client = db(context.supabase);
    const payload = nullify(values);
    const { error } = id
      ? await client.from("tutors").update(payload).eq("id", id)
      : await client.from("tutors").insert(payload);
    if (error) throw error;
    return { success: true };
  });
