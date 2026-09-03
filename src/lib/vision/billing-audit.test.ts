import { describe, expect, it } from "vitest";

import {
  applyTaughtFilters,
  choosePackage,
  countsAsTaught,
  findUnbilled,
  groupUnbilled,
  type AuditInput,
} from "./billing-audit";
import type { Row } from "./types";

/** The four tables the audit reads, with only the fields the rules look at. */
function input(over: Partial<AuditInput> = {}): AuditInput {
  return {
    enrolments: [],
    packages: [],
    attendance: [],
    chargedAttendanceIds: new Set<string>(),
    ...over,
  };
}

const student = (id: string, name: string) => ({ id, code: "STU-001", full_name: name });

const enrolment = (over: Record<string, unknown> = {}) => ({
  id: "enr-1",
  code: "ENR-0001",
  status: "active",
  method: "hours",
  base_price: 600,
  student_id: "stu-1",
  students: student("stu-1", "Mia Chen"),
  class_offerings: { code: "CLS-1", programs: { name: "Year 8 Maths" } },
  ...over,
});

const lesson = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  enrolment_id: "enr-1",
  package_id: "pkg-1",
  hours_consumed: 1.5,
  session_date: "2026-08-20",
  ...over,
});

const pkg = (over: Record<string, unknown> = {}) => ({
  id: "pkg-1",
  code: "HRS-0001",
  student_id: "stu-1",
  status: "active",
  package_type: "purchased",
  price: 600,
  ...over,
});

describe("findUnbilled — on hours with nothing to invoice against", () => {
  it("flags an hours enrolment being taught with no package at all", () => {
    const found = findUnbilled(
      input({ enrolments: [enrolment()], attendance: [lesson({ package_id: null })] }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe("hours_no_package");
    expect(found[0]!.studentName).toBe("Mia Chen");
  });

  it("counts the hours and lessons actually taught, so the size of the hole is visible", () => {
    const found = findUnbilled(
      input({
        enrolments: [enrolment()],
        attendance: [
          lesson({ id: "a1", package_id: null, hours_consumed: 1.5 }),
          lesson({ id: "a2", package_id: null, hours_consumed: 2 }),
        ],
      }),
    );
    expect(found[0]!.hours).toBe(3.5);
    expect(found[0]!.lessons).toBe(2);
  });

  it("stays quiet before any lesson has run - a package still to come is not a fault", () => {
    expect(findUnbilled(input({ enrolments: [enrolment()] }))).toEqual([]);
  });

  it("is satisfied by a package the student actually owns", () => {
    expect(
      findUnbilled(input({ enrolments: [enrolment()], packages: [pkg()], attendance: [lesson()] })),
    ).toEqual([]);
  });

  it("does not accept another student's package as cover", () => {
    const found = findUnbilled(
      input({
        enrolments: [enrolment()],
        packages: [pkg({ student_id: "stu-2" })],
        attendance: [lesson({ package_id: null })],
      }),
    );
    expect(found[0]!.reason).toBe("hours_no_package");
  });

  it("does not accept a courtesy package as cover - it is free, so it bills nothing", () => {
    const found = findUnbilled(
      input({
        enrolments: [enrolment()],
        packages: [pkg({ package_type: "courtesy", price: 0 })],
        attendance: [lesson({ package_id: null })],
      }),
    );
    expect(found[0]!.reason).toBe("hours_no_package");
  });

  it("reports a draft package as a draft rather than as a missing one", () => {
    // The charge queue skips drafts, so the student is just as unbillable - but
    // the fix is one click, not a purchase, and the screen should say so.
    const found = findUnbilled(
      input({
        enrolments: [enrolment()],
        packages: [pkg({ status: "draft" })],
        attendance: [lesson({ package_id: null })],
      }),
    );
    expect(found[0]!.reason).toBe("package_draft");
    expect(found[0]!.code).toBe("HRS-0001");
  });
});

describe("findUnbilled — hours taught against no package", () => {
  it("flags roll entries not pointed at the package that exists", () => {
    const found = findUnbilled(
      input({
        enrolments: [enrolment()],
        packages: [pkg()],
        attendance: [
          lesson({ id: "a1" }),
          lesson({ id: "a2", package_id: null, hours_consumed: 2 }),
        ],
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe("hours_unattributed");
    // Only the unattributed part is the problem, not the whole history.
    expect(found[0]!.hours).toBe(2);
  });

  it("says nothing when every entry draws from the package", () => {
    expect(
      findUnbilled(input({ enrolments: [enrolment()], packages: [pkg()], attendance: [lesson()] })),
    ).toEqual([]);
  });
});

describe("findUnbilled — the quieter faults", () => {
  it("flags an active enrolment that is neither hours nor PAYG", () => {
    const found = findUnbilled(input({ enrolments: [enrolment({ method: null })] }));
    expect(found[0]!.reason).toBe("method_unset");
  });

  it("flags a closed PAYG enrolment whose lessons were never charged", () => {
    const found = findUnbilled(
      input({
        enrolments: [enrolment({ status: "closed", method: "payg" })],
        attendance: [lesson({ package_id: null })],
      }),
    );
    expect(found[0]!.reason).toBe("closed_with_unbilled");
  });

  it("leaves a closed enrolment alone once its lessons carry charges", () => {
    expect(
      findUnbilled(
        input({
          enrolments: [enrolment({ status: "closed", method: "payg" })],
          attendance: [lesson({ id: "att-1", package_id: null })],
          chargedAttendanceIds: new Set(["att-1"]),
        }),
      ),
    ).toEqual([]);
  });

  it("ignores a trial enrolment entirely - a trial never owes anything", () => {
    expect(
      findUnbilled(input({ enrolments: [enrolment({ status: "trial", method: null })] })),
    ).toEqual([]);
  });

  it("ignores a PAYG enrolment being taught - those reach billing on their own", () => {
    expect(
      findUnbilled(input({ enrolments: [enrolment({ method: "payg" })], attendance: [lesson()] })),
    ).toEqual([]);
  });
});

describe("findUnbilled — ordering and grouping", () => {
  it("puts money being taught for nothing above bookkeeping faults", () => {
    const found = findUnbilled(
      input({
        enrolments: [
          enrolment({ id: "e1", method: null, student_id: "s1", students: student("s1", "Zoe") }),
          enrolment({ id: "e2", student_id: "s2", students: student("s2", "Amy") }),
        ],
        attendance: [lesson({ id: "a2", enrolment_id: "e2", package_id: null })],
      }),
    );
    expect(found.map((f) => f.reason)).toEqual(["hours_no_package", "method_unset"]);
  });

  it("groups findings and totals the hours behind each reason", () => {
    const groups = groupUnbilled(
      findUnbilled(
        input({
          enrolments: [
            enrolment({ id: "e1", student_id: "s1", students: student("s1", "Amy") }),
            enrolment({ id: "e2", student_id: "s2", students: student("s2", "Zoe") }),
          ],
          attendance: [
            lesson({ id: "a1", enrolment_id: "e1", package_id: null, hours_consumed: 2 }),
            lesson({ id: "a2", enrolment_id: "e2", package_id: null, hours_consumed: 3 }),
          ],
        }),
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("hours_no_package");
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.hours).toBe(5);
    expect(groups[0]!.title).toMatch(/no package/i);
  });
});

/**
 * The same rule is written twice - here, and in the seed_roll SQL function that
 * the database uses when it seeds a roll itself. These cases describe the
 * behaviour both have to agree on.
 */
describe("choosePackage — which package a roll entry draws from", () => {
  it("uses the enrolment's own package when it is eligible", () => {
    expect(choosePackage("pkg-1", ["pkg-1", "pkg-2"])).toBe("pkg-1");
  });

  it("refuses a default that is not eligible, even though it is named on the enrolment", () => {
    // The database has a trigger that would reject the insert outright, so
    // returning it here would turn a missing package into a failed roll seed.
    expect(choosePackage("pkg-9", ["pkg-1", "pkg-2"])).toBeNull();
  });

  it("falls back to the only eligible package when no default is set", () => {
    // One eligible package IS the package for that class - there is no choice
    // to get wrong.
    expect(choosePackage(null, ["pkg-1"])).toBe("pkg-1");
  });

  it("takes the single eligible package even when the default names another", () => {
    expect(choosePackage("pkg-9", ["pkg-1"])).toBe("pkg-1");
  });

  it("stays out of it when two are eligible and neither is the default", () => {
    // Whose hours these are is a real question; guessing would move money.
    expect(choosePackage(null, ["pkg-1", "pkg-2"])).toBeNull();
    expect(choosePackage(undefined, ["pkg-1", "pkg-2"])).toBeNull();
  });

  it("returns nothing when the enrolment has no eligible package at all", () => {
    expect(choosePackage(null, [])).toBeNull();
    expect(choosePackage("pkg-1", [])).toBeNull();
  });
});

const taught = (over: Partial<Row>): Row =>
  ({ status: "present", att_type: "regular", hours_consumed: 1.5, ...over }) as Row;

describe("what counts as taught", () => {
  it("refuses a lesson whose session was cancelled", () => {
    // The bug this fixes. Attendance keeps its own status, so cancelling a
    // lesson does not un-mark the students on it: the roll still says present
    // while the session says cancelled, and hours_consumed drops to zero. The
    // charge queue asked only for present rows, so those lessons sat in
    // "PAYG lessons taught, not charged" reading 0 h - billable, and never
    // taught. It is exactly what a cancelled-and-rebooked make-up leaves.
    expect(countsAsTaught(taught({ hours_consumed: 0 }))).toBe(false);
  });

  it("refuses a trial, which is free by definition", () => {
    expect(countsAsTaught(taught({ att_type: "trial" }))).toBe(false);
  });

  it("refuses a student who was not there", () => {
    expect(countsAsTaught(taught({ status: "absent" }))).toBe(false);
    expect(countsAsTaught(taught({ status: "not_marked" }))).toBe(false);
  });

  it("accepts a lesson that actually ran", () => {
    expect(countsAsTaught(taught({}))).toBe(true);
  });

  it("applies the same three filters to a query", () => {
    // The query and the predicate must not drift: the audit and the charge
    // queue disagreeing is what let a cancelled lesson be billable.
    const calls: string[] = [];
    const fake = {
      eq(c: string, v: unknown) {
        calls.push(`eq:${c}=${String(v)}`);
        return this;
      },
      neq(c: string, v: unknown) {
        calls.push(`neq:${c}=${String(v)}`);
        return this;
      },
      gt(c: string, v: unknown) {
        calls.push(`gt:${c}=${String(v)}`);
        return this;
      },
    };
    applyTaughtFilters(fake);
    expect(calls).toEqual(["eq:status=present", "neq:att_type=trial", "gt:hours_consumed=0"]);
  });
});
