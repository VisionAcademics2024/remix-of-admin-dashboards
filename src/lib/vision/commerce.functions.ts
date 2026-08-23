import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff, type AnyClient } from "./guard";
import type { PricingBasis, Row } from "./types";

/**
 * The frozen base price implied by a catalogue price.
 *
 * This is the distinction that causes more mistakes than anything else in the
 * system: a per_hour price carries a catalogue quantity of one hour, so an
 * enrolment using one MUST state how many hours are being bought or the family
 * gets billed for a single hour for a whole term.
 */
export function computeBasePrice(
  basis: PricingBasis,
  unitRate: number,
  quantity: number,
  hoursOverride: number | null,
): number {
  switch (basis) {
    case "per_hour":
      if (hoursOverride === null || hoursOverride <= 0) {
        throw new Error(
          "This is a per-hour price, so the enrolment must say how many hours are being bought.",
        );
      }
      return round2(unitRate * hoursOverride);
    case "per_session":
      return round2(unitRate * quantity);
    case "fixed_hours_price":
      return round2(unitRate);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The Enrolments & Hours screen, in one round trip. */
export const listCommerce = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [enrolments, packages, eligibility, students, offerings, prices] = await Promise.all([
      client
        .from("v_enrolments")
        .select(
          "*, students(id, code, full_name), class_offerings(id, code, programs(name), operating_periods(name, code))",
        )
        .order("starts_on", { ascending: false }),
      client
        .from("v_hours_packages")
        .select("*, students(id, code, full_name)")
        .order("approved_on", {
          ascending: false,
        }),
      client.from("package_eligibility").select("package_id, enrolment_id"),
      client.from("students").select("id, code, full_name, status").order("full_name"),
      client
        .from("class_offerings")
        .select("id, code, capacity, status, programs(name), operating_periods(name, code)")
        .order("starts_on", { ascending: false }),
      client.from("standard_prices").select("*").eq("status", "active").order("name"),
    ]);

    return {
      enrolments: enrolments.data ?? [],
      packages: packages.data ?? [],
      eligibility: eligibility.data ?? [],
      students: students.data ?? [],
      offerings: offerings.data ?? [],
      prices: prices.data ?? [],
    };
  });

/* ------------------------------------------------------------------ Enrolments */

const enrolmentInput = z.object({
  student_id: z.string().uuid(),
  class_offering_id: z.string().uuid(),
  status: z.enum(["trial", "active", "closed"]).default("active"),
  starts_on: z.string().min(1),
  ends_on: z.string().optional().or(z.literal("")),
  method: z.enum(["hours", "payg"]).nullish(),
  standard_price_id: z.string().uuid().nullish(),
  hours_override: z.coerce.number().positive().nullish(),
  adjustment: z
    .enum(["none", "percentage", "fixed_amount", "final_price_override"])
    .default("none"),
  adjustment_value: z.coerce.number().default(0),
  default_package_id: z.string().uuid().nullish(),
  notes: z.string().optional().or(z.literal("")),
});

/**
 * Creating an enrolment freezes the commercial terms and then seeds the roll,
 * so enrolling after lessons were generated works exactly as well as before.
 */
export const saveEnrolment = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => enrolmentInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const { id, ...values } = data;

    if (values.status !== "trial" && !values.method) {
      throw new Error("Only a trial enrolment may leave the billing method blank.");
    }

    let basePrice: number | null = null;
    if (values.standard_price_id) {
      const { data: price, error } = await client
        .from("standard_prices")
        .select("basis, unit_rate, quantity")
        .eq("id", values.standard_price_id)
        .maybeSingle();
      if (error) throw error;
      if (price) {
        basePrice = computeBasePrice(
          price.basis,
          Number(price.unit_rate),
          Number(price.quantity),
          values.hours_override ?? null,
        );
      }
    }

    const payload: Record<string, unknown> = {
      ...values,
      ends_on: values.ends_on || null,
      method: values.method || null,
      standard_price_id: values.standard_price_id || null,
      hours_override: values.hours_override ?? null,
      default_package_id: values.default_package_id || null,
      notes: values.notes || null,
    };
    if (basePrice !== null) payload["base_price"] = basePrice;

    if (id) {
      const { error } = await client.from("enrolments").update(payload).eq("id", id);
      if (error) throw error;
      return { id };
    }

    const { data: row, error } = await client
      .from("enrolments")
      .insert(payload)
      .select("id, code, class_offering_id")
      .single();
    if (error) {
      throw new Error(
        error.message.includes("enrolments_unique")
          ? "This student already has an enrolment in that class starting on that date."
          : error.message,
      );
    }

    // Seeding on enrolment creation is half of why ordering stops mattering.
    await client.rpc("seed_roll_for_offering", { p_offering_id: row.class_offering_id });
    return row;
  });

/** Closing an enrolment needs an end date and a reason; deletion is blocked once there is history. */
export const closeEnrolment = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        ends_on: z.string().min(1),
        closure: z.enum(["completed", "withdrawn", "transferred", "other"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("enrolments")
      .update({ status: "closed", ends_on: data.ends_on, closure: data.closure })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/* --------------------------------------------------------------- Hours packages */

const packageInput = z.object({
  student_id: z.string().uuid(),
  package_type: z.enum(["purchased", "courtesy"]).default("purchased"),
  hours_purchased: z.coerce.number().positive(),
  price: z.coerce.number().min(0).default(0),
  standard_price_id: z.string().uuid().nullish(),
  approved_on: z.string().min(1),
  status: z.enum(["draft", "active", "closed", "expired"]).default("active"),
  low_balance_threshold: z.coerce.number().min(0).default(2),
  courtesy_reason: z.string().optional().or(z.literal("")),
  admin_note: z.string().optional().or(z.literal("")),
  /** Which enrolments this package may be spent on. */
  enrolment_ids: z.array(z.string().uuid()).default([]),
});

export const savePackage = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => packageInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const { id, enrolment_ids, ...values } = data;

    if (values.package_type === "courtesy" && !values.courtesy_reason?.trim()) {
      throw new Error("A courtesy package must record why it was given.");
    }

    const payload = {
      ...values,
      price: values.package_type === "courtesy" ? 0 : values.price,
      standard_price_id: values.standard_price_id || null,
      courtesy_reason: values.courtesy_reason || null,
      admin_note: values.admin_note || null,
    };

    let packageId = id;
    if (id) {
      const { error } = await client.from("hours_packages").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data: row, error } = await client
        .from("hours_packages")
        .insert(payload)
        .select("id, code")
        .single();
      if (error) throw error;
      packageId = row.id;
    }

    await syncEligibility(client, packageId!, enrolment_ids);
    return { id: packageId };
  });

async function syncEligibility(client: AnyClient, packageId: string, enrolmentIds: string[]) {
  const { data: existing } = await client
    .from("package_eligibility")
    .select("enrolment_id")
    .eq("package_id", packageId);

  const have = new Set((existing ?? []).map((r: Row) => r.enrolment_id));
  const want = new Set(enrolmentIds);

  const toAdd = enrolmentIds.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id as string)) as string[];

  if (toAdd.length) {
    const { error } = await client
      .from("package_eligibility")
      .insert(toAdd.map((enrolment_id) => ({ package_id: packageId, enrolment_id })));
    if (error) throw error;
  }
  if (toRemove.length) {
    const { error } = await client
      .from("package_eligibility")
      .delete()
      .eq("package_id", packageId)
      .in("enrolment_id", toRemove);
    if (error) throw error;
  }
}

/**
 * Eligibility is the most misunderstood relationship in the system — a student
 * in two classes needs both enrolments ticked or their roll will not validate.
 * It gets its own endpoint so the UI can put it front and centre.
 */
export const setPackageEligibility = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({ package_id: z.string().uuid(), enrolment_ids: z.array(z.string().uuid()) })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await syncEligibility(db(context.supabase), data.package_id, data.enrolment_ids);
    return { success: true };
  });

export const updatePackageStatus = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["draft", "active", "closed", "expired"]) })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("hours_packages")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
