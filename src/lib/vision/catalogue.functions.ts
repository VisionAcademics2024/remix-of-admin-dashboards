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

    const [periods, prices, programs, tutors] = await Promise.all([
      client.from("operating_periods").select("*").order("starts_on", { ascending: false }),
      client.from("standard_prices").select("*").order("effective_from", { ascending: false }),
      client.from("programs").select("*").order("name"),
      client.from("tutors").select("*").order("full_name"),
    ]);

    return {
      periods: periods.data ?? [],
      prices: prices.data ?? [],
      programs: programs.data ?? [],
      tutors: tutors.data ?? [],
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

export const saveProgram = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => programInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...values } = data;
    const client = db(context.supabase);
    const payload = nullify(values);
    // Return the id so a caller creating a program on the fly (Class Builder)
    // can select it straight away.
    const { data: row, error } = id
      ? await client.from("programs").update(payload).eq("id", id).select("id, code").single()
      : await client.from("programs").insert(payload).select("id, code").single();
    if (error) throw error;
    return { success: true, id: row?.id as string, code: row?.code as string };
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
