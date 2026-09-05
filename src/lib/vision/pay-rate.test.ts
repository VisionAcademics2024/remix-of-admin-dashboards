import { describe, expect, it } from "vitest";

import { rateIsMissing, rateOf } from "./pay-rate";

describe("rateIsMissing", () => {
  it("is true when no lesson carries a rate", () => {
    expect(rateIsMissing([{ hourly_rate: null }, { hourly_rate: null }])).toBe(true);
    expect(rateIsMissing([{}, {}])).toBe(true);
  });

  // The regression. An owner who teaches is deliberately on $0 an hour; telling
  // them every fortnight that their rate is missing is nagging about a decision
  // they already made.
  it("is false when the rate is a deliberate zero", () => {
    expect(rateIsMissing([{ hourly_rate: 0 }, { hourly_rate: 0 }])).toBe(false);
  });

  it("is false when any lesson carries a rate", () => {
    expect(rateIsMissing([{ hourly_rate: null }, { hourly_rate: 45 }])).toBe(false);
  });

  it("is false with nothing to judge", () => {
    expect(rateIsMissing([])).toBe(false);
  });
});

describe("rateOf", () => {
  it("finds the rate the lessons were paid at", () => {
    expect(rateOf([{ hourly_rate: null }, { hourly_rate: 45 }])).toBe(45);
  });

  it("reports a deliberate zero as zero, not as absent", () => {
    expect(rateOf([{ hourly_rate: 0 }])).toBe(0);
  });

  it("falls back to zero when there is no rate at all", () => {
    expect(rateOf([{ hourly_rate: null }])).toBe(0);
    expect(rateOf([])).toBe(0);
  });
});
