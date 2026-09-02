import { describe, expect, it } from "vitest";

import { rollState, type CalendarEvent } from "./calendar";

/** The only fields the rule looks at. */
function event(over: Partial<CalendarEvent> = {}) {
  return {
    cancelled: false,
    date: "2026-09-02",
    endMinutes: 10 * 60,
    rollMarked: 0,
    rollTotal: 3,
    ...over,
  } satisfies Pick<CalendarEvent, "cancelled" | "date" | "endMinutes" | "rollMarked" | "rollTotal">;
}

// 09:30 on Wednesday 2 September 2026.
const TODAY = "2026-09-02";
const NOW = 9 * 60 + 30;

describe("rollState", () => {
  it("is marked once every student on the roll has a mark", () => {
    expect(rollState(event({ rollMarked: 3, rollTotal: 3 }), TODAY, NOW)).toBe("marked");
  });

  it("stays marked for a finished lesson - a done roll never asks to be chased", () => {
    expect(rollState(event({ date: "2026-09-01", rollMarked: 3, rollTotal: 3 }), TODAY, NOW)).toBe(
      "marked",
    );
  });

  it("is overdue for an unmarked lesson on an earlier day", () => {
    expect(rollState(event({ date: "2026-09-01" }), TODAY, NOW)).toBe("overdue");
  });

  it("is overdue for a lesson that already ended today", () => {
    expect(rollState(event({ endMinutes: 9 * 60 }), TODAY, NOW)).toBe("overdue");
  });

  it("is overdue the minute a lesson ends", () => {
    expect(rollState(event({ endMinutes: NOW }), TODAY, NOW)).toBe("overdue");
  });

  it("is only partly marked but still overdue once the lesson has run", () => {
    expect(rollState(event({ endMinutes: 9 * 60, rollMarked: 2 }), TODAY, NOW)).toBe("overdue");
  });

  it("is pending while the lesson is still running", () => {
    expect(rollState(event({ endMinutes: 10 * 60 }), TODAY, NOW)).toBe("pending");
  });

  it("is pending for a lesson later today or on a later day", () => {
    expect(rollState(event({ date: "2026-09-03", endMinutes: 9 * 60 }), TODAY, NOW)).toBe(
      "pending",
    );
  });

  it("says nothing about a lesson with no roll seeded yet", () => {
    expect(rollState(event({ date: "2026-09-01", rollTotal: 0 }), TODAY, NOW)).toBe("none");
  });

  it("says nothing about a cancelled lesson", () => {
    expect(rollState(event({ date: "2026-09-01", cancelled: true }), TODAY, NOW)).toBe("none");
  });
});
