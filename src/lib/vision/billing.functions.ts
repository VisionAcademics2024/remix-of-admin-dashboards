import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
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

    const [uncharged, charges, packagesToCharge, newEnrolments] = await Promise.all([
      // PAYG lessons attended but not charged.
      client
        .from("v_attendance")
        .select(
          "*, sessions(code, starts_at, class_offerings(code, programs(name))), enrolments(code, base_price, standard_price_id, students(id, code, full_name, default_payer_id))",
        )
        .eq("billing_method", "payg")
        .eq("status", "present")
        .order("lesson_starts_at", { ascending: false })
        .limit(300),
      client
        .from("v_charges")
        .select("*, students(id, code, full_name), guardians(id, full_name)")
        .order("created_at", { ascending: false })
        .limit(500),
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
    const chargedAttendance = new Set(
      chargeRows.filter((c: Row) => c.attendance_id).map((c: Row) => c.attendance_id),
    );
    const chargedPackages = new Set(
      chargeRows.filter((c: Row) => c.package_id).map((c: Row) => c.package_id),
    );

    return {
      newEnrolments: newEnrolments.data ?? [],
      toCharge: (uncharged.data ?? []).filter((a: Row) => !chargedAttendance.has(a.id)),
      packagesToCharge: (packagesToCharge.data ?? []).filter(
        (p: Row) => !chargedPackages.has(p.id) && Number(p.price) > 0,
      ),
      toInvoice: chargeRows.filter((c: Row) => c.status === "to_invoice"),
      unpaid: chargeRows.filter((c: Row) => c.status === "invoiced"),
      received: chargeRows.filter((c: Row) => c.status === "paid"),
      cancelled: chargeRows.filter((c: Row) => c.status === "cancelled"),
    };
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
