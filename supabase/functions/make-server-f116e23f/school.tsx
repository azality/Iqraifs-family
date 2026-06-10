// =============================================================================
// School module — Hono sub-app for the school-side surfaces.
//
// This file is the boundary between the legacy KV-backed family product and
// the new Postgres-backed school product. School data lives in the new
// relational tables created by `supabase/migrations/20260511_0001_school_pilot_schema.sql`.
//
// Mount point in index.ts:
//   app.route("/make-server-f116e23f/school", schoolApp);
//
// All routes here:
//   - Require auth (requireAuth middleware)
//   - Use serviceRoleClient (RLS is deferred to Phase 2.5 — app-level scope checks until then)
//   - Operate ONLY on the new tables (organizations, campuses, classes, etc.)
//   - Never touch kv_store_f116e23f
//
// Scope-check pattern: every endpoint that mutates data verifies the caller
// has a non-revoked row in user_roles with the right (role_type, scope_type,
// scope_id) tuple. The helpers below centralize that check.
// =============================================================================

import { Hono } from "npm:hono";
import { serviceRoleClient, requireAuth, getAuthUserId } from "./middleware.tsx";
import { logAuditWithLookup } from "./schoolAudit.ts";
import { installPhaseA } from "./schoolPhaseA.tsx";
import { installPhaseB } from "./schoolPhaseB.tsx";
import { installPhaseC } from "./schoolPhaseC.tsx";
import { installPhaseC2 } from "./schoolPhaseC2.tsx";
import { installPhaseCD } from "./schoolPhaseCD.tsx";
import { installDashboard } from "./schoolDashboard.tsx";
import { installSubjects } from "./schoolSubjects.tsx";
import { installCurriculum } from "./schoolCurriculum.tsx";
import { installAcademics } from "./schoolAcademics.tsx";
import { installOffice } from "./schoolOffice.tsx";
import { installFinance } from "./schoolFinance.tsx";
import { installPortal } from "./schoolPortal.tsx";
import { installAnnounce } from "./schoolAnnounce.tsx";
import { installTimetable } from "./schoolTimetable.tsx";
import { installBehaviorCategories } from "./behaviorCategories.tsx";
import { installSchoolSearch } from "./schoolSearch.tsx";
import { installYearRollover } from "./schoolYearRollover.tsx";
import { installSchoolGroup } from "./schoolGroup.tsx";
import { installPublicSite } from "./schoolPublicSite.tsx";
import { installFeePlans } from "./schoolFeePlans.tsx";
import { installAssessment } from "./schoolAssessment.tsx";
import { installReportCard } from "./schoolReportCard.tsx";
import { installMessages } from "./schoolMessages.tsx";
import { verifyPinToken } from "./schoolPhaseA.tsx";

const school = new Hono();

// Paths under /school that are intentionally PUBLIC (no family-JWT required).
// These have their own auth mechanisms (e.g. PIN-based login that issues a
// token the caller then uses for follow-up requests).
const PUBLIC_SCHOOL_PATHS = new Set<string>([
  "/auth/pin-login",
  // pin-change carries its own X-Pin-Token; the handler verifies it.
  "/auth/pin-change",
  // Public org-branding lookup so PortalLogin can render the school's
  // name + logo + motto before sign-in. Returns nothing sensitive.
  "/auth/org-by-slug",
]);

// Tail patterns that may be authenticated via X-Pin-Token (parent subject)
// INSTEAD of family-JWT. The downstream handler still validates the token
// and decides what to do; this middleware just lets the request through
// when a valid PIN token is present.
const PIN_TOKEN_ALLOWED_PATTERNS: RegExp[] = [
  /^\/orgs\/[^/]+\/my-forms$/,
  /^\/orgs\/[^/]+\/forms\/[^/]+\/responses$/,
];

// All routes require auth EXCEPT the explicitly-public PIN login endpoint.
// Guard against malformed UUID path segments BEFORE auth so we don't
// reach Supabase with garbage that surfaces "invalid input syntax for
// type uuid" verbatim in the UI. Looks for any path segment that's a
// 32+ hex run with hyphens but doesn't match the canonical UUID shape.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SHAPE_RE = /^[0-9a-f-]{20,}$/i;
school.use("*", async (c, next) => {
  const segs = new URL(c.req.url).pathname.split("/");
  for (const s of segs) {
    if (s && UUID_SHAPE_RE.test(s) && !UUID_RE.test(s)) {
      return c.json({ error: "not found" }, 404);
    }
  }
  await next();
});

school.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  // path is the full request path; strip the mount prefix to compare.
  // The school sub-app is mounted at /make-server-f116e23f/school, so the
  // tail after that is what we want to test.
  const tail = path.replace(/^.*\/school/, "");
  if (PUBLIC_SCHOOL_PATHS.has(tail)) {
    await next();
    return;
  }
  // Public school site lookup — anyone can fetch a school's marketing
  // content by slug, no auth.
  if (/^\/public-site\/[^/]+$/.test(tail)) {
    await next();
    return;
  }
  // Phase E portal endpoints (/pin-me/*) authenticate via X-Pin-Token, not
  // the family JWT. Skip requireAuth — each handler enforces requirePinSubject.
  if (tail === "/pin-me" || tail.startsWith("/pin-me/")) {
    await next();
    return;
  }
  // For Phase C.3+D parent-facing endpoints (my-forms, form responses),
  // a valid X-Pin-Token also bypasses family-JWT requireAuth so PIN-authed
  // parents can call those handlers.
  const pinTokenHeader = c.req.header("X-Pin-Token") || "";
  if (pinTokenHeader && PIN_TOKEN_ALLOWED_PATTERNS.some((re) => re.test(tail))) {
    const payload = await verifyPinToken(pinTokenHeader);
    if (payload) {
      await next();
      return;
    }
  }
  return requireAuth(c, next);
});

// -----------------------------------------------------------------------------
// Role helpers — check user_roles for caller's privileges.
// -----------------------------------------------------------------------------

type RoleType = "principal" | "teacher" | "parent" | "student";
type ScopeType = "organization" | "campus" | "class" | "family" | "child";

async function hasRole(
  userId: string,
  roleType: RoleType,
  scopeType: ScopeType,
  scopeId: string,
): Promise<boolean> {
  const { data, error } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_type", roleType)
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("[school.hasRole] DB error:", error);
    return false;
  }
  return !!data;
}

// Returns true if the user is a principal of the given organization.
async function isPrincipalOf(userId: string, orgId: string): Promise<boolean> {
  return hasRole(userId, "principal", "organization", orgId);
}

// Returns the org_id of any organization where this user is principal.
// For the v1 single-school pilot, every principal has exactly one org.
async function findPrincipalOrgs(userId: string): Promise<string[]> {
  const { data, error } = await serviceRoleClient
    .from("user_roles")
    .select("scope_id")
    .eq("user_id", userId)
    .eq("role_type", "principal")
    .eq("scope_type", "organization")
    .is("revoked_at", null);
  if (error) {
    console.error("[school.findPrincipalOrgs] DB error:", error);
    return [];
  }
  return (data ?? []).map((r: any) => r.scope_id);
}

// -----------------------------------------------------------------------------
// GET /school/health — module-level health check
// -----------------------------------------------------------------------------
school.get("/health", async (c) => {
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select("slug, name, plan")
    .limit(5);
  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }
  return c.json({ ok: true, organizations: data });
});

// -----------------------------------------------------------------------------
// GET /school/me — what does this user see on the school side?
// Returns { roles: [{ roleType, scopeType, scopeId, scopeName }], orgs: [...] }
// so the frontend can route them to the right surface (principal / teacher /
// neither).
// -----------------------------------------------------------------------------
school.get("/me", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  // Look up signupIntent from app_metadata — server-controlled so the
  // frontend can trust it as the truth for "is this account school-only".
  // Older accounts (signed up before signupIntent existed) get 'family'
  // by default.
  let signupIntent: 'family' | 'school' = 'family';
  try {
    const { data: userLookup } = await serviceRoleClient.auth.admin.getUserById(userId);
    const meta = (userLookup?.user as any)?.app_metadata ?? {};
    if (meta.signupIntent === 'school') signupIntent = 'school';
  } catch (_err) {
    // Lookup failure is non-fatal — default to 'family'.
  }

  const { data: roleRows, error: rolesErr } = await serviceRoleClient
    .from("user_roles")
    .select("role_type, scope_type, scope_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (rolesErr) {
    return c.json({ error: "could not load roles", details: rolesErr.message }, 500);
  }
  const roles: Array<{ role_type: string; scope_type: string; scope_id: string }> =
    (roleRows ?? []) as any;

  // SYNTHETIC HIFZ TEACHER ROLES (PR feat/hifz-teacher-section-listing).
  // class_section.hifz_teacher_user_id grants Hifz-log POST access but
  // doesn't write a user_roles row. Without surfacing those attachments
  // here, a Hifz-only teacher (no class_teacher / visiting_teacher
  // role) lands on /school with no orgs in their access list and is
  // shown the "no staff role" card. We materialize them here as
  // synthetic class-scoped role rows with role_type='hifz_teacher' so
  // viewerRoleForOrg + the access-denied gate downstream can see them.
  // role_type intentionally NOT equal to 'class_teacher' so existing
  // gates that grant write powers based on a real class_teacher row
  // remain unaffected.
  const { data: hifzSections } = await serviceRoleClient
    .from("class_section")
    .select("id, class_id, class:class_id(id, org_id)")
    .eq("hifz_teacher_user_id", userId);
  const hifzSectionRows = (hifzSections ?? []) as Array<{
    id: string;
    class_id: string;
    class: { id: string; org_id: string } | null;
  }>;
  for (const sec of hifzSectionRows) {
    if (!sec.class) continue;
    // Section-scoped synthetic — feeds determineScope downstream.
    roles.push({
      role_type: "hifz_teacher",
      scope_type: "class",
      scope_id: sec.id,
    });
    // Also synthesize an org-scoped marker so viewerRoleForOrg can
    // resolve the role without needing to look at every section.
    roles.push({
      role_type: "hifz_teacher",
      scope_type: "organization",
      scope_id: sec.class.org_id,
    });
  }

  // Hydrate scope names so the frontend doesn't need extra round trips.
  // For the org list we union real role-row orgs + Hifz section orgs so
  // a Hifz-only teacher gets their org in me.organizations.
  const orgIds = Array.from(
    new Set([
      ...roles
        .filter((r) => r.scope_type === "organization")
        .map((r) => r.scope_id),
      ...hifzSectionRows
        .map((s) => s.class?.org_id)
        .filter((x): x is string => !!x),
    ]),
  );
  const classIds = Array.from(
    new Set([
      ...roles.filter((r) => r.scope_type === "class").map((r) => r.scope_id),
      ...hifzSectionRows.map((s) => s.class_id),
    ]),
  );

  const [orgRows, classRows] = await Promise.all([
    orgIds.length > 0
      // Filter out soft-deleted orgs so they disappear from the workspace
      // switcher during the 30-day grace window. Migration 0014 adds the
      // deleted_at column.
      ? serviceRoleClient
          .from("organizations")
          .select("id, name, slug, plan")
          .in("id", orgIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    classIds.length > 0
      ? serviceRoleClient
          .from("classes")
          .select("id, name, grade_level, section, track, organization_id, campus_id")
          .in("id", classIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return c.json({
    userId,
    signupIntent,
    roles,
    organizations: orgRows.data ?? [],
    classes: classRows.data ?? [],
  });
});

// -----------------------------------------------------------------------------
// POST /school/organizations
// Self-service org creation. The authenticated caller becomes the
// principal of the new organization. Used by the school-signup path on
// the marketing site (/signup) so a school owner can create their own
// org without an Anthropic admin in the loop.
//
// Body: { name: string, slug?: string }
//   - name is required; trimmed; 2..200 chars.
//   - slug is optional; if omitted we derive it from name. We retry
//     with an incrementing suffix if the derived slug collides.
//
// One user can be principal of multiple orgs (e.g. a chain owner with
// several schools), so we don't refuse if they already have a principal
// row elsewhere.
// -----------------------------------------------------------------------------
school.post("/organizations", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const rawName = typeof body?.name === "string" ? body.name.trim() : "";
  if (rawName.length < 2 || rawName.length > 200) {
    return c.json({ error: "name must be 2..200 characters" }, 400);
  }

  // Slug: prefer user-supplied, else derive from name. Allowed chars:
  // lowercase a-z, digits, dashes. Strip everything else, collapse runs.
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{ASCII}]/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

  let baseSlug = typeof body?.slug === "string" ? slugify(body.slug) : "";
  if (!baseSlug) baseSlug = slugify(rawName);
  if (!baseSlug) baseSlug = "school"; // total fallback for non-Latin names

  // Try base slug, then -2, -3, ... up to 50 attempts.
  let chosenSlug = baseSlug;
  let attempt = 1;
  while (attempt <= 50) {
    const { data: existing, error: lookupErr } = await serviceRoleClient
      .from("organizations")
      .select("id")
      .eq("slug", chosenSlug)
      .maybeSingle();
    if (lookupErr) {
      return c.json({ error: lookupErr.message }, 500);
    }
    if (!existing) break;
    attempt += 1;
    chosenSlug = `${baseSlug}-${attempt}`;
  }

  const { data: org, error: insertErr } = await serviceRoleClient
    .from("organizations")
    .insert({
      name: rawName,
      slug: chosenSlug,
      org_type: "school",
      plan: "pilot",
      settings: {
        salahQadhaPoints: 1,
        salahMissedPoints: -1,
        leaderboardFrequency: "weekly",
        dailyDiaryDelivery: "daily",
        allowParentComments: true,
      },
    })
    .select()
    .single();
  if (insertErr) {
    // 23505 = unique violation — unlikely after our pre-check but
    // possible under a race. Surface as 409.
    if ((insertErr as any).code === "23505") {
      return c.json({ error: "slug already exists; try a different one" }, 409);
    }
    return c.json({ error: insertErr.message }, 500);
  }

  // Make the caller principal of the new org. ON CONFLICT DO NOTHING
  // is unnecessary here because the org was just created — but we
  // catch the unique violation defensively anyway.
  const { error: roleErr } = await serviceRoleClient
    .from("user_roles")
    .insert({
      user_id: userId,
      role_type: "principal",
      scope_type: "organization",
      scope_id: org.id,
      granted_by: userId,
    });
  if (roleErr && (roleErr as any).code !== "23505") {
    // Rollback the org if we can't grant principal — without principal
    // the org is unreachable, so it's better to delete than leave orphaned.
    await serviceRoleClient.from("organizations").delete().eq("id", org.id);
    return c.json({ error: "could not grant principal role", details: roleErr.message }, 500);
  }

  return c.json({ organization: org }, 201);
});

// -----------------------------------------------------------------------------
// PATCH /school/orgs/:orgId
// Principal-only. Updates org-level fields. `name` is written to the
// organizations.name column directly; contact_email / contact_phone /
// address / academic_year are merged into the organizations.settings
// jsonb so we don't depend on columns that may not exist yet.
// Body: Partial<{ name, contact_email, contact_phone, address, academic_year }>
// -----------------------------------------------------------------------------
school.patch("/orgs/:orgId", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  // Expanded in PR C (gap #5): timezone, branding (logo URL + theme color),
  // school_motto. All stored in the organizations.settings jsonb so we don't
  // need a migration. Frontend OrgSettings exposes editors for each.
  const settingsKeys = [
    "contact_email",
    "contact_phone",
    "address",
    "academic_year",
    "timezone",
    "logo_url",
    "theme_color",
    "school_motto",
  ];

  // Load current settings so we merge rather than overwrite.
  const { data: current, error: loadErr } = await serviceRoleClient
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (loadErr) return c.json({ error: loadErr.message }, 500);
  if (!current) return c.json({ error: "not found" }, 404);

  const mergedSettings: Record<string, unknown> = {
    ...((current.settings as Record<string, unknown>) ?? {}),
  };
  let settingsTouched = false;
  for (const k of settingsKeys) {
    if (body[k] !== undefined) {
      mergedSettings[k] = body[k];
      settingsTouched = true;
    }
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (settingsTouched) patch.settings = mergedSettings;

  // Custom URL slug — feeds the per-school login URL (iqraifs.com/:slug).
  // Mirror src/app/utils/reservedSlugs.ts: any change here MUST be made
  // there too, otherwise a principal can grab a slug that would shadow a
  // top-level route on the frontend.
  if (typeof body.slug === "string") {
    const slug = body.slug.trim().toLowerCase();
    const RESERVED = new Set([
      "welcome", "login", "signup", "parent-login", "parent-signup",
      "parent", "kid-login", "kid-login-new", "kid", "onboarding",
      "join-pending", "diagnostic", "school", "school-login",
      "school-portal", "api", "auth", "admin", "settings", "logout",
      "about", "contact", "help", "support", "terms", "privacy",
      "legal", "static", "assets", "public", "favicon.ico",
      "robots.txt", "sitemap.xml", "manifest.json", "sw.js",
      "_app", "_next",
    ]);
    if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/.test(slug) || slug.includes("--")) {
      return c.json(
        { error: "Slug must be 3–40 chars: lowercase letters, digits, or single dashes." },
        400,
      );
    }
    if (RESERVED.has(slug)) {
      return c.json({ error: `'${slug}' is reserved and can't be used as a school URL.` }, 400);
    }
    // Uniqueness check across NON-deleted orgs. A soft-deleted org keeps
    // its slug until the purge job runs; new orgs can claim it after.
    const { data: clash } = await serviceRoleClient
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .is("deleted_at", null)
      .neq("id", orgId)
      .maybeSingle();
    if (clash) {
      return c.json({ error: `'${slug}' is already taken by another school.` }, 409);
    }
    patch.slug = slug;
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no allowed fields in body" }, 400);
  }

  const { data, error } = await serviceRoleClient
    .from("organizations")
    .update(patch)
    .eq("id", orgId)
    .select()
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// -----------------------------------------------------------------------------
// DELETE /orgs/:orgId — soft-delete the school (principal-only, typed-name
// confirmation required). 30-day grace window; hard-delete happens via a
// background job (manual for pilot — 4 schools at most).
//
// Body: { confirmName: string } — must match organizations.name exactly. This
// is the "type the project name to delete" pattern that's the standard guard
// against accidental clicks. We compare with .trim() but otherwise case-
// sensitively because school names contain proper nouns.
//
// Effect: sets deleted_at = now(), purge_after = now() + 30 days,
// deleted_by = caller. Subsequent reads (workspace switcher, /school/me, etc.)
// filter on deleted_at IS NULL so the org disappears from everyone's UI.
//
// Recovery (restore) is currently a DB-only operation — there's no /restore
// endpoint yet. The principal contacts support during the grace window.
// -----------------------------------------------------------------------------
school.delete("/orgs/:orgId", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated", code: "UNAUTHENTICATED" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json(
      { error: "Only the principal can delete the school.", code: "FORBIDDEN_NOT_PRINCIPAL" },
      403,
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as { confirmName?: string };
  if (!body.confirmName || typeof body.confirmName !== "string") {
    return c.json(
      { error: "confirmName required.", code: "CONFIRM_NAME_REQUIRED" },
      400,
    );
  }

  const { data: org, error: loadErr } = await serviceRoleClient
    .from("organizations")
    .select("id, name, deleted_at")
    .eq("id", orgId)
    .maybeSingle();
  if (loadErr) return c.json({ error: loadErr.message }, 500);
  if (!org) return c.json({ error: "not found", code: "NOT_FOUND" }, 404);
  if ((org as any).deleted_at) {
    return c.json(
      { error: "School is already scheduled for deletion.", code: "ALREADY_DELETED" },
      409,
    );
  }

  if (body.confirmName.trim() !== (org as any).name) {
    return c.json(
      {
        error: "School name did not match. Please type the name exactly as shown.",
        code: "CONFIRM_NAME_MISMATCH",
      },
      400,
    );
  }

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: updErr } = await serviceRoleClient
    .from("organizations")
    .update({
      deleted_at: now.toISOString(),
      deleted_by: userId,
      purge_after: purgeAfter.toISOString(),
    })
    .eq("id", orgId);
  if (updErr) return c.json({ error: updErr.message }, 500);

  await logAuditWithLookup({
    orgId,
    actorUserId: userId,
    action: "delete_school",
    details: {
      schoolName: (org as any).name,
      purgeAfter: purgeAfter.toISOString(),
    },
  });

  return c.json({
    ok: true,
    deletedAt: now.toISOString(),
    purgeAfter: purgeAfter.toISOString(),
    message: `${(org as any).name} has been scheduled for deletion. It will be permanently removed after ${purgeAfter.toISOString().slice(0, 10)}. Contact support before then if you need to restore it.`,
  });
});

// -----------------------------------------------------------------------------
// DELETE /orgs/:orgId/staff/me — staff member self-removes from this org.
// Revokes their role row but does NOT delete their Supabase Auth user (they
// keep family-app access and any other workspaces). Available to any staff
// role except principal — the principal must either transfer ownership first
// (TODO, separate flow) or use the school-delete endpoint above.
//
// This is the "leave this school" button in the user's settings page.
// -----------------------------------------------------------------------------
school.delete("/orgs/:orgId/staff/me", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated", code: "UNAUTHENTICATED" }, 401);
  const orgId = c.req.param("orgId");

  // Block principals — they need a transfer-ownership flow (TODO #15).
  const { data: principalRole } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_type", "principal")
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .maybeSingle();
  if (principalRole) {
    return c.json(
      {
        error: "Principals cannot leave their own school. Transfer ownership first, or delete the school.",
        code: "PRINCIPAL_CANNOT_LEAVE",
      },
      400,
    );
  }

  const { data: rolesToRevoke, error: selErr } = await serviceRoleClient
    .from("user_roles")
    .select("id, role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  if (selErr) return c.json({ error: selErr.message }, 500);
  if (!rolesToRevoke || rolesToRevoke.length === 0) {
    return c.json({ error: "You are not a staff member of this school.", code: "NOT_STAFF" }, 404);
  }

  const { error: updErr } = await serviceRoleClient
    .from("user_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  if (updErr) return c.json({ error: updErr.message }, 500);

  await logAuditWithLookup({
    orgId,
    actorUserId: userId,
    action: "staff_self_leave",
    targetUserId: userId,
    details: {
      revokedRoles: (rolesToRevoke as any[]).map((r) => r.role_type),
    },
  });

  return c.json({
    ok: true,
    revokedRoles: (rolesToRevoke as any[]).map((r) => r.role_type),
    message: "You have left this school. Your account is unaffected.",
  });
});

// -----------------------------------------------------------------------------
// POST /orgs/:orgId/transfer-ownership — principal hands the school over to
// another user (typically an existing admin). High-stakes operation; we
// require typed-name confirmation matching the school name, same guard as
// delete-school.
//
// Behavior:
//   1. Revoke caller's principal role.
//   2. Grant principal to targetUserId. If target already has a non-revoked
//      role in this org (e.g. they were admin) we revoke that first so the
//      "one user, one role per org" invariant from the dedupe check holds.
//   3. Grant the caller an admin role on the same org so they don't lose
//      access — the NEW principal can then remove them or the old principal
//      can self-leave via DELETE /staff/me.
//   4. Audit log entry.
//
// All four DB writes happen sequentially; we do NOT wrap in an explicit
// transaction because supabase-js doesn't expose one. The window is small
// and each step is idempotent on retry, but a partial failure could leave
// the school with 0 or 2 principals. Worth tightening later with a stored
// procedure.
// -----------------------------------------------------------------------------
school.post("/orgs/:orgId/transfer-ownership", async (c) => {
  const callerId = getAuthUserId(c);
  if (!callerId) return c.json({ error: "unauthenticated", code: "UNAUTHENTICATED" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(callerId, orgId))) {
    return c.json(
      { error: "Only the current principal can transfer ownership.", code: "FORBIDDEN_NOT_PRINCIPAL" },
      403,
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as { targetUserId?: string; confirmName?: string };
  if (!body.targetUserId) {
    return c.json({ error: "targetUserId required", code: "MISSING_TARGET" }, 400);
  }
  if (body.targetUserId === callerId) {
    return c.json({ error: "Cannot transfer ownership to yourself.", code: "SAME_USER" }, 400);
  }
  if (!body.confirmName) {
    return c.json({ error: "confirmName required", code: "CONFIRM_NAME_REQUIRED" }, 400);
  }

  const { data: org } = await serviceRoleClient
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return c.json({ error: "not found", code: "NOT_FOUND" }, 404);
  if (body.confirmName.trim() !== (org as any).name) {
    return c.json(
      { error: "School name did not match. Please type the name exactly as shown.", code: "CONFIRM_NAME_MISMATCH" },
      400,
    );
  }

  // Confirm target actually has an account in Supabase Auth.
  const { data: targetLookup, error: lookupErr } = await (serviceRoleClient as any)
    .auth.admin.getUserById(body.targetUserId);
  if (lookupErr || !targetLookup?.user) {
    return c.json({ error: "target user not found", code: "TARGET_NOT_FOUND" }, 404);
  }
  const targetEmail = targetLookup.user.email ?? null;

  const nowIso = new Date().toISOString();

  // 1. Revoke caller's principal row.
  const { error: revokeErr } = await serviceRoleClient
    .from("user_roles")
    .update({ revoked_at: nowIso })
    .eq("user_id", callerId)
    .eq("role_type", "principal")
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  if (revokeErr) return c.json({ error: revokeErr.message }, 500);

  // 2a. Revoke any existing role the target already has in this org (e.g.
  // they were an admin). Keeps the one-role-per-user invariant intact.
  await serviceRoleClient
    .from("user_roles")
    .update({ revoked_at: nowIso })
    .eq("user_id", body.targetUserId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);

  // 2b. Grant principal to target.
  const { error: grantErr } = await serviceRoleClient.from("user_roles").insert({
    user_id: body.targetUserId,
    role_type: "principal",
    scope_type: "organization",
    scope_id: orgId,
    granted_by: callerId,
  });
  if (grantErr) return c.json({ error: grantErr.message }, 500);

  // 3. Demote caller to admin so they don't lose all access. Idempotent —
  // if a revoked admin row exists, we insert a fresh one (the dedupe
  // check we do at staff-add time would catch this, but here we're
  // explicitly handing the demotion ourselves).
  const { error: demoteErr } = await serviceRoleClient.from("user_roles").insert({
    user_id: callerId,
    role_type: "admin",
    scope_type: "organization",
    scope_id: orgId,
    granted_by: body.targetUserId,
  });
  if (demoteErr && (demoteErr as any).code !== "23505") {
    return c.json({ error: demoteErr.message }, 500);
  }

  // 4. Audit. New action code so the AuditLog UI can label it distinctly.
  await logAuditWithLookup({
    orgId,
    actorUserId: callerId,
    action: "transfer_ownership" as any, // extending the AuditAction union below
    targetUserId: body.targetUserId,
    targetEmail,
    targetRole: "principal",
    details: { previousPrincipal: callerId },
  });

  return c.json({
    ok: true,
    newPrincipalUserId: body.targetUserId,
    yourNewRole: "admin",
    message: `Ownership transferred to ${targetEmail ?? body.targetUserId}. You are now an admin of this school.`,
  });
});

// -----------------------------------------------------------------------------
// POST /admin/purge-soft-deleted-orgs — manual trigger for the daily purge.
//
// Calls the purge_soft_deleted_orgs() Postgres function defined in
// migration 0017. Useful for testing the delete-school flow end-to-end
// without waiting 30 days, and as a recovery handle if the cron stops
// running. Gated by a shared admin token (env: ADMIN_PURGE_TOKEN) — we
// don't want a regular principal accidentally hitting this and nuking
// every org that's past its grace window.
// -----------------------------------------------------------------------------
school.post("/admin/purge-soft-deleted-orgs", async (c) => {
  const expectedToken = Deno.env.get("ADMIN_PURGE_TOKEN");
  if (!expectedToken) {
    return c.json({ error: "ADMIN_PURGE_TOKEN not configured on the server.", code: "NOT_CONFIGURED" }, 503);
  }
  const provided = c.req.header("x-admin-token") ?? "";
  if (provided !== expectedToken) {
    return c.json({ error: "forbidden", code: "BAD_TOKEN" }, 403);
  }

  const { data, error } = await serviceRoleClient.rpc("purge_soft_deleted_orgs");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true, purgedCount: (data as number | null) ?? 0 });
});

// -----------------------------------------------------------------------------
// GET /orgs/:orgId/audit — principal/admin only. Returns the latest N (default
// 200, max 500) invite/staff audit log entries in reverse chronological order.
// -----------------------------------------------------------------------------
school.get("/orgs/:orgId/audit", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  // Principal OR admin can view. Use the local isPrincipalOf + isAdminOf via
  // user_roles direct check rather than importing schoolAuth (to keep
  // school.tsx's import surface minimal).
  const { data: gateRows } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  const isStaff = (gateRows ?? []).some(
    (r: any) => r.role_type === "principal" || r.role_type === "admin",
  );
  if (!isStaff) {
    return c.json(
      { error: "Only principals and admins can view the audit log.", code: "FORBIDDEN_ROLE" },
      403,
    );
  }

  const limitParam = parseInt(c.req.query("limit") ?? "200", 10);
  const limit = Math.min(Math.max(isFinite(limitParam) ? limitParam : 200, 1), 500);

  const { data, error } = await serviceRoleClient
    .from("invite_audit_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ entries: data ?? [], limit });
});

// -----------------------------------------------------------------------------
// POST /school/organizations/:orgId/grant-principal
// Admin-only escape hatch to seed the FIRST principal of a fresh org. Once
// a principal exists, they grant roles via /school/teachers etc.
//
// Authorization: only callable when the org has ZERO principals (bootstrap),
// OR by an existing principal of the same org.
// Body: { userId: string }
// -----------------------------------------------------------------------------
school.post("/organizations/:orgId/grant-principal", async (c) => {
  const callerId = getAuthUserId(c);
  if (!callerId) return c.json({ error: "unauthenticated" }, 401);

  const orgId = c.req.param("orgId");
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const targetUserId = body?.userId;
  if (!targetUserId) return c.json({ error: "userId required" }, 400);

  // Check org exists
  const { data: org, error: orgErr } = await serviceRoleClient
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr) return c.json({ error: orgErr.message }, 500);
  if (!org) return c.json({ error: "organization not found" }, 404);

  // Count existing principals
  const { count, error: countErr } = await serviceRoleClient
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_type", "principal")
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  if (countErr) return c.json({ error: countErr.message }, 500);

  const isBootstrap = (count ?? 0) === 0;
  const callerIsPrincipal = await isPrincipalOf(callerId, orgId);

  if (!isBootstrap && !callerIsPrincipal) {
    return c.json(
      {
        error: "forbidden",
        detail: "Only an existing principal of this org can grant the principal role",
      },
      403,
    );
  }

  const { data, error } = await serviceRoleClient
    .from("user_roles")
    .insert({
      user_id: targetUserId,
      role_type: "principal",
      scope_type: "organization",
      scope_id: orgId,
      granted_by: callerId,
    })
    .select()
    .single();
  if (error) {
    // 23505 = unique violation (already a principal)
    if ((error as any).code === "23505") {
      return c.json({ ok: true, message: "already a principal of this org" });
    }
    return c.json({ error: error.message }, 500);
  }
  return c.json({ ok: true, role: data });
});

// -----------------------------------------------------------------------------
// GET /school/organizations/:orgId
// Returns org details + counts (campuses, classes, students). Principal only.
// -----------------------------------------------------------------------------
school.get("/organizations/:orgId", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  // Read-only org details + counts. Open to any non-revoked role in the
  // org (principal, admin, teacher, class_teacher, visiting_teacher,
  // office_staff, financial_staff). Previously principal-only, which
  // caused PerformanceDashboard to throw "forbidden" for every
  // non-principal staff member because getOrganization() set the same
  // error state as the dashboard fetch.
  const { data: anyRole } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (!anyRole) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [orgRes, campusCount, classCount, enrollmentCount] = await Promise.all([
    serviceRoleClient.from("organizations").select("*").eq("id", orgId).maybeSingle(),
    serviceRoleClient
      .from("campuses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    serviceRoleClient
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    // Enrollment count is via a join — count active enrollments whose class belongs to this org.
    serviceRoleClient
      .from("enrollments")
      .select("class_id!inner(organization_id)", { count: "exact", head: true })
      .is("withdrawn_at", null)
      .eq("class_id.organization_id", orgId),
  ]);

  if (orgRes.error) return c.json({ error: orgRes.error.message }, 500);
  if (!orgRes.data) return c.json({ error: "not found" }, 404);

  return c.json({
    organization: orgRes.data,
    counts: {
      campuses: campusCount.count ?? 0,
      classes: classCount.count ?? 0,
      activeEnrollments: enrollmentCount.count ?? 0,
    },
  });
});

// -----------------------------------------------------------------------------
// POST /school/organizations/:orgId/campuses
// Body: { name: string, address?: string, timezone?: string }
// -----------------------------------------------------------------------------
school.post("/organizations/:orgId/campuses", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!body?.name || typeof body.name !== "string") {
    return c.json({ error: "name required" }, 400);
  }

  const { data, error } = await serviceRoleClient
    .from("campuses")
    .insert({
      organization_id: orgId,
      name: body.name.trim(),
      address: body.address ?? null,
      timezone: body.timezone ?? "Asia/Karachi",
    })
    .select()
    .single();
  if (error) {
    if ((error as any).code === "23505") {
      return c.json({ error: "a campus with this name already exists" }, 409);
    }
    return c.json({ error: error.message }, 500);
  }
  return c.json(data, 201);
});

// -----------------------------------------------------------------------------
// GET /school/organizations/:orgId/campuses
// -----------------------------------------------------------------------------
school.get("/organizations/:orgId/campuses", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { data, error } = await serviceRoleClient
    .from("campuses")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

// -----------------------------------------------------------------------------
// POST /school/organizations/:orgId/academic-years
// Body: { name: string, startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', isCurrent?: boolean }
// -----------------------------------------------------------------------------
school.post("/organizations/:orgId/academic-years", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!body?.name || !body?.startDate || !body?.endDate) {
    return c.json({ error: "name, startDate, endDate required" }, 400);
  }

  // If isCurrent, first clear any existing is_current for this org so the
  // partial unique index doesn't fight us.
  if (body.isCurrent === true) {
    await serviceRoleClient
      .from("academic_years")
      .update({ is_current: false })
      .eq("organization_id", orgId)
      .eq("is_current", true);
  }

  const { data, error } = await serviceRoleClient
    .from("academic_years")
    .insert({
      organization_id: orgId,
      name: body.name,
      start_date: body.startDate,
      end_date: body.endDate,
      is_current: body.isCurrent === true,
    })
    .select()
    .single();
  if (error) {
    if ((error as any).code === "23505") {
      return c.json({ error: "academic year with this name already exists" }, 409);
    }
    return c.json({ error: error.message }, 500);
  }
  return c.json(data, 201);
});

// -----------------------------------------------------------------------------
// GET /school/organizations/:orgId/academic-years
// -----------------------------------------------------------------------------
school.get("/organizations/:orgId/academic-years", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { data, error } = await serviceRoleClient
    .from("academic_years")
    .select("*")
    .eq("organization_id", orgId)
    .order("start_date", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

// -----------------------------------------------------------------------------
// POST /school/classes
// Body: {
//   organizationId, campusId, academicYearId,
//   name, gradeLevel?, section?, track: 'mainstream'|'hifz'|'hybrid',
//   classTeacherUserId?
// }
// -----------------------------------------------------------------------------
school.post("/classes", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const { organizationId, campusId, academicYearId, name, gradeLevel, section, track, classTeacherUserId } = body || {};
  if (!organizationId || !campusId || !academicYearId || !name || !track) {
    return c.json(
      { error: "organizationId, campusId, academicYearId, name, track required" },
      400,
    );
  }
  if (!["mainstream", "hifz", "hybrid"].includes(track)) {
    return c.json({ error: "track must be one of: mainstream, hifz, hybrid" }, 400);
  }

  if (!(await isPrincipalOf(userId, organizationId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { data, error } = await serviceRoleClient
    .from("classes")
    .insert({
      organization_id: organizationId,
      campus_id: campusId,
      academic_year_id: academicYearId,
      name,
      grade_level: gradeLevel ?? null,
      section: section ?? null,
      track,
      class_teacher_id: classTeacherUserId ?? null,
    })
    .select()
    .single();
  if (error) {
    if ((error as any).code === "23505") {
      return c.json({ error: "a class with this name already exists for the year" }, 409);
    }
    return c.json({ error: error.message }, 500);
  }

  // If a class teacher was given, also write the teacher role grant so they
  // can see the class. This is the "one place to bootstrap a teacher" path.
  if (classTeacherUserId) {
    await serviceRoleClient.from("user_roles").insert({
      user_id: classTeacherUserId,
      role_type: "teacher",
      scope_type: "class",
      scope_id: data.id,
      granted_by: userId,
    });
  }

  return c.json(data, 201);
});

// -----------------------------------------------------------------------------
// GET /school/organizations/:orgId/classes?campusId=&academicYearId=
// -----------------------------------------------------------------------------
school.get("/organizations/:orgId/classes", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const campusId = c.req.query("campusId");
  const academicYearId = c.req.query("academicYearId");

  let query = serviceRoleClient
    .from("classes")
    .select("*")
    .eq("organization_id", orgId);
  if (campusId) query = query.eq("campus_id", campusId);
  if (academicYearId) query = query.eq("academic_year_id", academicYearId);

  const { data, error } = await query.order("name");
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

// -----------------------------------------------------------------------------
// GET /school/classes/:classId
// Returns class + subjects + roster (active enrollments → child names).
// Accessible to: principal of the org, OR teacher of this class.
// -----------------------------------------------------------------------------
school.get("/classes/:classId", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  const { data: cls, error: clsErr } = await serviceRoleClient
    .from("classes")
    .select("*")
    .eq("id", classId)
    .maybeSingle();
  if (clsErr) return c.json({ error: clsErr.message }, 500);
  if (!cls) return c.json({ error: "not found" }, 404);

  // Authorization: principal of org OR teacher of this class
  const principalAllowed = await isPrincipalOf(userId, cls.organization_id);
  const teacherAllowed = principalAllowed ? true : await hasRole(userId, "teacher", "class", classId);
  if (!principalAllowed && !teacherAllowed) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [subjects, roster] = await Promise.all([
    serviceRoleClient
      .from("subjects")
      .select("id, name, teacher_id, sort_order")
      .eq("class_id", classId)
      .order("sort_order"),
    serviceRoleClient
      .from("enrollments")
      .select("id, child_id, enrolled_at, children:child_id(id, name, avatar, current_points)")
      .eq("class_id", classId)
      .is("withdrawn_at", null),
  ]);

  return c.json({
    class: cls,
    subjects: subjects.data ?? [],
    roster: (roster.data ?? []).map((e: any) => ({
      enrollmentId: e.id,
      enrolledAt: e.enrolled_at,
      child: e.children,
    })),
  });
});

// -----------------------------------------------------------------------------
// (Legacy POST /school/classes/:classId/subjects removed — Phase 1C handler
// in installSubjects() now owns this route and works against the new
// class_subject schema. The legacy handler was registered earlier in the
// chain, so Hono's first-match-wins ordering was shadowing the new one
// and returning 'class not found' because the legacy code queried the
// retired `classes` plural table.)
// -----------------------------------------------------------------------------

// =============================================================================
// STUDENT ENROLLMENT & PARENT INVITES
// =============================================================================
// The enrollment flow has two halves:
//
//   1. School-side: principal/teacher creates a Student record. This creates
//      both a `children` row AND a "virtual" `families` row for the student
//      so the ledger model stays consistent. The family is "school-only"
//      until a parent claims it via an invite code. Once claimed, the
//      virtual family is converted to a real family with the parent as
//      owner.
//
//   2. Parent-side: parent uses the invite code to (a) link their existing
//      family to the student record (preferred), OR (b) accept the
//      virtual family as their own. After acceptance, both the parent and
//      the school see the same child, write to the same point_events
//      ledger, with `source='home'` vs `source='school'` distinguishing
//      attribution.
// =============================================================================


// Generates a short, human-friendly invite code: 8 chars, mixed-case
// alphanumeric, no ambiguous chars (0/O, 1/I/l).
function generateInviteCode(): string {
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// -----------------------------------------------------------------------------
// POST /school/classes/:classId/students
// Body: {
//   name: string,
//   dateOfBirth?: 'YYYY-MM-DD',
//   avatar?: string,
//   generateParentInvite?: boolean   // default true
// }
// Creates a virtual family + child + enrollment. Optionally creates a
// parent invite code so a parent can later claim the child into their
// real family.
//
// Authorization: principal of the class's org, OR teacher of this class.
// -----------------------------------------------------------------------------
school.post("/classes/:classId/students", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!body?.name || typeof body.name !== "string") {
    return c.json({ error: "name required" }, 400);
  }

  // Resolve the class to check authorization + get the org_id for the virtual family
  const { data: cls, error: clsErr } = await serviceRoleClient
    .from("classes")
    .select("id, organization_id, name")
    .eq("id", classId)
    .maybeSingle();
  if (clsErr) return c.json({ error: clsErr.message }, 500);
  if (!cls) return c.json({ error: "class not found" }, 404);

  const callerIsPrincipal = await isPrincipalOf(userId, cls.organization_id);
  const callerIsTeacher = callerIsPrincipal
    ? true
    : await hasRole(userId, "teacher", "class", classId);
  if (!callerIsPrincipal && !callerIsTeacher) {
    return c.json({ error: "forbidden" }, 403);
  }

  // Create the virtual family. Naming: "<student> (Iqra Academy)" so it's
  // clear in admin views these are school-created. The parent renames it
  // upon claiming.
  const { data: family, error: familyErr } = await serviceRoleClient
    .from("families")
    .insert({
      name: `${body.name} (school-pending)`,
      timezone: "Asia/Karachi",
    })
    .select()
    .single();
  if (familyErr) return c.json({ error: "could not create family", details: familyErr.message }, 500);

  // Create the child
  const { data: child, error: childErr } = await serviceRoleClient
    .from("children")
    .insert({
      family_id: family.id,
      name: body.name.trim(),
      avatar: body.avatar ?? null,
      date_of_birth: body.dateOfBirth ?? null,
    })
    .select()
    .single();
  if (childErr) {
    // Roll back the family
    await serviceRoleClient.from("families").delete().eq("id", family.id);
    return c.json({ error: "could not create child", details: childErr.message }, 500);
  }

  // Create enrollment
  const { data: enrollment, error: enrollErr } = await serviceRoleClient
    .from("enrollments")
    .insert({
      class_id: classId,
      child_id: child.id,
    })
    .select()
    .single();
  if (enrollErr) {
    return c.json({ error: "could not enroll child", details: enrollErr.message }, 500);
  }

  // Optionally generate an invite code
  let invite = null;
  if (body.generateParentInvite !== false) {
    const code = generateInviteCode();
    const { data: inv, error: invErr } = await serviceRoleClient
      .from("parent_invites")
      .insert({
        invite_code: code,
        child_id: child.id,
        created_by: userId,
        // Invites valid for 90 days by default
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (!invErr) invite = inv;
  }

  return c.json(
    {
      child,
      enrollment,
      invite,
      // The frontend can deep-link this — e.g. https://app.example.com/parent/connect?code=ABCD1234
      inviteUrl: invite ? `/parent/connect?code=${invite.invite_code}` : null,
    },
    201,
  );
});


// -----------------------------------------------------------------------------
// POST /school/classes/:classId/students/bulk
// Body: { students: [{ name, dateOfBirth?, avatar? }] }
// Creates many students at once. Useful for the principal's start-of-year
// roster upload. Returns one row per student with the resulting child + invite.
// All-or-nothing: if any single insert fails, the whole batch is rolled back.
// -----------------------------------------------------------------------------
school.post("/classes/:classId/students/bulk", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!Array.isArray(body?.students) || body.students.length === 0) {
    return c.json({ error: "students[] required and non-empty" }, 400);
  }
  if (body.students.length > 200) {
    return c.json({ error: "max 200 students per batch" }, 400);
  }

  const { data: cls, error: clsErr } = await serviceRoleClient
    .from("classes")
    .select("id, organization_id")
    .eq("id", classId)
    .maybeSingle();
  if (clsErr) return c.json({ error: clsErr.message }, 500);
  if (!cls) return c.json({ error: "class not found" }, 404);

  if (!(await isPrincipalOf(userId, cls.organization_id))) {
    return c.json({ error: "forbidden" }, 403);
  }

  // Validate inputs before any insert so we don't half-write
  for (const s of body.students) {
    if (!s?.name || typeof s.name !== "string" || s.name.trim().length === 0) {
      return c.json({ error: "every student needs a non-empty name" }, 400);
    }
  }

  // Note: we don't get true transactional safety via the JS client. We do
  // a best-effort sequential create and report partial success. Frontend
  // should re-upload failures only.
  const results: any[] = [];
  for (const s of body.students) {
    try {
      const { data: family } = await serviceRoleClient
        .from("families")
        .insert({ name: `${s.name} (school-pending)`, timezone: "Asia/Karachi" })
        .select()
        .single();
      const { data: child } = await serviceRoleClient
        .from("children")
        .insert({
          family_id: family.id,
          name: s.name.trim(),
          avatar: s.avatar ?? null,
          date_of_birth: s.dateOfBirth ?? null,
        })
        .select()
        .single();
      await serviceRoleClient
        .from("enrollments")
        .insert({ class_id: classId, child_id: child.id });

      const code = generateInviteCode();
      const { data: invite } = await serviceRoleClient
        .from("parent_invites")
        .insert({
          invite_code: code,
          child_id: child.id,
          created_by: userId,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      results.push({
        ok: true,
        name: child.name,
        childId: child.id,
        familyId: family.id,
        inviteCode: invite?.invite_code,
      });
    } catch (e: any) {
      results.push({ ok: false, name: s.name, error: e?.message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return c.json({ succeeded, failed, results }, 207); // 207 Multi-Status
});


// -----------------------------------------------------------------------------
// POST /school/enrollments/:enrollmentId/withdraw
// Body: { reason?: string }
// Soft-withdraw a student. Their data stays; the enrollment row gets
// withdrawn_at set so the active-roster query excludes them.
// -----------------------------------------------------------------------------
school.post("/enrollments/:enrollmentId/withdraw", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const enrollmentId = c.req.param("enrollmentId");

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body is fine
  }

  // Authorize via the enrollment's class's org
  const { data: enr, error: enrErr } = await serviceRoleClient
    .from("enrollments")
    .select("id, class_id, classes:class_id(organization_id)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (enrErr) return c.json({ error: enrErr.message }, 500);
  if (!enr) return c.json({ error: "enrollment not found" }, 404);

  const orgId = (enr as any).classes?.organization_id;
  if (!orgId) return c.json({ error: "could not resolve class org" }, 500);
  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { data, error } = await serviceRoleClient
    .from("enrollments")
    .update({ withdrawn_at: new Date().toISOString(), withdrawn_reason: body?.reason ?? null })
    .eq("id", enrollmentId)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});


// -----------------------------------------------------------------------------
// GET /school/parent-invites/:code
// Returns the invite + child + class info so the parent app can preview
// before claiming. Does NOT require auth (the code itself is the auth).
// -----------------------------------------------------------------------------
school.get("/parent-invites/:code", async (c) => {
  const code = c.req.param("code");
  const { data: invite, error } = await serviceRoleClient
    .from("parent_invites")
    .select("id, invite_code, child_id, expires_at, consumed_at, children:child_id(id, name, avatar)")
    .eq("invite_code", code)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!invite) return c.json({ error: "invite not found" }, 404);
  if (invite.consumed_at) return c.json({ error: "invite already used" }, 410);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return c.json({ error: "invite expired" }, 410);
  }

  // Find current enrollment + class
  const { data: enrollment } = await serviceRoleClient
    .from("enrollments")
    .select("class_id, classes:class_id(id, name, organization_id, organizations:organization_id(id, name))")
    .eq("child_id", invite.child_id)
    .is("withdrawn_at", null)
    .maybeSingle();

  return c.json({
    inviteCode: invite.invite_code,
    child: (invite as any).children,
    class: (enrollment as any)?.classes,
    expiresAt: invite.expires_at,
  });
});


// -----------------------------------------------------------------------------
// POST /school/parent-invites/:code/accept
// Body: { mergeIntoFamilyId?: uuid, linkToKvChildId?: string }
// The parent (authed) claims the invite.
//   - If mergeIntoFamilyId is provided AND the caller is a member of that
//     family: move the child into that family. The "school-pending"
//     virtual family is deleted.
//   - Otherwise: the caller is added as the owner of the virtual family
//     (renamed to "<child name>'s Family").
//
//   - If linkToKvChildId is ALSO provided (only meaningful in merge mode):
//     record the KV↔Postgres child mapping in child_id_map. This is what
//     lets the family Dashboard fetch school events for an existing KV
//     kid. We accept any non-empty string and trust the caller — they're
//     authenticated and they're choosing which of their own children to
//     link to. If a mapping already exists for that KV id, we leave it
//     and do not error (idempotent claim).
//
// In all cases the school enrollment is unchanged — the child stays
// enrolled, and now has a real parent linkage.
// -----------------------------------------------------------------------------
school.post("/parent-invites/:code/accept", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const code = c.req.param("code");

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body fine
  }

  const { data: invite, error: invErr } = await serviceRoleClient
    .from("parent_invites")
    .select("id, invite_code, child_id, expires_at, consumed_at")
    .eq("invite_code", code)
    .maybeSingle();
  if (invErr) return c.json({ error: invErr.message }, 500);
  if (!invite) return c.json({ error: "invite not found" }, 404);
  if (invite.consumed_at) return c.json({ error: "invite already used" }, 410);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return c.json({ error: "invite expired" }, 410);
  }

  // Fetch the child to know its current (virtual) family
  const { data: child, error: childErr } = await serviceRoleClient
    .from("children")
    .select("id, name, family_id")
    .eq("id", invite.child_id)
    .maybeSingle();
  if (childErr) return c.json({ error: childErr.message }, 500);
  if (!child) return c.json({ error: "child not found" }, 404);

  const mergeTarget = body?.mergeIntoFamilyId;

  if (mergeTarget) {
    // Verify caller is a member of that family
    const { data: membership } = await serviceRoleClient
      .from("family_members")
      .select("id")
      .eq("family_id", mergeTarget)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return c.json({ error: "you are not a member of that family" }, 403);
    }

    const virtualFamilyId = child.family_id;
    // Move the child
    const { error: moveErr } = await serviceRoleClient
      .from("children")
      .update({ family_id: mergeTarget })
      .eq("id", child.id);
    if (moveErr) return c.json({ error: "could not move child", details: moveErr.message }, 500);

    // Delete the now-empty virtual family. Cascades to family_members (none)
    // and any orphan point_events on the virtual family scope (none — children
    // moved). If this fails it's not critical, the virtual family becomes orphan.
    await serviceRoleClient.from("families").delete().eq("id", virtualFamilyId);
  } else {
    // Adopt the virtual family. Rename + add caller as owner.
    await serviceRoleClient
      .from("families")
      .update({ name: `${child.name}'s Family` })
      .eq("id", child.family_id);

    await serviceRoleClient.from("family_members").insert({
      family_id: child.family_id,
      user_id: userId,
      relationship: "parent",
      is_owner: true,
    });

    // Also grant the parent role on this family (so future RLS sees them)
    await serviceRoleClient
      .from("user_roles")
      .insert({
        user_id: userId,
        role_type: "parent",
        scope_type: "family",
        scope_id: child.family_id,
        granted_by: userId,
      })
      .select();
  }

  // Mark invite consumed
  await serviceRoleClient
    .from("parent_invites")
    .update({ consumed_by: userId, consumed_at: new Date().toISOString() })
    .eq("id", invite.id);

  // Record the KV↔Postgres child id mapping. Only meaningful in merge mode
  // because adopt mode just creates a fresh family with no KV counterpart.
  // Idempotent: ON CONFLICT DO NOTHING. If the same KV id was previously
  // mapped to a different Postgres child, we keep the older mapping —
  // safer than silently overwriting.
  let linkedKvChildId: string | null = null;
  if (mergeTarget && typeof body?.linkToKvChildId === "string" && body.linkToKvChildId.trim().length > 0) {
    const kvId = body.linkToKvChildId.trim();
    const { error: mapErr } = await serviceRoleClient
      .from("child_id_map")
      .insert({
        kv_child_id: kvId,
        postgres_child_id: child.id,
        created_by: userId,
      });
    // Postgres error code 23505 = unique_violation. Treat as no-op.
    if (mapErr && (mapErr as any).code !== "23505") {
      console.warn("[school.accept] could not create child_id_map row:", mapErr);
    } else {
      linkedKvChildId = kvId;
    }
  }

  return c.json({
    ok: true,
    childId: child.id,
    familyId: mergeTarget ?? child.family_id,
    mode: mergeTarget ? "merged" : "adopted",
    linkedKvChildId,
  });
});


// -----------------------------------------------------------------------------
// GET /school/classes/:classId/roster
// Convenience endpoint: roster with each student's active invite code (if
// any). Principal can copy/paste codes from here when sending to parents.
// -----------------------------------------------------------------------------
school.get("/classes/:classId/roster", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  const { data: cls } = await serviceRoleClient
    .from("classes")
    .select("organization_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) return c.json({ error: "class not found" }, 404);

  const callerIsPrincipal = await isPrincipalOf(userId, cls.organization_id);
  const callerIsTeacher = callerIsPrincipal
    ? true
    : await hasRole(userId, "teacher", "class", classId);
  if (!callerIsPrincipal && !callerIsTeacher) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { data: enrollments } = await serviceRoleClient
    .from("enrollments")
    .select("id, child_id, enrolled_at, children:child_id(id, name, avatar, current_points, family_id)")
    .eq("class_id", classId)
    .is("withdrawn_at", null);

  if (!enrollments || enrollments.length === 0) {
    return c.json({ classId, students: [] });
  }

  // Fetch active invites for these children
  const childIds = enrollments.map((e: any) => e.child_id);
  const { data: invites } = await serviceRoleClient
    .from("parent_invites")
    .select("invite_code, child_id, expires_at, consumed_at")
    .in("child_id", childIds)
    .is("consumed_at", null);

  const inviteByChild = new Map<string, any>();
  for (const inv of invites ?? []) inviteByChild.set(inv.child_id, inv);

  return c.json({
    classId,
    students: enrollments.map((e: any) => ({
      enrollmentId: e.id,
      enrolledAt: e.enrolled_at,
      child: e.children,
      parentConnected: !inviteByChild.has(e.child_id), // crude: invite consumed OR never created
      activeInvite: inviteByChild.get(e.child_id) ?? null,
    })),
  });
});

// =============================================================================
// HIFZ LOGGING — sabaq, sabaq-para, manzil
// =============================================================================
// The qari's daily surface. Each log:
//   1. Writes a structured row to sabaq_logs / sabaq_para_logs / manzil_logs
//      (used by the progress visualizations — juz bar, manzil due-list).
//   2. ALSO writes a point_event with source='school' so the entry shows
//      in the unified parent+child timeline alongside Salah / behavior.
//
// The two writes are linked: point_events.id is stored on the hifz log row
// (point_event_id FK). If voiding a hifz event later, void the
// point_event; the hifz log row stays for history.
//
// Authorization: any teacher of the child's class, or the org's principal.
// =============================================================================

// Helper — assert the caller can log Hifz for this child
async function canLogHifzFor(userId: string, childId: string): Promise<{
  ok: boolean;
  classId?: string;
  orgId?: string;
  reason?: string;
}> {
  // Find the child's active enrollment
  const { data: enrollment } = await serviceRoleClient
    .from("enrollments")
    .select("class_id, classes:class_id(id, organization_id)")
    .eq("child_id", childId)
    .is("withdrawn_at", null)
    .maybeSingle();
  if (!enrollment) {
    return { ok: false, reason: "child is not enrolled in any school class" };
  }
  const classId = (enrollment as any).class_id;
  const orgId = (enrollment as any).classes?.organization_id;
  if (!orgId) return { ok: false, reason: "could not resolve class org" };

  // Principal of org can do anything
  if (await isPrincipalOf(userId, orgId)) {
    return { ok: true, classId, orgId };
  }
  // Teacher of the child's class can log
  if (await hasRole(userId, "teacher", "class", classId)) {
    return { ok: true, classId, orgId };
  }
  return { ok: false, reason: "you are not a teacher of this student's class" };
}


// Helper — write a school-source point event linked to a Hifz log.
// Returns the inserted point_event id (or null on failure — we treat
// hifz write as primary; ledger write is best-effort but logged).
async function writeHifzPointEvent(args: {
  childId: string;
  loggedBy: string;
  loggedByName: string;
  points: number;
  orgId: string;
  classId: string;
  itemNameSnapshot: string;
  notes?: string;
}): Promise<string | null> {
  const { data, error } = await serviceRoleClient
    .from("point_events")
    .insert({
      child_id: args.childId,
      points: args.points,
      logged_by: args.loggedBy,
      logged_by_name_snapshot: args.loggedByName,
      source: "school",
      source_org_id: args.orgId,
      source_class_id: args.classId,
      item_name_snapshot: args.itemNameSnapshot,
      notes: args.notes ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[school.writeHifzPointEvent] failed:", error);
    return null;
  }
  return data?.id ?? null;
}

// Helper — resolve a friendly name for the caller (snapshotted onto events).
async function resolveCallerName(userId: string): Promise<string> {
  try {
    const { data } = await serviceRoleClient.auth.admin.getUserById(userId);
    return data?.user?.user_metadata?.name || data?.user?.email || "Teacher";
  } catch {
    return "Teacher";
  }
}


// -----------------------------------------------------------------------------
// POST /school/children/:childId/sabaq
// Body: {
//   surahNumber?: number (1..114),
//   ayahStart?: number,
//   ayahEnd?: number,
//   juzNumber?: number,
//   pageNumber?: number,
//   tajweedRating?: number (1..5),
//   notes?: string,
//   points?: number (default 5)
// }
// School chose surah+ayah as their input style during onboarding, but the
// schema supports both so a school that picks juz+page later still works.
// -----------------------------------------------------------------------------
school.post("/children/:childId/sabaq", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const allow = await canLogHifzFor(userId, childId);
  if (!allow.ok) return c.json({ error: "forbidden", reason: allow.reason }, 403);

  // Light validation
  if (body.tajweedRating !== undefined && body.tajweedRating !== null) {
    const r = Number(body.tajweedRating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return c.json({ error: "tajweedRating must be an integer 1..5" }, 400);
    }
  }
  if (body.surahNumber !== undefined && body.surahNumber !== null) {
    const s = Number(body.surahNumber);
    if (!Number.isInteger(s) || s < 1 || s > 114) {
      return c.json({ error: "surahNumber must be 1..114" }, 400);
    }
  }

  const points = Number.isInteger(body.points) ? body.points : 5;
  const callerName = await resolveCallerName(userId);

  // Build a human-readable item name snapshot for the audit trail.
  // e.g. "Sabaq · Al-Baqarah 100–110" — if we have surah/ayah, format it;
  // otherwise fall back to "Sabaq".
  let label = "Sabaq";
  if (body.surahNumber && body.ayahStart) {
    label = `Sabaq · Surah ${body.surahNumber}, ${body.ayahStart}${
      body.ayahEnd && body.ayahEnd !== body.ayahStart ? `–${body.ayahEnd}` : ""
    }`;
  } else if (body.juzNumber && body.pageNumber) {
    label = `Sabaq · Juz ${body.juzNumber}, page ${body.pageNumber}`;
  }

  // 1. Write the point event first so the FK on sabaq_logs is satisfiable
  const pointEventId = await writeHifzPointEvent({
    childId,
    loggedBy: userId,
    loggedByName: callerName,
    points,
    orgId: allow.orgId!,
    classId: allow.classId!,
    itemNameSnapshot: label,
    notes: body.notes,
  });

  // 2. Write the structured sabaq log
  const { data, error } = await serviceRoleClient
    .from("sabaq_logs")
    .insert({
      child_id: childId,
      logged_by: userId,
      point_event_id: pointEventId,
      surah_number: body.surahNumber ?? null,
      ayah_start: body.ayahStart ?? null,
      ayah_end: body.ayahEnd ?? null,
      juz_number: body.juzNumber ?? null,
      page_number: body.pageNumber ?? null,
      tajweed_rating: body.tajweedRating ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);

  // 3. Bump the child's currentPoints aggregate (best-effort).
  // TODO: convert to a Postgres trigger on point_events so this is atomic.
  if (points) {
    const { data: child } = await serviceRoleClient
      .from("children")
      .select("current_points")
      .eq("id", childId)
      .maybeSingle();
    if (child) {
      await serviceRoleClient
        .from("children")
        .update({ current_points: (child.current_points ?? 0) + points })
        .eq("id", childId);
    }
  }

  return c.json({ sabaqLog: data, pointEventId, awardedPoints: points }, 201);
});


// -----------------------------------------------------------------------------
// POST /school/children/:childId/sabaq-para
// Body: {
//   coversFromSabaqId?: uuid,
//   coversToSabaqId?: uuid,
//   qualityRating?: number (1..5),
//   notes?: string,
//   points?: number (default 3)
// }
// -----------------------------------------------------------------------------
school.post("/children/:childId/sabaq-para", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const allow = await canLogHifzFor(userId, childId);
  if (!allow.ok) return c.json({ error: "forbidden", reason: allow.reason }, 403);

  if (body.qualityRating !== undefined && body.qualityRating !== null) {
    const r = Number(body.qualityRating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return c.json({ error: "qualityRating must be 1..5" }, 400);
    }
  }

  const points = Number.isInteger(body.points) ? body.points : 3;
  const callerName = await resolveCallerName(userId);

  const pointEventId = await writeHifzPointEvent({
    childId,
    loggedBy: userId,
    loggedByName: callerName,
    points,
    orgId: allow.orgId!,
    classId: allow.classId!,
    itemNameSnapshot: "Sabaq-para revision",
    notes: body.notes,
  });

  const { data, error } = await serviceRoleClient
    .from("sabaq_para_logs")
    .insert({
      child_id: childId,
      logged_by: userId,
      point_event_id: pointEventId,
      covers_from_sabaq_id: body.coversFromSabaqId ?? null,
      covers_to_sabaq_id: body.coversToSabaqId ?? null,
      quality_rating: body.qualityRating ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);

  if (points) {
    const { data: child } = await serviceRoleClient
      .from("children").select("current_points").eq("id", childId).maybeSingle();
    if (child) {
      await serviceRoleClient
        .from("children")
        .update({ current_points: (child.current_points ?? 0) + points })
        .eq("id", childId);
    }
  }

  return c.json({ sabaqParaLog: data, pointEventId, awardedPoints: points }, 201);
});


// -----------------------------------------------------------------------------
// POST /school/children/:childId/manzil
// Body: {
//   manzilNumber: number (1..7),
//   qualityRating?: number (1..5),
//   notes?: string,
//   points?: number (default 4)
// }
// -----------------------------------------------------------------------------
school.post("/children/:childId/manzil", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const allow = await canLogHifzFor(userId, childId);
  if (!allow.ok) return c.json({ error: "forbidden", reason: allow.reason }, 403);

  const m = Number(body.manzilNumber);
  if (!Number.isInteger(m) || m < 1 || m > 7) {
    return c.json({ error: "manzilNumber must be 1..7" }, 400);
  }
  if (body.qualityRating !== undefined && body.qualityRating !== null) {
    const r = Number(body.qualityRating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return c.json({ error: "qualityRating must be 1..5" }, 400);
    }
  }

  const points = Number.isInteger(body.points) ? body.points : 4;
  const callerName = await resolveCallerName(userId);

  const pointEventId = await writeHifzPointEvent({
    childId,
    loggedBy: userId,
    loggedByName: callerName,
    points,
    orgId: allow.orgId!,
    classId: allow.classId!,
    itemNameSnapshot: `Manzil ${m}`,
    notes: body.notes,
  });

  const { data, error } = await serviceRoleClient
    .from("manzil_logs")
    .insert({
      child_id: childId,
      logged_by: userId,
      point_event_id: pointEventId,
      manzil_number: m,
      quality_rating: body.qualityRating ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);

  if (points) {
    const { data: child } = await serviceRoleClient
      .from("children").select("current_points").eq("id", childId).maybeSingle();
    if (child) {
      await serviceRoleClient
        .from("children")
        .update({ current_points: (child.current_points ?? 0) + points })
        .eq("id", childId);
    }
  }

  return c.json({ manzilLog: data, pointEventId, awardedPoints: points }, 201);
});


// -----------------------------------------------------------------------------
// GET /school/children/:childId/hifz
// Returns:
//   - sabaqLogs: last 30 sabaqs (most recent first)
//   - sabaqParaLogs: last 10
//   - manzilLogs: last per-manzil (one each, freshest)
//   - manzilStatus: for each of 7 manzils, daysSinceLastReview
//   - currentStreak: consecutive days of any sabaq logged
//
// Accessible to: principal of org, teacher of child's class, OR any family
// member of the child's family (parent view).
// -----------------------------------------------------------------------------
school.get("/children/:childId/hifz", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  // Authorization: family member OR (principal/teacher of the child's class)
  const { data: child } = await serviceRoleClient
    .from("children")
    .select("id, name, family_id, hifz_progress")
    .eq("id", childId)
    .maybeSingle();
  if (!child) return c.json({ error: "child not found" }, 404);

  let allowed = false;

  // Family member check
  const { data: fam } = await serviceRoleClient
    .from("family_members")
    .select("id")
    .eq("family_id", child.family_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (fam) allowed = true;

  // School-side check
  if (!allowed) {
    const allow = await canLogHifzFor(userId, childId);
    if (allow.ok) allowed = true;
  }

  if (!allowed) return c.json({ error: "forbidden" }, 403);

  // Pull logs
  const [sabaqRes, sabaqParaRes, manzilRes] = await Promise.all([
    serviceRoleClient
      .from("sabaq_logs")
      .select("*")
      .eq("child_id", childId)
      .order("logged_at", { ascending: false })
      .limit(30),
    serviceRoleClient
      .from("sabaq_para_logs")
      .select("*")
      .eq("child_id", childId)
      .order("logged_at", { ascending: false })
      .limit(10),
    serviceRoleClient
      .from("manzil_logs")
      .select("*")
      .eq("child_id", childId)
      .order("logged_at", { ascending: false }),
  ]);

  // Per-manzil freshest = last review date by manzil_number
  const manzilFreshest: Record<number, string | null> = {};
  for (let i = 1; i <= 7; i++) manzilFreshest[i] = null;
  for (const m of manzilRes.data ?? []) {
    const n = (m as any).manzil_number as number;
    if (manzilFreshest[n] === null) manzilFreshest[n] = (m as any).logged_at;
  }
  const now = Date.now();
  const manzilStatus = Object.entries(manzilFreshest).map(([n, last]) => ({
    manzilNumber: Number(n),
    lastReviewedAt: last,
    daysSinceLastReview: last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null,
  }));

  // Streak: count consecutive days ending today that have at least one sabaq.
  const dayKeys = new Set<string>();
  for (const s of sabaqRes.data ?? []) {
    const d = new Date((s as any).logged_at);
    dayKeys.add(d.toISOString().slice(0, 10));
  }
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const k = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (dayKeys.has(k)) streak += 1;
    else break;
  }

  return c.json({
    child: { id: child.id, name: child.name, hifzProgress: child.hifz_progress },
    sabaqLogs: sabaqRes.data ?? [],
    sabaqParaLogs: sabaqParaRes.data ?? [],
    manzilLogs: manzilRes.data ?? [],
    manzilStatus,
    currentStreak: streak,
  });
});


// -----------------------------------------------------------------------------
// POST /school/point-events/:id/void  — void a school-side event
// Body: { reason: string (>=10 chars) }
// Mirror of the existing parent void flow but scoped to school events.
// Reverses points on the child.
// -----------------------------------------------------------------------------
school.post("/point-events/:id/void", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const eventId = c.req.param("id");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body?.reason !== "string" || body.reason.trim().length < 10) {
    return c.json({ error: "reason of at least 10 characters required" }, 400);
  }

  const { data: ev, error: evErr } = await serviceRoleClient
    .from("point_events")
    .select("id, child_id, points, status, source, source_org_id, source_class_id")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr) return c.json({ error: evErr.message }, 500);
  if (!ev) return c.json({ error: "event not found" }, 404);
  if (ev.source !== "school") {
    return c.json({ error: "this endpoint voids school events only" }, 400);
  }
  if (ev.status === "voided") {
    return c.json({ error: "already voided" }, 409);
  }

  const callerIsPrincipal = ev.source_org_id
    ? await isPrincipalOf(userId, ev.source_org_id)
    : false;
  const callerIsTeacher = ev.source_class_id
    ? await hasRole(userId, "teacher", "class", ev.source_class_id)
    : false;
  if (!callerIsPrincipal && !callerIsTeacher) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { error: updErr } = await serviceRoleClient
    .from("point_events")
    .update({
      status: "voided",
      voided_by: userId,
      voided_at: new Date().toISOString(),
      void_reason: body.reason.trim(),
    })
    .eq("id", eventId);
  if (updErr) return c.json({ error: updErr.message }, 500);

  // Reverse points on child (best-effort)
  const { data: child } = await serviceRoleClient
    .from("children")
    .select("current_points")
    .eq("id", ev.child_id)
    .maybeSingle();
  if (child) {
    const newPoints = Math.max(0, (child.current_points ?? 0) - ev.points);
    await serviceRoleClient.from("children").update({ current_points: newPoints }).eq("id", ev.child_id);
  }

  return c.json({ ok: true });
});

// =============================================================================
// BEHAVIOR CATALOG (school-wide, principal-managed) + BEHAVIOR LOGGING
// =============================================================================
// Decision per spec §10: school-wide catalog, principal-approved. Class
// teachers cannot add custom behaviors in v1 — they request the principal.
// =============================================================================

// -----------------------------------------------------------------------------
// POST /school/organizations/:orgId/behavior-catalog
// Body: {
//   name: string,
//   kind: 'positive' | 'negative',
//   points: number,            // sign auto-corrected to match kind
//   category?: string,
//   tier?: 'minor' | 'moderate' | 'major',
//   dedupeWindowMin?: number,  // default 15 for negative, none for positive
// }
// -----------------------------------------------------------------------------
school.post("/organizations/:orgId/behavior-catalog", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  if (!(await isPrincipalOf(userId, orgId))) {
    return c.json({ error: "forbidden" }, 403);
  }

  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON body" }, 400); }
  if (!body?.name || typeof body.name !== "string") return c.json({ error: "name required" }, 400);
  if (!["positive", "negative"].includes(body.kind)) return c.json({ error: "kind must be positive|negative" }, 400);
  if (typeof body.points !== "number") return c.json({ error: "points must be a number" }, 400);

  // Auto-correct sign to match kind so the UI doesn't have to police it
  let points = Math.abs(body.points);
  if (body.kind === "negative") points = -points;

  const dedupeWindow = body.dedupeWindowMin ?? (body.kind === "negative" ? 15 : null);

  const { data, error } = await serviceRoleClient
    .from("trackable_items")
    .insert({
      owner_type: "organization",
      owner_id: orgId,
      name: body.name.trim(),
      kind: body.kind,
      category: body.category ?? null,
      points,
      tier: body.tier ?? null,
      dedupe_window_min: dedupeWindow,
      is_singleton: false,
      is_religious: false,
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

// -----------------------------------------------------------------------------
// GET /school/organizations/:orgId/behavior-catalog
// -----------------------------------------------------------------------------
school.get("/organizations/:orgId/behavior-catalog", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const orgId = c.req.param("orgId");

  // Any role on this org can read the catalog (teachers need to log against it)
  const principal = await isPrincipalOf(userId, orgId);
  let allowed = principal;
  if (!allowed) {
    // Cheap check: is the user a teacher anywhere in this org?
    const { data: teacherClasses } = await serviceRoleClient
      .from("user_roles")
      .select("scope_id, classes:scope_id(organization_id)")
      .eq("user_id", userId)
      .eq("role_type", "teacher")
      .eq("scope_type", "class")
      .is("revoked_at", null);
    if ((teacherClasses ?? []).some((r: any) => r.classes?.organization_id === orgId)) {
      allowed = true;
    }
  }
  if (!allowed) return c.json({ error: "forbidden" }, 403);

  const { data, error } = await serviceRoleClient
    .from("trackable_items")
    .select("*")
    .eq("owner_type", "organization")
    .eq("owner_id", orgId)
    .eq("active", true)
    .order("kind")
    .order("name");
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

// -----------------------------------------------------------------------------
// POST /school/children/:childId/behavior
// Body: { trackableItemId: uuid, notes?: string }
// Logs a behavior catalog item against a child. Points come from the
// catalog row (with sign already correct). Writes point_event with
// source='school' AND child's current_points is bumped.
// -----------------------------------------------------------------------------
school.post("/children/:childId/behavior", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON body" }, 400); }
  if (!body?.trackableItemId) return c.json({ error: "trackableItemId required" }, 400);

  // Authorize: principal of child's org OR teacher of child's class
  const allow = await canLogHifzFor(userId, childId); // same auth pattern works
  if (!allow.ok) return c.json({ error: "forbidden", reason: allow.reason }, 403);

  // Fetch the catalog item, validate it belongs to this org
  const { data: item, error: itemErr } = await serviceRoleClient
    .from("trackable_items")
    .select("*")
    .eq("id", body.trackableItemId)
    .maybeSingle();
  if (itemErr) return c.json({ error: itemErr.message }, 500);
  if (!item) return c.json({ error: "behavior catalog item not found" }, 404);
  if (item.owner_type !== "organization" || item.owner_id !== allow.orgId) {
    return c.json({ error: "this catalog item does not belong to your school" }, 400);
  }
  if (!item.active) return c.json({ error: "catalog item is inactive" }, 400);

  // Dedupe check: if item has a dedupe window, check for recent same-item event on this child
  if (item.dedupe_window_min) {
    const cutoff = new Date(Date.now() - item.dedupe_window_min * 60_000).toISOString();
    const { data: recent } = await serviceRoleClient
      .from("point_events")
      .select("id")
      .eq("child_id", childId)
      .eq("trackable_item_id", item.id)
      .eq("status", "active")
      .gte("occurred_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      return c.json({
        error: "duplicate_window",
        message: `"${item.name}" already logged within the last ${item.dedupe_window_min} minutes`,
      }, 409);
    }
  }

  const callerName = await resolveCallerName(userId);
  const { data: ev, error: evErr } = await serviceRoleClient
    .from("point_events")
    .insert({
      child_id: childId,
      trackable_item_id: item.id,
      item_name_snapshot: item.name,
      points: item.points,
      logged_by: userId,
      logged_by_name_snapshot: callerName,
      source: "school",
      source_org_id: allow.orgId,
      source_class_id: allow.classId,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (evErr) return c.json({ error: evErr.message }, 500);

  // Bump child points
  const { data: child } = await serviceRoleClient
    .from("children").select("current_points").eq("id", childId).maybeSingle();
  if (child) {
    const newPoints = Math.max(0, (child.current_points ?? 0) + item.points);
    await serviceRoleClient.from("children").update({ current_points: newPoints }).eq("id", childId);
  }

  return c.json(ev, 201);
});

// =============================================================================
// SALAH LOGGING (school)
// =============================================================================

const VALID_PRAYERS = ["Fajr", "Zuhr", "Asr", "Maghrib", "Isha"] as const;
type PrayerName = typeof VALID_PRAYERS[number];

// Compute points for a salah log given the org's policy.
// Default: ontime = +2, qadha = +1, missed = -1. Org settings override.
async function salahPointsFor(orgId: string, state: "ontime" | "qadha" | "missed"): Promise<number> {
  const { data: org } = await serviceRoleClient
    .from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const settings = (org as any)?.settings ?? {};
  if (state === "qadha") return settings.salahQadhaPoints ?? 1;
  if (state === "missed") return settings.salahMissedPoints ?? -1;
  return settings.salahOntimePoints ?? 2;
}

// One Salah per child per day per prayer (singleton). Check via existing
// point_event with same item_name_snapshot prefix.
async function alreadyLoggedSalahToday(childId: string, prayer: PrayerName): Promise<boolean> {
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data } = await serviceRoleClient
    .from("point_events")
    .select("id")
    .eq("child_id", childId)
    .eq("status", "active")
    .ilike("item_name_snapshot", `Salah · ${prayer}%`)
    .gte("occurred_at", todayStart.toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

// -----------------------------------------------------------------------------
// POST /school/children/:childId/salah
// Body: { prayer: 'Fajr'|'Zuhr'|'Asr'|'Maghrib'|'Isha', state: 'ontime'|'qadha'|'missed', notes? }
// -----------------------------------------------------------------------------
school.post("/children/:childId/salah", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON body" }, 400); }
  if (!VALID_PRAYERS.includes(body.prayer)) {
    return c.json({ error: `prayer must be one of: ${VALID_PRAYERS.join(", ")}` }, 400);
  }
  if (!["ontime", "qadha", "missed"].includes(body.state)) {
    return c.json({ error: "state must be ontime|qadha|missed" }, 400);
  }

  const allow = await canLogHifzFor(userId, childId);
  if (!allow.ok) return c.json({ error: "forbidden", reason: allow.reason }, 403);

  if (await alreadyLoggedSalahToday(childId, body.prayer)) {
    return c.json({ error: "salah_already_logged_today", prayer: body.prayer }, 409);
  }

  const points = await salahPointsFor(allow.orgId!, body.state);
  const stateLabel = body.state === "ontime" ? "On time" : body.state === "qadha" ? "Qadha" : "Missed";
  const callerName = await resolveCallerName(userId);

  const { data, error } = await serviceRoleClient
    .from("point_events")
    .insert({
      child_id: childId,
      item_name_snapshot: `Salah · ${body.prayer} (${stateLabel})`,
      points,
      logged_by: userId,
      logged_by_name_snapshot: callerName,
      source: "school",
      source_org_id: allow.orgId,
      source_class_id: allow.classId,
      salah_state: body.state,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);

  // Bump child points
  const { data: child } = await serviceRoleClient
    .from("children").select("current_points").eq("id", childId).maybeSingle();
  if (child) {
    const newPoints = Math.max(0, (child.current_points ?? 0) + points);
    await serviceRoleClient.from("children").update({ current_points: newPoints }).eq("id", childId);
  }

  return c.json({ pointEvent: data, awardedPoints: points }, 201);
});

// -----------------------------------------------------------------------------
// POST /school/classes/:classId/salah/bulk
// Body: {
//   prayer: 'Fajr'|...,
//   defaultState: 'ontime'|'qadha'|'missed',
//   overrides?: { [childId]: 'ontime'|'qadha'|'missed' }
// }
// Class teacher logs the same prayer for the whole roster in one call.
// Default state applies to everyone; overrides per child override.
// -----------------------------------------------------------------------------
school.post("/classes/:classId/salah/bulk", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON body" }, 400); }
  if (!VALID_PRAYERS.includes(body.prayer)) {
    return c.json({ error: `prayer must be one of: ${VALID_PRAYERS.join(", ")}` }, 400);
  }
  if (!["ontime", "qadha", "missed"].includes(body.defaultState)) {
    return c.json({ error: "defaultState must be ontime|qadha|missed" }, 400);
  }

  const { data: cls } = await serviceRoleClient
    .from("classes").select("organization_id").eq("id", classId).maybeSingle();
  if (!cls) return c.json({ error: "class not found" }, 404);

  const isPrincipal = await isPrincipalOf(userId, cls.organization_id);
  const isTeacher = isPrincipal ? true : await hasRole(userId, "teacher", "class", classId);
  if (!isPrincipal && !isTeacher) return c.json({ error: "forbidden" }, 403);

  // Get roster
  const { data: enrollments } = await serviceRoleClient
    .from("enrollments")
    .select("child_id")
    .eq("class_id", classId)
    .is("withdrawn_at", null);
  if (!enrollments || enrollments.length === 0) {
    return c.json({ message: "no students enrolled", logged: 0 });
  }

  const callerName = await resolveCallerName(userId);
  const overrides = body.overrides ?? {};
  const orgId = cls.organization_id;

  const results: any[] = [];
  for (const e of enrollments) {
    const childId = (e as any).child_id;
    const state = overrides[childId] ?? body.defaultState;
    const stateLabel = state === "ontime" ? "On time" : state === "qadha" ? "Qadha" : "Missed";

    if (await alreadyLoggedSalahToday(childId, body.prayer)) {
      results.push({ childId, skipped: true, reason: "already logged today" });
      continue;
    }

    const points = await salahPointsFor(orgId, state);
    const { data: ev, error } = await serviceRoleClient
      .from("point_events")
      .insert({
        child_id: childId,
        item_name_snapshot: `Salah · ${body.prayer} (${stateLabel})`,
        points,
        logged_by: userId,
        logged_by_name_snapshot: callerName,
        source: "school",
        source_org_id: orgId,
        source_class_id: classId,
        salah_state: state,
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (error) {
      results.push({ childId, ok: false, error: error.message });
      continue;
    }

    const { data: child } = await serviceRoleClient
      .from("children").select("current_points").eq("id", childId).maybeSingle();
    if (child) {
      await serviceRoleClient
        .from("children")
        .update({ current_points: Math.max(0, (child.current_points ?? 0) + points) })
        .eq("id", childId);
    }
    results.push({ childId, ok: true, eventId: ev.id, points });
  }

  const ok = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.ok === false).length;
  return c.json({ prayer: body.prayer, ok, skipped, failed, results }, 207);
});

// -----------------------------------------------------------------------------
// POST /school/classes/:classId/attendance
// Body: { date: 'YYYY-MM-DD', records: [{ childId, status, lateMinutes?, reason? }] }
// Records attendance for a class day. One row per child per day (unique
// constraint). Re-running on same date upserts.
// -----------------------------------------------------------------------------
school.post("/classes/:classId/attendance", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON body" }, 400); }
  if (!body?.date || !Array.isArray(body?.records)) {
    return c.json({ error: "date + records[] required" }, 400);
  }

  const { data: cls } = await serviceRoleClient
    .from("classes").select("organization_id").eq("id", classId).maybeSingle();
  if (!cls) return c.json({ error: "class not found" }, 404);

  const isPrincipal = await isPrincipalOf(userId, cls.organization_id);
  const isTeacher = isPrincipal ? true : await hasRole(userId, "teacher", "class", classId);
  if (!isPrincipal && !isTeacher) return c.json({ error: "forbidden" }, 403);

  const valid = ["present", "late", "absent", "present_remote"];
  const upserts: any[] = [];
  for (const r of body.records) {
    if (!valid.includes(r.status)) {
      return c.json({ error: `invalid status for child ${r.childId}: ${r.status}` }, 400);
    }
    if (r.status === "absent" && (!r.reason || typeof r.reason !== "string")) {
      return c.json({ error: `absent requires a reason for child ${r.childId}` }, 400);
    }
    upserts.push({
      child_id: r.childId,
      class_id: classId,
      attendance_date: body.date,
      status: r.status,
      late_minutes: r.lateMinutes ?? null,
      reason: r.reason ?? null,
      recorded_by: userId,
    });
  }

  const { data, error } = await serviceRoleClient
    .from("school_attendance")
    .upsert(upserts, { onConflict: "child_id,attendance_date" })
    .select();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ recorded: data?.length ?? 0, records: data });
});

// -----------------------------------------------------------------------------
// GET /school/children/:childId/events
// Returns the school-source point_events for a child, newest first.
// This is what the family Dashboard uses to render school activity
// alongside home-source events in the unified parent timeline.
//
// Visible to:
//   - Family members of the child (parent view — the main use case)
//   - Principal of the child's org
//   - Teacher of the child's class
// Backend authorization mirrors the /hifz endpoint.
//
// Query params:
//   limit (default 50, max 200)
//   sinceIso  (optional, returns only events after this timestamp)
//   includeVoided (default false)
// -----------------------------------------------------------------------------
school.get("/children/:childId/events", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.param("childId");

  // Authorization: family member OR school role for this child
  const { data: child } = await serviceRoleClient
    .from("children")
    .select("id, family_id")
    .eq("id", childId)
    .maybeSingle();
  if (!child) return c.json({ error: "child not found" }, 404);

  let allowed = false;
  const { data: fam } = await serviceRoleClient
    .from("family_members")
    .select("id")
    .eq("family_id", child.family_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (fam) allowed = true;
  if (!allowed) {
    const allow = await canLogHifzFor(userId, childId);
    if (allow.ok) allowed = true;
  }
  if (!allowed) return c.json({ error: "forbidden" }, 403);

  const limitParam = parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Math.min(Math.max(limitParam || 50, 1), 200);
  const sinceIso = c.req.query("sinceIso");
  const includeVoided = c.req.query("includeVoided") === "true";

  let query = serviceRoleClient
    .from("point_events")
    .select(
      "id, points, item_name_snapshot, logged_by_name_snapshot, source, source_org_id, source_class_id, source_subject_id, salah_state, notes, status, voided_at, void_reason, occurred_at, " +
        "organizations:source_org_id(id, name), classes:source_class_id(id, name)",
    )
    .eq("child_id", childId)
    .eq("source", "school")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (!includeVoided) query = query.eq("status", "active");
  if (sinceIso) query = query.gte("occurred_at", sinceIso);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    childId,
    events: (data ?? []).map((e: any) => ({
      id: e.id,
      points: e.points,
      itemName: e.item_name_snapshot,
      loggedByName: e.logged_by_name_snapshot,
      source: e.source,
      orgId: e.source_org_id,
      orgName: e.organizations?.name ?? null,
      classId: e.source_class_id,
      className: e.classes?.name ?? null,
      salahState: e.salah_state,
      notes: e.notes,
      status: e.status,
      voidedAt: e.voided_at,
      voidReason: e.void_reason,
      occurredAt: e.occurred_at,
    })),
  });
});

// -----------------------------------------------------------------------------
// GET /school/kv-children/:kvChildId/events
// KV-side ingress: family Dashboard passes a legacy KV child id (e.g.
// "child:1234567890") and gets back the school-source events for the
// linked Postgres child, if a mapping exists in child_id_map. Returns
// an empty events list if no mapping (the kid has no school presence).
//
// This is the bridge that lets the family product surface school activity
// without knowing about Postgres ids directly.
//
// Authorization: any authenticated user. The mapping itself is the auth
// — only a parent who claimed the invite could have created the row,
// and we further verify by looking up family membership on the Postgres
// side before returning events. (A randomly-guessed KV id would either
// not be in the map or not link to a family the caller is a member of.)
// -----------------------------------------------------------------------------
school.get("/kv-children/:kvChildId/events", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const kvChildId = c.req.param("kvChildId");

  const { data: mapping } = await serviceRoleClient
    .from("child_id_map")
    .select("postgres_child_id")
    .eq("kv_child_id", kvChildId)
    .maybeSingle();
  if (!mapping) {
    // No mapping = no school presence for this KV kid. Not an error;
    // family Dashboard will just see an empty list and skip the merge.
    return c.json({ kvChildId, postgresChildId: null, events: [] });
  }

  const pgChildId = (mapping as any).postgres_child_id as string;

  // Confirm the caller has parent rights via family_members on the
  // child's Postgres family. Same auth as /children/:id/events.
  const { data: child } = await serviceRoleClient
    .from("children")
    .select("id, family_id")
    .eq("id", pgChildId)
    .maybeSingle();
  if (!child) {
    return c.json({ kvChildId, postgresChildId: null, events: [] });
  }

  const { data: fam } = await serviceRoleClient
    .from("family_members")
    .select("id")
    .eq("family_id", child.family_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!fam) {
    // Caller has no Postgres family link for this child. Possible if
    // mapping exists but caller never joined the family. Treat as 403.
    return c.json({ error: "forbidden" }, 403);
  }

  const limitParam = parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Math.min(Math.max(limitParam || 50, 1), 200);
  const sinceIso = c.req.query("sinceIso");

  let query = serviceRoleClient
    .from("point_events")
    .select(
      "id, points, item_name_snapshot, logged_by_name_snapshot, source, source_org_id, source_class_id, salah_state, notes, status, occurred_at, " +
        "organizations:source_org_id(id, name), classes:source_class_id(id, name)",
    )
    .eq("child_id", pgChildId)
    .eq("source", "school")
    .eq("status", "active")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (sinceIso) query = query.gte("occurred_at", sinceIso);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    kvChildId,
    postgresChildId: pgChildId,
    events: (data ?? []).map((e: any) => ({
      id: e.id,
      points: e.points,
      itemName: e.item_name_snapshot,
      loggedByName: e.logged_by_name_snapshot,
      source: e.source,
      orgId: e.source_org_id,
      orgName: e.organizations?.name ?? null,
      classId: e.source_class_id,
      className: e.classes?.name ?? null,
      salahState: e.salah_state,
      notes: e.notes,
      status: e.status,
      occurredAt: e.occurred_at,
    })),
  });
});

// POST /school/child-id-map
// Thin endpoint to record the KV-side child id (e.g. "child:1234567890") →
// Postgres-side student/child id mapping. Called by the family app right
// after /link-codes/consume succeeds.
//
// Body: { kvChildId: string, studentId: string, orgId: string }
//
// Auth: any authenticated user. Idempotent: a unique-violation on the
// (kv_child_id) key returns ok with `existed: true` so the family app can
// re-run the bind on retry without surfacing an error.
//
// Note: child_id_map.postgres_child_id was originally introduced for the
// parent-invite flow which mapped to the legacy `children` table. The
// Phase A schema's `student.id` lives in a different table — we store it
// here regardless because the column has no FK constraint and the family
// app only ever reads it back via /kv-children/:kvChildId/events, which
// looks up the same row by kv_child_id.
// -----------------------------------------------------------------------------
school.post("/child-id-map", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  let body: { kvChildId?: string; studentId?: string; orgId?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const kvChildId = (body?.kvChildId ?? "").trim();
  const studentId = (body?.studentId ?? "").trim();
  const orgId = (body?.orgId ?? "").trim();
  if (!kvChildId || !studentId || !orgId) {
    return c.json({ error: "kvChildId, studentId, and orgId are required" }, 400);
  }

  const { error: insErr } = await serviceRoleClient
    .from("child_id_map")
    .insert({
      kv_child_id: kvChildId,
      postgres_child_id: studentId,
      created_by: userId,
    });

  if (insErr) {
    // 23505 = unique_violation. The mapping already exists — that's fine,
    // the family app retried. We do NOT overwrite an existing mapping.
    if ((insErr as any).code === "23505") {
      return c.json({ ok: true, existed: true });
    }
    console.error("[school.child-id-map] insert error:", insErr);
    return c.json({ error: insErr.message }, 500);
  }

  return c.json({ ok: true, existed: false });
});

// -----------------------------------------------------------------------------
// Phase B routes (attendance, behavior notes, roster change requests)
// Installed onto this same Hono instance so they inherit requireAuth.
// -----------------------------------------------------------------------------
// Phase A — install admin role / students / parents / classes / PIN / link
// codes / permission-template routes. Kept in a separate module to keep
// this file manageable.
installPhaseA(school);

installPhaseB(school);

// -----------------------------------------------------------------------------
// Phase C.1 routes (daily sabaq lessons + hifz progress)
// -----------------------------------------------------------------------------
installPhaseC(school);

// -----------------------------------------------------------------------------
// Phase C.2 routes (assignments + grades)
// -----------------------------------------------------------------------------
installPhaseC2(school);

// -----------------------------------------------------------------------------
// Phase C.3 + Phase D routes (curriculum, fees, native form builder)
// -----------------------------------------------------------------------------
installPhaseCD(school);

// -----------------------------------------------------------------------------
// Subjects per class section (Phase 1A of per-subject rewiring; PR follow-ups
// thread subject_id into lesson, assignment, gradebook).
// -----------------------------------------------------------------------------
installSubjects(school);

// -----------------------------------------------------------------------------
// Curriculum per (class_subject, academic year) — Phase 1D.
// -----------------------------------------------------------------------------
installCurriculum(school);

// -----------------------------------------------------------------------------
// Academic aggregates for the principal/admin PerformanceDashboard
// (curriculum coverage, resources tally, subjects-at-risk) — Phase 6a.
// -----------------------------------------------------------------------------
installAcademics(school);

// -----------------------------------------------------------------------------
// Office-staff snapshot (roster requests, missing parent contacts,
// attendance gaps, pending invites) — Phase 6c.
// -----------------------------------------------------------------------------
installOffice(school);

// -----------------------------------------------------------------------------
// Finance-staff snapshot (collection %, overdue list, recent payments)
// — Phase 6d.
// -----------------------------------------------------------------------------
installFinance(school);

// -----------------------------------------------------------------------------
// Dashboard aggregate routes (school-at-a-glance, leaderboard, insights)
// -----------------------------------------------------------------------------
installDashboard(school);

// -----------------------------------------------------------------------------
// Phase E — student/parent portal (PIN-authenticated read endpoints)
// -----------------------------------------------------------------------------
installPortal(school);

// -----------------------------------------------------------------------------
// Phase F — announcements + lesson completion + parent fees in portal
// -----------------------------------------------------------------------------
installAnnounce(school);
installTimetable(school);
installBehaviorCategories(school);
installSchoolSearch(school);
installYearRollover(school);
installSchoolGroup(school);
installPublicSite(school);
installFeePlans(school);
installAssessment(school);
installReportCard(school);
installMessages(school);

// ─── Notification queue flush (PR feat/notification-scaffold) ─────────
// Admin-triggered flush — calls processNotificationQueue. Until an SMS
// or email provider is wired up, this just runs the log sender against
// queued rows so operators can see what would have shipped.
school.post("/orgs/:orgId/notifications/flush", async (c) => {
  const userId = getAuthUserId(c);
  const orgId = c.req.param("orgId");
  const { data: roles } = await serviceRoleClient
    .from("user_roles").select("role_type")
    .eq("user_id", userId).eq("scope_type", "organization")
    .eq("scope_id", orgId).is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r: any) => r.role_type === "principal" || r.role_type === "admin",
  );
  if (!ok) return c.json({ error: "forbidden" }, 403);
  const { processNotificationQueue } = await import("./notify.tsx");
  const result = await processNotificationQueue(100);
  return c.json(result);
});

export default school;
