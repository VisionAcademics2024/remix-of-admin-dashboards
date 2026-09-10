import { describe, expect, it } from "vitest";

import {
  classRemovalConsequences,
  classRemovalRefusal,
  type ClassRemovalFacts,
} from "./class-removal";

const built = (over: Partial<ClassRemovalFacts> = {}): ClassRemovalFacts => ({
  lessons: 10,
  enrolments: 1,
  rollEntries: 10,
  taughtLessons: 0,
  charges: 0,
  ...over,
});

describe("classRemovalRefusal", () => {
  it("allows a class built by mistake to go", () => {
    // A term of lessons generated, a student attached, nothing taught yet -
    // the case this exists for.
    expect(classRemovalRefusal(built())).toBeNull();
  });

  it("allows an empty class to go", () => {
    expect(classRemovalRefusal(built({ lessons: 0, enrolments: 0, rollEntries: 0 }))).toBeNull();
  });

  it("refuses a class whose lessons have been charged", () => {
    expect(classRemovalRefusal(built({ charges: 1 }))).toMatch(/charged/);
  });

  it("refuses a class that has actually been taught", () => {
    // Marked present with hours spent is history. Cancelling keeps it; deleting
    // would erase a lesson that happened.
    const refusal = classRemovalRefusal(built({ taughtLessons: 3 }));
    expect(refusal).toMatch(/3 lessons have already been taught/);
    expect(refusal).toMatch(/[Cc]ancel the class instead/);
  });

  it("says one lesson rather than 1 lessons", () => {
    expect(classRemovalRefusal(built({ taughtLessons: 1 }))).toMatch(/1 lesson has already/);
  });

  it("names the charge first when a class is caught by both", () => {
    expect(classRemovalRefusal(built({ charges: 2, taughtLessons: 2 }))).toMatch(/charged/);
  });
});

describe("classRemovalConsequences", () => {
  it("counts what goes", () => {
    const said = classRemovalConsequences(built({ lessons: 10, enrolments: 2, rollEntries: 20 }));
    expect(said[0]).toMatch(/10 lessons disappear/);
    expect(said[1]).toMatch(/2 enrolments/);
    expect(said[2]).toMatch(/20 roll entries/);
  });

  it("leaves out the counts that are zero", () => {
    const said = classRemovalConsequences(built({ lessons: 4, enrolments: 0, rollEntries: 0 }));
    expect(said.some((s) => s.includes("enrolment"))).toBe(false);
    expect(said.some((s) => s.includes("roll entry"))).toBe(false);
  });

  it("always warns that the hours package stays behind", () => {
    // The class builder buys a package in the same breath as building the
    // class; deleting the class does not take the student's money with it.
    expect(classRemovalConsequences(built()).some((s) => s.includes("hours package"))).toBe(true);
  });

  it("always says it cannot be undone", () => {
    expect(classRemovalConsequences(built()).some((s) => s.includes("cannot be undone"))).toBe(
      true,
    );
  });

  it("keeps the singular readable", () => {
    const said = classRemovalConsequences(built({ lessons: 1, enrolments: 1, rollEntries: 1 }));
    expect(said[0]).toMatch(/1 lesson disappears|1 lesson /);
    expect(said[1]).toMatch(/1 enrolment /);
    expect(said[2]).toMatch(/1 roll entry /);
  });
});
