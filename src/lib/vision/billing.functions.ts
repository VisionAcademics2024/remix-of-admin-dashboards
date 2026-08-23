import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import type { Row } from "./types";

/**
 * Money in, as a pipeline: to charge → to invoice → unpaid → received.
 *
 * "To charge" is the one queue that is not a charge status — it is attendance
 * that has been taught and not yet billed.
 */
export const getBillingBoard = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [uncharged, charges, packagesToCharge] = await Promise.all([
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
    ]);

    const chargeRows = charges.data ?? [];
    const chargedAttendance = new Set(
      chargeRows.filter((c: Row) => c.attendance_id).map((c: Row) => c.attendance_id),
    );
    const chargedPackages = new Set(
      chargeRows.filter((c: Row) => c.package_id).map((c: Row) => c.package_id),
    );

    return {
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
 * "Bill these together" raises nothing new — it stamps one Xero invoice number
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
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("charges")
      .update({
        status: "invoiced",
        invoice_date: data.invoice_date,
        xero_invoice_no: data.xero_invoice_no || null,
      })
      .in("id", data.ids);
    if (error) throw error;
    return { updated: data.ids.length };
  });

/** Paid requires a date and a method — the database will not accept it otherwise. */
export const markPaid = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        paid_date: z.string().min(1),
        method: z.enum(["cash", "bank_transfer", "other"]),
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

/** Never delete a charge that was invoiced — cancel it. */
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
