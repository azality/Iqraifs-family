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

const school = new Hono();

// All routes require auth
school.use("*", requireAuth);

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

  const { data: roles, error: rolesErr } = await serviceRoleClient
    .from("user_roles")
    .select("role_type, scope_type, scope_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (rolesErr) {
    return c.json({ error: "could not load roles", details: rolesErr.message }, 500);
  }

  // Hydrate scope names so the frontend doesn't need extra round trips
  const orgIds = (roles ?? [])
    .filter((r: any) => r.scope_type === "organization")
    .map((r: any) => r.scope_id);
  const classIds = (roles ?? [])
    .filter((r: any) => r.scope_type === "class")
    .map((r: any) => r.scope_id);

  const [orgRows, classRows] = await Promise.all([
    orgIds.length > 0
      ? serviceRoleClient.from("organizations").select("id, name, slug, plan").in("id", orgIds)
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
    roles: roles ?? [],
    organizations: orgRows.data ?? [],
    classes: classRows.data ?? [],
  });
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

  if (!(await isPrincipalOf(userId, orgId))) {
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
// POST /school/classes/:classId/subjects
// Body: { name: string, teacherUserId?: string, sortOrder?: number }
// -----------------------------------------------------------------------------
school.post("/classes/:classId/subjects", async (c) => {
  const userId = getAuthUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const classId = c.req.param("classId");

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (!body?.name) return c.json({ error: "name required" }, 400);

  const { data: cls, error: clsErr } = await serviceRoleClient
    .from("classes")
    .select("organization_id")
    .eq("id", classId)
    .maybeSingle();
  if (clsErr) return c.json({ error: clsErr.message }, 500);
  if (!cls) return c.json({ error: "class not found" }, 404);

  if (!(await isPrincipalOf(userId, cls.organization_id))) {
    return c.json({ error: "forbidden" }, 403);
  }

  const { data, error } = await serviceRoleClient
    .from("subjects")
    .insert({
      class_id: classId,
      name: body.name,
      teacher_id: body.teacherUserId ?? null,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) {
    if ((error as any).code === "23505") {
      return c.json({ error: "subject with this name already exists for the class" }, 409);
    }
    return c.json({ error: error.message }, 500);
  }

  // Bootstrap teacher role for the subject teacher if provided
  if (body.teacherUserId) {
    await serviceRoleClient
      .from("user_roles")
      .insert({
        user_id: body.teacherUserId,
        role_type: "teacher",
        scope_type: "class",
        scope_id: classId,
        granted_by: userId,
      })
      .select(); // ignore duplicate insertion errors silently
  }

  return c.json(data, 201);
});

export default school;
