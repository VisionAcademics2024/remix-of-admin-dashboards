import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sydDate, sydToday } from "@/lib/format";
import { db, requireStaff } from "./guard";
import type { Row } from "./types";

const blank = z.string().optional().or(z.literal(""));

function nullify<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "" ? null : v])) as T;
}

/* ------------------------------------------------------------ The pipeline board */

/** Everything the Leads & Trials screen needs on first paint, in one round trip. */
export const getLeadsBoard = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .handler(async ({ context }) => {
    const client = db(context.supabase);

    const [leads, programs, tutors, staff, offerings] = await Promise.all([
      client.from("v_leads").select("*").order("created_at", { ascending: false }),
      client.from("programs").select("id, name, code").eq("is_active", true).order("name"),
      client
        .from("tutors")
        .select("id, full_name, colour")
        .eq("status", "active")
        .order("full_name"),
      client.from("staff").select("user_id, full_name").eq("is_active", true).order("full_name"),
      client
        .from("class_offerings")
        .select("id, code, status, programs(name), operating_periods(name, code)")
        .in("status", ["planned", "active"])
        .order("starts_on", { ascending: false }),
    ]);

    return {
      leads: leads.data ?? [],
      programs: programs.data ?? [],
      tutors: tutors.data ?? [],
      staff: staff.data ?? [],
      offerings: offerings.data ?? [],
    };
  });

/** One lead with its full contact log and every trial booked for it. */
export const getLead = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: lead, error } = await client
      .from("v_leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!lead) return null;

    const [contacts, trials] = await Promise.all([
      client
        .from("lead_contacts")
        .select("*, staff(full_name)")
        .eq("lead_id", data.id)
        .order("contacted_at", { ascending: false }),
      client
        .from("trials")
        .select("*, class_offerings(code, programs(name)), tutors(full_name), programs(name)")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false }),
    ]);

    // Once converted, surface the student it became so the lead links straight
    // through to the real profile, its family, and the class it joined.
    let student: Row | null = null;
    if (lead.converted_student_id) {
      const [{ data: s }, { data: enrolment }] = await Promise.all([
        client
          .from("students")
          .select(
            "id, code, full_name, year_level, status, default_payer_id, " +
              "student_guardians(relationship, guardians(id, code, full_name, mobile, email))",
          )
          .eq("id", lead.converted_student_id)
          .maybeSingle(),
        lead.converted_enrolment_id
          ? client
              .from("enrolments")
              .select("id, code, status, method, starts_on, class_offerings(code, programs(name))")
              .eq("id", lead.converted_enrolment_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const sr = s as Row | null;
      if (sr) {
        const guardians = ((sr.student_guardians ?? []) as Row[]).map((g) => ({
          ...g.guardians,
          relationship: g.relationship,
        }));
        student = {
          ...sr,
          guardians,
          payer_name: guardians.find((g: Row) => g.id === sr.default_payer_id)?.full_name ?? null,
          enrolment: enrolment ?? null,
        };
      }
    }

    return { lead, contacts: contacts.data ?? [], trials: trials.data ?? [], student };
  });

/* --------------------------------------------------------------------- Save a lead */

const leadInput = z.object({
  student_name: z.string().min(1, "The child's name is required"),
  year_level: blank,
  subject_interest: blank,
  program_interest_id: z.string().uuid().nullish(),
  guardian_name: z.string().min(1, "The parent's name is required"),
  guardian_email: blank,
  guardian_mobile: blank,
  status: z.enum(["new", "contacted", "nurturing", "trial_booked", "converted", "lost"]),
  source: z.enum(["referral", "google", "social_media", "walk_in", "event", "website", "other"]),
  source_detail: blank,
  assigned_to: z.string().uuid().nullish(),
  next_action_on: blank,
  lost_reason: blank,
  notes: blank,
});

export const saveLead = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => leadInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...values } = data;
    const client = db(context.supabase);
    const payload = nullify(values);
    const { data: row, error } = id
      ? await client.from("leads").update(payload).eq("id", id).select("id, code").single()
      : await client.from("leads").insert(payload).select("id, code").single();
    if (error) throw error;
    return { success: true, id: row?.id as string, code: row?.code as string };
  });

/** Remove a lead outright, and its contact log and trials with it (FK cascade).
 * A converted lead's student and enrolment are left untouched. */
export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase).from("leads").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

/* --------------------------------------------------------------- Log a contact */

/**
 * Record a touchpoint. A first contact on a brand-new lead nudges it to
 * `contacted`, and the follow-up date is mirrored onto the lead so the board's
 * "overdue" column stays honest without a second edit.
 */
export const logContact = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        lead_id: z.string().uuid(),
        channel: z.enum(["phone", "sms", "email", "whatsapp", "in_person", "other"]),
        summary: z.string().min(1, "Say what was discussed"),
        contacted_at: z.string().min(1),
        next_action_on: blank,
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { error } = await client.from("lead_contacts").insert({
      lead_id: data.lead_id,
      channel: data.channel,
      summary: data.summary,
      contacted_at: new Date(data.contacted_at).toISOString(),
      next_action_on: data.next_action_on || null,
      contacted_by: context.staff.user_id,
    });
    if (error) throw error;

    const { data: lead } = await client
      .from("leads")
      .select("status")
      .eq("id", data.lead_id)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (data.next_action_on) patch["next_action_on"] = data.next_action_on;
    if (lead?.status === "new") patch["status"] = "contacted";
    if (Object.keys(patch).length) {
      const { error: patchError } = await client.from("leads").update(patch).eq("id", data.lead_id);
      if (patchError) throw patchError;
    }
    return { success: true };
  });

/**
 * Upcoming lessons for one class offering, so a trial can be pinned to a
 * specific existing session rather than a loose date.
 */
export const getOfferingSessions = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await db(context.supabase)
      .from("sessions")
      .select("id, starts_at, ends_at, status, tutors(full_name)")
      .eq("class_offering_id", data.offering_id)
      .neq("status", "cancelled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(50);
    if (error) throw error;
    return rows ?? [];
  });

/**
 * Trial students to overlay on the Attendance roll. A trial has no student or
 * attendance record until conversion, so these are read straight from the
 * trials table, joined to their session and lead, and filtered to the same date
 * window the roll is showing. Marking one attended/no-show updates the trial's
 * own status (via saveTrial), never a real attendance row.
 */
export const listTrialRoll = createServerFn({ method: "GET" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        filter: z.enum(["today", "tomorrow", "this_week", "trials", "all"]).default("today"),
        today: z.string().min(1),
        week_start: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await db(context.supabase)
      .from("trials")
      .select(
        "id, code, kind, status, session_id, scheduled_for, class_offering_id, " +
          "leads(id, code, student_name, year_level, guardian_name, guardian_mobile), " +
          "class_offerings(code, programs(name)), " +
          "sessions(code, starts_at, ends_at, tutors(full_name, colour))",
      )
      .not("session_id", "is", null)
      .order("scheduled_for", { ascending: true });
    if (error) throw error;

    const shiftDate = (d: string, days: number) => {
      const dt = new Date(`${d}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    };
    const weekEnd = shiftDate(data.week_start, 6);

    return ((rows ?? []) as Row[])
      .map((t) => ({
        ...t,
        session_date: t.sessions?.starts_at ? sydDate(t.sessions.starts_at) : null,
      }))
      .filter((t) => {
        if (!t.session_date) return false;
        switch (data.filter) {
          case "today":
            return t.session_date === data.today;
          case "tomorrow":
            return t.session_date === shiftDate(data.today, 1);
          case "this_week":
            return t.session_date >= data.week_start && t.session_date <= weekEnd;
          default:
            return true; // "trials" and "all"
        }
      });
  });

/* ------------------------------------------------------------------ Save a trial */

const trialInput = z.object({
  lead_id: z.string().uuid(),
  kind: z.enum(["class_trial", "diagnostic_test"]),
  class_offering_id: z.string().uuid().nullish(),
  session_id: z.string().uuid().nullish(),
  scheduled_for: blank,
  status: z.enum(["proposed", "scheduled", "attended", "no_show", "converted", "declined"]),
  recommendation: z
    .enum(["ready_for_class", "needs_foundation", "accelerate", "not_suitable", "undecided"])
    .nullish(),
  recommended_program_id: z.string().uuid().nullish(),
  score: blank,
  outcome_notes: blank,
  conducted_by: z.string().uuid().nullish(),
  // The trial student's own details, edited here and written back to the lead
  // (there is no student record until conversion).
  student_name: blank,
  year_level: blank,
  guardian_mobile: blank,
  guardian_email: blank,
});

export const saveTrial = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) => trialInput.extend({ id: z.string().uuid().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    const {
      id,
      scheduled_for,
      student_name,
      year_level,
      guardian_mobile,
      guardian_email,
      ...rest
    } = data;
    const client = db(context.supabase);

    if (rest.kind === "class_trial" && !rest.class_offering_id) {
      throw new Error(
        "A class trial needs a class to sit in on. Pick one, or make a new one first.",
      );
    }

    const payload = {
      ...nullify(rest),
      scheduled_for: scheduled_for ? new Date(scheduled_for).toISOString() : null,
    };

    const { error } = id
      ? await client.from("trials").update(payload).eq("id", id)
      : await client.from("trials").insert(payload);
    if (error) throw error;

    // Persist any edits to the trial student's details onto the lead. student_name
    // is required on the lead, so only write it when it was actually supplied.
    const leadPatch: Record<string, unknown> = {};
    if (student_name) leadPatch["student_name"] = student_name;
    if (year_level !== undefined) leadPatch["year_level"] = year_level || null;
    if (guardian_mobile !== undefined) leadPatch["guardian_mobile"] = guardian_mobile || null;
    if (guardian_email !== undefined) leadPatch["guardian_email"] = guardian_email || null;
    if (Object.keys(leadPatch).length) {
      const { error: leadError } = await client
        .from("leads")
        .update(leadPatch)
        .eq("id", data.lead_id);
      if (leadError) throw leadError;
    }

    // Booking a trial moves the lead along, unless it's already further ahead.
    if (!id) {
      const { data: lead } = await client
        .from("leads")
        .select("status")
        .eq("id", data.lead_id)
        .maybeSingle();
      if (lead && ["new", "contacted", "nurturing"].includes(lead.status)) {
        await client.from("leads").update({ status: "trial_booked" }).eq("id", data.lead_id);
      }
    }
    return { success: true };
  });

/* --------------------------------------------------------------- Convert a lead */

/**
 * Turn a won lead into a real record. Creates a brand-new guardian and student,
 * links them, and makes the guardian the default payer, in the order the
 * deferred payer trigger requires (link before payer). Optionally opens a trial
 * enrolment in a chosen class so the family lands straight on the roll.
 *
 * Everything downstream (sessions, attendance, hours, billing) is the existing
 * machinery; this only stitches the pipeline onto it.
 */
export const convertLead = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .inputValidator((data) =>
    z
      .object({
        lead_id: z.string().uuid(),
        relationship: blank,
        enrol_offering_id: z.string().uuid().nullish(),
        // How they join the class: keep them a trial student, or enrol them for real.
        enrol_status: z.enum(["trial", "active"]).default("trial"),
        // Required only for an active enrolment (a trial consumes nothing).
        enrol_method: z.enum(["hours", "payg"]).nullish(),
        enrol_starts_on: blank,
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const { data: lead, error: leadError } = await client
      .from("leads")
      .select("*")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) throw new Error("Lead not found.");
    if (lead.converted_student_id) throw new Error("This lead has already been converted.");

    // 1. The guardian.
    const { data: guardian, error: gError } = await client
      .from("guardians")
      .insert(
        nullify({
          full_name: lead.guardian_name,
          email: lead.guardian_email,
          mobile: lead.guardian_mobile,
        }),
      )
      .select("id")
      .single();
    if (gError) throw gError;

    // 2. The student, with no payer yet, so the deferred trigger has nothing to reject.
    const foundUs = [lead.source, lead.source_detail].filter(Boolean).join(" · ") || null;
    const { data: student, error: sError } = await client
      .from("students")
      .insert(
        nullify({
          full_name: lead.student_name,
          year_level: lead.year_level,
          how_they_found_us: foundUs,
          joined_on: sydToday(),
        }),
      )
      .select("id")
      .single();
    if (sError) throw sError;

    // 3. Link them.
    const { error: linkError } = await client.from("student_guardians").insert({
      student_id: student.id,
      guardian_id: guardian.id,
      relationship: data.relationship || null,
    });
    if (linkError) throw linkError;

    // 4. Now the payer can be set: the link exists, so the trigger passes.
    const { error: payerError } = await client
      .from("students")
      .update({ default_payer_id: guardian.id })
      .eq("id", student.id);
    if (payerError) throw payerError;

    // 5. Optional enrolment, so they land on the roll immediately. A trial keeps
    //    the enrolment open with no billing method; an active enrolment needs one
    //    (the enrolment_method_required check enforces this). Pricing is left to
    //    the Enrolments screen, where an active enrolment without a price shows on
    //    Needs Attention as a reminder.
    let enrolmentId: string | null = null;
    if (data.enrol_offering_id) {
      const active = data.enrol_status === "active";
      if (active && !data.enrol_method) {
        throw new Error(
          "Choose a billing method (Hours or Pay as you go) for an active enrolment, or enrol them as a trial.",
        );
      }
      const { data: enrolment, error: eError } = await client
        .from("enrolments")
        .insert({
          student_id: student.id,
          class_offering_id: data.enrol_offering_id,
          status: active ? "active" : "trial",
          method: active ? data.enrol_method : null,
          starts_on: data.enrol_starts_on || sydToday(),
        })
        .select("id")
        .single();
      if (eError) throw eError;
      enrolmentId = enrolment.id;
    }

    // 6. Close the loop on the lead.
    const { error: updError } = await client
      .from("leads")
      .update({
        status: "converted",
        converted_student_id: student.id,
        converted_enrolment_id: enrolmentId,
        converted_at: new Date().toISOString(),
      })
      .eq("id", data.lead_id);
    if (updError) throw updError;

    return { success: true, student_id: student.id as string };
  });
