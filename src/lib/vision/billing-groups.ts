import type { Row } from "./types";

/**
 * How the billing queues are grouped, and who still needs a plan.
 *
 * Three rules that decide what a person sees on the Billing page, kept here as
 * pure functions so they can be tested without a database and so "why is this
 * student on this list?" has one answer in one place.
 */

/* --------------------------------------------------------------- Plan set? */

/**
 * Does this enrolment still need its plan and price agreed?
 *
 * The old rule asked one question of everybody - "is base_price empty?" - and
 * hid a student only while they had an *uncharged* package. Both halves were
 * wrong, and together they produced the complaint that started this: a student
 * whose hours were bought, priced, invoiced and paid reappeared under "plan not
 * set" the moment that package was charged, because charging it removed the
 * only thing suppressing them.
 *
 * The price of an hours student does not live on the enrolment at all - it
 * lives on the package - so base_price is empty for them forever and asking
 * about it can never be satisfied. What is actually missing, for an hours
 * student, is a package. For a pay-as-you-go student the price genuinely does
 * live on the enrolment, because it is what each lesson costs.
 *
 * So the question is asked per plan, and a student who has bought hours stays
 * settled whether or not anyone has invoiced them yet.
 */
export function needsPlan(enrolment: Row, studentHasPackage: boolean): boolean {
  if (enrolment.status !== "active") return false;
  // No plan chosen at all: neither hours nor pay-as-you-go.
  if (!enrolment.method) return true;
  if (enrolment.method === "hours") return !studentHasPackage;
  // Pay as you go: the enrolment carries what one lesson costs.
  return enrolment.base_price == null || Number(enrolment.base_price) === 0;
}

/* ------------------------------------------------- PAYG lessons per student */

export interface PaygGroup {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  /** The payer these lessons will be billed to, where there is one. */
  payerId: string | null;
  /** What one lesson costs under this enrolment, if it has been agreed. */
  rate: number | null;
  lessons: Row[];
  hours: number;
  /** Lessons whose length is still zero, so the hours are not yet right. */
  zeroHourLessons: number;
}

const studentOf = (a: Row): Row | undefined => a?.enrolments?.students;

/**
 * PAYG lessons gathered per student, newest teaching last.
 *
 * One row per lesson is the truth of what happened, but it is not how a bill is
 * read: a family with five lessons wants one line of dates and one total, not
 * five rows to tick separately. Grouping is a view over the same rows, so each
 * lesson keeps its own charge and its own protection against being billed
 * twice.
 */
export function groupPaygByStudent(rows: Row[]): PaygGroup[] {
  const groups = new Map<string, PaygGroup>();

  for (const a of rows) {
    const student = studentOf(a);
    const id = student?.id ?? a.student_id;
    if (!id) continue;

    const group: PaygGroup = groups.get(id) ?? {
      studentId: id,
      studentName: student?.full_name ?? "Unnamed student",
      studentCode: student?.code ?? null,
      payerId: student?.default_payer_id ?? null,
      rate: a.enrolments?.base_price == null ? null : Number(a.enrolments.base_price),
      lessons: [] as Row[],
      hours: 0,
      zeroHourLessons: 0,
    };

    const hours = Number(a.hours_consumed ?? 0);
    group.lessons.push(a);
    group.hours += hours;
    if (hours === 0) group.zeroHourLessons += 1;
    groups.set(id, group);
  }

  for (const group of groups.values()) {
    group.lessons.sort(
      (x, y) =>
        new Date(x.lesson_starts_at ?? 0).getTime() - new Date(y.lesson_starts_at ?? 0).getTime(),
    );
  }

  // Most lessons waiting first - that is the biggest unbilled sum, and the
  // thing most worth doing something about.
  return [...groups.values()].sort(
    (a, b) => b.lessons.length - a.lessons.length || a.studentName.localeCompare(b.studentName),
  );
}

/* ------------------------------------------------------- Charges per family */

export interface FamilyGroup {
  /** The payer's id, or null for charges billed internally. */
  payerId: string | null;
  payerName: string;
  charges: Row[];
  total: number;
  /** Distinct students behind these charges - siblings on one bill. */
  students: string[];
}

/**
 * Charges gathered by who pays them.
 *
 * Siblings are two students and one bill. The only thing that says so is the
 * payer they share, so that is what the grouping is: charges with the same
 * payer_id belong on one invoice, and a family with two children taught
 * separately gets one document rather than two arriving on the same day.
 *
 * Charges routed internally have no payer and are kept together at the end,
 * because they are nobody's invoice.
 */
export function groupChargesByPayer(rows: Row[]): FamilyGroup[] {
  const groups = new Map<string, FamilyGroup>();

  for (const c of rows) {
    const key = c.payer_id ?? "__internal__";
    const group: FamilyGroup = groups.get(key) ?? {
      payerId: c.payer_id ?? null,
      payerName: c.guardians?.full_name ?? "Internal",
      charges: [] as Row[],
      total: 0,
      students: [] as string[],
    };
    group.charges.push(c);
    group.total += Number(c.final_amount ?? 0);
    const name = c.students?.full_name;
    if (name && !group.students.includes(name)) group.students.push(name);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => {
    // Internal last: it is not a family and not an invoice anyone receives.
    if (a.payerId === null) return 1;
    if (b.payerId === null) return -1;
    // Families with more than one child first - they are the reason to group.
    return b.students.length - a.students.length || a.payerName.localeCompare(b.payerName);
  });
}

/* ------------------------------------------------------------ Sent invoices */

export interface InvoiceGroup {
  /** The invoice row's id, or null for a charge sent before invoices existed. */
  invoiceId: string | null;
  /** INV- code, or the charge's own code when it stands alone. */
  label: string;
  /** The accounting system's reference, where one was given. */
  xeroNo: string | null;
  invoiceDate: string | null;
  method: string | null;
  payerName: string;
  charges: Row[];
  total: number;
  /** Distinct students on this invoice - siblings on one bill. */
  students: string[];
}

/**
 * Charges gathered into the invoices they were sent on.
 *
 * A family that received one bill for five lessons should read as one invoice
 * that opens to its lines, not as five rows that happen to share a date. The
 * charges carry the invoice they belong to, so this is a straight grouping -
 * and a charge with no invoice stands alone, which is what it is.
 *
 * Newest invoice first: the unpaid queue is worked from the most recent run
 * backwards.
 */
export function groupChargesByInvoice(rows: Row[]): InvoiceGroup[] {
  const groups = new Map<string, InvoiceGroup>();

  for (const c of rows) {
    // A charge with no invoice is its own group, keyed by itself, so it never
    // merges with another one.
    const key = c.invoice_id ?? `charge:${c.id}`;
    const group: InvoiceGroup = groups.get(key) ?? {
      invoiceId: c.invoice_id ?? null,
      label: c.invoices?.code ?? c.code ?? "Charge",
      xeroNo: c.xero_invoice_no ?? null,
      invoiceDate: c.invoice_date ?? null,
      method: c.method ?? null,
      payerName: c.guardians?.full_name ?? "Internal",
      charges: [] as Row[],
      total: 0,
      students: [] as string[],
    };
    group.charges.push(c);
    group.total += Number(c.final_amount ?? 0);
    const name = c.students?.full_name;
    if (name && !group.students.includes(name)) group.students.push(name);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => {
    const at = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
    const bt = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
    return bt - at || a.payerName.localeCompare(b.payerName);
  });
}
