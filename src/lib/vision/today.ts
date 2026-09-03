import type { Row } from "./types";

/**
 * The teaching day, derived.
 *
 * Today is read at a glance while something else is happening - a lesson about
 * to start, a parent on the phone - so what it shows has to be true without
 * being studied. These are the derivations behind it, kept pure so each one can
 * be tested against the awkward cases rather than eyeballed on a screen: a
 * lesson nobody is teaching, a roll half marked, an invoice old enough to
 * matter.
 */

/* ------------------------------------------------------------- Roll state */

export type RollState = "marked" | "partial" | "unmarked" | "empty";

export interface SessionRoll {
  marked: number;
  total: number;
  state: RollState;
}

/**
 * How much of a lesson's roll has been taken.
 *
 * "Partial" is its own state rather than a rounding of unmarked, because it is
 * the one that actually goes wrong: a tutor marks the students in front of them
 * and leaves the absentee unmarked, and the lesson then looks done from a
 * distance while somebody's hours quietly never get spent.
 */
export function rollFor(sessionId: string, attendance: Row[]): SessionRoll {
  const rows = attendance.filter((a) => a.session_id === sessionId);
  const total = rows.length;
  const marked = rows.filter((a) => a.status && a.status !== "not_marked").length;
  if (total === 0) return { marked: 0, total: 0, state: "empty" };
  if (marked === 0) return { marked, total, state: "unmarked" };
  return { marked, total, state: marked === total ? "marked" : "partial" };
}

/* ------------------------------------------------------------ Tutor load */

export interface TutorDay {
  tutorId: string | null;
  name: string;
  colour: string | null;
  lessons: number;
  hours: number;
  /** Sydney wall-clock of the first and last lesson, for "3:30–6:00". */
  from: string | null;
  to: string | null;
}

/**
 * Who is teaching today and how much of the day it takes.
 *
 * Sessions with nobody assigned are deliberately not folded into a "no tutor"
 * pseudo-tutor here - they are a separate question, answered by
 * `unassigned` below, because one is a workload and the other is a hole.
 */
export function tutorsFor(sessions: Row[]): TutorDay[] {
  const byTutor = new Map<string, TutorDay>();

  for (const s of sessions) {
    const id = s.tutor_id;
    if (!id) continue;
    const entry: TutorDay = byTutor.get(id) ?? {
      tutorId: id,
      name: s.tutors?.full_name ?? "Unnamed tutor",
      colour: s.tutors?.colour ?? null,
      lessons: 0,
      hours: 0,
      from: null,
      to: null,
    };
    entry.lessons += 1;
    entry.hours += Number(s.duration_hours ?? 0);
    if (!entry.from || String(s.starts_at) < entry.from) entry.from = String(s.starts_at);
    if (!entry.to || String(s.ends_at) > entry.to) entry.to = String(s.ends_at);
    byTutor.set(id, entry);
  }

  return [...byTutor.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

/** Lessons with nobody teaching them. The one hole worth interrupting for. */
export function unassigned(sessions: Row[]): Row[] {
  return sessions.filter((s) => !s.tutor_id);
}

/* --------------------------------------------------------------- Ageing */

export interface Ageing {
  under30: number;
  from30to60: number;
  over60: number;
  oldestDays: number | null;
}

/** Whole days between two Sydney calendar dates, or null if either is missing. */
export function daysBetween(from: string | null | undefined, to: string): number | null {
  if (!from) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How overdue the unpaid money is, in three buckets.
 *
 * A single total says how much is owed and nothing about whether it is a
 * problem. Twelve thousand invoiced last week is a healthy month; the same
 * figure sent in July is a conversation nobody has had. An invoice with no date
 * counts in the oldest bucket, because a bill you cannot date is not a bill
 * anyone is tracking.
 */
export function ageing(unpaid: Row[], today: string): Ageing {
  const result: Ageing = { under30: 0, from30to60: 0, over60: 0, oldestDays: null };

  for (const c of unpaid) {
    const amount = Number(c.final_amount ?? 0);
    const days = daysBetween(c.invoice_date as string | null, today);
    if (days == null) {
      result.over60 += amount;
      continue;
    }
    if (result.oldestDays == null || days > result.oldestDays) result.oldestDays = days;
    if (days < 30) result.under30 += amount;
    else if (days < 60) result.from30to60 += amount;
    else result.over60 += amount;
  }

  return result;
}
