// =============================================================================
// School Pilot — Phase C.2 routes (assignments + grades)
//
// Mounted onto the existing `school` Hono sub-app via installPhaseC2(school)
// (invoked from school.tsx). All routes here:
//   - Inherit the `requireAuth` middleware applied at the parent `school.*`
//   - Use serviceRoleClient for all DB access (no RLS)
//   - Perform their own app-level scope checks
//
// Endpoints:
//   Assignments:
//     POST   /school/orgs/:orgId/sections/:sectionId/assignments
//     GET    /school/orgs/:orgId/sections/:sectionId/assignments
//     GET    /school/orgs/:orgId/assignments/:assignmentId
//     PATCH  /school/orgs/:orgId/assignments/:assignmentId
//     DELETE /school/orgs/:orgId/assignments/:assignmentId
//   Grades:
//     POST   /school/orgs/:orgId/assignments/:assignmentId/grades/batch
//     POST   /school/orgs/:orgId/assignments/:assignmentId/grades
//     GET    /school/orgs/:orgId/assignments/:assignmentId/grades
//     GET    /school/orgs/:orgId/students/:studentId/grades
//     GET    /school/orgs/:orgId/students/:studentId/grades/summary
//     GET    /school/orgs/:orgId/sections/:sectionId/gradebook
//     DELETE /school/orgs/:orgId/grades/:gradeId
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Permission helpers (duplicated from Phase B pattern — self-contained)
// -----------------------------------------------------------------------------

async function userHasRoleRow(
  userId: string,
  roleType: string,
  scopeType: string,
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
    console.error("[schoolPhaseC2.userHasRoleRow] DB error:", error);
    return false;
  }
  return !!data;
}

async function hasAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  if (await userHasRoleRow(userId, "principal", "organization", orgId)) return true;
  if (await userHasRoleRow(userId, "admin", "organization", orgId)) return true;
  return false;
}

async function hasAnyRoleInOrg(userId: string, orgId: string): Promise<boolean> {
  const { data, error } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1);
  if (error) {
    console.error("[schoolPhaseC2.hasAnyRoleInOrg] DB error:", error);
    return false;
  }
  if (data && data.length > 0) return true;
  const { data: data2, error: err2 } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .limit(1);
  if (err2) return false;
  return !!(data2 && data2.length > 0);
}

async function loadSection(sectionId: string): Promise<
  | {
      id: string;
      class_id: string;
      class_teacher_user_id: string | null;
      org_id: string;
    }
  | null
> {
  const { data, error } = await serviceRoleClient
    .from("class_section")
    .select("id, class_id, class_teacher_user_id, class:class_id(org_id)")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) {
    console.error("[schoolPhaseC2.loadSection] DB error:", error);
    return null;
  }
  if (!data) return null;
  const orgId = (data as any).class?.org_id ?? null;
  if (!orgId) return null;
  return {
    id: (data as any).id,
    class_id: (data as any).class_id,
    class_teacher_user_id: (data as any).class_teacher_user_id ?? null,
    org_id: orgId,
  };
}

async function requireTeacherOfSection(
  userId: string,
  orgId: string,
  sectionId: string,
  expectedSectionOrgId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404; error: string }> {
  if (expectedSectionOrgId !== orgId) {
    return { ok: false, status: 404, error: "section not in this org" };
  }
  if (await hasAdminOrPrincipal(userId, orgId)) return { ok: true };

  const { data: sec, error: secErr } = await serviceRoleClient
    .from("class_section")
    .select("class_teacher_user_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (secErr) return { ok: false, status: 403, error: "forbidden" };
  if (sec?.class_teacher_user_id === userId) return { ok: true };

  if (await userHasRoleRow(userId, "visiting_teacher", "class", sectionId)) {
    return { ok: true };
  }
  if (await userHasRoleRow(userId, "visiting_teacher", "organization", orgId)) {
    return { ok: true };
  }
  return { ok: false, status: 403, error: "forbidden" };
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------
const ASSIGNMENT_KINDS = new Set([
  "quiz",
  "test",
  "homework",
  "project",
  "class_participation",
  "other",
]);
const GRADE_STATUSES = new Set(["graded", "missing", "excused", "late"]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && ISO_DATE_RE.test(s);
}

function assignmentToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    sectionId: r.class_section_id,
    // Phase 3 — subject + topic FKs and denormalised display names. The
    // denorm fields are populated by the list endpoint via nested select;
    // single-row fetches set them to undefined and the frontend either
    // refetches the list or treats undefined as "unknown".
    sectionSubjectId: r.section_subject_id ?? null,
    curriculumTopicId: r.curriculum_topic_id ?? null,
    subjectName: (r as any).subject_name ?? undefined,
    topicName: (r as any).topic_name ?? undefined,
    title: r.title,
    kind: r.kind,
    description: r.description,
    maxScore: Number(r.max_score),
    weight: r.weight !== null && r.weight !== undefined ? Number(r.weight) : 1,
    dueDate: r.due_date,
    assignedDate: r.assigned_date,
    relatedTopic: r.related_topic,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function gradeToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    assignmentId: r.assignment_id,
    studentId: r.student_id,
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    status: r.status,
    feedback: r.feedback,
    gradedBy: r.graded_by,
    gradedAt: r.graded_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// =============================================================================
// installPhaseC2 — register all Phase C.2 routes onto the parent school app
// =============================================================================
export function installPhaseC2(school: Hono): void {
  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/sections/:sectionId/assignments
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/sections/:sectionId/assignments", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "title required" }, 400);
    }
    if (!ASSIGNMENT_KINDS.has(body?.kind)) {
      return c.json({ error: "invalid kind" }, 400);
    }
    const maxScore = Number(body?.maxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      return c.json({ error: "maxScore must be a positive number" }, 400);
    }
    let weight = 1;
    if (body.weight !== undefined && body.weight !== null) {
      weight = Number(body.weight);
      if (!Number.isFinite(weight) || weight < 0) {
        return c.json({ error: "weight must be a non-negative number" }, 400);
      }
    }
    if (body.dueDate && !isIsoDate(body.dueDate)) {
      return c.json({ error: "dueDate must be YYYY-MM-DD" }, 400);
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    // Phase 3 — optional subject + topic. Validates that the subject
    // belongs to THIS section and the topic belongs to THAT subject's
    // syllabus, so a teacher can't mis-tag an assignment.
    let sectionSubjectId: string | null = null;
    let curriculumTopicId: string | null = null;
    if (typeof body?.sectionSubjectId === "string" && body.sectionSubjectId.length > 0) {
      const { data: ss } = await serviceRoleClient
        .from("section_subject")
        .select("id, class_section_id, class_subject_id")
        .eq("id", body.sectionSubjectId)
        .maybeSingle();
      if (!ss || (ss as any).class_section_id !== sectionId) {
        return c.json({ error: "sectionSubjectId does not belong to this section" }, 400);
      }
      sectionSubjectId = (ss as any).id;

      if (typeof body?.curriculumTopicId === "string" && body.curriculumTopicId.length > 0) {
        const { data: topic } = await serviceRoleClient
          .from("curriculum_topic")
          .select("id, curriculum:curriculum_id(class_subject_id)")
          .eq("id", body.curriculumTopicId)
          .maybeSingle();
        const topicSubjectId = (topic as any)?.curriculum?.class_subject_id;
        if (!topic || topicSubjectId !== (ss as any).class_subject_id) {
          return c.json({ error: "curriculumTopicId does not belong to this subject" }, 400);
        }
        curriculumTopicId = (topic as any).id;
      }
    }

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("assignment")
      .insert({
        org_id: orgId,
        class_section_id: sectionId,
        section_subject_id: sectionSubjectId,
        curriculum_topic_id: curriculumTopicId,
        title: body.title.trim(),
        kind: body.kind,
        description: body.description ?? null,
        max_score: maxScore,
        weight,
        due_date: body.dueDate ?? null,
        related_topic: body.relatedTopic ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ assignment: assignmentToJson(ins) }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/assignments
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/assignments", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const kind = c.req.query("kind");
    const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);

    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }
    if (kind && !ASSIGNMENT_KINDS.has(kind)) {
      return c.json({ error: "invalid kind" }, 400);
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (section.org_id !== orgId) return c.json({ error: "section not in this org" }, 404);

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const subjectFilter = c.req.query("subjectId");
    let q = serviceRoleClient
      .from("assignment")
      // Phase 3: nested select so the list endpoint hydrates subject + topic
      // names without N follow-up round-trips.
      .select(
        "*, section_subject:section_subject_id(class_subject:class_subject_id(name)), curriculum_topic:curriculum_topic_id(name)",
      )
      .eq("class_section_id", sectionId)
      .order("assigned_date", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("assigned_date", startDate);
    if (endDate) q = q.lte("assigned_date", endDate);
    if (kind) q = q.eq("kind", kind);
    if (subjectFilter) q = q.eq("section_subject_id", subjectFilter);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const hydrated = ((data ?? []) as any[]).map((r) => ({
      ...r,
      subject_name: r.section_subject?.class_subject?.name ?? null,
      topic_name: r.curriculum_topic?.name ?? null,
    }));

    return c.json({
      sectionId,
      assignments: hydrated.map(assignmentToJson),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/assignments/:assignmentId
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/assignments/:assignmentId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const assignmentId = c.req.param("assignmentId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("assignment")
      .select(
        // Phase 3: pull subject + topic names alongside section context.
        "*, class_section:class_section_id(id, name, class_id, class:class_id(id, name, grade_level)), section_subject:section_subject_id(class_subject:class_subject_id(name)), curriculum_topic:curriculum_topic_id(name)",
      )
      .eq("id", assignmentId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "assignment not found" }, 404);
    if ((data as any).org_id !== orgId) {
      return c.json({ error: "assignment not in this org" }, 404);
    }

    const cs = (data as any).class_section;
    const enriched = {
      ...(data as any),
      subject_name: (data as any).section_subject?.class_subject?.name ?? null,
      topic_name: (data as any).curriculum_topic?.name ?? null,
    };
    return c.json({
      assignment: assignmentToJson(enriched),
      section: cs
        ? {
            id: cs.id,
            name: cs.name,
            classId: cs.class_id,
            className: cs.class?.name ?? null,
            gradeLevel: cs.class?.grade_level ?? null,
          }
        : null,
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/orgs/:orgId/assignments/:assignmentId
  // ---------------------------------------------------------------------------
  school.patch("/orgs/:orgId/assignments/:assignmentId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const assignmentId = c.req.param("assignmentId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("assignment")
      .select("id, org_id, created_by")
      .eq("id", assignmentId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "assignment not found" }, 404);
    if (existing.org_id !== orgId) {
      return c.json({ error: "assignment not in this org" }, 404);
    }

    const isCreator = existing.created_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isCreator && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return c.json({ error: "title must be non-empty string" }, 400);
      }
      update.title = body.title.trim();
    }
    if (body.kind !== undefined) {
      if (!ASSIGNMENT_KINDS.has(body.kind)) return c.json({ error: "invalid kind" }, 400);
      update.kind = body.kind;
    }
    if (body.description !== undefined) update.description = body.description ?? null;
    if (body.maxScore !== undefined) {
      const ms = Number(body.maxScore);
      if (!Number.isFinite(ms) || ms <= 0) {
        return c.json({ error: "maxScore must be a positive number" }, 400);
      }
      update.max_score = ms;
    }
    if (body.weight !== undefined) {
      const w = Number(body.weight);
      if (!Number.isFinite(w) || w < 0) {
        return c.json({ error: "weight must be a non-negative number" }, 400);
      }
      update.weight = w;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate !== null && !isIsoDate(body.dueDate)) {
        return c.json({ error: "dueDate must be YYYY-MM-DD or null" }, 400);
      }
      update.due_date = body.dueDate;
    }
    if (body.relatedTopic !== undefined) update.related_topic = body.relatedTopic ?? null;
    // Phase 3 — subject + topic re-tagging with cross-validation.
    if ("sectionSubjectId" in body) {
      if (body.sectionSubjectId === null) {
        update.section_subject_id = null;
        update.curriculum_topic_id = null; // can't keep topic without subject
      } else if (typeof body.sectionSubjectId === "string") {
        const { data: ss } = await serviceRoleClient
          .from("section_subject")
          .select("id, class_section_id")
          .eq("id", body.sectionSubjectId)
          .maybeSingle();
        if (!ss || (ss as any).class_section_id !== existing.class_section_id) {
          return c.json({ error: "sectionSubjectId does not belong to this assignment's section" }, 400);
        }
        update.section_subject_id = body.sectionSubjectId;
      }
    }
    if ("curriculumTopicId" in body) {
      if (body.curriculumTopicId === null) {
        update.curriculum_topic_id = null;
      } else if (typeof body.curriculumTopicId === "string") {
        const targetSubjectId =
          (update.section_subject_id as string | null | undefined) ??
          existing.section_subject_id ??
          null;
        if (!targetSubjectId) {
          return c.json({ error: "set a subject before tagging a topic" }, 400);
        }
        const { data: ss } = await serviceRoleClient
          .from("section_subject")
          .select("class_subject_id")
          .eq("id", targetSubjectId)
          .maybeSingle();
        const { data: topic } = await serviceRoleClient
          .from("curriculum_topic")
          .select("id, curriculum:curriculum_id(class_subject_id)")
          .eq("id", body.curriculumTopicId)
          .maybeSingle();
        if (!topic || (topic as any).curriculum?.class_subject_id !== (ss as any)?.class_subject_id) {
          return c.json({ error: "topic does not belong to this subject" }, 400);
        }
        update.curriculum_topic_id = body.curriculumTopicId;
      }
    }

    if (Object.keys(update).length === 0) {
      return c.json({ error: "no updatable fields supplied" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("assignment")
      .update(update)
      .eq("id", assignmentId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({ assignment: assignmentToJson(upd) });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/assignments/:assignmentId
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/assignments/:assignmentId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const assignmentId = c.req.param("assignmentId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("assignment")
      .select("id, org_id, created_by")
      .eq("id", assignmentId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "assignment not found" }, 404);
    if (existing.org_id !== orgId) {
      return c.json({ error: "assignment not in this org" }, 404);
    }

    const isCreator = existing.created_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isCreator && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const { error: delErr } = await serviceRoleClient
      .from("assignment")
      .delete()
      .eq("id", assignmentId);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/assignments/:assignmentId/grades/batch
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/assignments/:assignmentId/grades/batch", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const assignmentId = c.req.param("assignmentId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!Array.isArray(body?.entries) || body.entries.length === 0) {
      return c.json({ error: "entries[] required and non-empty" }, 400);
    }
    if (body.entries.length > 500) {
      return c.json({ error: "max 500 entries per submit" }, 400);
    }

    const { data: assignment, error: aErr } = await serviceRoleClient
      .from("assignment")
      .select("id, org_id, class_section_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (aErr) return c.json({ error: aErr.message }, 500);
    if (!assignment) return c.json({ error: "assignment not found" }, 404);
    if (assignment.org_id !== orgId) {
      return c.json({ error: "assignment not in this org" }, 404);
    }

    const section = await loadSection(assignment.class_section_id);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, assignment.class_section_id, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    // Validate entries
    for (const e of body.entries) {
      if (!e?.studentId || typeof e.studentId !== "string") {
        return c.json({ error: "every entry needs a studentId" }, 400);
      }
      if (e.status !== undefined && !GRADE_STATUSES.has(e.status)) {
        return c.json({ error: `invalid status for student ${e.studentId}` }, 400);
      }
      if (e.score !== undefined && e.score !== null) {
        const s = Number(e.score);
        if (!Number.isFinite(s) || s < 0) {
          return c.json({ error: `invalid score for student ${e.studentId}` }, 400);
        }
      }
    }

    let inserted = 0;
    let updated = 0;
    const results: Array<{ studentId: string; ok: boolean; error?: string; grade?: any }> = [];
    const nowIso = new Date().toISOString();

    for (const e of body.entries) {
      try {
        const { data: existing, error: selErr } = await serviceRoleClient
          .from("grade")
          .select("id")
          .eq("assignment_id", assignmentId)
          .eq("student_id", e.studentId)
          .maybeSingle();
        if (selErr) throw new Error(selErr.message);

        const score = e.score === undefined || e.score === null ? null : Number(e.score);
        const status = e.status ?? "graded";

        if (existing) {
          const { data: row, error: updErr } = await serviceRoleClient
            .from("grade")
            .update({
              score,
              status,
              feedback: e.feedback ?? null,
              graded_by: userId,
              graded_at: nowIso,
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (updErr) throw new Error(updErr.message);
          updated += 1;
          results.push({ studentId: e.studentId, ok: true, grade: gradeToJson(row) });
        } else {
          const { data: row, error: insErr } = await serviceRoleClient
            .from("grade")
            .insert({
              org_id: orgId,
              assignment_id: assignmentId,
              student_id: e.studentId,
              score,
              status,
              feedback: e.feedback ?? null,
              graded_by: userId,
              graded_at: nowIso,
            })
            .select()
            .single();
          if (insErr) throw new Error(insErr.message);
          inserted += 1;
          results.push({ studentId: e.studentId, ok: true, grade: gradeToJson(row) });
        }
      } catch (err: any) {
        results.push({ studentId: e.studentId, ok: false, error: err?.message });
      }
    }

    const failed = results.filter((r) => !r.ok).length;
    return c.json(
      { inserted, updated, failed, results },
      failed > 0 ? 207 : 200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/assignments/:assignmentId/grades
  // Single-row variant for inline edit.
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/assignments/:assignmentId/grades", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const assignmentId = c.req.param("assignmentId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body?.studentId || typeof body.studentId !== "string") {
      return c.json({ error: "studentId required" }, 400);
    }
    if (body.status !== undefined && !GRADE_STATUSES.has(body.status)) {
      return c.json({ error: "invalid status" }, 400);
    }
    if (body.score !== undefined && body.score !== null) {
      const s = Number(body.score);
      if (!Number.isFinite(s) || s < 0) {
        return c.json({ error: "invalid score" }, 400);
      }
    }

    const { data: assignment, error: aErr } = await serviceRoleClient
      .from("assignment")
      .select("id, org_id, class_section_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (aErr) return c.json({ error: aErr.message }, 500);
    if (!assignment) return c.json({ error: "assignment not found" }, 404);
    if (assignment.org_id !== orgId) {
      return c.json({ error: "assignment not in this org" }, 404);
    }

    const section = await loadSection(assignment.class_section_id);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, assignment.class_section_id, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const score = body.score === undefined || body.score === null ? null : Number(body.score);
    const status = body.status ?? "graded";
    const nowIso = new Date().toISOString();

    const { data: existing, error: selErr } = await serviceRoleClient
      .from("grade")
      .select("id")
      .eq("assignment_id", assignmentId)
      .eq("student_id", body.studentId)
      .maybeSingle();
    if (selErr) return c.json({ error: selErr.message }, 500);

    if (existing) {
      const { data: row, error: updErr } = await serviceRoleClient
        .from("grade")
        .update({
          score,
          status,
          feedback: body.feedback ?? null,
          graded_by: userId,
          graded_at: nowIso,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (updErr) return c.json({ error: updErr.message }, 500);
      return c.json({ grade: gradeToJson(row), created: false });
    }

    const { data: row, error: insErr } = await serviceRoleClient
      .from("grade")
      .insert({
        org_id: orgId,
        assignment_id: assignmentId,
        student_id: body.studentId,
        score,
        status,
        feedback: body.feedback ?? null,
        graded_by: userId,
        graded_at: nowIso,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);
    return c.json({ grade: gradeToJson(row), created: true }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/assignments/:assignmentId/grades
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/assignments/:assignmentId/grades", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const assignmentId = c.req.param("assignmentId");

    const { data: assignment, error: aErr } = await serviceRoleClient
      .from("assignment")
      .select("id, org_id, class_section_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (aErr) return c.json({ error: aErr.message }, 500);
    if (!assignment) return c.json({ error: "assignment not found" }, 404);
    if (assignment.org_id !== orgId) {
      return c.json({ error: "assignment not in this org" }, 404);
    }

    const section = await loadSection(assignment.class_section_id);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, assignment.class_section_id, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const { data, error } = await serviceRoleClient
      .from("grade")
      .select(
        "*, student:student_id(id, full_name, gr_number)",
      )
      .eq("assignment_id", assignmentId);
    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      assignmentId,
      grades: (data ?? []).map((r: any) => ({
        ...gradeToJson(r),
        studentName: r.student?.full_name ?? null,
        grNumber: r.student?.gr_number ?? null,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/students/:studentId/grades
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/students/:studentId/grades", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const kind = c.req.query("kind");
    const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);

    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }
    if (kind && !ASSIGNMENT_KINDS.has(kind)) {
      return c.json({ error: "invalid kind" }, 400);
    }

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: stu, error: stuErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (stuErr) return c.json({ error: stuErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    let q = serviceRoleClient
      .from("grade")
      .select(
        "*, assignment:assignment_id(id, title, kind, max_score, weight, due_date, assigned_date, class_section_id, related_topic)",
      )
      .eq("student_id", studentId)
      .order("graded_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    // Filter in app for assignment-joined fields (startDate/endDate/kind on assignment.assigned_date).
    const filtered = (data ?? []).filter((r: any) => {
      const a = r.assignment;
      if (!a) return false;
      if (kind && a.kind !== kind) return false;
      if (startDate && a.assigned_date && a.assigned_date < startDate) return false;
      if (endDate && a.assigned_date && a.assigned_date > endDate) return false;
      return true;
    });

    return c.json({
      studentId,
      grades: filtered.map((r: any) => ({
        ...gradeToJson(r),
        assignment: r.assignment
          ? {
              id: r.assignment.id,
              title: r.assignment.title,
              kind: r.assignment.kind,
              maxScore: Number(r.assignment.max_score),
              weight:
                r.assignment.weight !== null && r.assignment.weight !== undefined
                  ? Number(r.assignment.weight)
                  : 1,
              dueDate: r.assignment.due_date,
              assignedDate: r.assignment.assigned_date,
              sectionId: r.assignment.class_section_id,
              relatedTopic: r.assignment.related_topic,
            }
          : null,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/students/:studentId/grades/summary
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/students/:studentId/grades/summary", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: stu, error: stuErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (stuErr) return c.json({ error: stuErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    const { data, error } = await serviceRoleClient
      .from("grade")
      .select(
        "score, status, graded_at, assignment:assignment_id(id, kind, max_score, weight)",
      )
      .eq("student_id", studentId);
    if (error) return c.json({ error: error.message }, 500);

    const rows = (data ?? []).filter((r: any) => r.score !== null && r.score !== undefined && r.assignment);

    let assignmentsGraded = 0;
    let weightedSum = 0;
    let weightTotal = 0;
    let lastGradedAt: string | null = null;
    const perKindAgg = new Map<string, { sum: number; weight: number; count: number }>();

    for (const r of rows) {
      const a = (r as any).assignment;
      const max = Number(a.max_score);
      const w = a.weight !== null && a.weight !== undefined ? Number(a.weight) : 1;
      const score = Number((r as any).score);
      if (!Number.isFinite(max) || max <= 0) continue;
      assignmentsGraded += 1;
      const pct = score / max;
      weightedSum += pct * w;
      weightTotal += w;

      const ga = (r as any).graded_at;
      if (ga && (!lastGradedAt || ga > lastGradedAt)) lastGradedAt = ga;

      const k = a.kind;
      let bucket = perKindAgg.get(k);
      if (!bucket) {
        bucket = { sum: 0, weight: 0, count: 0 };
        perKindAgg.set(k, bucket);
      }
      bucket.sum += pct * w;
      bucket.weight += w;
      bucket.count += 1;
    }

    const average =
      weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 1000) / 10 : null;
    const perKindAverage: Record<string, { average: number | null; count: number }> = {};
    for (const [k, b] of perKindAgg) {
      perKindAverage[k] = {
        average: b.weight > 0 ? Math.round((b.sum / b.weight) * 1000) / 10 : null,
        count: b.count,
      };
    }

    return c.json({
      studentId,
      assignmentsGraded,
      average,
      lastGradedAt,
      perKindAverage,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/gradebook
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/gradebook", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    // Assignments for the section. Phase 3: pull subject + topic names
    // alongside so the gradebook can offer subject filtering.
    const subjectFilter = c.req.query("subjectId");
    let aq = serviceRoleClient
      .from("assignment")
      .select(
        "*, section_subject:section_subject_id(class_subject:class_subject_id(name)), curriculum_topic:curriculum_topic_id(name)",
      )
      .eq("class_section_id", sectionId)
      .order("assigned_date", { ascending: false });
    if (startDate) aq = aq.gte("assigned_date", startDate);
    if (endDate) aq = aq.lte("assigned_date", endDate);
    if (subjectFilter) aq = aq.eq("section_subject_id", subjectFilter);
    const { data: assignmentRows, error: aErr } = await aq;
    if (aErr) return c.json({ error: aErr.message }, 500);
    const assignments = ((assignmentRows ?? []) as any[]).map((r) => ({
      ...r,
      subject_name: r.section_subject?.class_subject?.name ?? null,
      topic_name: r.curriculum_topic?.name ?? null,
    }));

    // Students in the section
    const { data: students, error: sErr } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number")
      .eq("class_section_id", sectionId)
      .order("full_name", { ascending: true });
    if (sErr) return c.json({ error: sErr.message }, 500);

    const assignmentIds = (assignments ?? []).map((a: any) => a.id);
    let grades: any[] = [];
    if (assignmentIds.length > 0) {
      const { data: g, error: gErr } = await serviceRoleClient
        .from("grade")
        .select("*")
        .in("assignment_id", assignmentIds);
      if (gErr) return c.json({ error: gErr.message }, 500);
      grades = g ?? [];
    }

    const gradesMap: Record<string, Record<string, any>> = {};
    for (const a of assignments ?? []) {
      gradesMap[(a as any).id] = {};
    }
    for (const g of grades) {
      const aId = g.assignment_id;
      if (!gradesMap[aId]) gradesMap[aId] = {};
      gradesMap[aId][g.student_id] = gradeToJson(g);
    }

    return c.json({
      sectionId,
      assignments: (assignments ?? []).map(assignmentToJson),
      students: (students ?? []).map((s: any) => ({
        id: s.id,
        fullName: s.full_name,
        grNumber: s.gr_number,
      })),
      grades: gradesMap,
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/grades/:gradeId
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/grades/:gradeId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const gradeId = c.req.param("gradeId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("grade")
      .select("id, org_id, graded_by")
      .eq("id", gradeId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "grade not found" }, 404);
    if (existing.org_id !== orgId) {
      return c.json({ error: "grade not in this org" }, 404);
    }

    const isGrader = existing.graded_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isGrader && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const { error: delErr } = await serviceRoleClient
      .from("grade")
      .delete()
      .eq("id", gradeId);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });
}
