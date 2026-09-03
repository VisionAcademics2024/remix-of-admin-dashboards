import { describe, expect, it } from "vitest";

import {
  groupChargesByInvoice,
  groupChargesByPayer,
  groupPaygByStudent,
  needsPlan,
} from "./billing-groups";
import type { Row } from "./types";

const enrolment = (over: Partial<Row>): Row =>
  ({ status: "active", method: "payg", base_price: 100, ...over }) as Row;

describe("needsPlan", () => {
  it("keeps an hours student settled once they have a package, charged or not", () => {
    // The complaint this fixes: hours bought, priced, invoiced and paid, and
    // the student reappeared under "plan not set" the moment the package was
    // charged - because an uncharged package was the only thing hiding them.
    const hours = enrolment({ method: "hours", base_price: null });
    expect(needsPlan(hours, true)).toBe(false);
  });

  it("asks an hours student for a package, not for a price", () => {
    // base_price is empty for every hours enrolment - the price lives on the
    // package - so asking about it could never be satisfied.
    const hours = enrolment({ method: "hours", base_price: null });
    expect(needsPlan(hours, false)).toBe(true);
    expect(needsPlan(enrolment({ method: "hours", base_price: 0 }), true)).toBe(false);
  });

  it("asks a pay-as-you-go student for the price of a lesson", () => {
    expect(needsPlan(enrolment({ base_price: null }), false)).toBe(true);
    expect(needsPlan(enrolment({ base_price: 0 }), false)).toBe(true);
    expect(needsPlan(enrolment({ base_price: 95 }), false)).toBe(false);
  });

  it("asks anyone with no plan at all", () => {
    expect(needsPlan(enrolment({ method: null, base_price: 120 }), true)).toBe(true);
  });

  it("ignores enrolments that are not active", () => {
    expect(needsPlan(enrolment({ status: "closed", base_price: null }), false)).toBe(false);
    expect(needsPlan(enrolment({ status: "trial", base_price: null }), false)).toBe(false);
  });
});

const lesson = (over: Partial<Row>): Row =>
  ({
    id: over["id"] ?? "a1",
    student_id: "s1",
    hours_consumed: 1,
    lesson_starts_at: "2026-08-06T00:00:00Z",
    enrolments: {
      base_price: 80,
      students: { id: "s1", code: "STU-0059", full_name: "Qin", default_payer_id: "g1" },
    },
    ...over,
  }) as Row;

describe("groupPaygByStudent", () => {
  it("puts a student's repeated lessons on one row", () => {
    const groups = groupPaygByStudent([
      lesson({ id: "a1" }),
      lesson({ id: "a2" }),
      lesson({
        id: "a3",
        student_id: "s2",
        enrolments: { base_price: 70, students: { id: "s2", full_name: "Beverly Chen" } },
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.studentName).toBe("Qin");
    expect(groups[0]!.lessons).toHaveLength(2);
    expect(groups[0]!.rate).toBe(80);
    expect(groups[0]!.payerId).toBe("g1");
  });

  it("counts the lessons whose length is still zero", () => {
    const groups = groupPaygByStudent([
      lesson({ id: "a1", hours_consumed: 0 }),
      lesson({ id: "a2", hours_consumed: 1.5 }),
    ]);
    expect(groups[0]!.hours).toBe(1.5);
    expect(groups[0]!.zeroHourLessons).toBe(1);
  });

  it("lists a student's lessons oldest first", () => {
    const groups = groupPaygByStudent([
      lesson({ id: "late", lesson_starts_at: "2026-08-31T00:00:00Z" }),
      lesson({ id: "early", lesson_starts_at: "2026-08-06T00:00:00Z" }),
    ]);
    expect(groups[0]!.lessons.map((l) => l.id)).toEqual(["early", "late"]);
  });
});

const charge = (over: Partial<Row>): Row =>
  ({
    payer_id: "g1",
    guardians: { full_name: "Andre Chen" },
    students: { full_name: "Beverly Chen" },
    final_amount: 100,
    ...over,
  }) as Row;

describe("groupChargesByPayer", () => {
  it("puts siblings on one family bill", () => {
    const groups = groupChargesByPayer([
      charge({ students: { full_name: "Beverly Chen" }, final_amount: 105 }),
      charge({ students: { full_name: "Brandon Chen" }, final_amount: 70 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.payerName).toBe("Andre Chen");
    expect(groups[0]!.students).toEqual(["Beverly Chen", "Brandon Chen"]);
    expect(groups[0]!.total).toBe(175);
  });

  it("keeps different payers apart", () => {
    const groups = groupChargesByPayer([
      charge({ payer_id: "g1" }),
      charge({ payer_id: "g2", guardians: { full_name: "Erin Chen" } }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("sorts families with more children first and internal last", () => {
    const groups = groupChargesByPayer([
      charge({ payer_id: null, guardians: null, students: { full_name: "X" } }),
      charge({
        payer_id: "g2",
        guardians: { full_name: "Erin Chen" },
        students: { full_name: "Max Shi" },
      }),
      charge({ payer_id: "g1", students: { full_name: "Beverly Chen" } }),
      charge({ payer_id: "g1", students: { full_name: "Brandon Chen" } }),
    ]);
    expect(groups.map((g) => g.payerName)).toEqual(["Andre Chen", "Erin Chen", "Internal"]);
  });
});

const line = (over: Partial<Row>): Row =>
  ({
    id: "c1",
    code: "CHG-00036",
    invoice_id: "inv-1",
    invoices: { code: "INV-2026-0007" },
    invoice_date: "2026-09-03",
    method: "bank_transfer",
    xero_invoice_no: null,
    payer_id: "g1",
    guardians: { full_name: "Andre Chen" },
    students: { full_name: "Beverly Chen" },
    final_amount: 70,
    ...over,
  }) as Row;

describe("groupChargesByInvoice", () => {
  it("shows one invoice for charges sent together, even with no Xero number", () => {
    // The complaint this fixes: five lessons sent as one bill read as five
    // separate rows, because the optional Xero number was the only thing
    // tying them together and it had been left blank.
    const groups = groupChargesByInvoice([
      line({ id: "c1", code: "CHG-00032" }),
      line({ id: "c2", code: "CHG-00033" }),
      line({ id: "c3", code: "CHG-00034", students: { full_name: "Brandon Chen" } }),
      line({ id: "c4", code: "CHG-00035", students: { full_name: "Brandon Chen" } }),
      line({ id: "c5", code: "CHG-00036", students: { full_name: "Brandon Chen" } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("INV-2026-0007");
    expect(groups[0]!.charges).toHaveLength(5);
    expect(groups[0]!.students).toEqual(["Beverly Chen", "Brandon Chen"]);
    expect(groups[0]!.total).toBe(350);
  });

  it("keeps separate invoices apart", () => {
    const groups = groupChargesByInvoice([
      line({ id: "c1", invoice_id: "inv-1" }),
      line({ id: "c2", invoice_id: "inv-2", invoices: { code: "INV-2026-0008" } }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("leaves a charge with no invoice standing on its own", () => {
    // Two un-invoiced charges must never merge into one phantom invoice.
    const groups = groupChargesByInvoice([
      line({ id: "c1", code: "CHG-00011", invoice_id: null, invoices: null, invoice_date: null }),
      line({ id: "c2", code: "CHG-00012", invoice_id: null, invoices: null, invoice_date: null }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.label).sort()).toEqual(["CHG-00011", "CHG-00012"]);
  });

  it("puts the most recent invoice first", () => {
    const groups = groupChargesByInvoice([
      line({ id: "c1", invoice_id: "old", invoice_date: "2026-08-20" }),
      line({ id: "c2", invoice_id: "new", invoice_date: "2026-09-03" }),
    ]);
    expect(groups[0]!.invoiceId).toBe("new");
  });
});

describe("groupChargesByInvoice — when the invoice lookup is unavailable", () => {
  // The invoice row supplies only the INV- label. If reading invoices fails,
  // the charges must still be there: the figures are the money, the label is
  // decoration. This is the shape that took Billing to all-zeroes once.
  it("still groups by invoice_id and still shows every charge", () => {
    const groups = groupChargesByInvoice([
      line({ id: "c1", code: "CHG-00032", invoices: null }),
      line({ id: "c2", code: "CHG-00033", invoices: null }),
      line({ id: "c3", code: "CHG-00034", invoices: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.charges).toHaveLength(3);
    expect(groups[0]!.total).toBe(210);
    // Falls back to a charge code rather than rendering nothing.
    expect(groups[0]!.label).toBe("CHG-00032");
  });

  it("still shows every charge when nothing has an invoice at all", () => {
    const rows = [
      line({ id: "c1", code: "CHG-00032", invoice_id: null, invoices: null }),
      line({ id: "c2", code: "CHG-00033", invoice_id: null, invoices: null }),
    ];
    const groups = groupChargesByInvoice(rows);
    expect(groups.flatMap((g) => g.charges)).toHaveLength(2);
    expect(groups.reduce((n, g) => n + g.total, 0)).toBe(140);
  });
});
