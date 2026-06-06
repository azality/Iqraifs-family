// =============================================================================
// School Pilot — Phase C.1 routes (daily sabaq lessons + hifz progress)
//
// Mounted onto the existing `school` Hono sub-app via installPhaseC(school)
// (invoked from school.tsx). All routes here:
//   - Inherit the `requireAuth` middleware applied at the parent `school.*`
//   - Use serviceRoleClient for all DB access (no RLS)
//   - Perform their own app-level scope checks
//
// Endpoints:
//   Lessons (daily sabaq):
//     POST   /school/orgs/:orgId/sections/:sectionId/lessons
//     GET    /school/orgs/:orgId/sections/:sectionId/lessons
//     GET    /school/orgs/:orgId/lessons/:lessonId
//     PATCH  /school/orgs/:orgId/lessons/:lessonId
//     DELETE /school/orgs/:orgId/lessons/:lessonId
//   Hifz progress:
//     POST   /school/orgs/:orgId/hifz-progress
//     GET    /school/orgs/:orgId/students/:studentId/hifz-progress
//     GET    /school/orgs/:orgId/students/:studentId/hifz-progress/summary
//     GET    /school/orgs/:orgId/sections/:sectionId/hifz-progress/summary
//     DELETE /school/orgs/:orgId/hifz-progress/:entryId
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Permission helpers (mirrors schoolPhaseB.tsx — kept self-contained so this
// module doesn't depend on internals of school.tsx or sibling phase modules).
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
    console.error("[schoolPhaseC.userHasRoleRow] DB error:", error);
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
    console.error("[schoolPhaseC.hasAnyRoleInOrg] DB error:", error);
    return false;
  }
  if (data && data.length > 0) return true;
  // Also accept any non-revoked role row for the user (e.g. section-scoped
  // teachers without an explicit org row), matching Phase B fallback.
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
    console.error("[schoolPhaseC.loadSection] DB error:", error);
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
// Validation helpers
// -----------------------------------------------------------------------------
const HIFZ_KINDS = new Set([
  "memorized",
  "revised",
  "tested",
  "sabaq",
  "sabqi",
  "manzil",
]);
const HIFZ_QUALITIES = new Set([
  "excellent",
  "good",
  "needs_practice",
  "weak",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && ISO_DATE_RE.test(s);
}

function lessonToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    sectionId: r.class_section_id,
    sectionSubjectId: r.section_subject_id ?? null,
    curriculumTopicId: r.curriculum_topic_id ?? null,
    // Denormalised display fields hydrated by the list endpoint (see
    // installPhaseC's GET handler). PATCH / POST return them as undefined
    // and the frontend re-fetches the list — keeps these handlers small.
    subjectName: (r as any).subject_name ?? undefined,
    topicName: (r as any).topic_name ?? undefined,
    // Phase 4a: the topic's durable resources (worksheet / video / quiz /
    // PDF / link). Hydrated by the list endpoint; absent on single-fetch.
    topicResources: (r as any).topic_resources ?? undefined,
    lessonDate: r.lesson_date,
    title: r.title,
    body: r.body,
    videoUrl: r.video_url,
    audioUrl: r.audio_url,
    attachments: r.attachments ?? [],
    taughtBy: r.taught_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function hifzToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    studentId: r.student_id,
    surahNumber: r.surah_number,
    ayahFrom: r.ayah_from,
    ayahTo: r.ayah_to,
    kind: r.kind,
    quality: r.quality,
    notes: r.notes,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at,
    createdAt: r.created_at,
  };
}

// =============================================================================
// installPhaseC — register all Phase C.1 routes onto the parent school app
// =============================================================================
export function installPhaseC(school: Hono): void {
  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/sections/:sectionId/lessons
  // Body: { lessonDate, title, body?, videoUrl?, audioUrl?, attachments? }
  // Teacher of section OR Admin+.
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/sections/:sectionId/lessons", async (c) => {
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
    if (!isIsoDate(body?.lessonDate)) {
      return c.json({ error: "lessonDate (YYYY-MM-DD) required" }, 400);
    }
    if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "title required" }, 400);
    }
    if (body.attachments !== undefined && !Array.isArray(body.attachments)) {
      return c.json({ error: "attachments must be an array" }, 400);
    }
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments) {
        if (!a || typeof a !== "object" || typeof a.url !== "string") {
          return c.json({ error: "each attachment needs { label, url }" }, 400);
        }
      }
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    // Phase 2: optional section_subject + curriculum_topic links. If
    // provided, validate they belong to THIS section / THIS subject — a
    // teacher must not be able to tag a lesson with another section's
    // subject id or a topic from a different subject's syllabus.
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
          return c.json(
            { error: "curriculumTopicId does not belong to this subject" },
            400,
          );
        }
        curriculumTopicId = (topic as any).id;
      }
    }

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("lesson")
      .insert({
        org_id: orgId,
        class_section_id: sectionId,
        section_subject_id: sectionSubjectId,
        curriculum_topic_id: curriculumTopicId,
        lesson_date: body.lessonDate,
        title: body.title.trim(),
        body: body.body ?? null,
        video_url: body.videoUrl ?? null,
        audio_url: body.audioUrl ?? null,
        attachments: body.attachments ?? [],
        taught_by: userId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    // Optional: auto-mark the topic completed if the teacher requested it.
    if (curriculumTopicId && body?.markTopicCompleted === true) {
      await serviceRoleClient
        .from("curriculum_topic")
        .update({ completed: true })
        .eq("id", curriculumTopicId);
    }

    return c.json({ lesson: lessonToJson(ins) }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/lessons?startDate&endDate&limit
  // Any role in org.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/lessons", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const limitRaw = c.req.query("limit");
    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }
    let limit = 50;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 500) {
        return c.json({ error: "limit must be 1..500" }, 400);
      }
      limit = Math.floor(n);
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (section.org_id !== orgId) {
      return c.json({ error: "section not in this org" }, 404);
    }

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const subjectFilter = c.req.query("subjectId");
    let q = serviceRoleClient
      .from("lesson")
      // Phase 2 + Phase 4a: nested select for subject + topic + the
      // topic's durable resources (worksheets, videos, quizzes). One join
      // per request — beats N round-trips when the feed has 20+ lessons.
      .select(
        "*, section_subject:section_subject_id(class_subject:class_subject_id(name)), curriculum_topic:curriculum_topic_id(name, topic_resource(id, kind, label, url, sort_order, archived_at))",
      )
      .eq("class_section_id", sectionId)
      .order("lesson_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("lesson_date", startDate);
    if (endDate) q = q.lte("lesson_date", endDate);
    if (subjectFilter) q = q.eq("section_subject_id", subjectFilter);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const lessons = ((data ?? []) as any[]).map((r) => {
      // Strip archived resources + sort by sort_order client-shape.
      const rawResources = (r.curriculum_topic?.topic_resource ?? []) as any[];
      const topicResources = rawResources
        .filter((tr) => !tr.archived_at)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((tr) => ({
          id: tr.id,
          kind: tr.kind,
          label: tr.label,
          url: tr.url,
        }));
      return {
        ...r,
        subject_name: r.section_subject?.class_subject?.name ?? null,
        topic_name: r.curriculum_topic?.name ?? null,
        topic_resources: topicResources,
      };
    });
    // Augment with completion_count and section_size for the teacher feed.
    const lessonIds = lessons.map((l) => l.id);
    const countMap = new Map<string, number>();
    if (lessonIds.length > 0) {
      const { data: comps, error: compErr } = await serviceRoleClient
        .from("lesson_completion")
        .select("lesson_id")
        .in("lesson_id", lessonIds);
      if (!compErr && comps) {
        for (const r of comps as any[]) {
          countMap.set(r.lesson_id, (countMap.get(r.lesson_id) ?? 0) + 1);
        }
      }
    }
    let sectionSize = 0;
    {
      const { count } = await serviceRoleClient
        .from("student")
        .select("id", { count: "exact", head: true })
        .eq("class_section_id", sectionId);
      sectionSize = count ?? 0;
    }

    return c.json({
      sectionId,
      lessons: lessons.map((r) => ({
        ...lessonToJson(r),
        completionCount: countMap.get(r.id) ?? 0,
        sectionSize,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/lessons/:lessonId — single lesson. Any role in org.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/lessons/:lessonId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const lessonId = c.req.param("lessonId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("lesson")
      .select("*")
      .eq("id", lessonId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "lesson not found" }, 404);
    if (data.org_id !== orgId) return c.json({ error: "lesson not in this org" }, 404);

    return c.json({ lesson: lessonToJson(data) });
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/orgs/:orgId/lessons/:lessonId — Only taught_by user OR Admin+.
  // ---------------------------------------------------------------------------
  school.patch("/orgs/:orgId/lessons/:lessonId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const lessonId = c.req.param("lessonId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { data: existing, error: selErr } = await serviceRoleClient
      .from("lesson")
      .select("*")
      .eq("id", lessonId)
      .maybeSingle();
    if (selErr) return c.json({ error: selErr.message }, 500);
    if (!existing) return c.json({ error: "lesson not found" }, 404);
    if (existing.org_id !== orgId) {
      return c.json({ error: "lesson not in this org" }, 404);
    }

    const isOwner = existing.taught_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isOwner && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const patch: Record<string, unknown> = {};
    if (body.lessonDate !== undefined) {
      if (!isIsoDate(body.lessonDate)) {
        return c.json({ error: "lessonDate must be YYYY-MM-DD" }, 400);
      }
      patch.lesson_date = body.lessonDate;
    }
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return c.json({ error: "title cannot be empty" }, 400);
      }
      patch.title = body.title.trim();
    }
    if (body.body !== undefined) patch.body = body.body;
    if (body.videoUrl !== undefined) patch.video_url = body.videoUrl;
    if (body.audioUrl !== undefined) patch.audio_url = body.audioUrl;
    if (body.attachments !== undefined) {
      if (!Array.isArray(body.attachments)) {
        return c.json({ error: "attachments must be an array" }, 400);
      }
      for (const a of body.attachments) {
        if (!a || typeof a !== "object" || typeof a.url !== "string") {
          return c.json({ error: "each attachment needs { label, url }" }, 400);
        }
      }
      patch.attachments = body.attachments;
    }
    // Phase 2: subject / topic re-tagging. null = clear.
    if ("sectionSubjectId" in body) {
      if (body.sectionSubjectId === null) {
        patch.section_subject_id = null;
        patch.curriculum_topic_id = null; // topic can't survive without subject
      } else if (typeof body.sectionSubjectId === "string") {
        const { data: ss } = await serviceRoleClient
          .from("section_subject")
          .select("id, class_section_id")
          .eq("id", body.sectionSubjectId)
          .maybeSingle();
        if (!ss || (ss as any).class_section_id !== existing.class_section_id) {
          return c.json({ error: "sectionSubjectId does not belong to this lesson's section" }, 400);
        }
        patch.section_subject_id = body.sectionSubjectId;
      }
    }
    if ("curriculumTopicId" in body) {
      if (body.curriculumTopicId === null) {
        patch.curriculum_topic_id = null;
      } else if (typeof body.curriculumTopicId === "string") {
        // Validate against the subject we're saving (either new value or existing).
        const targetSubjectId =
          (patch.section_subject_id as string | null | undefined) ??
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
        patch.curriculum_topic_id = body.curriculumTopicId;
      }
    }

    if (Object.keys(patch).length === 0) {
      return c.json({ lesson: lessonToJson(existing) });
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("lesson")
      .update(patch)
      .eq("id", lessonId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({ lesson: lessonToJson(upd) });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/lessons/:lessonId — Only taught_by OR Admin+.
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/lessons/:lessonId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const lessonId = c.req.param("lessonId");

    const { data: existing, error: selErr } = await serviceRoleClient
      .from("lesson")
      .select("id, org_id, taught_by")
      .eq("id", lessonId)
      .maybeSingle();
    if (selErr) return c.json({ error: selErr.message }, 500);
    if (!existing) return c.json({ error: "lesson not found" }, 404);
    if (existing.org_id !== orgId) {
      return c.json({ error: "lesson not in this org" }, 404);
    }

    const isOwner = existing.taught_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isOwner && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const { error: delErr } = await serviceRoleClient
      .from("lesson")
      .delete()
      .eq("id", lessonId);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/hifz-progress
  // Body: { studentId, surahNumber, ayahFrom, ayahTo, kind, quality?, notes? }
  // Teacher of student's section OR Admin+.
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/hifz-progress", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body?.studentId || typeof body.studentId !== "string") {
      return c.json({ error: "studentId required" }, 400);
    }
    const surah = Number(body.surahNumber);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
      return c.json({ error: "surahNumber must be 1..114" }, 400);
    }
    const ayahFrom = Number(body.ayahFrom);
    const ayahTo = Number(body.ayahTo);
    if (!Number.isInteger(ayahFrom) || ayahFrom < 1) {
      return c.json({ error: "ayahFrom must be >= 1" }, 400);
    }
    if (!Number.isInteger(ayahTo) || ayahTo < ayahFrom) {
      return c.json({ error: "ayahTo must be >= ayahFrom" }, 400);
    }
    if (!HIFZ_KINDS.has(body?.kind)) {
      return c.json({ error: "invalid kind" }, 400);
    }
    if (body.quality !== undefined && body.quality !== null && !HIFZ_QUALITIES.has(body.quality)) {
      return c.json({ error: "invalid quality" }, 400);
    }

    const { data: stu, error: stuErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id, class_section_id")
      .eq("id", body.studentId)
      .maybeSingle();
    if (stuErr) return c.json({ error: stuErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    let allowed = await hasAdminOrPrincipal(userId, orgId);
    if (!allowed && stu.class_section_id) {
      const gate = await requireTeacherOfSection(userId, orgId, stu.class_section_id, orgId);
      allowed = gate.ok;
    }
    if (!allowed) return c.json({ error: "forbidden" }, 403);

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("hifz_progress")
      .insert({
        org_id: orgId,
        student_id: stu.id,
        surah_number: surah,
        ayah_from: ayahFrom,
        ayah_to: ayahTo,
        kind: body.kind,
        quality: body.quality ?? null,
        notes: body.notes ?? null,
        recorded_by: userId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ entry: hifzToJson(ins) }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/students/:studentId/hifz-progress
  // Query: startDate, endDate, kind, limit (default 100, max 500). Any role.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/students/:studentId/hifz-progress", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const kind = c.req.query("kind");
    const limitRaw = c.req.query("limit");
    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }
    if (kind && !HIFZ_KINDS.has(kind)) {
      return c.json({ error: "invalid kind" }, 400);
    }
    let limit = 100;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 500) {
        return c.json({ error: "limit must be 1..500" }, 400);
      }
      limit = Math.floor(n);
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
      .from("hifz_progress")
      .select("*")
      .eq("student_id", studentId)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("recorded_at", startDate);
    if (endDate) {
      // end-of-day to be inclusive of YYYY-MM-DD passed as endDate
      q = q.lte("recorded_at", `${endDate}T23:59:59.999Z`);
    }
    if (kind) q = q.eq("kind", kind);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      studentId,
      entries: (data ?? []).map(hifzToJson),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/students/:studentId/hifz-progress/summary
  // Derived totals. Any role in org.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/students/:studentId/hifz-progress/summary", async (c) => {
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
      .from("hifz_progress")
      .select("surah_number, ayah_from, ayah_to, kind, recorded_at")
      .eq("student_id", studentId)
      .order("recorded_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);

    const rows = (data ?? []) as Array<{
      surah_number: number;
      ayah_from: number;
      ayah_to: number;
      kind: string;
      recorded_at: string;
    }>;

    const { ayahsMemorized, surahsCompleted } = computeMemorizedTotals(rows);
    const lastEntry = rows.length > 0 ? rows[0].recorded_at : null;

    return c.json({
      studentId,
      ayahsMemorized,
      surahsCompleted,
      lastEntry,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/hifz-progress/summary
  // Per-student summary for the section. Teacher of section OR Admin+.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/hifz-progress/summary", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const { data: students, error: stuErr } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number")
      .eq("org_id", orgId)
      .eq("class_section_id", sectionId);
    if (stuErr) return c.json({ error: stuErr.message }, 500);

    const studentList = (students ?? []) as Array<{
      id: string;
      full_name: string | null;
      gr_number: string | null;
    }>;
    if (studentList.length === 0) {
      return c.json({ sectionId, students: [] });
    }

    const studentIds = studentList.map((s) => s.id);
    const { data: entries, error: entryErr } = await serviceRoleClient
      .from("hifz_progress")
      .select("student_id, surah_number, ayah_from, ayah_to, kind, recorded_at")
      .in("student_id", studentIds);
    if (entryErr) return c.json({ error: entryErr.message }, 500);

    const byStudent = new Map<string, Array<{
      surah_number: number;
      ayah_from: number;
      ayah_to: number;
      kind: string;
      recorded_at: string;
    }>>();
    for (const e of (entries ?? []) as any[]) {
      const arr = byStudent.get(e.student_id) ?? [];
      arr.push(e);
      byStudent.set(e.student_id, arr);
    }

    const out = studentList.map((s) => {
      const rows = byStudent.get(s.id) ?? [];
      const { ayahsMemorized } = computeMemorizedTotals(rows);
      let lastEntry: string | null = null;
      for (const r of rows) {
        if (!lastEntry || r.recorded_at > lastEntry) lastEntry = r.recorded_at;
      }
      return {
        studentId: s.id,
        studentName: s.full_name,
        grNumber: s.gr_number,
        ayahsMemorized,
        lastEntry,
      };
    });

    return c.json({ sectionId, students: out });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/hifz-progress/:entryId
  // Only the recorder or Admin+.
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/hifz-progress/:entryId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const entryId = c.req.param("entryId");

    const { data: entry, error: entryErr } = await serviceRoleClient
      .from("hifz_progress")
      .select("id, org_id, recorded_by")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) return c.json({ error: entryErr.message }, 500);
    if (!entry) return c.json({ error: "entry not found" }, 404);
    if (entry.org_id !== orgId) return c.json({ error: "entry not in this org" }, 404);

    const isRecorder = entry.recorded_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isRecorder && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const { error: delErr } = await serviceRoleClient
      .from("hifz_progress")
      .delete()
      .eq("id", entryId);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });
}

// -----------------------------------------------------------------------------
// computeMemorizedTotals — shared by per-student summary endpoints.
//
// "ayahsMemorized" = sum of (ayah_to - ayah_from + 1) across kind='memorized'
//   rows, but counted at most ONCE per (surah, ayah) so re-recordings of the
//   same range don't double-count.
// "surahsCompleted" = count of distinct surah_number that has any 'memorized'
//   row. (v1 simplification — not gated on full surah coverage.)
// -----------------------------------------------------------------------------
export function computeMemorizedTotals(
  rows: Array<{ surah_number: number; ayah_from: number; ayah_to: number; kind: string }>,
): { ayahsMemorized: number; surahsCompleted: number } {
  const surahsWithMem = new Set<number>();
  // Map<surah, Set<ayah>> — dedupe ayah units across overlapping ranges.
  const ayahsBySurah = new Map<number, Set<number>>();
  for (const r of rows) {
    if (r.kind !== "memorized") continue;
    surahsWithMem.add(r.surah_number);
    let set = ayahsBySurah.get(r.surah_number);
    if (!set) {
      set = new Set<number>();
      ayahsBySurah.set(r.surah_number, set);
    }
    for (let a = r.ayah_from; a <= r.ayah_to; a += 1) {
      set.add(a);
    }
  }
  let ayahsMemorized = 0;
  for (const s of ayahsBySurah.values()) ayahsMemorized += s.size;
  return { ayahsMemorized, surahsCompleted: surahsWithMem.size };
}

export default installPhaseC;
