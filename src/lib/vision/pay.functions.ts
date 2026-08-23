import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db, requireOwner } from "./guard";
import type { Row } from "./types";

/**
 * Owner-only, twice over. RLS on tutor_pay_rates, session_pay_adjustments and
 * tutor_payouts means an admin sees nothing; requireOwner means an admin gets
 * told so rather than being shown a screen of zeroes.
 */

export const getFortnightPay = createServerFn({ method: "GET" })
  .middleware([requireOwner])
  .inputValidator((data) => z.object({ fortnight_start: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }) => {
    const client = db(context.supabase);

    const [totals, lessons, payouts, rates, tutors] = await Promise.all([
      client.from("v_tutor_fortnight_pay").select("*").eq("fortnight_start", data.fortnight_start),
      client
        .from("v_session_pay")
        .select("*")
        .eq("fortnight_start", data.fortnight_start)
        .order("session_date"),
      client.from("tutor_payouts").select("*").eq("fortnight_start", data.fortnight_start),
      client.from("tutor_pay_rates").select("*").order("effective_from", { ascending: false }),
      client.from("tutors").select("id, code, full_name, colour, status").order("full_name"),
    ]);

    // Lesson detail carries the class and tutor names the pay views leave out.
    const sessionIds = (lessons.data ?? []).map((l: Row) => l.session_id);
    const context_ = sessionIds.length
      ? ((
          await client
            .from("sessions")
            .select("id, code, starts_at, ends_at, status, class_offerings(code, programs(name))")
            .in("id", sessionIds)
        ).data ?? [])
      : [];
    const byId = new Map(context_.map((s: Row) => [s.id, s]));

    return {
      totals: totals.data ?? [],
      lessons: (lessons.data ?? []).map((l: Row) => ({
        ...l,
        session: byId.get(l.session_id) ?? null,
      })),
      payouts: payouts.data ?? [],
      rates: rates.data ?? [],
      tutors: tutors.data ?? [],
    };
  });

/**
 * A new rate is a new row. Repricing a past fortnight because someone got a
 * raise is a bug, not a feature — v_session_pay always reads the rate in force
 * on the lesson's own date.
 */
export const addPayRate = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) =>
    z
      .object({
        tutor_id: z.string().uuid(),
        hourly_rate: z.coerce.number().min(0),
        effective_from: z.string().min(1),
        note: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase)
      .from("tutor_pay_rates")
      .insert({ ...data, note: data.note || null });
    if (error) {
      throw new Error(
        error.message.includes("tutor_pay_rates_unique")
          ? "That tutor already has a rate starting on that date."
          : error.message,
      );
    }
    return { success: true };
  });

/** Every adjustment requires a written reason. This is enforced, not encouraged. */
export const addSessionPayAdjustment = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) =>
    z
      .object({
        session_id: z.string().uuid(),
        amount: z.coerce.number(),
        note: z.string().min(1, "An adjustment needs a reason."),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context.supabase).from("session_pay_adjustments").insert({
      session_id: data.session_id,
      amount: data.amount,
      note: data.note,
      created_by: context.staff.user_id,
    });
    if (error) throw error;
    return { success: true };
  });

export const listSessionPayAdjustments = createServerFn({ method: "GET" })
  .middleware([requireOwner])
  .inputValidator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await db(context.supabase)
      .from("session_pay_adjustments")
      .select("*")
      .eq("session_id", data.session_id)
      .order("created_at");
    if (error) throw error;
    return rows ?? [];
  });

/**
 * A payout freezes hours and rate at the moment of payment. From then on the
 * row is a historical record and does not track later edits.
 *
 * total = (hours_worked + hours_adjustment) * rate_at_payout + amount_adjustment
 */
export const savePayout = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data) =>
    z
      .object({
        tutor_id: z.string().uuid(),
        fortnight_start: z.string().min(1),
        hours_worked: z.coerce.number().min(0),
        rate_at_payout: z.coerce.number().min(0),
        hours_adjustment: z.coerce.number().default(0),
        amount_adjustment: z.coerce.number().default(0),
        adjustment_reason: z.string().optional().or(z.literal("")),
        status: z.enum(["draft", "approved", "paid"]).default("draft"),
        paid_date: z.string().optional().or(z.literal("")),
        method: z.enum(["cash", "bank_transfer", "other"]).nullish(),
        payment_ref: z.string().optional().or(z.literal("")),
        notes: z.string().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const hasAdjustment = data.hours_adjustment !== 0 || data.amount_adjustment !== 0;
    if (hasAdjustment && !data.adjustment_reason?.trim()) {
      throw new Error("An adjustment needs a written reason.");
    }
    if (data.status === "paid" && (!data.paid_date || !data.method)) {
      throw new Error("Marking a payout paid requires a date and a payment method.");
    }

    const { error } = await db(context.supabase)
      .from("tutor_payouts")
      .upsert(
        {
          ...data,
          adjustment_reason: data.adjustment_reason || null,
          paid_date: data.paid_date || null,
          method: data.method || null,
          payment_ref: data.payment_ref || null,
          notes: data.notes || null,
        },
        { onConflict: "tutor_id,fortnight_start" },
      );
    if (error) throw error;
    return { success: true };
  });

export function payoutTotal(p: {
  hours_worked: number;
  hours_adjustment: number;
  rate_at_payout: number;
  amount_adjustment: number;
}): number {
  const raw =
    (Number(p.hours_worked) + Number(p.hours_adjustment)) * Number(p.rate_at_payout) +
    Number(p.amount_adjustment);
  return Math.round(raw * 100) / 100;
}
