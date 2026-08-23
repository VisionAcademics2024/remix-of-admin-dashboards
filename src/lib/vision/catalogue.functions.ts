import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";

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
    const { error } = id
      ? await client.from("programs").update(payload).eq("id", id)
      : await client.from("programs").insert(payload);
    if (error) throw error;
    return { success: true };
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
