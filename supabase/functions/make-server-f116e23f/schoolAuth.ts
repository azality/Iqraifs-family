// Shared school-role authorization helpers and Hono middleware factories.
//
// Before this module existed, schoolPhaseA / schoolPhaseB / schoolPhaseC each
// defined their own private copies of isPrincipalOf, isAdminOf,
// hasAdminOrPrincipal, requireTeacherOfSection, etc. That meant new routes
// drifted easily — Phase A's checks accepted org-level visiting_teacher,
// Phase B's didn't, and Phase C had a slightly different fallback.
//
// All NEW routes should import from this file. The existing per-phase copies
// stay in place for now (low-risk; refactoring 50+ call sites in one PR is
// dangerous pre-pilot) but should be migrated incrementally.
//
// Block style: by user product decision (PR docs/school-roles, Q in
// AskUserQuestion), forbidden routes return 403 with a body like
//   { error: "human-readable message", code: "MACHINE_CODE" }
// so the frontend can show a useful toast.

import { Context } from "npm:hono";
import { serviceRoleClient } from "./middleware.tsx";

// Canonical role names. Keep in sync with the role_type enum in Postgres
// and the role_template enum used by the frontend.
export type SchoolRole =
  | "principal"
  | "admin"
  | "class_teacher"
  | "visiting_teacher"
  | "teacher" // legacy alias for class_teacher in some rows
  | "financial_staff"
  | "office_staff";

// =============================================================================
// Low-level role lookups — exported because some call sites need the raw
// boolean (e.g. "principal can do X, anyone else can do Y but with a warning")
// =============================================================================

// Validity helpers live in roleValidity.ts (pure, no Deno-runtime deps) so
// they're testable in isolation. Re-exported here so existing imports keep
// working unchanged.
export { todayUtcDate, isRoleActiveNow } from "./roleValidity.ts";
export type { RoleRowForActiveCheck } from "./roleValidity.ts";
import { todayUtcDate, isRoleActiveNow } from "./roleValidity.ts";

export async function userHasRoleRow(
  userId: string,
  roleType: SchoolRole,
  scopeType: "organization" | "class",
  scopeId: string,
): Promise<boolean> {
  // PR F (Q5): also enforce the valid_from/valid_until window. A role is
  // active only if not revoked AND inside the window. We do the window
  // check in SQL via .or() to keep it indexable.
  const today = todayUtcDate();
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id, valid_from, valid_until")
    .eq("user_id", userId)
    .eq("role_type", roleType)
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .is("revoked_at", null);
  if (!data || data.length === 0) return false;
  return data.some((r: any) => isRoleActiveNow({ revoked_at: null, valid_from: r.valid_from ?? null, valid_until: r.valid_until ?? null }, today));
}

export async function isPrincipalOf(userId: string, orgId: string): Promise<boolean> {
  return userHasRoleRow(userId, "principal", "organization", orgId);
}

export async function isAdminOf(userId: string, orgId: string): Promise<boolean> {
  return userHasRoleRow(userId, "admin", "organization", orgId);
}

export async function hasAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  if (await isPrincipalOf(userId, orgId)) return true;
  if (await isAdminOf(userId, orgId)) return true;
  return false;
}

/**
 * Return the set of distinct role_type values this user holds in this org
 * (across org-level and any class-level scope rows). Use this when you want
 * to render UI state or make multi-role decisions; for a single allow/deny
 * check, prefer `requireOrgRole` below.
 */
export async function getOrgRoles(userId: string, orgId: string): Promise<Set<SchoolRole>> {
  const out = new Set<SchoolRole>();
  const today = todayUtcDate();
  const inWindow = (r: any) => isRoleActiveNow({
    revoked_at: null, // already filtered by SQL
    valid_from: r.valid_from ?? null,
    valid_until: r.valid_until ?? null,
  }, today);

  // Org-scoped roles — direct match. Filter by validity window in TS so
  // a single SQL roundtrip serves all permission resolution.
  const { data: orgRoles } = await serviceRoleClient
    .from("user_roles")
    .select("role_type, valid_from, valid_until")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  for (const r of orgRoles ?? []) {
    if (inWindow(r)) out.add((r as any).role_type as SchoolRole);
  }

  // Class-scoped roles — need to verify the class belongs to this org. We
  // collect the user's class-scoped role rows then check class_section.org_id.
  const { data: classRoles } = await serviceRoleClient
    .from("user_roles")
    .select("role_type, scope_id, valid_from, valid_until")
    .eq("user_id", userId)
    .eq("scope_type", "class")
    .is("revoked_at", null);
  if (classRoles && classRoles.length > 0) {
    const validClassRoles = (classRoles as any[]).filter(inWindow);
    const ids = validClassRoles.map(r => r.scope_id);
    if (ids.length > 0) {
      const { data: secs } = await serviceRoleClient
        .from("class_section")
        .select("id, org_id")
        .in("id", ids);
      const orgOf = new Map<string, string>((secs ?? []).map((s: any) => [s.id, s.org_id]));
      for (const r of validClassRoles) {
        if (orgOf.get(r.scope_id) === orgId) out.add(r.role_type as SchoolRole);
      }
    }
  }

  return out;
}

// =============================================================================
// Scope check: is this user the class teacher / a visiting teacher of this
// specific section? Returns a discriminated union so callers can surface a
// useful HTTP response.
// =============================================================================

export type ScopeGate =
  | { ok: true }
  | { ok: false; status: 403 | 404; error: string; code: string };

export async function requireTeacherOfSection(
  userId: string,
  orgId: string,
  sectionId: string,
): Promise<ScopeGate> {
  // First confirm the section is in this org. Doubles as an existence check.
  const { data: sec } = await serviceRoleClient
    .from("class_section")
    .select("id, org_id, class_teacher_user_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!sec) return { ok: false, status: 404, error: "section not found", code: "SECTION_NOT_FOUND" };
  if ((sec as any).org_id !== orgId) {
    return { ok: false, status: 404, error: "section not in this org", code: "SECTION_NOT_IN_ORG" };
  }

  // Admin/principal: always allowed.
  if (await hasAdminOrPrincipal(userId, orgId)) return { ok: true };

  // Class teacher of this exact section.
  if ((sec as any).class_teacher_user_id === userId) return { ok: true };

  // Visiting teacher scoped to this section.
  if (await userHasRoleRow(userId, "visiting_teacher", "class", sectionId)) return { ok: true };

  // Fallback: org-level visiting_teacher (matches Phase A pattern — visiting
  // teachers without a specific class assignment can act on any section in
  // their org. Tighten this if needed per Q5 in SCHOOL_ROLES.md).
  if (await userHasRoleRow(userId, "visiting_teacher", "organization", orgId)) return { ok: true };

  return {
    ok: false,
    status: 403,
    error: "You do not have permission to act on this class.",
    code: "NOT_TEACHER_OF_SECTION",
  };
}

// =============================================================================
// Permission resolution (PR E #3)
// =============================================================================
// The role_template_override table stores per-org deviations from the
// hardcoded DEFAULT_PERMISSIONS map in schoolPhaseA.tsx. Most gates today
// still check roles directly ("if class_teacher OR visiting_teacher then OK").
// The right primitive is: "does this user have permission KEY in this org",
// resolved through role → effective permission (override or default).
//
// New routes should call userCanInOrg(). Existing routes can migrate
// incrementally — we don't refactor 50+ call sites in one PR.
// =============================================================================

export type PermissionKey =
  | "manage_students"
  | "mark_attendance"
  | "edit_grades"
  | "mark_fees_status"
  | "create_forms"
  | "define_curriculum"
  | "manage_teachers"
  | "view_all_classes";

// Mirror of DEFAULT_PERMISSIONS in schoolPhaseA.tsx. Kept in sync by hand;
// when you add a new permission, update both places. (Future cleanup: hoist
// to a shared module and import both sides.)
const DEFAULT_PERMS: Record<SchoolRole, Partial<Record<PermissionKey, boolean>>> = {
  principal: {
    manage_students: true, mark_attendance: true, edit_grades: true,
    mark_fees_status: true, create_forms: true, define_curriculum: true,
    manage_teachers: true, view_all_classes: true,
  },
  admin: {
    manage_students: true, mark_attendance: true, edit_grades: true,
    mark_fees_status: true, create_forms: true, define_curriculum: true,
    manage_teachers: true, view_all_classes: true,
  },
  class_teacher: {
    mark_attendance: true, edit_grades: true,
    create_forms: true, define_curriculum: true,
  },
  visiting_teacher: {
    mark_attendance: true,
  },
  teacher: {
    mark_attendance: true, edit_grades: true,
  },
  financial_staff: {
    mark_fees_status: true,
  },
  office_staff: {
    manage_students: true, mark_attendance: true, create_forms: true,
    manage_teachers: true, view_all_classes: true,
  },
};

/** Effective permission for (org, role, key). Reads role_template_override
 *  if a row exists; otherwise falls back to DEFAULT_PERMS. Returns false
 *  when no row and no default. */
export async function getEffectivePermission(
  orgId: string,
  role: SchoolRole,
  key: PermissionKey,
): Promise<boolean> {
  const { data: override } = await serviceRoleClient
    .from("role_template_override")
    .select("allowed")
    .eq("org_id", orgId)
    .eq("role_template", role)
    .eq("permission_key", key)
    .maybeSingle();
  if (override) return !!(override as any).allowed;
  return DEFAULT_PERMS[role]?.[key] ?? false;
}

/** Does this user, via any role they hold in this org, have permission KEY?
 *  Principal/admin always pass for everything (they're trust-root + power
 *  user respectively). For others, resolves through getEffectivePermission. */
export async function userCanInOrg(
  userId: string,
  orgId: string,
  key: PermissionKey,
): Promise<boolean> {
  if (await isPrincipalOf(userId, orgId)) return true;
  if (await isAdminOf(userId, orgId)) return true;
  const roles = await getOrgRoles(userId, orgId);
  for (const r of roles) {
    if (await getEffectivePermission(orgId, r, key)) return true;
  }
  return false;
}

// =============================================================================
// requireOrgRole — Hono middleware FACTORY
//
// Usage:
//   school.post("/orgs/:orgId/something",
//     requireOrgRole({ allow: ["principal", "admin"] }),
//     async (c) => { ... });
//
// The middleware reads :orgId from the route params, looks up the caller's
// roles in that org, and 403s if none of them are in `allow`. The handler
// can then call getAuthUserId(c) without re-checking permissions.
//
// `code` overrides the default 403 code so frontend can branch on it.
// `orgIdParam` lets you point at a non-standard path param (default "orgId").
// =============================================================================

export function requireOrgRole(opts: {
  allow: SchoolRole[];
  code?: string;
  orgIdParam?: string;
}) {
  const allowSet = new Set<SchoolRole>(opts.allow);
  const orgIdParam = opts.orgIdParam ?? "orgId";

  return async function middleware(c: Context, next: () => Promise<void>) {
    const user = c.get("user");
    if (!user?.id) {
      return c.json({ error: "unauthenticated", code: "UNAUTHENTICATED" }, 401);
    }
    const orgId = c.req.param(orgIdParam);
    if (!orgId) {
      // Programmer error — route mounted at wrong path. Surface clearly.
      return c.json({ error: `missing :${orgIdParam} in route`, code: "MISSING_ORG_PARAM" }, 500);
    }

    const roles = await getOrgRoles(user.id, orgId);
    for (const r of roles) {
      if (allowSet.has(r)) return next();
    }

    const human =
      opts.allow.length === 1
        ? `This action requires ${opts.allow[0].replace(/_/g, " ")} role in this school.`
        : `This action requires one of: ${opts.allow.map(r => r.replace(/_/g, " ")).join(", ")}.`;

    return c.json(
      { error: human, code: opts.code ?? "FORBIDDEN_ROLE", allowed: opts.allow },
      403,
    );
  };
}
