import { describe, expect, it } from "vitest";

import {
  isManager,
  lessonPermissions,
  linkedTutorMismatch,
  mayMarkRoll,
  sharedTutorLinks,
} from "./tutor-access";

describe("lessonPermissions", () => {
  it("lets an owner and an admin run the schedule", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(lessonPermissions(role)).toEqual({
        reschedule: true,
        manage: true,
        markRoll: true,
        notes: true,
      });
    }
  });

  it("lets a tutor mark the roll and write notes, and nothing else", () => {
    // The database says the same thing: a tutor has SELECT on sessions and
    // UPDATE on attendance for lessons they teach. This keeps the screen from
    // offering what the data layer will refuse.
    expect(lessonPermissions("tutor")).toEqual({
      reschedule: false,
      manage: false,
      markRoll: true,
      notes: true,
    });
  });

  it("offers nothing at all when the role is not known yet", () => {
    // A screen that has not loaded who you are must not show Delete on the
    // assumption it will turn out to be an owner.
    expect(lessonPermissions(undefined)).toEqual({
      reschedule: false,
      manage: false,
      markRoll: false,
      notes: false,
    });
    expect(lessonPermissions(null).manage).toBe(false);
  });
});

describe("isManager", () => {
  it("is the two roles that run the schedule", () => {
    expect(isManager("owner")).toBe(true);
    expect(isManager("admin")).toBe(true);
    expect(isManager("tutor")).toBe(false);
    expect(isManager(null)).toBe(false);
  });
});

describe("linkedTutorMismatch", () => {
  it("flags an account signed in as one person and linked to another", () => {
    // The reported case: signed in as Harrison, shown Alice Park's pay.
    expect(linkedTutorMismatch("Harrison Liu", "Alice Park")).toBe(true);
  });

  it("says nothing when the two agree", () => {
    expect(linkedTutorMismatch("Alice Park", "Alice Park")).toBe(false);
  });

  it("ignores casing and stray spacing rather than crying wolf", () => {
    expect(linkedTutorMismatch(" alice park ", "Alice Park")).toBe(false);
  });

  it("stays quiet when either name is missing", () => {
    // An unlinked account is a different warning, raised where it belongs.
    expect(linkedTutorMismatch("Harrison Liu", null)).toBe(false);
    expect(linkedTutorMismatch(null, "Alice Park")).toBe(false);
    expect(linkedTutorMismatch("Harrison Liu", "   ")).toBe(false);
  });
});

describe("sharedTutorLinks", () => {
  it("names a tutor two accounts both point at", () => {
    const shared = sharedTutorLinks([
      { user_id: "u1", role: "tutor", tutor_id: "alice" },
      { user_id: "u2", role: "tutor", tutor_id: "alice" },
      { user_id: "u3", role: "tutor", tutor_id: "harrison" },
    ]);
    expect([...shared]).toEqual(["alice"]);
  });

  it("ignores owners, admins and unlinked accounts", () => {
    const shared = sharedTutorLinks([
      { user_id: "u1", role: "owner", tutor_id: "alice" },
      { user_id: "u2", role: "admin", tutor_id: "alice" },
      { user_id: "u3", role: "tutor", tutor_id: null },
      { user_id: "u4", role: "tutor", tutor_id: null },
    ]);
    expect(shared.size).toBe(0);
  });
});

describe("mayMarkRoll", () => {
  const lesson = (tutor_id: string | null) => ({ tutor_id });

  it("lets the office mark any lesson", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(mayMarkRoll({ role }, lesson("alice"))).toBe(true);
      expect(mayMarkRoll({ role }, lesson(null))).toBe(true);
    }
  });

  it("lets a tutor mark the lesson they teach", () => {
    expect(mayMarkRoll({ role: "tutor", tutor_id: "alice" }, lesson("alice"))).toBe(true);
  });

  it("refuses a tutor a lesson taught by somebody else", () => {
    // RLS refuses the write too, but a refused policy returns "success, zero
    // rows changed" - so the buttons must not be offered in the first place.
    expect(mayMarkRoll({ role: "tutor", tutor_id: "alice" }, lesson("harrison"))).toBe(false);
  });

  it("fails closed on an unlinked account, an unassigned lesson, or no role yet", () => {
    expect(mayMarkRoll({ role: "tutor", tutor_id: null }, lesson("alice"))).toBe(false);
    expect(mayMarkRoll({ role: "tutor" }, lesson("alice"))).toBe(false);
    expect(mayMarkRoll({ role: "tutor", tutor_id: "alice" }, lesson(null))).toBe(false);
    expect(mayMarkRoll({ role: null }, lesson("alice"))).toBe(false);
    expect(mayMarkRoll({ role: undefined }, lesson("alice"))).toBe(false);
  });
});
