import { describe, expect, it } from "vitest";

import { removalConsequences, removalRefusal, type RollEntryFacts } from "./roll-removal";

const entry = (over: Partial<RollEntryFacts> = {}): RollEntryFacts => ({
  charges: 0,
  makeUpsSettlingIt: 0,
  hoursConsumed: 0,
  packageId: null,
  status: "not_marked",
  ...over,
});

describe("removalRefusal", () => {
  it("allows an ordinary unmarked entry to go", () => {
    expect(removalRefusal(entry())).toBeNull();
  });

  it("allows a present entry to go - attending is not a reason to be stuck", () => {
    expect(removalRefusal(entry({ status: "present", hoursConsumed: 1.5 }))).toBeNull();
  });

  it("refuses one that has been charged", () => {
    // charges.attendance_id is ON DELETE RESTRICT, so the database refuses too.
    // This refuses first, with a sentence rather than a constraint error.
    expect(removalRefusal(entry({ charges: 1 }))).toMatch(/already been charged/);
  });

  it("refuses one a make-up was booked to settle", () => {
    // The make-up row carries source_attendance_id, and make_up_has_source
    // forbids that being null - so removing the absence breaks the make-up.
    expect(removalRefusal(entry({ makeUpsSettlingIt: 1 }))).toMatch(/make-up/);
  });

  it("names the charge first when an entry is caught by both", () => {
    expect(removalRefusal(entry({ charges: 1, makeUpsSettlingIt: 1 }))).toMatch(/charged/);
  });
});

describe("removalConsequences", () => {
  it("says the hours go back when they came from a package", () => {
    const said = removalConsequences(entry({ hoursConsumed: 1.5, packageId: "pkg-1" }));
    expect(said[0]).toMatch(/1.5 h goes back onto their hours package/);
  });

  it("says the hours stop being owed when there is no package behind them", () => {
    const said = removalConsequences(entry({ hoursConsumed: 2 }));
    expect(said[0]).toMatch(/stops counting as taught/);
  });

  it("says nothing about hours when none were drawn", () => {
    const said = removalConsequences(entry());
    expect(said.some((s) => s.includes("h "))).toBe(false);
  });

  it("warns that a present mark is not kept anywhere else", () => {
    const said = removalConsequences(entry({ status: "present" }));
    expect(said.some((s) => s.includes("attended this lesson is gone"))).toBe(true);
  });

  it("always says the lesson survives, which is the whole point", () => {
    for (const facts of [entry(), entry({ status: "present", hoursConsumed: 1 })]) {
      expect(removalConsequences(facts).some((s) => s.includes("lesson itself"))).toBe(true);
    }
  });

  it("rounds hours rather than printing floating-point noise", () => {
    const said = removalConsequences(entry({ hoursConsumed: 1.4999999999, packageId: "p" }));
    expect(said[0]).toMatch(/1.5 h/);
  });
});
