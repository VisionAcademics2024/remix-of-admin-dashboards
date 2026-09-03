import { describe, expect, it } from "vitest";

import { buildEnrolmentPayload } from "./enrolment-terms";

describe("buildEnrolmentPayload", () => {
  const terms = {
    student_id: "s1",
    class_offering_id: "c1",
    status: "active",
    starts_on: "2026-01-01",
    adjustment: "none",
    adjustment_value: 0,
  };

  it("leaves the package alone when the caller did not mention it", () => {
    // The edit-terms dialog sends no default_package_id. If this key appeared
    // in the payload, the update would strip the enrolment's package and every
    // roll seeded afterwards would draw from nothing.
    const payload = buildEnrolmentPayload({ ...terms, method: "hours", notes: "" });
    expect("default_package_id" in payload).toBe(false);
  });

  it("clears the package when the caller sends null on purpose", () => {
    const payload = buildEnrolmentPayload({ ...terms, default_package_id: null });
    expect("default_package_id" in payload).toBe(true);
    expect(payload["default_package_id"]).toBeNull();
  });

  it("writes the package the caller sent", () => {
    const payload = buildEnrolmentPayload({ ...terms, default_package_id: "pkg-1" });
    expect(payload["default_package_id"]).toBe("pkg-1");
  });

  it("turns cleared inputs into null rather than empty strings", () => {
    const payload = buildEnrolmentPayload({
      ...terms,
      ends_on: "",
      method: "",
      standard_price_id: "",
      notes: "",
    });
    expect(payload["ends_on"]).toBeNull();
    expect(payload["method"]).toBeNull();
    expect(payload["standard_price_id"]).toBeNull();
    expect(payload["notes"]).toBeNull();
  });

  it("keeps a real hours override and nulls a missing one", () => {
    expect(buildEnrolmentPayload({ ...terms, hours_override: 7.5 })["hours_override"]).toBe(7.5);
    expect(buildEnrolmentPayload({ ...terms })["hours_override"]).toBeNull();
  });
});
