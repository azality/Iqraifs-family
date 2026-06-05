// =============================================================================
// School module — Subjects per class section.
//
// Subjects (Math, Science, English, Quran, Urdu, …) attach to a specific
// class_section. Each subject has an optional teacher_user_id (a visiting
// teacher or the section's class teacher). Future migrations thread the
// subject_id into lesson, assignment, gradebook so a parent / teacher can
// see per-subject grades.
//
// Routes (mounted on the `school` parent app):
//   GET    /school/sections/:sectionId/subjects
//   POST   /school/sections/:sectionId/subjects      (principal / admin)
//   PATCH  /school/subjects/:subjectId               (principal / admin)
//   DELETE /school/subjects/:subjectId               (principal / admin; soft)
//
// All routes require the caller to hold any non-revoked role in the org
// that owns the section. Mutation routes additionally require principal
// or admin in that org. Subject_teacher role grants live in user_roles
// with scope_type='class_section', scope_id=section, subject_id=subject.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Returns the org_id of the section, or null if the section is gone. */
async function sectionOrgId(sectionId: string): Promise<string | null> {
  const { data } = await serviceRoleClient
    .from("class_section")
    .select("class!inner(org_id)")
    .eq("id", sectionId)
    .maybeSingle();
  // PostgREST shape: { class: { org_id } }
  const orgId = (data as any)?.class?.org_id ?? null;
  return orgId;
}

/** Returns the org_id of the subject (via its section), or null. */
async function subjectOrgId(subjectId: string): Promise<{
  orgId: string;
  sectionId: string;
} | null> {
  const { data } = await serviceRoleClient
    .from("section_subject")
    .select("org_id, class_section_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId: (data as any).org_id,
    sectionId: (data as any).class_section_id,
  };
}

/** True if the caller has any non-revoked role row in this org. */
async function hasAnyOrgRole(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** True if the caller is principal or admin in this org. */
async function isPrincipalOrAdmin(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  return (data ?? []).some((r: any) =>
    r.role_type === "principal" || r.role_type === "admin",
  );
}

// -----------------------------------------------------------------------------
// Route installation
// -----------------------------------------------------------------------------

export function installSubjects(school: Hono) {
  // ---------------------------------------------------------------------------
  // GET /school/sections/:sectionId/subjects
  // ---------------------------------------------------------------------------
  school.get("/sections/:sectionId/subjects", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const sectionId = c.req.param("sectionId");
    const orgId = await sectionOrgId(sectionId);
    if (!orgId) return c.json({ error: "section not found" }, 404);
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("section_subject")
      .select("*")
      .eq("class_section_id", sectionId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);

    // Hydrate teacher names (one batched auth lookup beats N round-trips).
    const teacherIds = Array.from(
      new Set((data ?? []).map((r: any) => r.teacher_user_id).filter(Boolean)),
    );
    const teacherNames = new Map<string, string>();
    await Promise.all(
      teacherIds.map(async (uid) => {
        try {
          const { data: u } = await serviceRoleClient.auth.admin.getUserById(
            uid as string,
          );
          const name =
            ((u?.user as any)?.user_metadata?.full_name as string | undefined) ??
            ((u?.user as any)?.email as string | undefined) ??
            "Teacher";
          teacherNames.set(uid as string, name);
        } catch (_) {
          /* swallow */
        }
      }),
    );

    return c.json({
      sectionId,
      subjects: (data ?? []).map((r: any) => ({
        id: r.id,
        orgId: r.org_id,
        classSectionId: r.class_section_id,
        name: r.name,
        teacherUserId: r.teacher_user_id,
        teacherName: r.teacher_user_id ? teacherNames.get(r.teacher_user_id) ?? null : null,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // POST /school/sections/:sectionId/subjects
  // Body: { name, teacherUserId?, sortOrder? }
  // ---------------------------------------------------------------------------
  school.post("/sections/:sectionId/subjects", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const sectionId = c.req.param("sectionId");
    const orgId = await sectionOrgId(sectionId);
    if (!orgId) return c.json({ error: "section not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 100) {
      return c.json({ error: "name must be 1..100 characters" }, 400);
    }
    const teacherUserId =
      typeof body?.teacherUserId === "string" && body.teacherUserId.length > 0
        ? body.teacherUserId
        : null;
    const sortOrder =
      typeof body?.sortOrder === "number" ? Math.trunc(body.sortOrder) : 0;

    const { data: inserted, error } = await serviceRoleClient
      .from("section_subject")
      .insert({
        org_id: orgId,
        class_section_id: sectionId,
        name,
        teacher_user_id: teacherUserId,
        sort_order: sortOrder,
        created_by: userId,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json(
          { error: "a subject with this name already exists in the section" },
          409,
        );
      }
      return c.json({ error: error.message }, 500);
    }

    // Grant the subject teacher a subject-scoped role row so downstream
    // permission checks (lessons / assignments / gradebook for THIS
    // subject) can authorise them without granting access to the rest of
    // the section. Silently ignore conflicts so re-adding the same
    // teacher to another subject doesn't fail.
    if (teacherUserId) {
      await serviceRoleClient
        .from("user_roles")
        .insert({
          user_id: teacherUserId,
          role_type: "visiting_teacher",
          scope_type: "class_section",
          scope_id: sectionId,
          subject_id: inserted.id,
          granted_by: userId,
        })
        .select(); // ignore dup-key errors silently
    }

    return c.json({ subject: inserted }, 201);
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/subjects/:subjectId
  // Body: { name?, teacherUserId? (null to clear), sortOrder? }
  // ---------------------------------------------------------------------------
  school.patch("/subjects/:subjectId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const subjectId = c.req.param("subjectId");
    const ctx = await subjectOrgId(subjectId);
    if (!ctx) return c.json({ error: "subject not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const patch: Record<string, unknown> = {};
    if (typeof body?.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        return c.json({ error: "name must be 1..100 characters" }, 400);
      }
      patch.name = trimmed;
    }
    let teacherChanged = false;
    let newTeacherId: string | null | undefined = undefined;
    if ("teacherUserId" in (body ?? {})) {
      const v = body.teacherUserId;
      if (v === null || (typeof v === "string" && v.length > 0)) {
        patch.teacher_user_id = v;
        newTeacherId = v;
        teacherChanged = true;
      }
    }
    if (typeof body?.sortOrder === "number") {
      patch.sort_order = Math.trunc(body.sortOrder);
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "nothing to update" }, 400);
    }

    const { data: updated, error } = await serviceRoleClient
      .from("section_subject")
      .update(patch)
      .eq("id", subjectId)
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "name conflicts with another subject" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }

    // Sync the user_roles grant when the teacher changes — revoke the
    // old, insert the new. Idempotent across no-op reassignments.
    if (teacherChanged) {
      await serviceRoleClient
        .from("user_roles")
        .update({ revoked_at: new Date().toISOString() })
        .eq("subject_id", subjectId)
        .is("revoked_at", null);
      if (newTeacherId) {
        await serviceRoleClient
          .from("user_roles")
          .insert({
            user_id: newTeacherId,
            role_type: "visiting_teacher",
            scope_type: "class_section",
            scope_id: ctx.sectionId,
            subject_id: subjectId,
            granted_by: userId,
          })
          .select();
      }
    }

    return c.json({ subject: updated });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/subjects/:subjectId  (soft — sets archived_at)
  // ---------------------------------------------------------------------------
  school.delete("/subjects/:subjectId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const subjectId = c.req.param("subjectId");
    const ctx = await subjectOrgId(subjectId);
    if (!ctx) return c.json({ error: "subject not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const now = new Date().toISOString();
    const { error } = await serviceRoleClient
      .from("section_subject")
      .update({ archived_at: now })
      .eq("id", subjectId);
    if (error) return c.json({ error: error.message }, 500);

    // Revoke any active teacher grant on this subject.
    await serviceRoleClient
      .from("user_roles")
      .update({ revoked_at: now })
      .eq("subject_id", subjectId)
      .is("revoked_at", null);

    return c.json({ ok: true });
  });
}
