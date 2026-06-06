// =============================================================================
// School module — Subjects.
//
// Architecture (after Phase 1C):
//   class_subject   = subject template owned by the CLASS (Grade 3). One row
//                     per (class, name). Created and renamed by admins.
//   section_subject = the same subject taught in a specific section, holding
//                     the per-section teacher assignment. Created automatically
//                     when a class_subject is added (fans out to every active
//                     section in the class).
//
// Why split: every section of Grade 3 teaches the same Math, but Zara teaches
// it in 3-A while someone else teaches it in 3-B. Storing the subject template
// at the class level avoids per-section duplication when admins type "Math"
// three times.
//
// Routes (all under /school/ parent app, all gated by org role):
//
//   class-level (admin/principal only for writes):
//     GET    /school/classes/:classId/subjects          → list templates + teacher per section
//     POST   /school/classes/:classId/subjects          → create template + fanout
//     PATCH  /school/class-subjects/:id                 → rename / re-order
//     DELETE /school/class-subjects/:id                 → soft delete + fanout
//
//   section-level:
//     GET    /school/sections/:sectionId/subjects       → list with denormalised name
//     PATCH  /school/section-subjects/:id               → set teacher for THIS section
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Auth helpers
// -----------------------------------------------------------------------------

async function classOrgId(classId: string): Promise<string | null> {
  const { data } = await serviceRoleClient
    .from("class")
    .select("org_id")
    .eq("id", classId)
    .maybeSingle();
  return (data as any)?.org_id ?? null;
}

async function classSubjectCtx(id: string): Promise<{
  orgId: string;
  classId: string;
} | null> {
  const { data } = await serviceRoleClient
    .from("class_subject")
    .select("org_id, class_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId: (data as any).org_id,
    classId: (data as any).class_id,
  };
}

async function sectionOrgId(sectionId: string): Promise<string | null> {
  const { data } = await serviceRoleClient
    .from("class_section")
    .select("class!inner(org_id)")
    .eq("id", sectionId)
    .maybeSingle();
  return (data as any)?.class?.org_id ?? null;
}

async function sectionSubjectCtx(id: string): Promise<{
  orgId: string;
  sectionId: string;
} | null> {
  const { data } = await serviceRoleClient
    .from("section_subject")
    .select("org_id, class_section_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId: (data as any).org_id,
    sectionId: (data as any).class_section_id,
  };
}

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
// Teacher-name hydration helper (batched auth lookups)
// -----------------------------------------------------------------------------
async function hydrateTeacherNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(ids.filter(Boolean))).map(async (uid) => {
      try {
        const { data } = await serviceRoleClient.auth.admin.getUserById(uid);
        const name =
          ((data?.user as any)?.user_metadata?.full_name as string | undefined) ??
          ((data?.user as any)?.email as string | undefined) ??
          "Teacher";
        out.set(uid, name);
      } catch (_) {
        /* swallow */
      }
    }),
  );
  return out;
}

// -----------------------------------------------------------------------------
// GET helper: list every section_subject row where teacher_user_id = me,
// plus the class + section + class_subject names and curriculum progress
// for the latest curriculum on each subject.
//
// Used by TeacherHome's "My Subjects" widget so a section teacher sees
// the per-subject view of their workload: "Math · 3-A: 8/14 topics covered".
// -----------------------------------------------------------------------------
async function loadMySectionSubjects(userId: string): Promise<any[]> {
  // 1. Section subjects assigned to me.
  const { data: rows } = await serviceRoleClient
    .from("section_subject")
    .select(
      "id, org_id, class_section_id, class_subject_id, " +
        "class_subject:class_subject_id(id, name, class_id, class:class_id(name)), " +
        "class_section:class_section_id(name)",
    )
    .eq("teacher_user_id", userId)
    .is("archived_at", null);
  if (!rows || rows.length === 0) return [];

  // 2. For each class_subject, find the latest curriculum + its topic counts.
  const classSubjectIds = Array.from(
    new Set((rows as any[]).map((r) => r.class_subject_id).filter(Boolean)),
  );
  type CurStats = {
    classSubjectId: string;
    academicYear: string | null;
    total: number;
    completed: number;
  };
  const curByClassSubject = new Map<string, CurStats>();
  if (classSubjectIds.length > 0) {
    const { data: curricula } = await serviceRoleClient
      .from("curriculum")
      .select("id, class_subject_id, academic_year")
      .in("class_subject_id", classSubjectIds)
      .order("academic_year", { ascending: false });
    // Pick the latest curriculum per class_subject_id (rows are pre-sorted
    // newest first, so the first time we see a class_subject_id we keep it).
    const latestPerSubject = new Map<string, { id: string; academicYear: string }>();
    for (const c of (curricula ?? []) as any[]) {
      if (!latestPerSubject.has(c.class_subject_id)) {
        latestPerSubject.set(c.class_subject_id, {
          id: c.id,
          academicYear: c.academic_year,
        });
      }
    }
    // Bulk-fetch topic counts for those curricula in one query.
    const curIds = Array.from(latestPerSubject.values()).map((v) => v.id);
    if (curIds.length > 0) {
      const { data: topics } = await serviceRoleClient
        .from("curriculum_topic")
        .select("curriculum_id, completed")
        .in("curriculum_id", curIds);
      const byCurr = new Map<string, { total: number; completed: number }>();
      for (const t of (topics ?? []) as any[]) {
        const acc = byCurr.get(t.curriculum_id) ?? { total: 0, completed: 0 };
        acc.total += 1;
        if (t.completed) acc.completed += 1;
        byCurr.set(t.curriculum_id, acc);
      }
      for (const [csId, latest] of latestPerSubject.entries()) {
        const counts = byCurr.get(latest.id) ?? { total: 0, completed: 0 };
        curByClassSubject.set(csId, {
          classSubjectId: csId,
          academicYear: latest.academicYear,
          total: counts.total,
          completed: counts.completed,
        });
      }
    }
  }

  return (rows as any[]).map((r) => {
    const cs = curByClassSubject.get(r.class_subject_id);
    return {
      id: r.id,
      orgId: r.org_id,
      classSectionId: r.class_section_id,
      classSubjectId: r.class_subject_id,
      subjectName: r.class_subject?.name ?? "Subject",
      className: r.class_subject?.class?.name ?? null,
      sectionName: r.class_section?.name ?? null,
      curriculum: cs
        ? {
            academicYear: cs.academicYear,
            topicTotal: cs.total,
            topicCompleted: cs.completed,
            progressPct: cs.total > 0 ? Math.round((cs.completed / cs.total) * 100) : 0,
          }
        : null,
    };
  });
}

// -----------------------------------------------------------------------------
// Route installation
// -----------------------------------------------------------------------------
export function installSubjects(school: Hono) {
  // ---------------------------------------------------------------------------
  // GET /school/me/section-subjects
  // Returns the section_subjects I teach plus curriculum progress for each.
  // ---------------------------------------------------------------------------
  school.get("/me/section-subjects", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const subjects = await loadMySectionSubjects(userId);
    return c.json({ sectionSubjects: subjects });
  });

  // ---------------------------------------------------------------------------
  // GET /school/sections/:sectionId/curriculum-progress
  // Returns per-subject curriculum progress for a section. Used by
  // SectionOverview to give admins/teachers a one-glance read on how
  // far each subject is into its syllabus this year.
  // ---------------------------------------------------------------------------
  school.get("/sections/:sectionId/curriculum-progress", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const sectionId = c.req.param("sectionId");
    const orgId = await sectionOrgId(sectionId);
    if (!orgId) return c.json({ error: "section not found" }, 404);
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // 1. Section's subjects (already-active rows; teacher info joined).
    const { data: rows } = await serviceRoleClient
      .from("section_subject")
      .select(
        "id, class_subject_id, teacher_user_id, " +
          "class_subject:class_subject_id(id, name)",
      )
      .eq("class_section_id", sectionId)
      .is("archived_at", null);
    if (!rows || rows.length === 0) {
      return c.json({ sectionId, subjects: [] });
    }

    const classSubjectIds = Array.from(
      new Set((rows as any[]).map((r) => r.class_subject_id).filter(Boolean)),
    );

    // 2. Latest curriculum per class_subject + bulk topic counts.
    const latestPerSubject = new Map<string, { id: string; year: string }>();
    if (classSubjectIds.length > 0) {
      const { data: curricula } = await serviceRoleClient
        .from("curriculum")
        .select("id, class_subject_id, academic_year")
        .in("class_subject_id", classSubjectIds)
        .order("academic_year", { ascending: false });
      for (const c of (curricula ?? []) as any[]) {
        if (!latestPerSubject.has(c.class_subject_id)) {
          latestPerSubject.set(c.class_subject_id, {
            id: c.id,
            year: c.academic_year,
          });
        }
      }
    }
    const curIds = Array.from(latestPerSubject.values()).map((v) => v.id);
    const countsByCurr = new Map<string, { total: number; completed: number }>();
    if (curIds.length > 0) {
      const { data: topics } = await serviceRoleClient
        .from("curriculum_topic")
        .select("curriculum_id, completed")
        .in("curriculum_id", curIds);
      for (const t of (topics ?? []) as any[]) {
        const acc = countsByCurr.get(t.curriculum_id) ?? { total: 0, completed: 0 };
        acc.total += 1;
        if (t.completed) acc.completed += 1;
        countsByCurr.set(t.curriculum_id, acc);
      }
    }

    // 3. Hydrate teacher names (batched auth lookups).
    const teacherIds = (rows as any[])
      .map((r) => r.teacher_user_id)
      .filter(Boolean) as string[];
    const teacherNames = await hydrateTeacherNames(teacherIds);

    const subjects = (rows as any[]).map((r) => {
      const latest = latestPerSubject.get(r.class_subject_id);
      const counts = latest ? countsByCurr.get(latest.id) : undefined;
      const total = counts?.total ?? 0;
      const completed = counts?.completed ?? 0;
      return {
        sectionSubjectId: r.id,
        classSubjectId: r.class_subject_id,
        name: r.class_subject?.name ?? "Subject",
        teacherUserId: r.teacher_user_id,
        teacherName: r.teacher_user_id ? teacherNames.get(r.teacher_user_id) ?? null : null,
        curriculum: latest
          ? {
              academicYear: latest.year,
              topicTotal: total,
              topicCompleted: completed,
              progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
            }
          : null,
      };
    });

    return c.json({ sectionId, subjects });
  });

  // ---------------------------------------------------------------------------
  // GET /school/classes/:classId/subjects
  // Returns templates + per-section teacher assignments.
  // ---------------------------------------------------------------------------
  school.get("/classes/:classId/subjects", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const classId = c.req.param("classId");
    const orgId = await classOrgId(classId);
    if (!orgId) return c.json({ error: "class not found" }, 404);
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: templates, error: tErr } = await serviceRoleClient
      .from("class_subject")
      .select("*")
      .eq("class_id", classId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (tErr) return c.json({ error: tErr.message }, 500);

    const templateIds = (templates ?? []).map((r: any) => r.id);

    // Section assignments: every active section_subject for these templates,
    // including the section name for display.
    const { data: assignments, error: aErr } = templateIds.length
      ? await serviceRoleClient
          .from("section_subject")
          .select("id, class_section_id, class_subject_id, teacher_user_id, class_section:class_section_id(id, name)")
          .in("class_subject_id", templateIds)
          .is("archived_at", null)
      : { data: [], error: null };
    if (aErr) return c.json({ error: (aErr as any).message }, 500);

    const teacherIds = (assignments ?? [])
      .map((r: any) => r.teacher_user_id)
      .filter(Boolean) as string[];
    const teacherNames = await hydrateTeacherNames(teacherIds);

    return c.json({
      classId,
      subjects: (templates ?? []).map((t: any) => ({
        id: t.id,
        orgId: t.org_id,
        classId: t.class_id,
        name: t.name,
        sortOrder: t.sort_order,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        sections: (assignments ?? [])
          .filter((a: any) => a.class_subject_id === t.id)
          .map((a: any) => ({
            sectionSubjectId: a.id,
            sectionId: a.class_section_id,
            sectionName: a.class_section?.name ?? null,
            teacherUserId: a.teacher_user_id,
            teacherName: a.teacher_user_id ? teacherNames.get(a.teacher_user_id) ?? null : null,
          })),
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // POST /school/classes/:classId/subjects
  // Body: { name, sortOrder? }
  // Creates the class_subject template and fans out a section_subject row
  // (teacher unassigned) for every active section in the class.
  // ---------------------------------------------------------------------------
  school.post("/classes/:classId/subjects", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const classId = c.req.param("classId");
    const orgId = await classOrgId(classId);
    if (!orgId) return c.json({ error: "class not found" }, 404);
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
    const sortOrder = typeof body?.sortOrder === "number" ? Math.trunc(body.sortOrder) : 0;

    const { data: template, error } = await serviceRoleClient
      .from("class_subject")
      .insert({ org_id: orgId, class_id: classId, name, sort_order: sortOrder, created_by: userId })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a subject with this name already exists in this class" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }

    // Fanout: one section_subject row per active section (no teacher yet).
    const { data: sections } = await serviceRoleClient
      .from("class_section")
      .select("id")
      .eq("class_id", classId);
    if (sections && sections.length > 0) {
      const rows = sections.map((s: any) => ({
        org_id: orgId,
        class_section_id: s.id,
        class_subject_id: template.id,
        name, // denorm copy (legacy column; future migration will drop)
        teacher_user_id: null,
        sort_order: sortOrder,
      }));
      await serviceRoleClient.from("section_subject").insert(rows);
    }

    return c.json({ subject: template }, 201);
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/class-subjects/:id
  // Body: { name?, sortOrder? }
  // Renames the template + propagates to denormalised section_subject.name.
  // ---------------------------------------------------------------------------
  school.patch("/class-subjects/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await classSubjectCtx(id);
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
    if (typeof body?.sortOrder === "number") {
      patch.sort_order = Math.trunc(body.sortOrder);
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "nothing to update" }, 400);
    }

    const { data: updated, error } = await serviceRoleClient
      .from("class_subject")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "name conflicts with another subject in this class" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }

    // Mirror the rename to the denormalised section_subject.name (legacy column).
    if (typeof patch.name === "string") {
      await serviceRoleClient
        .from("section_subject")
        .update({ name: patch.name })
        .eq("class_subject_id", id);
    }
    if (typeof patch.sort_order === "number") {
      await serviceRoleClient
        .from("section_subject")
        .update({ sort_order: patch.sort_order })
        .eq("class_subject_id", id);
    }

    return c.json({ subject: updated });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/class-subjects/:id (soft; fanout)
  // ---------------------------------------------------------------------------
  school.delete("/class-subjects/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await classSubjectCtx(id);
    if (!ctx) return c.json({ error: "subject not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const now = new Date().toISOString();
    const { error } = await serviceRoleClient
      .from("class_subject")
      .update({ archived_at: now })
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500);

    // Soft-delete the per-section rows + revoke any subject-scoped grants.
    await serviceRoleClient
      .from("section_subject")
      .update({ archived_at: now })
      .eq("class_subject_id", id)
      .is("archived_at", null);
    await serviceRoleClient
      .from("user_roles")
      .update({ revoked_at: now })
      .in(
        "subject_id",
        // Need the section_subject ids for the in-clause.
        (
          await serviceRoleClient
            .from("section_subject")
            .select("id")
            .eq("class_subject_id", id)
        ).data?.map((r: any) => r.id) ?? [],
      )
      .is("revoked_at", null);

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GET /school/sections/:sectionId/subjects
  // Returns section_subject rows with the inherited template name + teacher.
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
      .select(
        "id, class_section_id, class_subject_id, teacher_user_id, sort_order, class_subject:class_subject_id(id, name, sort_order)",
      )
      .eq("class_section_id", sectionId)
      .is("archived_at", null);
    if (error) return c.json({ error: error.message }, 500);

    const teacherIds = (data ?? []).map((r: any) => r.teacher_user_id).filter(Boolean) as string[];
    const teacherNames = await hydrateTeacherNames(teacherIds);

    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      classSectionId: r.class_section_id,
      classSubjectId: r.class_subject_id,
      name: r.class_subject?.name ?? "Subject",
      sortOrder: r.class_subject?.sort_order ?? r.sort_order ?? 0,
      teacherUserId: r.teacher_user_id,
      teacherName: r.teacher_user_id ? teacherNames.get(r.teacher_user_id) ?? null : null,
    }));
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return c.json({ sectionId, subjects: rows });
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/section-subjects/:id
  // Body: { teacherUserId? (null to clear) }
  // Sets the teacher for this section's subject without affecting other
  // sections of the same class.
  // ---------------------------------------------------------------------------
  school.patch("/section-subjects/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await sectionSubjectCtx(id);
    if (!ctx) return c.json({ error: "section subject not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!("teacherUserId" in (body ?? {}))) {
      return c.json({ error: "teacherUserId required" }, 400);
    }
    const newTeacherId: string | null =
      body.teacherUserId === null
        ? null
        : typeof body.teacherUserId === "string" && body.teacherUserId.length > 0
        ? body.teacherUserId
        : null;

    const { data: updated, error } = await serviceRoleClient
      .from("section_subject")
      .update({ teacher_user_id: newTeacherId })
      .eq("id", id)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);

    // Sync subject-scoped user_roles grant.
    const now = new Date().toISOString();
    await serviceRoleClient
      .from("user_roles")
      .update({ revoked_at: now })
      .eq("subject_id", id)
      .is("revoked_at", null);
    if (newTeacherId) {
      await serviceRoleClient
        .from("user_roles")
        .insert({
          user_id: newTeacherId,
          role_type: "visiting_teacher",
          scope_type: "class_section",
          scope_id: ctx.sectionId,
          subject_id: id,
          granted_by: userId,
        })
        .select();
    }

    return c.json({ sectionSubject: updated });
  });
}
