// The app-side half of the two-product rule. The worker cannot see a
// client-side navigation, so this is what stops the school app
// rendering on family.theilmnetwork.com after an in-app link.

import { describe, it, expect } from "vitest";
import { onFamilyHost, isSchoolPath, schoolPathOnFamilyHost } from "./productHost";

const FAMILY = "family.theilmnetwork.com";
const PLATFORM = "app.theilmnetwork.com";
const SCHOOL = "iqraifs.com";

describe("onFamilyHost", () => {
  it("recognises the family host, with or without a port", () => {
    expect(onFamilyHost(FAMILY)).toBe(true);
    expect(onFamilyHost(`${FAMILY}:443`)).toBe(true);
    expect(onFamilyHost(FAMILY.toUpperCase())).toBe(true);
  });

  it.each([PLATFORM, SCHOOL, "www.iqraifs.com", "localhost", "theilmnetwork.com"])(
    "%s is not the family host",
    (host) => {
      expect(onFamilyHost(host)).toBe(false);
    },
  );
});

describe("isSchoolPath", () => {
  it.each([
    "/school",
    "/school/orgs/63cd5732-5db4-40e1-8fb9-60782bcfd059",
    "/school/orgs/abc/admin/assessment",
    "/school-login",
    "/school-portal/students/1/hifz",
  ])("%s is a school surface", (p) => {
    expect(isSchoolPath(p)).toBe(true);
  });

  it.each([
    "/", "/rewards", "/kid/home", "/challenges", "/wishlist",
    "/login", "/signup", "/welcome", "/settings", "/audit",
  ])("%s is not", (p) => {
    expect(isSchoolPath(p)).toBe(false);
  });

  // Shipped wrong in the worker once: the name says parent, the route is
  // the FAMILY parent's login — an alias of /login.
  it("/parent-login is a family route despite the name", () => {
    expect(isSchoolPath("/parent-login")).toBe(false);
  });

  it("does not match a path that merely starts with the letters", () => {
    expect(isSchoolPath("/schoolyard")).toBe(false);
  });
});

describe("schoolPathOnFamilyHost", () => {
  it("refuses a school path on the family host", () => {
    expect(schoolPathOnFamilyHost(FAMILY, "/school/orgs/abc")).toBe(true);
  });

  it("allows the same path on the platform and the school's own domain", () => {
    expect(schoolPathOnFamilyHost(PLATFORM, "/school/orgs/abc")).toBe(false);
    expect(schoolPathOnFamilyHost(SCHOOL, "/school/orgs/abc")).toBe(false);
  });

  it("allows every family path on the family host", () => {
    for (const p of ["/", "/rewards", "/kid/home", "/login", "/parent-login"]) {
      expect(schoolPathOnFamilyHost(FAMILY, p)).toBe(false);
    }
  });
});
