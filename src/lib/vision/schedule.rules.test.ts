import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  assertReschedulable,
  assertRollUnmarked,
  reschedulePatch,
  validateProposedTimes,
} from "./schedule.rules";

const NOW = Date.parse("2026-09-01T00:00:00Z");
const FUTURE = "2026-09-10T07:30:00.000Z";
const FUTURE_END = "2026-09-10T09:00:00.000Z";

describe("rescheduling a lesson", () => {
  const future = {
    starts_at: "2026-09-08T07:30:00.000Z",
    ends_at: "2026-09-08T09:00:00.000Z",
    original_starts_at: null,
    original_ends_at: null,
  };

  it("accepts a future lesson with an unmarked roll", () => {
    expect(() => validateProposedTimes(FUTURE, FUTURE_END, NOW)).not.toThrow();
    expect(() => assertReschedulable(future, NOW)).not.toThrow();
    expect(() => assertRollUnmarked(0)).not.toThrow();
  });

  it("rejects reversed and equal times", () => {
    expect(() => validateProposedTimes(FUTURE_END, FUTURE, NOW)).toThrow(/end after it starts/);
    expect(() => validateProposedTimes(FUTURE, FUTURE, NOW)).toThrow(/end after it starts/);
  });

  it("rejects times that are not real instants", () => {
    expect(() => validateProposedTimes("not-a-date", FUTURE_END, NOW)).toThrow(/not a real date/);
  });

  it("rejects a proposed start in the past or now", () => {
    expect(() =>
      validateProposedTimes("2026-08-20T07:30:00Z", "2026-08-20T09:00:00Z", NOW),
    ).toThrow(/in the future/);
    expect(() => validateProposedTimes(new Date(NOW).toISOString(), FUTURE_END, NOW)).toThrow(
      /in the future/,
    );
  });

  it("rejects a lesson that has already started or passed", () => {
    expect(() =>
      assertReschedulable(
        { starts_at: "2026-08-01T07:30:00Z", ends_at: "2026-08-01T09:00:00Z" },
        NOW,
      ),
    ).toThrow(/already started or has passed/);
    expect(() =>
      assertReschedulable({ starts_at: new Date(NOW).toISOString(), ends_at: FUTURE_END }, NOW),
    ).toThrow(/already started or has passed/);
  });

  it("rejects a lesson whose roll has been marked", () => {
    expect(() => assertRollUnmarked(1)).toThrow(/marked/);
  });

  it("writes only the times and the remembered original slot", () => {
    const patch = reschedulePatch(future, FUTURE, FUTURE_END);
    expect(Object.keys(patch).sort()).toEqual([
      "ends_at",
      "original_ends_at",
      "original_starts_at",
      "starts_at",
    ]);
    // No session_type, no status, no id: the same row, the same identity.
    expect(patch).not.toHaveProperty("session_type");
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("id");
    expect(patch.starts_at).toBe(FUTURE);
    expect(patch.original_starts_at).toBe(future.starts_at);
  });

  it("keeps the first remembered slot across later moves", () => {
    const movedOnce = {
      starts_at: FUTURE,
      ends_at: FUTURE_END,
      original_starts_at: "2026-09-08T07:30:00.000Z",
      original_ends_at: "2026-09-08T09:00:00.000Z",
    };
    const patch = reschedulePatch(
      movedOnce,
      "2026-09-11T07:30:00.000Z",
      "2026-09-11T09:00:00.000Z",
    );
    expect(patch.original_starts_at).toBe(movedOnce.original_starts_at);
    expect(patch.original_ends_at).toBe(movedOnce.original_ends_at);
  });
});

/**
 * Contract checks over the source: there must be exactly one operation able to
 * change a lesson's time, and both doors onto the timetable must use it.
 */
describe("one canonical time mutation", () => {
  const fns = readFileSync("src/lib/vision/schedule.functions.ts", "utf8");
  const timetable = readFileSync("src/routes/_authenticated/timetable.tsx", "utf8");

  it("has no moveSession left anywhere", () => {
    expect(fns).not.toMatch(/moveSession/);
    expect(timetable).not.toMatch(/moveSession/);
  });

  it("keeps starts_at and ends_at out of the updateSession patch", () => {
    const start = fns.indexOf("const sessionPatch");
    const patch = fns.slice(start, fns.indexOf("});", start));
    expect(patch).not.toMatch(/starts_at|ends_at/);
  });

  it("routes drag and the edit dialog through rescheduleSession", () => {
    // The grid's move handler and the dialog's save both call it.
    expect(timetable).toMatch(/async function moveLesson[\s\S]*?await reschedule\(/);
    expect(timetable).toMatch(/async function saveDetails[\s\S]*?await reschedule\(/);
    // The dialog's metadata save carries no times.
    const save = timetable.slice(timetable.indexOf("async function saveDetails"));
    const updateCall = save.slice(save.indexOf("await update({"), save.indexOf("toast.success"));
    expect(updateCall).not.toMatch(/starts_at|ends_at/);
  });

  it("never turns an ordinary move into a make-up", () => {
    const start = fns.indexOf("export const rescheduleSession");
    const reschedule = fns.slice(start, fns.indexOf("export const cancelSession", start));
    expect(reschedule).not.toMatch(/dedicated_make_up/);
    expect(reschedule).not.toMatch(/session_type:/);
  });

  it("keeps the explicit per-student make-up workflow separate", () => {
    // Attendance-level make-ups are held on the roll, not by moving a lesson.
    expect(timetable).toMatch(/holdMakeUp/);
  });

  it("cannot delete a lesson that has a roll, and has no force option", () => {
    const del = fns.slice(fns.indexOf("export const deleteSession"));
    expect(del).not.toMatch(/force/);
    expect(del).not.toMatch(/from\("attendance"\)\s*\.delete\(\)/);
    expect(del).toMatch(/cannot be deleted/);
    expect(timetable).not.toMatch(/force:/);
  });
});
