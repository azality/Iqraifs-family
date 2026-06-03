// Tests for the role × permission matrix. Run with `npm test`.
//
// These tests are intentionally small and focused on the highest-stakes
// invariants from docs/SCHOOL_ROLES.md. The goal is to catch regressions
// in the matrix (e.g. "did someone accidentally give visiting_teacher
// edit_grades while refactoring?") without trying to be exhaustive.

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  getEffectivePermission,
  userCan,
} from "./rolePermissions";

describe("DEFAULT_PERMISSIONS — invariants", () => {
  it("every role has every permission key defined", () => {
    for (const role of ROLES) {
      for (const key of PERMISSIONS) {
        expect(DEFAULT_PERMISSIONS[role]).toHaveProperty(key);
        expect(typeof DEFAULT_PERMISSIONS[role][key]).toBe("boolean");
      }
    }
  });

  it("principal has every permission (trust root)", () => {
    for (const key of PERMISSIONS) {
      expect(DEFAULT_PERMISSIONS.principal[key]).toBe(true);
    }
  });

  it("admin has every permission (delegated power user)", () => {
    for (const key of PERMISSIONS) {
      expect(DEFAULT_PERMISSIONS.admin[key]).toBe(true);
    }
  });

  it("visiting_teacher cannot edit grades (least-privilege teaching role)", () => {
    expect(DEFAULT_PERMISSIONS.visiting_teacher.edit_grades).toBe(false);
  });

  it("financial_staff has ONLY mark_fees_status", () => {
    const fs = DEFAULT_PERMISSIONS.financial_staff;
    expect(fs.mark_fees_status).toBe(true);
    expect(fs.mark_attendance).toBe(false);
    expect(fs.edit_grades).toBe(false);
    expect(fs.manage_students).toBe(false);
  });

  it("office_staff can mark attendance (PR C #6)", () => {
    expect(DEFAULT_PERMISSIONS.office_staff.mark_attendance).toBe(true);
  });

  it("office_staff cannot edit grades or mark fees", () => {
    expect(DEFAULT_PERMISSIONS.office_staff.edit_grades).toBe(false);
    expect(DEFAULT_PERMISSIONS.office_staff.mark_fees_status).toBe(false);
  });

  it("class_teacher cannot manage other teachers", () => {
    expect(DEFAULT_PERMISSIONS.class_teacher.manage_teachers).toBe(false);
  });
});

describe("getEffectivePermission", () => {
  it("returns the default when override is null", () => {
    expect(getEffectivePermission("class_teacher", "mark_attendance", null)).toBe(true);
    expect(getEffectivePermission("class_teacher", "mark_fees_status", null)).toBe(false);
  });

  it("override true forces allow even when default is false", () => {
    expect(getEffectivePermission("class_teacher", "mark_fees_status", true)).toBe(true);
  });

  it("override false forces deny even when default is true", () => {
    expect(getEffectivePermission("class_teacher", "mark_attendance", false)).toBe(false);
  });
});

describe("userCan", () => {
  it("returns true if any role grants the permission", () => {
    expect(userCan(["financial_staff", "office_staff"], "mark_attendance")).toBe(true);
    expect(userCan(["financial_staff", "office_staff"], "mark_fees_status")).toBe(true);
  });

  it("returns false if no role grants the permission", () => {
    expect(userCan(["visiting_teacher"], "mark_fees_status")).toBe(false);
    expect(userCan(["visiting_teacher"], "edit_grades")).toBe(false);
  });

  it("override is honored per-role", () => {
    const overrides = new Map<string, boolean>();
    overrides.set("class_teacher::mark_fees_status", true);
    expect(userCan(["class_teacher"], "mark_fees_status", overrides)).toBe(true);

    overrides.set("class_teacher::mark_attendance", false);
    expect(userCan(["class_teacher"], "mark_attendance", overrides)).toBe(false);
  });

  it("multiple roles + mixed overrides: most-permissive wins", () => {
    const overrides = new Map<string, boolean>();
    overrides.set("class_teacher::mark_attendance", false);
    // even though CT is overridden off, office_staff still allows by default
    expect(userCan(["class_teacher", "office_staff"], "mark_attendance", overrides)).toBe(true);
  });

  it("empty roles set is always false", () => {
    expect(userCan([], "mark_attendance")).toBe(false);
  });
});
