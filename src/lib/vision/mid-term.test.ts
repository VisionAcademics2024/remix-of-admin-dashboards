import { describe, expect, it } from "vitest";

import {
  buildMidTermClasses,
  isBacklog,
  splitLessons,
  suggestedHours,
  tallyAll,
  tallySelection,
  type ClassSelection,
} from "./mid-term";

const TODAY = "2026-09-06";

const lesson = (id: string, date: string, hours = 1.5, on_roll = false) => ({
  id,
  session_date: date,
  duration_hours: hours,
  on_roll,
});

const added = (starts: string, ends: string, attended: boolean) => ({
  tempId: `t-${starts}`,
  starts_at: starts,
  ends_at: ends,
  attended,
});

describe("isBacklog", () => {
  it("counts a lesson before today", () => {
    expect(isBacklog({ session_date: "2026-09-05" }, TODAY)).toBe(true);
  });

  it("does not count today's lesson", () => {
    // Today's class may not have run yet. Marking it present would bill a
    // family for a lesson their child has not sat in.
    expect(isBacklog({ session_date: TODAY }, TODAY)).toBe(false);
  });

  it("does not count a future lesson", () => {
    expect(isBacklog({ session_date: "2026-09-10" }, TODAY)).toBe(false);
  });
});

describe("splitLessons", () => {
  it("puts the backlog newest-first and the upcoming soonest-first", () => {
    const { backlog, upcoming } = splitLessons(
      [
        lesson("a", "2026-08-20"),
        lesson("b", "2026-09-17"),
        lesson("c", "2026-08-27"),
        lesson("d", "2026-09-10"),
      ],
      TODAY,
    );
    expect(backlog.map((l) => l.id)).toEqual(["c", "a"]);
    expect(upcoming.map((l) => l.id)).toEqual(["d", "b"]);
  });
});

describe("tallySelection", () => {
  it("counts hours across past and future ticks", () => {
    const tally = tallySelection(
      {
        class_offering_id: "c1",
        lessons: [lesson("a", "2026-08-27", 2), lesson("b", "2026-09-10", 1.5)],
        selected: ["a", "b"],
        added: [],
      },
      TODAY,
    );
    expect(tally).toEqual({
      lessons: 2,
      hours: 3.5,
      backlogLessons: 1,
      backlogHours: 2,
    });
  });

  it("ignores a lesson the student is already on the roll for", () => {
    // Re-opening the builder to add one more date must not re-bill the roll
    // they already have.
    const tally = tallySelection(
      {
        class_offering_id: "c1",
        lessons: [lesson("a", "2026-08-27", 2, true), lesson("b", "2026-09-10", 1.5)],
        selected: ["a", "b"],
        added: [],
      },
      TODAY,
    );
    expect(tally.lessons).toBe(1);
    expect(tally.hours).toBe(1.5);
  });

  it("takes a hand-typed date's hours from its window", () => {
    const tally = tallySelection(
      {
        class_offering_id: "c1",
        lessons: [],
        selected: [],
        added: [added("2026-08-20T06:00:00.000Z", "2026-08-20T08:00:00.000Z", true)],
      },
      TODAY,
    );
    expect(tally).toEqual({ lessons: 1, hours: 2, backlogLessons: 1, backlogHours: 2 });
  });
});

describe("tallyAll", () => {
  const selections: ClassSelection[] = [
    {
      class_offering_id: "c1",
      lessons: [lesson("a", "2026-08-27", 1.5), lesson("b", "2026-09-10", 1.5)],
      selected: ["a", "b"],
      added: [],
    },
    {
      class_offering_id: "c2",
      lessons: [lesson("c", "2026-09-11", 1.5)],
      selected: ["c"],
      added: [],
    },
    { class_offering_id: "c3", lessons: [lesson("d", "2026-09-12")], selected: [], added: [] },
  ];

  it("adds up two classes at once and ignores the one with no ticks", () => {
    expect(tallyAll(selections, TODAY)).toEqual({
      lessons: 3,
      hours: 4.5,
      backlogLessons: 1,
      backlogHours: 1.5,
      classes: 2,
    });
  });

  it("keeps the total readable rather than floating-point exact", () => {
    expect(tallyAll(selections, TODAY).hours).toBe(4.5);
  });
});

describe("buildMidTermClasses", () => {
  it("splits ticks into lessons to teach and lessons already taught", () => {
    const payload = buildMidTermClasses(
      [
        {
          class_offering_id: "c1",
          lessons: [
            lesson("past", "2026-08-27"),
            lesson("today", TODAY),
            lesson("future", "2026-09-10"),
          ],
          selected: ["past", "today", "future"],
          added: [],
        },
      ],
      TODAY,
    );
    expect(payload).toEqual([
      {
        class_offering_id: "c1",
        session_ids: ["today", "future"],
        attended_session_ids: ["past"],
        new_sessions: [],
      },
    ]);
  });

  it("drops a class with nothing chosen", () => {
    const payload = buildMidTermClasses(
      [
        { class_offering_id: "c1", lessons: [lesson("a", "2026-09-10")], selected: [], added: [] },
        {
          class_offering_id: "c2",
          lessons: [lesson("b", "2026-09-11")],
          selected: ["b"],
          added: [],
        },
      ],
      TODAY,
    );
    expect(payload.map((p) => p.class_offering_id)).toEqual(["c2"]);
  });

  it("leaves out a lesson already on the roll", () => {
    const payload = buildMidTermClasses(
      [
        {
          class_offering_id: "c1",
          lessons: [lesson("a", "2026-08-27", 1.5, true), lesson("b", "2026-09-10")],
          selected: ["a", "b"],
          added: [],
        },
      ],
      TODAY,
    );
    expect(payload[0]).toMatchObject({ session_ids: ["b"], attended_session_ids: [] });
  });

  it("carries hand-typed dates through with whether they were attended", () => {
    const payload = buildMidTermClasses(
      [
        {
          class_offering_id: "c1",
          lessons: [],
          selected: [],
          added: [added("2026-08-20T06:00:00.000Z", "2026-08-20T07:30:00.000Z", true)],
        },
      ],
      TODAY,
    );
    expect(payload[0]?.new_sessions).toEqual([
      {
        starts_at: "2026-08-20T06:00:00.000Z",
        ends_at: "2026-08-20T07:30:00.000Z",
        attended: true,
      },
    ]);
  });
});

describe("suggestedHours", () => {
  it("suggests the hours the chosen lessons come to, backlog included", () => {
    const hours = suggestedHours(
      [
        {
          class_offering_id: "c1",
          lessons: [lesson("a", "2026-08-27", 1.5), lesson("b", "2026-09-10", 1.5)],
          selected: ["a", "b"],
          added: [],
        },
      ],
      TODAY,
    );
    expect(hours).toBe(3);
  });

  it("rounds up to the nearest half hour, which is how blocks are sold", () => {
    const hours = suggestedHours(
      [
        {
          class_offering_id: "c1",
          lessons: [lesson("a", "2026-09-10", 1.25)],
          selected: ["a"],
          added: [],
        },
      ],
      TODAY,
    );
    expect(hours).toBe(1.5);
  });
});
