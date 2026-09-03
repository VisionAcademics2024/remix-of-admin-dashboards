import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import { findUnbilled } from "./billing-audit";
import { packageForEnrolment } from "./commerce.functions";
import type { Row } from "./types";

/**
 * Money in, as a pipeline: to charge → to invoice → unpaid → received.
 *
 * "To charge" is the one queue that is not a charge status - it is attendance
 * that has been taught and not yet billed.
 */
export const getBillingBoard = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [uncharged, charges, billedKeys, packagesToCharge, newEnrolments] = await Promise.all([
      // PAYG lessons attended but not charged.
      //
      // Ordered OLDEST first, deliberately. This list is capped, and the cap
      // used to sit under a newest-first order - so once the backlog passed the
      // cap it was the oldest, most overdue lessons that fell off the end and
      // stopped being billable. The ones that have waited longest are the ones
      // that must survive the cut.
      client
        .from("v_attendance")
        .select(
          "*, sessions(code, starts_at, class_offerings(code, programs(name))), enrolments(code, base_price, standard_price_id, students(id, code, full_name, default_payer_id))",
        )
        .eq("billing_method", "payg")
        .eq("status", "present")
        .order("lesson_starts_at", { ascending: true })
        .limit(UNCHARGED_LIMIT),
      client
        .from("v_charges")
        .select("*, students(id, code, full_name), guardians(id, full_name)")
        .order("created_at", { ascending: false })
        .limit(CHARGE_LIMIT),
      // What has already been billed, as ids only.
      //
      // This is separate from the list above on purpose. "Already charged" used
      // to be derived from that capped list, which meant that past the cap the
      // app forgot a lesson had been billed and offered it up to be billed
      // again. Ids are small enough to read without a cap, so the guard against
      // double-billing is never the thing that gets truncated.
      client.from("charges").select("attendance_id, package_id").neq("status", "cancelled"),
      // Hours packages with no charge raised against them yet.
      client
        .from("v_hours_packages")
        .select("*, students(id, code, full_name, default_payer_id)")
        .neq("status", "draft")
        .order("approved_on", { ascending: false }),
      // New enrolments with no agreed price yet - a student joined a class but
      // whether they're on Hours or PAYG, and what they pay, isn't set. They are
      // firmed here before anything is charged.
      client
        .from("v_enrolments")
        .select(
          "id, code, status, method, base_price, starts_on, " +
            "students(id, code, full_name, default_payer_id), " +
            "class_offerings(code, programs(name))",
        )
        .eq("status", "active")
        .or("base_price.is.null,base_price.eq.0")
        .order("starts_on", { ascending: false })
        .limit(200),
    ]);

    const chargeRows = charges.data ?? [];
    const billed = billedKeys.data ?? [];
    const chargedAttendance = new Set(
      billed.filter((c: Row) => c.attendance_id).map((c: Row) => c.attendance_id),
    );
    const chargedPackages = new Set(
      billed.filter((c: Row) => c.package_id).map((c: Row) => c.package_id),
    );

    // Purchased packages still to charge - including the zero-priced ones a
    // mid-term join opens, so the student shows with their hours and an empty
    // price for the admin to firm. Courtesy (free) packages are never charged.
    const pkgToCharge = (packagesToCharge.data ?? []).filter(
      (p: Row) => !chargedPackages.has(p.id) && p.package_type !== "courtesy",
    );
    // A student whose hours already sit in a package to charge is handled there,
    // so don't also nag about the enrolment having no price.
    const pkgStudentIds = new Set(pkgToCharge.map((p: Row) => p.student_id));

    return {
      newEnrolments: (newEnrolments.data ?? []).filter(
        (e: Row) => !pkgStudentIds.has(e.students?.id),
      ),
      toCharge: (uncharged.data ?? []).filter((a: Row) => !chargedAttendance.has(a.id)),
      packagesToCharge: pkgToCharge,
      toInvoice: chargeRows.filter((c: Row) => c.status === "to_invoice"),
      unpaid: chargeRows.filter((c: Row) => c.status === "invoiced"),
      received: chargeRows.filter((c: Row) => c.status === "paid"),
      cancelled: chargeRows.filter((c: Row) => c.status === "cancelled"),
      // Said out loud rather than left to be discovered: a capped list that
      // does not admit it is capped is how work goes missing.
      truncated: {
        uncharged: (uncharged.data ?? []).length >= UNCHARGED_LIMIT,
        charges: chargeRows.length >= CHARGE_LIMIT,
      },
    };
  });

/**
 * Caps.
 *
 * Both queues are bounded so one enormous account cannot make the page
 * unusable, but the board now reports when it has hit a cap instead of quietly
 * showing part of the picture.
 */
const UNCHARGED_LIMIT = 500;
const CHARGE_LIMIT = 1000;

/**
 * The audit: students who ought to be reachable from Billing and are not.
 *
 * Every queue on the billing board starts from a row - an attendance, a
 * package, an enrolment with a blank price. This reads the same tables without
 * those assumptions and hands the whole picture to findUnbilled, which holds
 * the rules. Kept as its own call rather than folded into the board: it is a
 * heavier read, it is not needed to do the day's invoicing, and it should not
 * slow down the screen that is.
 */
export const getBillingAudit = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [enrolments, packages, attendance, charged] = await Promise.all([
      // Trials are excluded at the source: a trial never owes anything.
      client
        .from("enrolments")
        .select(
          "id, code, status, method, base_price, student_id, starts_on, " +
            "students(id, code, full_name, default_payer_id), " +
            "class_offerings(code, programs(name))",
        )
        .neq("status", "trial"),
      client.from("hours_packages").select("id, code, student_id, status, package_type, price"),
      // Only roll entries that actually consumed time. hours_consumed is
      // computed by the view, so a cancelled lesson or an absence is already
      // zero and never reaches here.
      client
        .from("v_attendance")
        .select("id, enrolment_id, package_id, hours_consumed, session_date")
        .eq("status", "present")
        .neq("att_type", "trial")
        .gt("hours_consumed", 0),
      client.from("charges").select("attendance_id").neq("status", "cancelled"),
    ]);

    for (const result of [enrolments, packages, attendance, charged]) {
      if (result.error) throw result.error;
    }

    const findings = findUnbilled({
      enrolments: enrolments.data ?? [],
      packages: packages.data ?? [],
      attendance: attendance.data ?? [],
      chargedAttendanceIds: new Set(
        (charged.data ?? []).filter((c: Row) => c.attendance_id).map((c: Row) => c.attendance_id),
      ),
    });

    return {
      findings,
      scanned: {
        enrolments: (enrolments.data ?? []).length,
        packages: (packages.data ?? []).length,
        attendance: (attendance.data ?? []).length,
      },
    };
  });

/**
 * Point unattributed roll entries back at the class's own package.
 *
 * The repair for the hours_unattributed finding. seed_roll used to create roll
 * entries with no package, so any lesson made after a package was attached -
 * most often the new lesson that settles a make-up - drew from nothing. Those
 * hours were taught and marked present but never came off the balance.
 *
 * Only rows that currently point at nothing are touched, so an entry someone
 * deliberately moved to a different package is left exactly as it is, and
 * running this twice does nothing the second time. Trials are skipped: a trial
 * never spends hours.
 *
 * This does not raise a charge. It attributes hours already given to the
 * package they were always meant to come out of, which is what makes the
 * balance true and what makes the package billable in the ordinary queue.
 */
export const attributeUnbilledHours = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        /** One enrolment, or every enrolment the audit flagged. */
        enrolment_ids: z.array(z.string().uuid()).min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: enrolments, error: readError } = await client
      .from("enrolments")
      .select("id, default_package_id")
      .in("id", data.enrolment_ids);
    if (readError) throw readError;

    let attributed = 0;
    const skipped: string[] = [];

    for (const enrolment of enrolments ?? []) {
      const packageId = await packageForEnrolment(
        client,
        enrolment.id,
        enrolment.default_package_id ?? null,
      );
      if (!packageId) {
        // No eligible package, or more than one and no default among them.
        // Which package the hours belong to is then a real question, and this
        // is not the place to guess at it.
        skipped.push(enrolment.id);
        continue;
      }

      const { data: updated, error } = await client
        .from("attendance")
        .update({ package_id: packageId })
        .eq("enrolment_id", enrolment.id)
        .is("package_id", null)
        .neq("att_type", "trial")
        .select("id");
      if (error) throw error;
      attributed += (updated ?? []).length;
    }

    return { attributed, skipped: skipped.length };
  });

/**
 * A bill that is not a lesson and not a package.
 *
 * Deliberately the only way to put an arbitrary amount on a family's account,
 * and deliberately unable to reference a package or an attendance row - the
 * database constraint enforces that, so a manual bill can never be a second
 * charge against something already billed.
 */
export const createManualCharge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        student_id: z.string().uuid(),
        standard_amount: z.coerce.number().min(0),
        adjustment: z.coerce.number().default(0),
        route: z.enum(["parent", "internal"]).default("parent"),
        /** What the bill is for. Required - an unexplained amount is unbillable. */
        description: z.string().min(1, "Say what this bill is for."),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: student, error: studentError } = await client
      .from("students")
      .select("id, full_name, default_payer_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) throw new Error("That student no longer exists.");

    const payerId = (student as Row).default_payer_id ?? null;
    if (data.route === "parent" && !payerId) {
      throw new Error(
        `${student.full_name} has no default payer, so a parent-routed bill cannot be raised. Set one on the student, or bill this internally.`,
      );
    }

    // The description leads the note so it reads as the line item it is.
    const note = data.notes ? `${data.description} — ${data.notes}` : data.description;

    const { error } = await client.from("charges").insert({
      student_id: data.student_id,
      payer_id: data.route === "parent" ? payerId : null,
      source: "manual",
      standard_amount: data.standard_amount,
      adjustment: data.adjustment,
      route: data.route,
      status: "to_invoice",
      notes: note,
    });
    if (error) {
      throw new Error(
        error.message.includes("charge_one_source")
          ? "This database has not had the manual-charge migration applied yet."
          : error.message,
      );
    }
    return { success: true };
  });

/**
 * One charge per lesson, always. The partial unique index on
 * charges.attendance_id makes double-billing impossible at the database; this
 * turns that into a readable message.
 */
export const createPaygCharge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        attendance_id: z.string().uuid(),
        standard_amount: z.coerce.number().min(0),
        adjustment: z.coerce.number().default(0),
        route: z.enum(["parent", "internal"]).default("parent"),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: attendance, error: attendanceError } = await client
      .from("v_attendance")
      .select("id, student_id, enrolments(students(default_payer_id))")
      .eq("id", data.attendance_id)
      .maybeSingle();
    if (attendanceError) throw attendanceError;
    if (!attendance) throw new Error("That roll entry no longer exists.");

    const payerId = (attendance as Row).enrolments?.students?.default_payer_id ?? null;
    if (data.route === "parent" && !payerId) {
      throw new Error(
        "This student has no default payer, so a parent-routed charge cannot be raised.",
      );
    }

    const { error } = await client.from("charges").insert({
      student_id: attendance.student_id,
      payer_id: data.route === "parent" ? payerId : null,
      source: "payg",
      attendance_id: data.attendance_id,
      standard_amount: data.standard_amount,
      adjustment: data.adjustment,
      route: data.route,
      status: "to_invoice",
      notes: data.notes || null,
    });
    if (error) {
      throw new Error(
        error.message.includes("charges_one_per_attendance")
          ? "That lesson has already been charged."
          : error.message,
      );
    }
    return { success: true };
  });

/** The hours invoice: one charge against the package, and nothing further. */
export const createHoursCharge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        package_id: z.string().uuid(),
        standard_amount: z.coerce.number().min(0),
        adjustment: z.coerce.number().default(0),
        route: z.enum(["parent", "internal"]).default("parent"),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: pkg, error: pkgError } = await client
      .from("hours_packages")
      .select("id, student_id, students(default_payer_id)")
      .eq("id", data.package_id)
      .maybeSingle();
    if (pkgError) throw pkgError;
    if (!pkg) throw new Error("That package no longer exists.");

    const payerId = (pkg as Row).students?.default_payer_id ?? null;
    if (data.route === "parent" && !payerId) {
      throw new Error(
        "This student has no default payer, so a parent-routed charge cannot be raised.",
      );
    }

    const { error } = await client.from("charges").insert({
      student_id: pkg.student_id,
      payer_id: data.route === "parent" ? payerId : null,
      source: "hours",
      package_id: data.package_id,
      standard_amount: data.standard_amount,
      adjustment: data.adjustment,
      route: data.route,
      status: "to_invoice",
      notes: data.notes || null,
    });
    if (error) {
      throw new Error(
        error.message.includes("charges_one_per_package")
          ? "That package has already been invoiced."
          : error.message,
      );
    }
    return { success: true };
  });

/**
 * "Bill these together" raises nothing new - it stamps one Xero invoice number
 * across several charges, so a family gets one document while every lesson
 * keeps its own traceable line.
 */
export const markInvoiced = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        invoice_date: z.string().min(1),
        xero_invoice_no: z.string().optional().or(z.literal("")),
        // The cash/card split is invoiced as two runs; stamp how the money is
        // expected so the unpaid queue already reads as cash or card.
        method: z.enum(["cash", "card", "bank_transfer", "other"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {
      status: "invoiced",
      invoice_date: data.invoice_date,
      xero_invoice_no: data.xero_invoice_no || null,
    };
    if (data.method) patch["method"] = data.method;
    const { error } = await db(context.supabase).from("charges").update(patch).in("id", data.ids);
    if (error) throw error;
    return { updated: data.ids.length };
  });

/**
 * How the money is coming in, set before invoicing so the cash and card runs
 * split cleanly. It is only a plan until the charge is marked paid.
 */
export const setChargeMethod = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        method: z.enum(["cash", "card", "bank_transfer", "other"]).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("charges")
      .update({ method: data.method })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/** Undo a cancellation - it goes back to the to-invoice queue. */
export const restoreCharge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("charges")
      .update({ status: "to_invoice" })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/** Paid requires a date and a method - the database will not accept it otherwise. */
export const markPaid = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        paid_date: z.string().min(1),
        method: z.enum(["cash", "card", "bank_transfer", "other"]),
        payment_ref: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("charges")
      .update({
        status: "paid",
        paid_date: data.paid_date,
        method: data.method,
        payment_ref: data.payment_ref || null,
      })
      .in("id", data.ids);
    if (error) throw error;
    return { updated: data.ids.length };
  });

/**
 * Discounts are negative adjustments. standard_amount is the frozen source
 * figure and is never edited.
 */
export const adjustCharge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        adjustment: z.coerce.number(),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("charges")
      .update({ adjustment: data.adjustment, notes: data.notes || null })
      .eq("id", data.id);
    if (error) {
      throw new Error(
        error.message.includes("charge_total_not_negative")
          ? "That discount is larger than the charge itself."
          : error.message,
      );
    }
    return { success: true };
  });

/** Never delete a charge that was invoiced - cancel it. */
export const cancelCharge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("charges")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/**
 * Firm a new enrolment's plan from Billing: whether they're on Hours or PAYG,
 * and what they pay. This is the "I wasn't sure yet" case a new student lands in
 * when they join a class before pricing is agreed.
 *
 * - PAYG sets the per-lesson price on the enrolment; lessons then flow into the
 *   "to charge" queue as they're taught.
 * - Hours sets the per-hour price and opens a priced hours package for the block
 *   they've paid for (hours × rate, plus any adjustment), which then appears
 *   under "Hours packages to charge" ready to invoice.
 */
export const firmEnrolmentPlan = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        enrolment_id: z.string().uuid(),
        method: z.enum(["hours", "payg"]),
        rate: z.coerce.number().min(0),
        hours: z.coerce.number().min(0).default(0),
        adjustment: z.coerce.number().default(0),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: enrolment, error: enrolmentError } = await client
      .from("enrolments")
      .select("id, student_id, status")
      .eq("id", data.enrolment_id)
      .maybeSingle();
    if (enrolmentError) throw enrolmentError;
    if (!enrolment) throw new Error("That enrolment no longer exists.");

    const { error: updError } = await client
      .from("enrolments")
      .update({ method: data.method, base_price: data.rate })
      .eq("id", data.enrolment_id);
    if (updError) throw updError;

    // Hours plan: open the block they've paid for, priced, so it's ready to charge.
    if (data.method === "hours") {
      if (data.hours <= 0) {
        throw new Error("Enter how many hours they're paying for.");
      }
      const price = Math.max(0, Math.round((data.rate * data.hours + data.adjustment) * 100) / 100);
      const { error: pkgError } = await client.from("hours_packages").insert({
        student_id: enrolment.student_id,
        package_type: "purchased",
        hours_purchased: data.hours,
        price,
        status: "active",
      });
      if (pkgError) throw pkgError;
    }

    return { success: true };
  });
