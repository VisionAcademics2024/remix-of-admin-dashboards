import type { Row } from "./types";

/**
 * Who should be reachable from Billing, and is not.
 *
 * Billing shows a student through exactly four doors: a PAYG lesson taught and
 * not charged, an hours package not charged, a new enrolment with no price
 * agreed, or a charge that already exists. Every one of those starts from a
 * row - an attendance, a package, an enrolment with a blank price, a charge.
 *
 * A student who has bought hours and is being taught can still miss all four.
 * The commonest way is the plainest: the hours were agreed but no package was
 * ever created, so there is no row for Billing to find. The lessons run, the
 * roll is marked, the balance is drawn from nothing, and no screen in the app
 * ever says the family owes anything.
 *
 * This module names those cases. The classifier is pure so the rules can be
 * tested without a database, and so "why is this student here?" has one answer
 * in one place rather than a condition buried in a query.
 */

export type UnbilledReason =
  | "hours_no_package"
  | "hours_unattributed"
  | "package_draft"
  | "method_unset"
  | "closed_with_unbilled";

export interface UnbilledFinding {
  reason: UnbilledReason;
  /** The enrolment or package this is about. */
  id: string;
  code: string | null;
  studentId: string | null;
  studentName: string;
  className: string | null;
  /** Hours actually taught and unaccounted for, where that is the point. */
  hours: number;
  /** Lessons behind those hours. */
  lessons: number;
  /** Money already agreed, where there is any. */
  amount: number | null;
}

export const UNBILLED_REASONS: Record<
  UnbilledReason,
  { title: string; explain: string; severity: "high" | "medium" }
> = {
  hours_no_package: {
    title: "On hours, but no package was ever bought",
    explain:
      "The enrolment is set to draw from an hours package and no package exists for this student. The lessons are being taught and nothing can be billed for them, because there is no purchase to invoice.",
    severity: "high",
  },
  hours_unattributed: {
    title: "Hours taught against no package",
    explain:
      "The student has a package, but these roll entries are not pointed at it - so the hours are taught, the balance is never drawn down, and the package looks unused. This is what a make-up settled by cancelling the lesson and creating a new one in its place used to leave behind: the new lesson's roll was seeded without a package. Attributing them draws the hours from the class's own package, which is what should have happened; it bills nobody anything extra.",
    severity: "high",
  },
  package_draft: {
    title: "Package still a draft",
    explain:
      "Hours were bought but the package was left in draft, and the charge queue skips drafts. Nothing will ever be raised against it while it stays there.",
    severity: "medium",
  },
  method_unset: {
    title: "No billing method agreed",
    explain:
      "An active enrolment that is neither hours nor pay-as-you-go. Until it is one or the other, nothing routes it to a queue.",
    severity: "medium",
  },
  closed_with_unbilled: {
    title: "Closed with lessons never billed",
    explain:
      "The enrolment has ended, but lessons taught under it were never charged. A closed enrolment drops out of the usual queues, so this is the last chance to catch it.",
    severity: "medium",
  },
};

/**
 * Which package a roll entry for an enrolment should draw from.
 *
 * The same rule lives in the seed_roll SQL function, because the database
 * writes rolls too. It is stated here as well so it can be tested, and so the
 * two are checked against one description rather than drifting apart quietly.
 *
 * Eligibility is the gate: attendance carries a trigger that refuses any
 * package with no package_eligibility row for the enrolment, so only an
 * eligible package is ever chosen. Two eligible packages and no default among
 * them is a genuine question about whose hours these are - so it returns null
 * and the audit keeps reporting it rather than picking one.
 */
export function choosePackage(
  defaultPackageId: string | null | undefined,
  eligiblePackageIds: string[],
): string | null {
  if (defaultPackageId && eligiblePackageIds.includes(defaultPackageId)) return defaultPackageId;
  return eligiblePackageIds.length === 1 ? eligiblePackageIds[0]! : null;
}

/** The rows the classifier reads, gathered by getBillingAudit. */
export interface AuditInput {
  /** Enrolments that are not trials, with their student and class. */
  enrolments: Row[];
  /** Every hours package, any status. */
  packages: Row[];
  /** Attendance that consumed hours: present, non-trial, on a lesson that ran. */
  attendance: Row[];
  /** attendance_id values that already carry a charge. */
  chargedAttendanceIds: Set<string>;
}

const nameOf = (row: Row): string =>
  row?.students?.full_name ?? row?.enrolments?.students?.full_name ?? "Unnamed student";

const classOf = (row: Row): string | null =>
  row?.class_offerings?.programs?.name ?? row?.class_offerings?.code ?? null;

/**
 * Every student who ought to be billable and is not, with the reason.
 *
 * Findings are ordered worst first: hours being taught with nothing to invoice
 * against, then the quieter bookkeeping faults.
 */
export function findUnbilled(input: AuditInput): UnbilledFinding[] {
  const { enrolments, packages, attendance, chargedAttendanceIds } = input;

  // Hours taught per enrolment, and how much of it is attributed to a package.
  const taught = new Map<string, { hours: number; lessons: number; unattributed: number }>();
  for (const a of attendance) {
    const key = a.enrolment_id;
    if (!key) continue;
    const entry = taught.get(key) ?? { hours: 0, lessons: 0, unattributed: 0 };
    const hours = Number(a.hours_consumed ?? 0);
    entry.hours += hours;
    entry.lessons += 1;
    if (!a.package_id) entry.unattributed += hours;
    taught.set(key, entry);
  }

  const packagesByStudent = new Map<string, Row[]>();
  for (const p of packages) {
    const list = packagesByStudent.get(p.student_id) ?? [];
    list.push(p);
    packagesByStudent.set(p.student_id, list);
  }

  const findings: UnbilledFinding[] = [];

  for (const e of enrolments) {
    const stats = taught.get(e.id) ?? { hours: 0, lessons: 0, unattributed: 0 };
    const base = {
      id: e.id,
      code: e.code ?? null,
      studentId: e.student_id ?? null,
      studentName: nameOf(e),
      className: classOf(e),
      hours: stats.hours,
      lessons: stats.lessons,
      amount: e.base_price == null ? null : Number(e.base_price),
    };

    // An enrolment that has ended with lessons nobody ever charged. Checked
    // first because a closed enrolment is out of every other queue.
    if (e.status === "closed") {
      const unbilled = attendance.filter(
        (a) => a.enrolment_id === e.id && !chargedAttendanceIds.has(a.id),
      );
      if (unbilled.length > 0 && e.method === "payg") {
        findings.push({ ...base, reason: "closed_with_unbilled", lessons: unbilled.length });
      }
      continue;
    }

    if (e.status !== "active") continue;

    // Neither hours nor PAYG: nothing routes it anywhere.
    if (!e.method) {
      findings.push({ ...base, reason: "method_unset" });
      continue;
    }

    if (e.method !== "hours") continue;

    const owned = packagesByStudent.get(e.student_id) ?? [];
    const spendable = owned.filter((p) => p.status !== "draft" && p.package_type !== "courtesy");

    // The headline case: on hours, and there is nothing to invoice against.
    // Only worth raising once a lesson has actually been taught - an enrolment
    // starting next term with the package still to come is not a fault yet.
    if (spendable.length === 0 && stats.lessons > 0) {
      const draft = owned.find((p) => p.status === "draft");
      findings.push({
        ...base,
        reason: draft ? "package_draft" : "hours_no_package",
        ...(draft ? { id: draft.id, code: draft.code ?? null } : {}),
      });
      continue;
    }

    // A package exists, but these lessons are not drawing from it.
    if (stats.unattributed > 0) {
      findings.push({ ...base, reason: "hours_unattributed", hours: stats.unattributed });
    }
  }

  const rank: Record<UnbilledReason, number> = {
    hours_no_package: 0,
    hours_unattributed: 1,
    package_draft: 2,
    closed_with_unbilled: 3,
    method_unset: 4,
  };

  return findings.sort(
    (a, b) =>
      rank[a.reason] - rank[b.reason] ||
      b.hours - a.hours ||
      a.studentName.localeCompare(b.studentName),
  );
}

/** Findings grouped by reason, for a screen that explains itself. */
export function groupUnbilled(findings: UnbilledFinding[]) {
  const groups = new Map<UnbilledReason, UnbilledFinding[]>();
  for (const f of findings) {
    const list = groups.get(f.reason) ?? [];
    list.push(f);
    groups.set(f.reason, list);
  }
  return [...groups.entries()].map(([reason, items]) => ({
    reason,
    ...UNBILLED_REASONS[reason],
    items,
    hours: items.reduce((sum, i) => sum + i.hours, 0),
  }));
}
