import { describe, expect, it } from "vitest";

import { NAV_GROUPS, isActivePath, navGroupsFor, sectionTitleFor } from "./nav-items";

describe("navGroupsFor", () => {
  it("hides owner-only sections from an admin", () => {
    const titles = navGroupsFor("admin").flatMap((g) => g.items.map((i) => i.title));
    expect(titles).not.toContain("Tutor Pay");
    expect(titles).not.toContain("Staff");
    expect(titles).toContain("Sessions");
  });

  it("shows everything to an owner", () => {
    const titles = navGroupsFor("owner").flatMap((g) => g.items.map((i) => i.title));
    expect(titles).toContain("Tutor Pay");
    expect(titles).toContain("Staff");
  });

  it("drops a group that has nothing left in it", () => {
    for (const group of navGroupsFor("admin")) expect(group.items.length).toBeGreaterThan(0);
  });

  it("puts Sessions in Manage, next to the other records", () => {
    const manage = NAV_GROUPS.find((g) => g.label === "Manage");
    expect(manage?.items.map((i) => i.url)).toContain("/sessions");
  });
});

describe("isActivePath", () => {
  it("lights a section on its own page", () => {
    expect(isActivePath("/sessions", "/sessions")).toBe(true);
  });

  it("lights a section on a page beneath it", () => {
    expect(isActivePath("/students", "/students/abc-123")).toBe(true);
  });

  it("does not light Classes when Class Builder is open", () => {
    // /classes/new is its own section, so lighting both would be a lie.
    expect(isActivePath("/classes", "/classes/new")).toBe(false);
    expect(isActivePath("/classes/new", "/classes/new")).toBe(true);
  });

  it("does not light a section whose path is merely a prefix of another", () => {
    expect(isActivePath("/tutors", "/tutor-pay")).toBe(false);
  });
});

describe("sectionTitleFor", () => {
  it("names the section the phone header is showing", () => {
    expect(sectionTitleFor("/sessions")).toBe("Sessions");
    expect(sectionTitleFor("/students/abc-123")).toBe("Students & Families");
    expect(sectionTitleFor("/classes/new")).toBe("Class Builder");
  });

  it("falls back to the app name off the map", () => {
    expect(sectionTitleFor("/somewhere-else")).toBe("Vision CRM");
  });
});
