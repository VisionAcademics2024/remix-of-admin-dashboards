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

describe("mayReadSessionNotes", () => {
  it("lets the office read any lesson's note", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(mayReadSessionNotes({ role }, lesson("alice"))).toBe(true);
      expect(mayReadSessionNotes({ role }, lesson(null))).toBe(true);
    }
  });

  it("lets a tutor read the note on the lesson they teach", () => {
    expect(mayReadSessionNotes({ role: "tutor", tutor_id: "alice" }, lesson("alice"))).toBe(true);
  });

  it("refuses a tutor the note on somebody else's lesson", () => {
    // A tutor reads the whole calendar on purpose, and the rows arrive whole -
    // so without this the note on every class in the school came with them.
    expect(mayReadSessionNotes({ role: "tutor", tutor_id: "alice" }, lesson("harrison"))).toBe(
      false,
    );
  });

  it("fails closed on an unlinked account or an unassigned lesson", () => {
    expect(mayReadSessionNotes({ role: "tutor", tutor_id: null }, lesson("alice"))).toBe(false);
    expect(mayReadSessionNotes({ role: "tutor", tutor_id: "alice" }, lesson(null))).toBe(false);
    expect(mayReadSessionNotes({ role: null }, lesson("alice"))).toBe(false);
  });
});

describe("redactNotes", () => {
  it("hands an entitled reader the row untouched", () => {
    const row = { tutor_id: "alice", notes: "Struggled with vectors." };
    expect(redactNotes({ role: "tutor", tutor_id: "alice" }, row)).toBe(row);
  });

  it("blanks the note for anyone else, without altering the original", () => {
    const row = { tutor_id: "harrison", notes: "Struggled with vectors." };
    const seen = redactNotes({ role: "tutor", tutor_id: "alice" }, row);
    expect(seen.notes).toBeNull();
    // The masking is a copy: the server keeps its own row intact, and nothing
    // downstream can accidentally write the blank back.
    expect(row.notes).toBe("Struggled with vectors.");
  });

  it("keeps every other column", () => {
    const seen = redactNotes(
      { role: "tutor", tutor_id: "alice" },
      { tutor_id: "harrison", notes: "x", code: "SES-1", starts_at: "2026-01-01T00:00:00Z" },
    );
    expect(seen.code).toBe("SES-1");
    expect(seen.starts_at).toBe("2026-01-01T00:00:00Z");
  });
});
