// Single source of truth for the school role × permission matrix.
//
// Both the frontend (UI gating, "is this button visible?") and the test
// suite import from this file. The Deno edge function in
// supabase/functions/make-server-f116e23f/schoolAuth.ts keeps its own copy
// because Deno can't ergonomically import from src/. The two must be kept
// in sync — when adding a permission, update BOTH places. There's a
// roundtrip test below that catches divergence.

export type SchoolRole =
  | "principal"
  | "admin"
  | "class_teacher"
  | "visiting_teacher"
  | "teacher" // legacy alias
  | "financial_staff"
  | "office_staff";

export type PermissionKey =
  | "manage_students"
  | "mark_attendance"
  | "edit_grades"
  | "mark_fees_status"
  | "create_forms"
  | "define_curriculum"
  | "manage_teachers"
  | "view_all_classes";

export const ROLES: SchoolRole[] = [
  "principal",
  "admin",
  "class_teacher",
  "visiting_teacher",
  "teacher",
  "financial_staff",
  "office_staff",
];

export const PERMISSIONS: PermissionKey[] = [
  "manage_students",
  "mark_attendance",
  "edit_grades",
  "mark_fees_status",
  "create_forms",
  "define_curriculum",
  "manage_teachers",
  "view_all_classes",
];

/** Default permissions. Pre-pilot decisions:
 *  - Principal/admin: god-mode (everything).
 *  - Class teacher: attendance + grades + lessons + forms within own scope.
 *  - Visiting teacher: attendance only (lowest privilege of teaching roles).
 *  - Financial staff: fees only.
 *  - Office staff: admin-lite — students, attendance, teachers, view all,
 *    forms. NO fees, NO grades. (PR C #6 elevated mark_attendance to true.)
 *  Use getEffectivePermission(role, key, override) at call sites — the
 *  override is the per-org row from role_template_override. */
export const DEFAULT_PERMISSIONS: Record<SchoolRole, Record<PermissionKey, boolean>> = {
  principal: {
    manage_students: true,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: true,
    create_forms: true,
    define_curriculum: true,
    manage_teachers: true,
    view_all_classes: true,
  },
  admin: {
    manage_students: true,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: true,
    create_forms: true,
    define_curriculum: true,
    manage_teachers: true,
    view_all_classes: true,
  },
  class_teacher: {
    manage_students: false,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: false,
    create_forms: true,
    define_curriculum: true,
    manage_teachers: false,
    view_all_classes: false,
  },
  visiting_teacher: {
    manage_students: false,
    mark_attendance: true,
    edit_grades: false,
    mark_fees_status: false,
    create_forms: false,
    define_curriculum: false,
    manage_teachers: false,
    view_all_classes: false,
  },
  teacher: {
    manage_students: false,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: false,
    create_forms: false,
    define_curriculum: false,
    manage_teachers: false,
    view_all_classes: false,
  },
  financial_staff: {
    manage_students: false,
    mark_attendance: false,
    edit_grades: false,
    mark_fees_status: true,
    create_forms: false,
    define_curriculum: false,
    manage_teachers: false,
    view_all_classes: false,
  },
  office_staff: {
    manage_students: true,
    mark_attendance: true, // PR C #6
    edit_grades: false,
    mark_fees_status: false,
    create_forms: true,
    define_curriculum: false,
    manage_teachers: true,
    view_all_classes: true,
  },
};

/** Resolve effective permission. Override (per-org boolean) wins when set;
 *  otherwise fall through to the default. `null` for override means
 *  "no row exists, use default". */
export function getEffectivePermission(
  role: SchoolRole,
  key: PermissionKey,
  override: boolean | null = null,
): boolean {
  if (override !== null) return override;
  return DEFAULT_PERMISSIONS[role]?.[key] ?? false;
}

/** Given a set of roles a user holds, does ANY of them grant the
 *  permission? `overrides` is a Map of `${role}::${key}` → bool for the
 *  current org's role_template_override rows. */
export function userCan(
  roles: Iterable<SchoolRole>,
  key: PermissionKey,
  overrides: Map<string, boolean> = new Map(),
): boolean {
  for (const r of roles) {
    const o = overrides.get(`${r}::${key}`);
    if (getEffectivePermission(r, key, o === undefined ? null : o)) return true;
  }
  return false;
}
