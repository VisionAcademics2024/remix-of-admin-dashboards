import { describe, expect, it } from "vitest";

import { isAuthFailure } from "./auth-failure";

describe("isAuthFailure", () => {
  it("recognises every refusal requireSupabaseAuth throws", () => {
    // The full set, copied from the middleware. If one is reworded there and
    // loses the prefix, this is what notices.
    for (const message of [
      "Unauthorized: No request headers available",
      "Unauthorized: No authorization header provided",
      "Unauthorized: Only Bearer tokens are supported",
      "Unauthorized: No token provided",
      "Unauthorized: Invalid token",
      "Unauthorized: No user ID found in token",
    ]) {
      expect(isAuthFailure(new Error(message))).toBe(true);
    }
  });

  it("reads a message however the boundary serialised it", () => {
    expect(isAuthFailure("Unauthorized: Invalid token")).toBe(true);
    expect(isAuthFailure({ message: "Unauthorized: Invalid token" })).toBe(true);
    expect(isAuthFailure({ body: "Unauthorized: Invalid token" })).toBe(true);
    expect(isAuthFailure({ body: { message: "Unauthorized: Invalid token" } })).toBe(true);
  });

  it("does not call a broken server a login problem", () => {
    // Each of these used to send someone to the sign-in screen, which sent
    // them straight back, forever.
    for (const message of [
      "Missing Supabase environment variable(s): SUPABASE_URL",
      'infinite recursion detected in policy for relation "staff"',
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      "500 Internal Server Error",
    ]) {
      expect(isAuthFailure(new Error(message))).toBe(false);
    }
  });

  it("treats what it cannot read as not an auth problem", () => {
    // The safer of the two mistakes: an error page states the fault, where a
    // bounce to the login screen hides it behind a loop.
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure(undefined)).toBe(false);
    expect(isAuthFailure({})).toBe(false);
    expect(isAuthFailure(42)).toBe(false);
  });

  it("is not fooled by case", () => {
    expect(isAuthFailure(new Error("UNAUTHORIZED: invalid token"))).toBe(true);
  });
});
