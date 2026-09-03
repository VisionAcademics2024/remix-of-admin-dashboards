import { describe, expect, it } from "vitest";

import { ageing, daysBetween, rollFor, tutorsFor, unassigned } from "./today";
import type { Row } from "./types";

const att = (over: Partial<Row>): Row => ({ session_id: "s1", status: "present", ...over }) as Row;

describe("rollFor", () => {
  it("calls a half-marked roll partial, not done", () => {
    // The case that actually goes wrong: the tutor marks the students in front
    // of them and leaves the absentee unmarked, so the lesson looks finished.
    const roll = rollFor("s1", [
      att({ status: "present" }),
      att({ status: "present" }),
      att({ status: "not_marked" }),
    ]);
    expect(roll).toEqual({ marked: 2, total: 3, state: "partial" });
  });

  it("counts absent as marked — somebody made a decision", () => {
    const roll = rollFor("s1", [att({ status: "present" }), att({ status: "absent" })]);
    expect(roll.state).toBe("marked");
  });

  it("reports an untouched roll and an empty one differently", () => {
    expect(rollFor("s1", [att({ status: "not_marked" })]).state).toBe("unmarked");
    expect(rollFor("s1", []).state).toBe("empty");
  });

  it("ignores other lessons' attendance", () => {
    const roll = rollFor("s1", [att({ session_id: "s2", status: "present" })]);
    expect(roll.total).toBe(0);
  });
});

const ses = (over: Partial<Row>): Row =>
  ({
    id: "x",
    tutor_id: "t1",
    tutors: { full_name: "Priya Raman", colour: "sky" },
    duration_hours: 2,
    starts_at: "2026-09-03T05:30:00Z",
    ends_at: "2026-09-03T07:30:00Z",
    ...over,
  }) as Row;

describe("tutorsFor", () => {
  it("adds a tutor's lessons into one day, busiest first", () => {
    const tutors = tutorsFor([
      ses({ id: "a", duration_hours: 1.5 }),
      ses({ id: "b", duration_hours: 2 }),
      ses({
        id: "c",
        tutor_id: "t2",
        tutors: { full_name: "Daniel Wu", colour: "amber" },
        duration_hours: 1,
      }),
    ]);
    expect(tutors).toHaveLength(2);
    expect(tutors[0]!.name).toBe("Priya Raman");
    expect(tutors[0]!.lessons).toBe(2);
    expect(tutors[0]!.hours).toBe(3.5);
    expect(tutors[1]!.name).toBe("Daniel Wu");
  });

  it("spans a tutor's day from first start to last end", () => {
    const tutors = tutorsFor([
      ses({ id: "a", starts_at: "2026-09-03T05:30:00Z", ends_at: "2026-09-03T07:00:00Z" }),
      ses({ id: "b", starts_at: "2026-09-03T08:00:00Z", ends_at: "2026-09-03T10:00:00Z" }),
    ]);
    expect(tutors[0]!.from).toBe("2026-09-03T05:30:00Z");
    expect(tutors[0]!.to).toBe("2026-09-03T10:00:00Z");
  });

  it("keeps a lesson with no tutor out of the workload, and names it as a hole", () => {
    const rows = [ses({ id: "a" }), ses({ id: "b", tutor_id: null, tutors: null })];
    expect(tutorsFor(rows)).toHaveLength(1);
    expect(unassigned(rows).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("daysBetween", () => {
  it("counts whole days, and gives up on a missing date", () => {
    expect(daysBetween("2026-07-14", "2026-09-03")).toBe(51);
    expect(daysBetween(null, "2026-09-03")).toBeNull();
  });
});

const chg = (amount: number, date: string | null): Row =>
  ({ final_amount: amount, invoice_date: date }) as Row;

describe("ageing", () => {
  it("splits what is owed by how overdue it is", () => {
    const a = ageing(
      [chg(100, "2026-09-01"), chg(200, "2026-07-25"), chg(400, "2026-06-20")],
      "2026-09-03",
    );
    expect(a.under30).toBe(100);
    expect(a.from30to60).toBe(200);
    expect(a.over60).toBe(400);
    expect(a.oldestDays).toBe(75);
  });

  it("treats an undated invoice as the worst kind, not as new", () => {
    // A bill nobody can date is a bill nobody is tracking.
    const a = ageing([chg(500, null)], "2026-09-03");
    expect(a.over60).toBe(500);
    expect(a.under30).toBe(0);
  });

  it("reports nothing owed as nothing overdue", () => {
    expect(ageing([], "2026-09-03")).toEqual({
      under30: 0,
      from30to60: 0,
      over60: 0,
      oldestDays: null,
    });
  });
});
