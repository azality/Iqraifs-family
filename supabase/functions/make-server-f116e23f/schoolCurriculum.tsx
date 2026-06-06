// =============================================================================
// School module — Curriculum (per class_subject + academic year).
//
// Phase 1D of the per-subject rewiring. Curriculum is the syllabus the
// admin/principal defines for a subject in a given academic year — an
// ordered list of topics teachers can later attribute lessons to.
//
// Model:
//   class_subject (Math · Grade 3)
//     └─ curriculum (Math · 2026-27)             ← ONE per (subject, year)
//          └─ curriculum_topic (Place value, Fractions, …, ordered)
//
// Routes (all under /school/ parent app):
//
//   GET    /school/class-subjects/:csId/curriculum?academicYear=YYYY-YY
//             → returns curriculum + topics for that subject/year
//             → 200 with { curriculum: null, topics: [] } when none defined
//             → ANY org role
//
//   POST   /school/class-subjects/:csId/curriculum
//             body: { academicYear, title?, description? }
//             → principal/admin only
//
//   PATCH  /school/class-curriculum/:id
//             body: { title?, description? }
//             → principal/admin only
//
//   DELETE /school/class-curriculum/:id
//             → principal/admin only
//             → cascades topics via FK
//
//   POST   /school/class-curriculum/:id/topics
//             body: { name, description?, targetDate?, displayOrder? }
//             → principal/admin only
//
//   PATCH  /school/curriculum-topics/:id
//             body: { name?, description?, targetDate? (null clears), displayOrder?, completed? }
//             → principal/admin only
//
//   DELETE /school/curriculum-topics/:id
//             → principal/admin only
//
//   POST   /school/class-curriculum/:id/topics/reorder
//             body: { orderedIds: string[] }
//             → principal/admin only
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function classSubjectOrgId(csId: string): Promise<{
  orgId: string;
  classId: string;
} | null> {
  const { data } = await serviceRoleClient
    .from("class_subject")
    .select("org_id, class_id")
    .eq("id", csId)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId: (data as any).org_id,
    classId: (data as any).class_id,
  };
}

async function curriculumOrgId(curriculumId: string): Promise<{
  orgId: string;
  classSubjectId: string | null;
} | null> {
  const { data } = await serviceRoleClient
    .from("curriculum")
    .select("org_id, class_subject_id")
    .eq("id", curriculumId)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId: (data as any).org_id,
    classSubjectId: (data as any).class_subject_id,
  };
}

async function topicOrgId(topicId: string): Promise<{
  orgId: string;
  curriculumId: string;
} | null> {
  const { data } = await serviceRoleClient
    .from("curriculum_topic")
    .select("curriculum_id, curriculum:curriculum_id(org_id)")
    .eq("id", topicId)
    .maybeSingle();
  if (!data) return null;
  return {
    orgId: (data as any).curriculum?.org_id ?? null,
    curriculumId: (data as any).curriculum_id,
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

const RESOURCE_KINDS = new Set(["pdf", "video", "worksheet", "link", "quiz"]);

function resourceToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    curriculumTopicId: r.curriculum_topic_id,
    kind: r.kind,
    label: r.label,
    url: r.url,
    description: r.description,
    sortOrder: r.sort_order,
    addedBy: r.added_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function topicToJson(r: any) {
  return {
    id: r.id,
    curriculumId: r.curriculum_id,
    name: r.name,
    description: r.description,
    displayOrder: r.display_order,
    targetDate: r.target_date,
    completed: !!r.completed,
    createdAt: r.created_at,
  };
}

function curriculumToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    classSubjectId: r.class_subject_id,
    academicYear: r.academic_year,
    title: r.title,
    description: r.description,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// -----------------------------------------------------------------------------
// Install routes
// -----------------------------------------------------------------------------
export function installCurriculum(school: Hono) {
  // ---------------------------------------------------------------------------
  // GET /school/class-subjects/:csId/curriculum?academicYear=YYYY-YY
  // ---------------------------------------------------------------------------
  school.get("/class-subjects/:csId/curriculum", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const csId = c.req.param("csId");
    const ctx = await classSubjectOrgId(csId);
    if (!ctx) return c.json({ error: "subject not found" }, 404);
    if (!(await hasAnyOrgRole(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const academicYear = c.req.query("academicYear");

    // Always load the full list of curricula for this subject so the
    // frontend can offer "copy from previous year" without a second
    // round-trip. Per-row topic counts are cheap to attach via a join.
    const { data: allCurricula, error: allErr } = await serviceRoleClient
      .from("curriculum")
      .select("id, academic_year, title")
      .eq("class_subject_id", csId)
      .order("academic_year", { ascending: false });
    if (allErr) return c.json({ error: allErr.message }, 500);

    const ids = (allCurricula ?? []).map((r: any) => r.id);
    const countByCurriculumId = new Map<string, number>();
    if (ids.length > 0) {
      const { data: counts } = await serviceRoleClient
        .from("curriculum_topic")
        .select("curriculum_id")
        .in("curriculum_id", ids);
      for (const r of (counts ?? []) as any[]) {
        countByCurriculumId.set(
          r.curriculum_id,
          (countByCurriculumId.get(r.curriculum_id) ?? 0) + 1,
        );
      }
    }
    const availableYears = (allCurricula ?? []).map((r: any) => ({
      academicYear: r.academic_year,
      title: r.title,
      topicCount: countByCurriculumId.get(r.id) ?? 0,
    }));

    // Pick the curriculum for the requested year (default: latest).
    const curriculum = academicYear
      ? (allCurricula ?? []).find((r: any) => r.academic_year === academicYear) ?? null
      : (allCurricula ?? [])[0] ?? null;

    if (!curriculum) {
      return c.json({ curriculum: null, topics: [], availableYears });
    }

    // Fetch the full curriculum row + its topics.
    const { data: fullRow } = await serviceRoleClient
      .from("curriculum")
      .select("*")
      .eq("id", (curriculum as any).id)
      .maybeSingle();

    const { data: topics, error: tErr } = await serviceRoleClient
      .from("curriculum_topic")
      .select("*")
      .eq("curriculum_id", (curriculum as any).id)
      .order("display_order", { ascending: true });
    if (tErr) return c.json({ error: tErr.message }, 500);

    return c.json({
      curriculum: curriculumToJson(fullRow ?? curriculum),
      topics: (topics ?? []).map(topicToJson),
      availableYears,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /school/class-subjects/:csId/curriculum/copy-from-year
  // Body: { fromAcademicYear, toAcademicYear, title? }
  // Clones all topics from the source year's curriculum into the target year.
  // Creates the target curriculum if it doesn't exist. Existing topic names
  // on the target (case-insensitive) are skipped so the call is idempotent.
  // Copies leave completed=false so the new year starts fresh.
  // ---------------------------------------------------------------------------
  school.post("/class-subjects/:csId/curriculum/copy-from-year", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const csId = c.req.param("csId");
    const ctx = await classSubjectOrgId(csId);
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
    const fromYear =
      typeof body?.fromAcademicYear === "string" ? body.fromAcademicYear.trim() : "";
    const toYear =
      typeof body?.toAcademicYear === "string" ? body.toAcademicYear.trim() : "";
    if (!fromYear || !toYear || fromYear === toYear) {
      return c.json({ error: "fromAcademicYear and toAcademicYear must differ" }, 400);
    }

    // Load source curriculum + its topics.
    const { data: source } = await serviceRoleClient
      .from("curriculum")
      .select("id, title, description")
      .eq("class_subject_id", csId)
      .eq("academic_year", fromYear)
      .maybeSingle();
    if (!source) {
      return c.json({ error: "no curriculum found for fromAcademicYear" }, 404);
    }
    const { data: sourceTopics } = await serviceRoleClient
      .from("curriculum_topic")
      .select("name, description, target_date, display_order")
      .eq("curriculum_id", (source as any).id)
      .order("display_order", { ascending: true });

    // Find-or-create the target curriculum.
    let target: any = null;
    {
      const { data: existing } = await serviceRoleClient
        .from("curriculum")
        .select("id")
        .eq("class_subject_id", csId)
        .eq("academic_year", toYear)
        .maybeSingle();
      if (existing) {
        target = existing;
      } else {
        const title =
          typeof body?.title === "string" && body.title.trim().length > 0
            ? body.title.trim()
            : `${(source as any).title?.replace(fromYear, toYear) ?? `Curriculum ${toYear}`}`;
        const { data: created, error: createErr } = await serviceRoleClient
          .from("curriculum")
          .insert({
            org_id: ctx.orgId,
            class_subject_id: csId,
            academic_year: toYear,
            title,
            description: (source as any).description ?? null,
            created_by: userId,
          })
          .select()
          .single();
        if (createErr) return c.json({ error: createErr.message }, 500);
        target = created;
      }
    }

    // Skip names already on the target (case-insensitive).
    const { data: existingTopics } = await serviceRoleClient
      .from("curriculum_topic")
      .select("name, display_order")
      .eq("curriculum_id", target.id);
    const existingLower = new Set(
      (existingTopics ?? []).map((r: any) => String(r.name).toLowerCase()),
    );
    const startOrder =
      (existingTopics ?? []).reduce(
        (m: number, r: any) => Math.max(m, r.display_order ?? 0),
        -1,
      ) + 1;

    const rows = (sourceTopics ?? [])
      .filter((r: any) => !existingLower.has(String(r.name).toLowerCase()))
      .map((r: any, i: number) => ({
        curriculum_id: target.id,
        name: r.name,
        description: r.description ?? null,
        // Target dates from a prior year are meaningless in the new year —
        // null them out so admin can set fresh dates if they want to.
        target_date: null,
        display_order: startOrder + i,
        completed: false,
      }));

    let added = 0;
    if (rows.length > 0) {
      const { data: inserted, error } = await serviceRoleClient
        .from("curriculum_topic")
        .insert(rows)
        .select();
      if (error) return c.json({ error: error.message }, 500);
      added = inserted?.length ?? 0;
    }

    return c.json({
      added,
      curriculumId: target.id,
      skipped: (sourceTopics?.length ?? 0) - added,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /school/class-subjects/:csId/curriculum
  // Body: { academicYear, title?, description? }
  // ---------------------------------------------------------------------------
  school.post("/class-subjects/:csId/curriculum", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const csId = c.req.param("csId");
    const ctx = await classSubjectOrgId(csId);
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
    const academicYear =
      typeof body?.academicYear === "string" ? body.academicYear.trim() : "";
    if (academicYear.length < 4 || academicYear.length > 20) {
      return c.json({ error: "academicYear must be 4..20 characters" }, 400);
    }
    const title =
      typeof body?.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : `Curriculum ${academicYear}`;
    const description =
      typeof body?.description === "string" ? body.description.trim() : null;

    const { data, error } = await serviceRoleClient
      .from("curriculum")
      .insert({
        org_id: ctx.orgId,
        class_subject_id: csId,
        academic_year: academicYear,
        title,
        description,
        created_by: userId,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json(
          { error: "a curriculum already exists for this subject + year" },
          409,
        );
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ curriculum: curriculumToJson(data) }, 201);
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/class-curriculum/:id
  // ---------------------------------------------------------------------------
  school.patch("/class-curriculum/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await curriculumOrgId(id);
    if (!ctx) return c.json({ error: "curriculum not found" }, 404);
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
    if (typeof body?.title === "string") {
      const t = body.title.trim();
      if (t.length < 1 || t.length > 200) {
        return c.json({ error: "title must be 1..200 characters" }, 400);
      }
      patch.title = t;
    }
    if ("description" in (body ?? {})) {
      patch.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "nothing to update" }, 400);
    }

    const { data, error } = await serviceRoleClient
      .from("curriculum")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ curriculum: curriculumToJson(data) });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/class-curriculum/:id
  // ---------------------------------------------------------------------------
  school.delete("/class-curriculum/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await curriculumOrgId(id);
    if (!ctx) return c.json({ error: "curriculum not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("curriculum")
      .delete()
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /school/class-curriculum/:id/topics
  // ---------------------------------------------------------------------------
  school.post("/class-curriculum/:id/topics", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const curriculumId = c.req.param("id");
    const ctx = await curriculumOrgId(curriculumId);
    if (!ctx) return c.json({ error: "curriculum not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const name =
      typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 200) {
      return c.json({ error: "name must be 1..200 characters" }, 400);
    }
    const description =
      typeof body?.description === "string" ? body.description.trim() : null;
    const targetDate =
      typeof body?.targetDate === "string" && body.targetDate.length > 0
        ? body.targetDate
        : null;

    // displayOrder: default = max + 1 so new topics land at the end.
    let displayOrder: number;
    if (typeof body?.displayOrder === "number") {
      displayOrder = Math.trunc(body.displayOrder);
    } else {
      const { data: existing } = await serviceRoleClient
        .from("curriculum_topic")
        .select("display_order")
        .eq("curriculum_id", curriculumId)
        .order("display_order", { ascending: false })
        .limit(1);
      displayOrder = ((existing?.[0] as any)?.display_order ?? -1) + 1;
    }

    const { data, error } = await serviceRoleClient
      .from("curriculum_topic")
      .insert({
        curriculum_id: curriculumId,
        name,
        description,
        target_date: targetDate,
        display_order: displayOrder,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ topic: topicToJson(data) }, 201);
  });

  // ---------------------------------------------------------------------------
  // POST /school/class-curriculum/:id/topics/bulk
  // Body: { names: string[] }  — one topic per name, appended to the end in order.
  // Empty / duplicate (vs existing) / blank names are silently skipped.
  // Returns: { added: number, topics: ClassCurriculumTopic[] (all topics post-insert) }
  // ---------------------------------------------------------------------------
  school.post("/class-curriculum/:id/topics/bulk", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const curriculumId = c.req.param("id");
    const ctx = await curriculumOrgId(curriculumId);
    if (!ctx) return c.json({ error: "curriculum not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const rawNames: unknown = body?.names;
    if (!Array.isArray(rawNames)) {
      return c.json({ error: "names must be an array of strings" }, 400);
    }
    // Normalise: trim, drop blanks, cap at 100 topics per call, cap each name length.
    const cleaned = (rawNames as unknown[])
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 200)
      .slice(0, 100);
    if (cleaned.length === 0) {
      return c.json({ added: 0, topics: [] }, 200);
    }

    // Skip names that already exist (case-insensitive) so re-applying a
    // template is idempotent.
    const { data: existing } = await serviceRoleClient
      .from("curriculum_topic")
      .select("name, display_order")
      .eq("curriculum_id", curriculumId);
    const existingLower = new Set(
      (existing ?? []).map((r: any) => String(r.name).toLowerCase()),
    );
    const startOrder =
      (existing ?? []).reduce(
        (m: number, r: any) => Math.max(m, r.display_order ?? 0),
        -1,
      ) + 1;

    const rows = cleaned
      .filter((n) => !existingLower.has(n.toLowerCase()))
      .map((name, i) => ({
        curriculum_id: curriculumId,
        name,
        description: null as string | null,
        target_date: null as string | null,
        display_order: startOrder + i,
      }));
    if (rows.length === 0) {
      return c.json({ added: 0, topics: [] });
    }

    const { data: inserted, error } = await serviceRoleClient
      .from("curriculum_topic")
      .insert(rows)
      .select();
    if (error) return c.json({ error: error.message }, 500);

    return c.json(
      {
        added: inserted?.length ?? 0,
        topics: (inserted ?? []).map(topicToJson),
      },
      201,
    );
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/curriculum-topics/:id
  // ---------------------------------------------------------------------------
  school.patch("/curriculum-topics/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await topicOrgId(id);
    if (!ctx || !ctx.orgId) return c.json({ error: "topic not found" }, 404);
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
      const n = body.name.trim();
      if (n.length < 1 || n.length > 200) {
        return c.json({ error: "name must be 1..200 characters" }, 400);
      }
      patch.name = n;
    }
    if ("description" in (body ?? {})) {
      patch.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
    if ("targetDate" in (body ?? {})) {
      patch.target_date =
        body.targetDate === null || body.targetDate === ""
          ? null
          : body.targetDate;
    }
    if (typeof body?.displayOrder === "number") {
      patch.display_order = Math.trunc(body.displayOrder);
    }
    if (typeof body?.completed === "boolean") {
      patch.completed = body.completed;
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "nothing to update" }, 400);
    }

    const { data, error } = await serviceRoleClient
      .from("curriculum_topic")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ topic: topicToJson(data) });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/curriculum-topics/:id
  // ---------------------------------------------------------------------------
  school.delete("/curriculum-topics/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await topicOrgId(id);
    if (!ctx || !ctx.orgId) return c.json({ error: "topic not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("curriculum_topic")
      .delete()
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Topic resources (Phase 1E) — durable worksheets / videos / quizzes
  // attached to a curriculum topic. Distinct from lesson.attachments[],
  // which are per-day. Read access: anyone in the org. Write access:
  // principal/admin only for now (subject-teacher writes are a follow-up).
  // ---------------------------------------------------------------------------

  // GET /school/curriculum-topics/:topicId/resources
  school.get("/curriculum-topics/:topicId/resources", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const topicId = c.req.param("topicId");
    const ctx = await topicOrgId(topicId);
    if (!ctx || !ctx.orgId) return c.json({ error: "topic not found" }, 404);
    if (!(await hasAnyOrgRole(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("topic_resource")
      .select("*")
      .eq("curriculum_topic_id", topicId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      topicId,
      resources: (data ?? []).map(resourceToJson),
    });
  });

  // POST /school/curriculum-topics/:topicId/resources
  // Body: { kind, label, url, description?, sortOrder? }
  school.post("/curriculum-topics/:topicId/resources", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const topicId = c.req.param("topicId");
    const ctx = await topicOrgId(topicId);
    if (!ctx || !ctx.orgId) return c.json({ error: "topic not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const kind = typeof body?.kind === "string" ? body.kind.toLowerCase() : "";
    if (!RESOURCE_KINDS.has(kind)) {
      return c.json(
        { error: "kind must be one of: pdf, video, worksheet, link, quiz" },
        400,
      );
    }
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (label.length < 1 || label.length > 200) {
      return c.json({ error: "label must be 1..200 characters" }, 400);
    }
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (url.length < 4 || url.length > 2048) {
      return c.json({ error: "url must be 4..2048 characters" }, 400);
    }
    // Light URL sanity: must start with http(s):// or be a relative path.
    if (!/^(https?:\/\/|\/)/i.test(url)) {
      return c.json({ error: "url must start with http(s):// or /" }, 400);
    }
    const description =
      typeof body?.description === "string" ? body.description.trim() : null;

    let sortOrder: number;
    if (typeof body?.sortOrder === "number") {
      sortOrder = Math.trunc(body.sortOrder);
    } else {
      const { data: existing } = await serviceRoleClient
        .from("topic_resource")
        .select("sort_order")
        .eq("curriculum_topic_id", topicId)
        .is("archived_at", null)
        .order("sort_order", { ascending: false })
        .limit(1);
      sortOrder = ((existing?.[0] as any)?.sort_order ?? -1) + 1;
    }

    const { data, error } = await serviceRoleClient
      .from("topic_resource")
      .insert({
        org_id: ctx.orgId,
        curriculum_topic_id: topicId,
        kind,
        label,
        url,
        description: description || null,
        sort_order: sortOrder,
        added_by: userId,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ resource: resourceToJson(data) }, 201);
  });

  // PATCH /school/topic-resources/:id
  school.patch("/topic-resources/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const { data: existing } = await serviceRoleClient
      .from("topic_resource")
      .select("org_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return c.json({ error: "resource not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, (existing as any).org_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const patch: Record<string, unknown> = {};
    if (typeof body?.kind === "string") {
      const k = body.kind.toLowerCase();
      if (!RESOURCE_KINDS.has(k)) {
        return c.json({ error: "invalid kind" }, 400);
      }
      patch.kind = k;
    }
    if (typeof body?.label === "string") {
      const v = body.label.trim();
      if (v.length < 1 || v.length > 200) {
        return c.json({ error: "label must be 1..200 characters" }, 400);
      }
      patch.label = v;
    }
    if (typeof body?.url === "string") {
      const u = body.url.trim();
      if (u.length < 4 || u.length > 2048) {
        return c.json({ error: "url must be 4..2048 characters" }, 400);
      }
      if (!/^(https?:\/\/|\/)/i.test(u)) {
        return c.json({ error: "url must start with http(s):// or /" }, 400);
      }
      patch.url = u;
    }
    if ("description" in (body ?? {})) {
      patch.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }
    if (typeof body?.sortOrder === "number") {
      patch.sort_order = Math.trunc(body.sortOrder);
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "nothing to update" }, 400);
    }
    const { data, error } = await serviceRoleClient
      .from("topic_resource")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ resource: resourceToJson(data) });
  });

  // DELETE /school/topic-resources/:id  (soft)
  school.delete("/topic-resources/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const { data: existing } = await serviceRoleClient
      .from("topic_resource")
      .select("org_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return c.json({ error: "resource not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, (existing as any).org_id))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("topic_resource")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /school/class-curriculum/:id/topics/reorder
  // Body: { orderedIds: string[] }
  // ---------------------------------------------------------------------------
  school.post("/class-curriculum/:id/topics/reorder", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const ctx = await curriculumOrgId(id);
    if (!ctx) return c.json({ error: "curriculum not found" }, 404);
    if (!(await isPrincipalOrAdmin(userId, ctx.orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const orderedIds: string[] = Array.isArray(body?.orderedIds)
      ? body.orderedIds.filter((x: unknown) => typeof x === "string")
      : [];
    if (orderedIds.length === 0) {
      return c.json({ error: "orderedIds required" }, 400);
    }

    // Update each topic's display_order in parallel. Skip rows that don't
    // belong to this curriculum (defensive).
    await Promise.all(
      orderedIds.map((tid, idx) =>
        serviceRoleClient
          .from("curriculum_topic")
          .update({ display_order: idx })
          .eq("id", tid)
          .eq("curriculum_id", id),
      ),
    );

    return c.json({ ok: true });
  });
}
