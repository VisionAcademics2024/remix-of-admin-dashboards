import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireStaff } from "./guard";
import { applyTaughtFilters, findUnbilled } from "./billing-audit";
import { needsPlan } from "./billing-groups";
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

    const [
      uncharged,
      charges,
      invoiceRows,
      billedKeys,
      packageOwners,
      packagesToCharge,
      newEnrolments,
    ] = await Promise.all([
      // PAYG lessons attended but not charged.
      //
      // Ordered OLDEST first, deliberately. This list is capped, and the cap
      // used to sit under a newest-first order - so once the backlog passed the
      // cap it was the oldest, most overdue lessons that fell off the end and
      // stopped being billable. The ones that have waited longest are the ones
      // that must survive the cut.
      applyTaughtFilters(
        client
          .from("v_attendance")
          .select(
            "*, sessions(code, starts_at, class_offerings(code, programs(name))), enrolments(code, base_price, standard_price_id, students(id, code, full_name, default_payer_id))",
          )
          .eq("billing_method", "payg"),
      )
        .order("lesson_starts_at", { ascending: true })
        .limit(UNCHARGED_LIMIT),
      // No invoice embed here, deliberately. v_charges is a view, and asking
      // PostgREST to follow charges.invoice_id through it failed - which took
      // the whole request down and rendered every queue as empty. The money
      // must not depend on a join that can fail; the invoice is read
      // separately below and attached in the app.
      client
        .from("v_charges")
        .select("*, students(id, code, full_name), guardians(id, full_name)")
        .order("created_at", { ascending: false })
        .limit(CHARGE_LIMIT),
      // The invoices those charges belong to. A nicety - it supplies the
      // INV- label - so a failure here must never blank the charges.
      client.from("invoices").select("id, code, invoice_date, xero_invoice_no"),
      // What has already been billed, as ids only.
      //
      // This is separate from the list above on purpose. "Already charged" used
      // to be derived from that capped list, which meant that past the cap the
      // app forgot a lesson had been billed and offered it up to be billed
      // again. Ids are small enough to read without a cap, so the guard against
      // double-billing is never the thing that gets truncated.
      client.from("charges").select("attendance_id, package_id").neq("status", "cancelled"),
      // Who owns a package at all, charged or not.
      //
      // Separate from the to-charge list below, which only holds uncharged
      // ones. An hours student's price lives on their package, so "have they
      // got one?" is the question that settles their plan - and it must not
      // stop being true the moment someone invoices it.
      client.from("hours_packages").select("student_id").neq("status", "draft"),
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
        .order("starts_on", { ascending: false })
        .limit(ENROLMENT_LIMIT),
    ]);

    // A failed query used to arrive here as an empty array, so a broken read
    // rendered as "nothing is owed anywhere" - indistinguishable from a quiet
    // month, and far more dangerous than an error message. These are the
    // queries the figures are made of; if one fails, say so.
    for (const [what, result] of [
      ["charges", charges],
      ["lessons to charge", uncharged],
      ["what has already been billed", billedKeys],
      ["packages", packagesToCharge],
      ["enrolments", newEnrolments],
    ] as const) {
      if (result.error) {
        throw new Error(`Billing could not read ${what}: ${result.error.message}`);
      }
    }

    const chargeRows = charges.data ?? [];
    const billed = billedKeys.data ?? [];

    // Attach each charge's invoice. Read separately and tolerated if it fails,
    // because the label is worth less than the figures it would take with it.
    const invoicesById = new Map((invoiceRows.data ?? []).map((i: Row) => [i.id, i] as const));
    for (const c of chargeRows) {
      c.invoices = c.invoice_id ? (invoicesById.get(c.invoice_id) ?? null) : null;
    }
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
    // Every student who owns a package, whatever has been billed against it.
    const packagedStudentIds = new Set(
      (packageOwners.data ?? []).map((p: Row) => p.student_id).filter(Boolean),
    );

    return {
      newEnrolments: (newEnrolments.data ?? []).filter((e: Row) =>
        needsPlan(e, packagedStudentIds.has(e.students?.id)),
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
        enrolments: (newEnrolments.data ?? []).length >= ENROLMENT_LIMIT,
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
/**
 * Active enrolments read to decide who still needs a plan.
 *
 * This one is filtered in the app rather than the query, because whether an
 * hours student is settled depends on owning a package - which no single
 * PostgREST filter can ask. So the cap has to be generous enough to hold every
 * active enrolment, and honest when it is not.
 */
const ENROLMENT_LIMIT = 1000;
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
      applyTaughtFilters(
        client
          .from("v_attendance")
          .select("id, enrolment_id, package_id, hours_consumed, session_date"),
      ),
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
      // Both halves of the manual-charge migration fail right here, in order:
      // first the enum has no 'manual' label, then the check constraint still
      // demands a package or an attendance. One message covers both, and names
      // the file that fixes it - "invalid input value for enum charge_source"
      // is not something anyone can act on.
      const migrationMissing =
        error.message.includes("charge_one_source") ||
        (error.message.includes("charge_source") && error.message.includes("manual"));
      throw new Error(
        migrationMissing
          ? "This database cannot take a manual bill yet: it is missing the charge_source migration. Run steps 1 and 2 of supabase/apply-by-hand/2026-09-10-catch-up.sql in the Supabase SQL editor, then raise the bill again."
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

/**
 * Charge several PAYG lessons in one go.
 *
 * Still one charge per lesson - that is what stops a lesson being billed twice,
 * and what lets a single lesson be discounted or cancelled later without
 * unpicking the rest. What changes is that raising them is one action rather
 * than five, and the charges that come out are then invoiced together under one
 * number, so the family receives one bill with a line per lesson.
 *
 * All or nothing: the rows go in as one insert, so a lesson that has already
 * been charged fails the whole batch rather than leaving half a bill raised.
 */
export const createPaygCharges = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        items: z
          .array(
            z.object({
              attendance_id: z.string().uuid(),
              standard_amount: z.coerce.number().min(0),
              adjustment: z.coerce.number().default(0),
            }),
          )
          .min(1),
        route: z.enum(["parent", "internal"]).default("parent"),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);
    const ids = data.items.map((i) => i.attendance_id);

    const { data: rows, error: readError } = await client
      .from("v_attendance")
      .select("id, student_id, enrolments(students(full_name, default_payer_id))")
      .in("id", ids);
    if (readError) throw readError;

    const byId = new Map((rows ?? []).map((r: Row) => [r.id, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(`${missing.length} of those lessons no longer exist.`);
    }

    const payload = data.items.map((item) => {
      const row = byId.get(item.attendance_id) as Row;
      const payerId = row.enrolments?.students?.default_payer_id ?? null;
      if (data.route === "parent" && !payerId) {
        throw new Error(
          `${row.enrolments?.students?.full_name ?? "A student"} has no default payer, so a parent-routed charge cannot be raised.`,
        );
      }
      return {
        student_id: row.student_id,
        payer_id: data.route === "parent" ? payerId : null,
        source: "payg",
        attendance_id: item.attendance_id,
        standard_amount: item.standard_amount,
        adjustment: item.adjustment,
        route: data.route,
        status: "to_invoice",
        notes: data.notes || null,
      };
    });

    const { error } = await client.from("charges").insert(payload);
    if (error) {
      throw new Error(
        error.message.includes("charges_one_per_attendance")
          ? "One of those lessons has already been charged, so nothing was raised. Refresh and try the rest."
          : error.message,
      );
    }
    return { raised: payload.length };
  });

/**
 * Set how long a lesson ran for.
 *
 * hours_consumed is not stored - it is the gap between a lesson's start and its
 * end. A lesson whose end was never set therefore reads as zero hours, and an
 * hours student taught in it draws nothing from their package.
 *
 * Editing it here moves the lesson's end time, keeping the start where it is.
 * That is the whole lesson, not one student's part of it, so a group class
 * changes for everyone on the roll - which is why the count comes back and has
 * to be confirmed before anything moves.
 */
export const setLessonHours = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        session_id: z.string().uuid(),
        hours: z.coerce.number().positive().max(12),
        /** Required when more than one student sits on this lesson. */
        confirm: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: session, error: readError } = await client
      .from("sessions")
      .select("id, code, starts_at")
      .eq("id", data.session_id)
      .maybeSingle();
    if (readError) throw readError;
    if (!session) throw new Error("That lesson no longer exists.");

    const { data: roll, error: rollError } = await client
      .from("attendance")
      .select("id")
      .eq("session_id", data.session_id);
    if (rollError) throw rollError;

    const attendees = (roll ?? []).length;
    if (attendees > 1 && !data.confirm) {
      return { updated: false, needsConfirm: true, attendees, code: session.code };
    }

    const endsAt = new Date(Date.parse(session.starts_at) + data.hours * 3_600_000).toISOString();
    const { error } = await client
      .from("sessions")
      .update({ ends_at: endsAt })
      .eq("id", data.session_id);
    if (error) throw error;

    return { updated: true, needsConfirm: false, attendees, code: session.code };
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
/**
 * Send a run out as one invoice.
 *
 * The charges are the lines; the invoice is the document the family receives.
 * Creating a row for it is what lets the unpaid queue show one invoice that
 * opens to its lines, instead of five lines that were sent together and have no
 * way of saying so - the Xero number used to be the only thing tying them
 * together, and it is optional.
 *
 * One payer per invoice, refused at the server rather than trusted from the
 * screen: a set of charges spanning two households would put one family's
 * children on the other's bill, and that is not a mistake worth allowing
 * anywhere in the stack.
 */
export const markInvoiced = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        invoice_date: z.string().min(1),
        xero_invoice_no: z.string().optional().or(z.literal("")),
        // The cash/bank-transfer split is invoiced as two runs; stamp how the
        // money is expected so the unpaid queue already reads as one or other.
        method: z.enum(["cash", "card", "bank_transfer", "other"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: rows, error: readError } = await client
      .from("charges")
      .select("id, payer_id, guardians(full_name)")
      .in("id", data.ids);
    if (readError) throw readError;
    if ((rows ?? []).length !== data.ids.length) {
      throw new Error("Some of those charges no longer exist.");
    }

    const payers = [...new Set((rows ?? []).map((c: Row) => c.payer_id ?? null))];
    if (payers.length > 1) {
      throw new Error(
        "Those charges belong to different families, so they cannot go on one invoice. Invoice each family separately.",
      );
    }

    const { data: invoice, error: invoiceError } = await client
      .from("invoices")
      .insert({
        payer_id: payers[0] ?? null,
        invoice_date: data.invoice_date,
        method: data.method ?? null,
        xero_invoice_no: data.xero_invoice_no || null,
      })
      .select("id, code")
      .single();
    if (invoiceError) throw invoiceError;

    const patch: Record<string, unknown> = {
      status: "invoiced",
      invoice_date: data.invoice_date,
      xero_invoice_no: data.xero_invoice_no || null,
      invoice_id: invoice.id,
    };
    if (data.method) patch["method"] = data.method;

    const { error } = await client.from("charges").update(patch).in("id", data.ids);
    if (error) throw error;
    return { updated: data.ids.length, invoice_id: invoice.id, code: invoice.code };
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
