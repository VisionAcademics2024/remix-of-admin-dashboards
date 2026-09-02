import { describe, expect, it } from "vitest";

import { compareSortValues } from "./ui";

/** Sorting a column means sorting its values, not the text drawn in the cell. */
describe("compareSortValues", () => {
  it("orders numbers numerically, not as text", () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0);
    expect(compareSortValues(10, 2)).toBeGreaterThan(0);
    expect(compareSortValues(3, 3)).toBe(0);
  });

  it("orders strings case-insensitively", () => {
    expect(compareSortValues("ada", "Bob")).toBeLessThan(0);
    expect(compareSortValues("Bob", "ada")).toBeGreaterThan(0);
  });

  it("orders numbers inside strings the way a person reads them", () => {
    // "Year 8" before "Year 10" - a plain string sort puts 10 first.
    expect(compareSortValues("Year 8 Maths", "Year 10 Maths")).toBeLessThan(0);
  });

  it("orders ISO timestamps chronologically", () => {
    expect(compareSortValues("2026-09-01T04:00:00Z", "2026-09-02T04:00:00Z")).toBeLessThan(0);
  });

  it("sinks blanks to the bottom whichever way the column is sorted", () => {
    // Ascending puts them last; the caller negates for descending, which puts
    // them first - so the rule is stated once here and tested at both ends.
    expect(compareSortValues(null, "Ada")).toBeGreaterThan(0);
    expect(compareSortValues("Ada", null)).toBeLessThan(0);
    expect(compareSortValues(undefined, 4)).toBeGreaterThan(0);
    expect(compareSortValues("", "Ada")).toBeGreaterThan(0);
  });

  it("treats two blanks as equal, whatever kind of blank they are", () => {
    expect(compareSortValues(null, undefined)).toBe(0);
    expect(compareSortValues("", null)).toBe(0);
  });

  it("does not treat zero as blank", () => {
    // A package with no hours left must still sort below one with some.
    expect(compareSortValues(0, 5)).toBeLessThan(0);
  });
});
