// =============================================================================
// Role-permission matrix — THE single source of truth.
//
// This file is intentionally pure TypeScript with zero imports so that BOTH
// runtimes can consume it directly:
//   - Deno edge functions:  schoolAuth.ts, schoolPhaseA.tsx import it
//   - Vite frontend:        src/lib/rolePermissions.ts re-exports it
//
// History: this matrix used to live in three hand-synced copies
// (schoolAuth.ts DEFAULT_PERMS, schoolPhaseA.tsx DEFAULT_PERMISSIONS,
// src/lib/rolePermissions.ts) and they drifted — manage_public_site existed
// in only one of them, which made the permission un-grantable from the
// editor. Do not fork this file again; add keys HERE and only here.
// =============================================================================

export type SchoolRole =
  | "principal"
  | "admin"
  | "class_teacher"
  | "visiting_teacher"
  | "teacher" // legacy alias for class_teacher in some rows
  | "financial_staff"
  | "office_staff"
  // Wing overseer (Sep 2026): Montessori / Primary+Secondary / Hifz.
  // Access is WING-scoped via explicit incharge checks in schoolAuth —
  // the org-wide permission matrix below stays all-false on purpose so
  // userCanInOrg() never grants an incharge org-wide powers.
  | "incharge";

export type PermissionKey =
  | "manage_students"
  | "mark_attendance"
  | "edit_grades"
  | "mark_fees_status"
  | "create_forms"
  | "define_curriculum"
  | "manage_teachers"
  | "view_all_classes"
  | "manage_public_site";

export const ROLES: SchoolRole[] = [
  "principal",
  "admin",
  "incharge",
  "class_teacher",
  "visiting_teacher",
  "teacher",
  "financial_staff",
  "office_staff",
];

export const PERMISSION_KEYS: PermissionKey[] = [
  "manage_students",
  "mark_attendance",
  "edit_grades",
  "mark_fees_status",
  "create_forms",
  "define_curriculum",
  "manage_teachers",
  "view_all_classes",
  "manage_public_site",
];

// Role templates whose defaults CAN be overridden per-org from the
// Permissions editor. Principal is deliberately excluded: it's the
// trust root and short-circuits every check, so an override row for it
// would be dead data that misleads the reader.
export const OVERRIDABLE_ROLE_TEMPLATES: Exclude<SchoolRole, "principal">[] = [
  "admin",
  "class_teacher",
  "visiting_teacher",
  "teacher",
  "financial_staff",
  "office_staff",
];

/** Default permissions. Pre-pilot decisions:
 *  - Principal/admin: god-mode (everything).
 *  - Class teacher: attendance + grades + curriculum + forms within own scope.
 *  - Visiting teacher: attendance only (lowest privilege of teaching roles).
 *  - Financial staff: fees only.
 *  - Office staff: admin-lite — students, attendance, teachers, view all,
 *    forms. NO fees, NO grades. (PR C #6 elevated mark_attendance to true.)
 *  Overrides from role_template_override (per org) win over these. */
export const DEFAULT_PERMISSIONS: Record<SchoolRole, Record<PermissionKey, boolean>> = {
  // Wing access is granted by explicit incharge checks (schoolAuth), not
  // by this org-wide matrix — everything false here is intentional.
  incharge: {
    manage_students: false,
    mark_attendance: false,
    edit_grades: false,
    mark_fees_status: false,
    create_forms: false,
    define_curriculum: false,
    manage_teachers: false,
    view_all_classes: false,
    manage_public_site: false,
  },
  principal: {
    manage_students: true,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: true,
    create_forms: true,
    define_curriculum: true,
    manage_teachers: true,
    view_all_classes: true,
    manage_public_site: true,
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
    manage_public_site: true,
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
    manage_public_site: false,
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
    manage_public_site: false,
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
    manage_public_site: false,
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
    manage_public_site: false,
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
    manage_public_site: false,
  },
};

/** Resolve effective permission. Override (per-org boolean) wins when set;
 *  otherwise fall through to the default. `null` for override means
 *  "no row exists, use default". Pure — DB lookups live in schoolAuth.ts. */
export function resolveEffectivePermission(
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
    if (resolveEffectivePermission(r, key, o === undefined ? null : o)) return true;
  }
  return false;
}
