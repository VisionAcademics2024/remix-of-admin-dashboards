import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sydDate, sydToday } from "@/lib/format";
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
        .select(
          "id, code, capacity, status, recurrence_start, session_duration_hours, room, programs(name), operating_periods(name, code)",
        )
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
 * Eligibility is the most misunderstood relationship in the system - a student
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

/**
 * Point an existing enrolment at the package its hours draw from - the fix for a
 * roll that reads "Hours · no package".
 *
 * Three things have to happen together, which is why this is one endpoint:
 *   1. the enrolment remembers the package (default_package_id), and becomes an
 *      hours enrolment if it was not one;
 *   2. the package is made eligible for the enrolment, or hours can never be
 *      drawn from it;
 *   3. the roll already seeded for this enrolment is re-pointed at the package -
 *      seeding is do-nothing-on-conflict, so rows created before the package was
 *      set keep their empty package and would otherwise stay "no package".
 *
 * Passing a null package clears all three.
 */
export const setEnrolmentPackage = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        enrolment_id: z.string().uuid(),
        package_id: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: enrolment, error: readErr } = await client
      .from("enrolments")
      .select("id, student_id, method")
      .eq("id", data.enrolment_id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!enrolment) throw new Error("That enrolment no longer exists.");

    if (data.package_id) {
      const { data: pkg, error: pErr } = await client
        .from("hours_packages")
        .select("id, student_id")
        .eq("id", data.package_id)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!pkg) throw new Error("That package no longer exists.");
      if (pkg.student_id !== enrolment.student_id) {
        throw new Error("That package belongs to a different student.");
      }
    }

    // 1. The enrolment remembers the package. Only hours enrolments draw from
    //    one, so attaching a package makes it an hours enrolment.
    const patch: Record<string, unknown> = { default_package_id: data.package_id };
    if (data.package_id) patch["method"] = "hours";
    const { error: upErr } = await client
      .from("enrolments")
      .update(patch)
      .eq("id", data.enrolment_id);
    if (upErr) throw upErr;

    // 2. Eligibility, or the database refuses to spend the package on this roll.
    if (data.package_id) {
      const { data: existing } = await client
        .from("package_eligibility")
        .select("enrolment_id")
        .eq("package_id", data.package_id)
        .eq("enrolment_id", data.enrolment_id);
      if (!existing || existing.length === 0) {
        const { error } = await client
          .from("package_eligibility")
          .insert({ package_id: data.package_id, enrolment_id: data.enrolment_id });
        if (error) throw error;
      }
    }

    // 3. Re-point the roll already on the books for this enrolment. Trials never
    //    draw hours, so they are left alone.
    const { error: attErr } = await client
      .from("attendance")
      .update({ package_id: data.package_id })
      .eq("enrolment_id", data.enrolment_id)
      .neq("att_type", "trial");
    if (attErr) throw attErr;

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

/**
 * Add a mid-term student onto the exact lessons they'll attend.
 *
 * A student who joins part-way through does not want a whole term generated for
 * them - they want to be on a handful of specific dates, across one or more
 * classes, and to show up on those rolls. This does all of that in one call:
 *
 * 1. An active, UNPRICED enrolment on each class (reused if one already exists),
 *    so the student lands in Billing → "What we need to charge" for the admin to
 *    firm the price.
 * 2. A roll entry on each chosen lesson only - the ticked dates, nothing else -
 *    so their name appears on those lessons' attendance.
 * 3. For a date not on the timetable yet, the lesson is reused if one is already
 *    at that slot (which is what avoids the "sessions_regular_slot" clash), and
 *    only created when the slot is genuinely free.
 * 4. For an Hours plan, one purchased package with the hours filled in and the
 *    price left at 0, so Billing shows the name and hours with an empty price.
 */
export const addMidTermStudent = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        student_id: z.string().uuid(),
        method: z.enum(["hours", "payg"]),
        hours: z.coerce.number().min(0).default(0),
        classes: z
          .array(
            z.object({
              class_offering_id: z.string().uuid(),
              session_ids: z.array(z.string().uuid()).default([]),
              new_sessions: z
                .array(z.object({ starts_at: z.string().min(1), ends_at: z.string().min(1) }))
                .default([]),
            }),
          )
          .min(1, "Pick at least one class."),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    let lessonCount = 0;

    for (const entry of data.classes) {
      // Resolve every chosen lesson to a real session id: the ticked existing
      // ones, plus any off-timetable date (reused at its slot, else created).
      const sessionIds = [...entry.session_ids];
      for (const ns of entry.new_sessions) {
        const { data: existing } = await client
          .from("sessions")
          .select("id")
          .eq("class_offering_id", entry.class_offering_id)
          .eq("starts_at", ns.starts_at)
          .maybeSingle();
        if (existing) {
          sessionIds.push(existing.id);
        } else {
          const { data: created, error: createError } = await client
            .from("sessions")
            .insert({
              class_offering_id: entry.class_offering_id,
              starts_at: ns.starts_at,
              ends_at: ns.ends_at,
              session_type: "regular",
            })
            .select("id")
            .single();
          if (createError) throw createError;
          sessionIds.push(created.id);
        }
      }
      if (!sessionIds.length) continue;

      // The enrolment starts on the earliest lesson they're joining.
      const { data: chosen } = await client
        .from("sessions")
        .select("id, starts_at")
        .in("id", sessionIds);
      const startsOn =
        (chosen ?? [])
          .map((s: Row) => sydDate(s.starts_at))
          .sort()
          .at(0) ?? sydToday();

      // Reuse a live enrolment on this class if there is one; otherwise open an
      // active, unpriced one so Billing can firm the price.
      const { data: existingEnrol } = await client
        .from("enrolments")
        .select("id")
        .eq("student_id", data.student_id)
        .eq("class_offering_id", entry.class_offering_id)
        .neq("status", "closed")
        .order("starts_on", { ascending: true })
        .limit(1)
        .maybeSingle();

      let enrolmentId = existingEnrol?.id as string | undefined;
      if (!enrolmentId) {
        const { data: enrolment, error: enrolError } = await client
          .from("enrolments")
          .insert({
            student_id: data.student_id,
            class_offering_id: entry.class_offering_id,
            status: "active",
            method: data.method,
            base_price: null,
            starts_on: startsOn,
          })
          .select("id")
          .single();
        if (enrolError) {
          throw new Error(
            enrolError.message.includes("enrolments_unique")
              ? "This student already has an enrolment on this class for that start date."
              : enrolError.message,
          );
        }
        enrolmentId = enrolment.id;
      }

      // Put them on the roll for exactly the chosen lessons - nothing else.
      const { error: attError } = await client.from("attendance").upsert(
        sessionIds.map((sid) => ({
          session_id: sid,
          enrolment_id: enrolmentId,
          att_type: "regular",
          status: "not_marked",
        })),
        { onConflict: "session_id,enrolment_id", ignoreDuplicates: true },
      );
      if (attError) throw attError;
      lessonCount += sessionIds.length;
    }

    // The hours they've paid for, priced later in Billing.
    if (data.method === "hours" && data.hours > 0) {
      const { error: pkgError } = await client.from("hours_packages").insert({
        student_id: data.student_id,
        package_type: "purchased",
        hours_purchased: data.hours,
        price: 0,
        status: "active",
      });
      if (pkgError) throw pkgError;
    }

    return { lessons: lessonCount };
  });
