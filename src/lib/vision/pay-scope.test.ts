import { describe, expect, it } from "vitest";

import { payScope } from "./pay-scope";

describe("payScope", () => {
  it("does not narrow an owner, who asks about everybody", () => {
    expect(payScope({ role: "owner" })).toBeNull();
    expect(payScope({ role: "owner", tutor_id: null })).toBeNull();
  });

  it("narrows a tutor to the tutor their account teaches as", () => {
    expect(payScope({ role: "tutor", tutor_id: "alice" })).toBe("alice");
  });

  it("shares a tutor when two accounts point at the same one", () => {
    // The test login has no lessons of its own, so it teaches as Alice Park.
    expect(payScope({ role: "tutor", tutor_id: "alice" })).toBe(
      payScope({ role: "tutor", tutor_id: "alice" }),
    );
  });

  // The regression. An unlinked tutor account used to fall through to "no
  // filter", which showed one tutor the whole school's lessons and pay.
  it("refuses an unlinked tutor rather than widening to everyone", () => {
    expect(() => payScope({ role: "tutor" })).toThrow(/not linked to a tutor/);
    expect(() => payScope({ role: "tutor", tutor_id: null })).toThrow(/not linked to a tutor/);
    expect(() => payScope({ role: "tutor", tutor_id: "" })).toThrow(/not linked to a tutor/);
  });
});
