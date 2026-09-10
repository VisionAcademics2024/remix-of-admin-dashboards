import { describe, expect, it } from "vitest";

import { mayReadSessionNotes, mayWriteSessionNotes, redactNotes } from "./session-notes";

const lesson = (tutor_id: string | null) => ({ tutor_id });

describe("mayWriteSessionNotes", () => {
  it("lets the office write up any lesson", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(mayWriteSessionNotes({ role }, lesson("alice"))).toBe(true);
      expect(mayWriteSessionNotes({ role }, lesson(null))).toBe(true);
    }
  });

  it("lets a tutor write up the lesson they teach", () => {
    expect(mayWriteSessionNotes({ role: "tutor", tutor_id: "alice" }, lesson("alice"))).toBe(true);
  });

  it("refuses a tutor on somebody else's lesson", () => {
    // The same question teaches_session() asks in SQL. A tutor may read the
    // whole calendar on purpose, so reading a lesson is not permission to
    // write on it.
    expect(mayWriteSessionNotes({ role: "tutor", tutor_id: "alice" }, lesson("harrison"))).toBe(
      false,
    );
  });

  it("refuses a tutor account with no tutor linked", () => {
    // Failing closed: the alternative is an account with nothing behind it
    // writing on lessons at large.
    expect(mayWriteSessionNotes({ role: "tutor" }, lesson("alice"))).toBe(false);
    expect(mayWriteSessionNotes({ role: "tutor", tutor_id: null }, lesson("alice"))).toBe(false);
    expect(mayWriteSessionNotes({ role: "tutor", tutor_id: "" }, lesson("alice"))).toBe(false);
  });

  it("refuses a tutor on an unassigned lesson", () => {
    // Nobody teaches it yet, so it is nobody's to write up.
    expect(mayWriteSessionNotes({ role: "tutor", tutor_id: "alice" }, lesson(null))).toBe(false);
  });
});
