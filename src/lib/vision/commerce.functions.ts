import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sydDate, sydToday } from "@/lib/format";
import { db, requireStaff, type AnyClient } from "./guard";
import { choosePackage } from "./billing-audit";
import { buildEnrolmentPayload } from "./enrolment-terms";
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

    // Which package an enrolment draws from has its own endpoint, and editing
    // the commercial terms must not disturb it - see buildEnrolmentPayload.
    const payload = buildEnrolmentPayload(values);
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
 * Delete a package outright.
 *
 * A duplicate created by mistake should be able to go away, and closing it
 * leaves it on the books forever. But deleting one is not a neutral act, and
 * the foreign keys say exactly why:
 *
 *   charges.package_id            on delete RESTRICT
 *   attendance.package_id         on delete SET NULL
 *   enrolments.default_package_id on delete SET NULL
 *   package_eligibility           on delete CASCADE
 *
 * So a package that has been invoiced cannot be deleted at all - and should
 * not be, because the charge is the record of money asked for. That one is
 * refused with an explanation rather than a raw constraint error.
 *
 * The dangerous one is attendance. SET NULL means deleting a package silently
 * un-points every roll entry that drew from it: the hours stay taught, the
 * balance they came out of disappears, and the student lands straight back in
 * "Hours taught against no package". That is allowed, because sometimes it is
 * exactly right - the package was a duplicate and the hours belong to the other
 * one - but never silently. It needs `confirm`, and the caller is told how many
 * lessons and hours it will strand.
 */
export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        /** Required when roll entries draw from this package. */
        confirm: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: pkg, error: readError } = await client
      .from("hours_packages")
      .select("id, code, students(full_name)")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!pkg) throw new Error("That package no longer exists.");

    // Money already asked for. The database would refuse this anyway; saying
    // why, and what to do instead, is more use than the constraint's message.
    const { data: charges, error: chargeError } = await client
      .from("charges")
      .select("code, status")
      .eq("package_id", data.id)
      .neq("status", "cancelled");
    if (chargeError) throw chargeError;
    if ((charges ?? []).length > 0) {
      const codes = (charges ?? []).map((c: Row) => c.code).join(", ");
      throw new Error(
        `${pkg.code} has been charged (${codes}), so it cannot be deleted - the charge is the record of what was asked for. Cancel that charge first, or close the package instead.`,
      );
    }

    // Roll entries that would be stranded.
    const { data: drawing, error: drawError } = await client
      .from("v_attendance")
      .select("id, hours_consumed")
      .eq("package_id", data.id);
    if (drawError) throw drawError;

    const lessons = (drawing ?? []).length;
    const hours = (drawing ?? []).reduce(
      (sum: number, a: Row) => sum + Number(a.hours_consumed ?? 0),
      0,
    );

    if (lessons > 0 && !data.confirm) {
      return { deleted: false, needsConfirm: true, lessons, hours, code: pkg.code };
    }

    const { error } = await client.from("hours_packages").delete().eq("id", data.id);
    if (error) throw error;

    return { deleted: true, needsConfirm: false, lessons, hours, code: pkg.code };
  });

/**
 * Delete an enrolment outright.
 *
 * attendance.enrolment_id is ON DELETE RESTRICT, so an enrolment with any roll
 * entry cannot be deleted - and should not be: those entries are the record of
 * lessons that happened. Closing it is the honest end for one that ran; delete
 * is for one created by mistake that never did.
 */
export const deleteEnrolment = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: enrolment, error: readError } = await client
      .from("enrolments")
      .select("id, code")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!enrolment) throw new Error("That enrolment no longer exists.");

    const { data: roll, error: rollError } = await client
      .from("attendance")
      .select("id")
      .eq("enrolment_id", data.id)
      .limit(1);
    if (rollError) throw rollError;

    if ((roll ?? []).length > 0) {
      throw new Error(
        `${enrolment.code} has roll entries, so it cannot be deleted - those are the record of lessons that happened. Close it instead, which ends it without erasing the history.`,
      );
    }

    const { error } = await client.from("enrolments").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

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
/**
 * The package a roll entry for this enrolment should draw from.
 *
 * The same rule the seed_roll function follows, in the one other place that
 * writes attendance rows by hand. Eligibility is what makes a package usable -
 * the database has a trigger that refuses any package with no eligibility row -
 * so this only ever returns one that is already eligible, and null otherwise.
 * Two eligible packages is a real choice and stays a person's to make.
 */
export async function packageForEnrolment(
  client: ReturnType<typeof db>,
  enrolmentId: string,
  defaultPackageId: string | null,
): Promise<string | null> {
  const { data: eligible } = await client
    .from("package_eligibility")
    .select("package_id")
    .eq("enrolment_id", enrolmentId);

  return choosePackage(
    defaultPackageId,
    (eligible ?? []).map((r: Row) => r.package_id),
  );
}

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
 * Add a mid-term student onto the exact lessons they'll attend - and the ones
 * they already have.
 *
 * A student who joins part-way through does not want a whole term generated
 * for them. They want to be on a handful of specific dates, often across more
 * than one class at once, and to show up on those rolls. Half of those dates
 * are usually in the past: they have been coming for a fortnight while the
 * paperwork caught up, and those lessons are exactly the ones the family owes
 * for. This does all of it in one call:
 *
 * 1. The hours package FIRST, when the plan is Hours. This is the order that
 *    matters and the reason this function was rewritten - see below.
 * 2. An active enrolment on each class (reused if one already exists), priced
 *    at nothing so the student lands in Billing → "What we need to charge" for
 *    the admin to firm the price against what was agreed.
 * 3. The package made eligible for each of those enrolments and set as their
 *    default, which is what lets any roll - this one, and every lesson seeded
 *    afterwards - draw from it.
 * 4. A roll entry on each chosen lesson only. Lessons already taught go on as
 *    `present`, because that is what happened and because only a present row
 *    consumes hours; lessons still to come are left unmarked for the tutor.
 * 5. For a date not on the timetable yet, the lesson is reused if one already
 *    sits at that slot (which is what avoids the "sessions_regular_slot"
 *    clash), and only created when the slot is genuinely free.
 *
 * ## Why the package comes first
 *
 * Billing's audit has a finding called "On hours, but no package was ever
 * bought": an enrolment set to draw hours from a package, lessons taught
 * against it, and nothing to invoice. Its sibling, "Hours taught against no
 * package", is the same wound one layer down - the package exists but the roll
 * points at nothing, so the balance never moves and the package reads unused.
 *
 * This function used to create both of them, every single time. The roll went
 * in first with `packageForEnrolment`, which can only return a package that is
 * already eligible - and nothing was, because the package was created in the
 * last few lines of the handler, after every roll entry had been written.
 * Every mid-term join on an Hours plan therefore produced a package attached
 * to nobody and a roll drawing from nothing. It was invisible while only
 * future lessons could be picked, because an unmarked lesson consumes no hours
 * and the audit only counts what was taught. Ticking the backlog makes it
 * visible immediately, which is why the two changes belong in one commit.
 *
 * So: package, then eligibility, then roll. Step 6 then re-points any roll
 * entry on those enrolments that is still drawing from nothing - the same
 * repair as Billing's "Attribute" button, applied where the package is being
 * bought rather than left for someone to notice later.
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
              /** Lessons still to come: a roll entry, left for the tutor to mark. */
              session_ids: z.array(z.string().uuid()).default([]),
              /** Lessons already taught: marked present, so they consume hours and bill. */
              attended_session_ids: z.array(z.string().uuid()).default([]),
              new_sessions: z
                .array(
                  z.object({
                    starts_at: z.string().min(1),
                    ends_at: z.string().min(1),
                    attended: z.boolean().default(false),
                  }),
                )
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
    let backlogCount = 0;

    // 1. The package, before anything can need it. Priced at 0 on purpose:
    //    what the family pays is agreed with them and firmed in Billing, and a
    //    number invented here would be a number nobody agreed to.
    let packageId: string | null = null;
    if (data.method === "hours" && data.hours > 0) {
      const { data: pkg, error: pkgError } = await client
        .from("hours_packages")
        .insert({
          student_id: data.student_id,
          package_type: "purchased",
          hours_purchased: data.hours,
          price: 0,
          status: "active",
        })
        .select("id")
        .single();
      if (pkgError) throw pkgError;
      packageId = pkg.id as string;
    }

    const touchedEnrolments: string[] = [];

    for (const entry of data.classes) {
      // Resolve every chosen lesson to a real session id: the ticked existing
      // ones, plus any off-timetable date (reused at its slot, else created).
      // `attended` travels with the id, because it decides how the roll entry
      // is marked and a hand-typed backlog date must not lose that on the way.
      const chosenIds: Array<{ id: string; attended: boolean }> = [
        ...entry.session_ids.map((id) => ({ id, attended: false })),
        ...entry.attended_session_ids.map((id) => ({ id, attended: true })),
      ];

      for (const ns of entry.new_sessions) {
        const { data: existing } = await client
          .from("sessions")
          .select("id")
          .eq("class_offering_id", entry.class_offering_id)
          .eq("starts_at", ns.starts_at)
          .maybeSingle();
        if (existing) {
          chosenIds.push({ id: existing.id, attended: ns.attended });
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
          chosenIds.push({ id: created.id, attended: ns.attended });
        }
      }
      if (!chosenIds.length) continue;

      // One decision per lesson, even if the same lesson arrived twice.
      const attendedById = new Map<string, boolean>();
      for (const { id, attended } of chosenIds) {
        attendedById.set(id, (attendedById.get(id) ?? false) || attended);
      }
      const sessionIds = [...attendedById.keys()];

      // 2. The enrolment starts on the earliest lesson they're joining, which
      //    with a backlog is a date already past. That matters: seed_roll only
      //    puts an enrolment on lessons at or after its start, so an enrolment
      //    that starts next week would skip the very lessons being billed.
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
        .select("id, starts_on, default_package_id")
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
      } else if (existingEnrol?.starts_on && startsOn < existingEnrol.starts_on) {
        // Backlog reaching behind the enrolment it belongs to. Pulling the
        // start date back keeps the enrolment covering every lesson billed
        // under it. A clash on (student, class, start date) means another
        // enrolment already owns that date, and this one is left as it is
        // rather than fighting it - the roll below still goes on correctly.
        const { error: moveError } = await client
          .from("enrolments")
          .update({ starts_on: startsOn })
          .eq("id", enrolmentId);
        if (moveError && !moveError.message.includes("enrolments_unique")) throw moveError;
      }
      touchedEnrolments.push(enrolmentId!);

      // 3. Eligibility, then the default. Without the eligibility row the
      //    database refuses to spend this package on this roll at all, and
      //    without the default every later lesson seeds unattributed again.
      //    Attaching a package makes it an hours enrolment, the same rule
      //    setEnrolmentPackage follows.
      if (packageId) {
        const { data: already } = await client
          .from("package_eligibility")
          .select("enrolment_id")
          .eq("package_id", packageId)
          .eq("enrolment_id", enrolmentId);
        if (!already || already.length === 0) {
          const { error: eligError } = await client
            .from("package_eligibility")
            .insert({ package_id: packageId, enrolment_id: enrolmentId });
          if (eligError) throw eligError;
        }
        const { error: defError } = await client
          .from("enrolments")
          .update({ default_package_id: packageId, method: "hours" })
          .eq("id", enrolmentId);
        if (defError) throw defError;
      }

      // 4. Put them on the roll for exactly the chosen lessons - nothing else.
      //    Skip any lesson they're already on rather than relying on ON
      //    CONFLICT, which can't be used here (the attendance uniqueness
      //    varies by database).
      const { data: existingRoll } = await client
        .from("attendance")
        .select("id, session_id, status")
        .eq("enrolment_id", enrolmentId)
        .in("session_id", sessionIds);
      const rollBySession = new Map((existingRoll ?? []).map((r: Row) => [r.session_id, r]));

      // The roll draws from the package the enrolment now has, rather than
      // waiting for someone to attach one and re-point it afterwards.
      // On a PAYG plan, or when no new hours were bought, the enrolment may
      // already draw from a package of its own - that one still applies.
      const rollPackageId = await packageForEnrolment(
        client,
        enrolmentId!,
        packageId ?? (existingEnrol?.default_package_id as string | null) ?? null,
      );

      const toInsert = sessionIds
        .filter((sid) => !rollBySession.has(sid))
        .map((sid) => ({
          session_id: sid,
          enrolment_id: enrolmentId,
          att_type: "regular",
          // A lesson already taught is marked as taught. That is what makes it
          // consume hours, and consuming hours is what makes it billable.
          status: attendedById.get(sid) ? "present" : "not_marked",
          package_id: rollPackageId,
        }));
      if (toInsert.length) {
        const { error: attError } = await client.from("attendance").insert(toInsert);
        if (attError) throw attError;
      }

      // A backlog lesson they were already on but nobody had marked. Only
      // "not_marked" is touched: an absence someone recorded on purpose is
      // theirs, and this is not the screen to overrule it.
      const toMark = (existingRoll ?? [])
        .filter((r: Row) => attendedById.get(r.session_id) && r.status === "not_marked")
        .map((r: Row) => r.id);
      if (toMark.length) {
        const { error: markError } = await client
          .from("attendance")
          .update({ status: "present" })
          .in("id", toMark);
        if (markError) throw markError;
      }

      lessonCount += toInsert.length + toMark.length;
      backlogCount += toInsert.filter((r) => r.status === "present").length + toMark.length;
    }

    // 5. Anything on these enrolments still drawing from nothing now draws
    //    from the package that was just bought. This is the repair behind
    //    Billing's "Attribute" button, done here because the answer is not in
    //    doubt: the package was created for these very lessons. It bills
    //    nobody anything extra - it points hours already given at the purchase
    //    they were always meant to come out of, and running it twice does
    //    nothing the second time.
    let attributed = 0;
    if (packageId && touchedEnrolments.length) {
      const { data: repointed, error: repointError } = await client
        .from("attendance")
        .update({ package_id: packageId })
        .in("enrolment_id", [...new Set(touchedEnrolments)])
        .is("package_id", null)
        .neq("att_type", "trial")
        .select("id");
      if (repointError) throw repointError;
      attributed = (repointed ?? []).length;
    }

    return {
      lessons: lessonCount,
      backlog: backlogCount,
      package_id: packageId,
      hours: packageId ? data.hours : 0,
      attributed,
    };
  });
