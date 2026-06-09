// =============================================================================
// School Pilot — Phase C.3 + Phase D routes
//   - Curriculum (per-section yearly) + topics
//   - Fees (fee_status per-student per-period)
//   - Native form builder (form, form_field, form_response, form_response_value)
//
// Mounted onto the existing `school` Hono sub-app via installPhaseCD(school)
// (invoked from school.tsx). All routes inherit the `school.use("*", ...)`
// middleware, which permits PIN-token auth on /my-forms and /forms/:formId/responses.
//
// All routes use serviceRoleClient + app-level scope checks (no RLS).
// =============================================================================

import type { Hono } from "npm:hono";
import {
  serviceRoleClient,
  getAuthUserId,
  createImportBatch,
  finalizeImportBatch,
} from "./middleware.tsx";
import { verifyPinToken } from "./schoolPhaseA.tsx";
// PR K: migrate fee + grade gates from hasAdminOrPrincipal to userCanInOrg
// so financial_staff / class_teacher can act per their permission template.
import { userCanInOrg } from "./schoolAuth.ts";

// -----------------------------------------------------------------------------
// Permission helpers (self-contained — mirrors Phase B / C / C2 pattern)
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
    console.error("[schoolPhaseCD.userHasRoleRow] DB error:", error);
    return false;
  }
  return !!data;
}

async function hasAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  if (await userHasRoleRow(userId, "principal", "organization", orgId)) return true;
  if (await userHasRoleRow(userId, "admin", "organization", orgId)) return true;
  return false;
}

/** PR D: receipt visibility — financial_staff can view/print receipts. */
async function isFinancialStaff(userId: string, orgId: string): Promise<boolean> {
  return userHasRoleRow(userId, "financial_staff", "organization", orgId);
}

/** PR D: receipt visibility — parent linked to this student can view/print
 *  their own child's receipt. Uses the parent_child_link table. */
async function isParentOfStudent(userId: string, studentId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("parent_child_link")
    .select("id")
    .eq("parent_user_id", userId)
    .eq("student_id", studentId)
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
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
    console.error("[schoolPhaseCD.hasAnyRoleInOrg] DB error:", error);
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
  | { id: string; class_id: string; class_teacher_user_id: string | null; org_id: string }
  | null
> {
  const { data, error } = await serviceRoleClient
    .from("class_section")
    .select("id, class_id, class_teacher_user_id, class:class_id(org_id)")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) {
    console.error("[schoolPhaseCD.loadSection] DB error:", error);
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

async function isTeacherOfSection(
  userId: string,
  orgId: string,
  sectionId: string,
): Promise<boolean> {
  const { data: sec } = await serviceRoleClient
    .from("class_section")
    .select("class_teacher_user_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (sec?.class_teacher_user_id === userId) return true;
  if (await userHasRoleRow(userId, "visiting_teacher", "class", sectionId)) return true;
  if (await userHasRoleRow(userId, "visiting_teacher", "organization", orgId)) return true;
  return false;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------
const FORM_FIELD_KINDS = new Set([
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "number",
]);
const FORM_STATUSES = new Set(["draft", "published", "closed"]);
const FORM_AUDIENCES = new Set(["whole_school", "class_section", "specific_students"]);
const FEE_STATUSES = new Set(["unpaid", "paid", "partial", "waived"]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && ISO_DATE_RE.test(s);
}

// -----------------------------------------------------------------------------
// JSON serializers
// -----------------------------------------------------------------------------
function curriculumToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    sectionId: r.class_section_id,
    academicYear: r.academic_year,
    title: r.title,
    description: r.description,
    createdBy: r.created_by,
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

function feeToJson(r: any) {
  // FIX: shape now matches the frontend FeeStatus type (snake_case
  // throughout). Earlier this returned camelCase (amountDue etc.) so the
  // table columns reading f.amount_due / f.due_date all rendered "—".
  return {
    id: r.id,
    org_id: r.org_id,
    student_id: r.student_id,
    period: r.period,
    amount_due: r.amount_due === null || r.amount_due === undefined ? null : Number(r.amount_due),
    amount_paid: r.amount_paid === null || r.amount_paid === undefined ? null : Number(r.amount_paid),
    status: r.status,
    due_date: r.due_date,
    paid_date: r.paid_date,
    receipt_url: r.receipt_url,
    notes: r.notes,
    recorded_by: r.recorded_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function formToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    title: r.title,
    description: r.description,
    audienceKind: r.audience_kind,
    audienceSectionId: r.audience_section_id,
    audienceStudentIds: r.audience_student_ids ?? [],
    status: r.status,
    allowMultiple: !!r.allow_multiple,
    deadline: r.deadline,
    createdBy: r.created_by,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function fieldToJson(r: any) {
  return {
    id: r.id,
    formId: r.form_id,
    displayOrder: r.display_order,
    kind: r.kind,
    label: r.label,
    required: !!r.required,
    options: r.options ?? [],
    helpText: r.help_text,
  };
}

function responseToJson(r: any) {
  return {
    id: r.id,
    formId: r.form_id,
    submitterUserId: r.submitter_user_id,
    submitterParentId: r.submitter_parent_id,
    onBehalfOfStudentId: r.on_behalf_of_student_id,
    submittedAt: r.submitted_at,
  };
}

function responseValueToJson(r: any) {
  return {
    id: r.id,
    responseId: r.response_id,
    fieldId: r.field_id,
    valueText: r.value_text,
    valueNumber:
      r.value_number === null || r.value_number === undefined ? null : Number(r.value_number),
    valueMulti: r.value_multi,
  };
}

// -----------------------------------------------------------------------------
// Caller identity for /forms and /my-forms
// -----------------------------------------------------------------------------
interface PinCaller {
  kind: "pin";
  subjectType: "student" | "parent";
  subjectId: string;
  orgId: string;
}
interface UserCaller {
  kind: "user";
  userId: string;
}
type Caller = PinCaller | UserCaller | null;

async function resolveCaller(c: any): Promise<Caller> {
  const pinTokenHeader = c.req.header("X-Pin-Token") || "";
  if (pinTokenHeader) {
    const payload = await verifyPinToken(pinTokenHeader);
    if (payload) {
      return {
        kind: "pin",
        subjectType: payload.subjectType,
        subjectId: payload.subjectId,
        orgId: payload.orgId,
      };
    }
  }
  const userId = getAuthUserId(c);
  if (userId) return { kind: "user", userId };
  return null;
}

// Get the list of student ids that a caller can act on behalf of, within an org.
async function callerLinkedStudentIds(caller: Caller, orgId: string): Promise<string[]> {
  if (!caller) return [];
  if (caller.kind === "pin") {
    if (caller.orgId !== orgId) return [];
    if (caller.subjectType === "student") return [caller.subjectId];
    // Parent: student_parent table
    const { data, error } = await serviceRoleClient
      .from("student_parent")
      .select("student_id")
      .eq("parent_id", caller.subjectId);
    if (error) return [];
    return (data ?? []).map((r: any) => r.student_id);
  }
  // family-JWT user: child_id_map -> postgres_child_id -> student (in this org).
  const { data: maps, error: mapErr } = await serviceRoleClient
    .from("child_id_map")
    .select("postgres_child_id")
    .eq("created_by", caller.userId);
  if (mapErr || !maps) return [];
  const childIds = maps
    .map((m: any) => m.postgres_child_id)
    .filter((x: string | null) => !!x);
  if (childIds.length === 0) return [];
  const { data: students, error: sErr } = await serviceRoleClient
    .from("student")
    .select("id, org_id")
    .in("id", childIds);
  if (sErr || !students) return [];
  return students.filter((s: any) => s.org_id === orgId).map((s: any) => s.id);
}

// =============================================================================
// installPhaseCD — register all Phase C.3 + Phase D routes
// =============================================================================
export function installPhaseCD(school: Hono): void {
  // ===========================================================================
  // CURRICULUM
  // ===========================================================================

  // POST /school/orgs/:orgId/sections/:sectionId/curriculum
  school.post("/orgs/:orgId/sections/:sectionId/curriculum", async (c) => {
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
    if (!body?.academicYear || typeof body.academicYear !== "string") {
      return c.json({ error: "academicYear required" }, 400);
    }
    if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "title required" }, 400);
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (section.org_id !== orgId) return c.json({ error: "section not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, sectionId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("curriculum")
      .insert({
        org_id: orgId,
        class_section_id: sectionId,
        academic_year: body.academicYear.trim(),
        title: body.title.trim(),
        description: body.description ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ curriculum: curriculumToJson(data) }, 201);
  });

  // GET /school/orgs/:orgId/sections/:sectionId/curriculum?academicYear
  school.get("/orgs/:orgId/sections/:sectionId/curriculum", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const academicYear = c.req.query("academicYear");

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (section.org_id !== orgId) return c.json({ error: "section not in this org" }, 404);

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let q = serviceRoleClient
      .from("curriculum")
      .select("*")
      .eq("class_section_id", sectionId)
      .order("academic_year", { ascending: false })
      .limit(1);
    if (academicYear) q = q.eq("academic_year", academicYear);

    const { data: rows, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const curriculum = rows && rows.length > 0 ? rows[0] : null;
    if (!curriculum) {
      return c.json({ curriculum: null, topics: [] });
    }

    const { data: topics, error: tErr } = await serviceRoleClient
      .from("curriculum_topic")
      .select("*")
      .eq("curriculum_id", (curriculum as any).id)
      .order("display_order", { ascending: true });
    if (tErr) return c.json({ error: tErr.message }, 500);

    return c.json({
      curriculum: curriculumToJson(curriculum),
      topics: (topics ?? []).map(topicToJson),
    });
  });

  // PATCH /school/orgs/:orgId/curriculum/:curriculumId
  school.patch("/orgs/:orgId/curriculum/:curriculumId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const curriculumId = c.req.param("curriculumId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("curriculum")
      .select("id, org_id, class_section_id")
      .eq("id", curriculumId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "curriculum not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "curriculum not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, existing.class_section_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return c.json({ error: "title must be non-empty string" }, 400);
      }
      update.title = body.title.trim();
    }
    if (body.description !== undefined) update.description = body.description ?? null;
    if (body.academicYear !== undefined) {
      if (typeof body.academicYear !== "string" || body.academicYear.trim().length === 0) {
        return c.json({ error: "academicYear must be non-empty string" }, 400);
      }
      update.academic_year = body.academicYear.trim();
    }
    if (Object.keys(update).length === 0) {
      return c.json({ error: "no updatable fields supplied" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("curriculum")
      .update(update)
      .eq("id", curriculumId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ curriculum: curriculumToJson(upd) });
  });

  // DELETE /school/orgs/:orgId/curriculum/:curriculumId
  school.delete("/orgs/:orgId/curriculum/:curriculumId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const curriculumId = c.req.param("curriculumId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("curriculum")
      .select("id, org_id, class_section_id")
      .eq("id", curriculumId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "curriculum not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "curriculum not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, existing.class_section_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("curriculum")
      .delete()
      .eq("id", curriculumId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // POST /school/orgs/:orgId/curriculum/:curriculumId/topics
  school.post("/orgs/:orgId/curriculum/:curriculumId/topics", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const curriculumId = c.req.param("curriculumId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body?.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ error: "name required" }, 400);
    }
    if (body.targetDate !== undefined && body.targetDate !== null && !isIsoDate(body.targetDate)) {
      return c.json({ error: "targetDate must be YYYY-MM-DD" }, 400);
    }

    const { data: cur, error: cErr } = await serviceRoleClient
      .from("curriculum")
      .select("id, org_id, class_section_id")
      .eq("id", curriculumId)
      .maybeSingle();
    if (cErr) return c.json({ error: cErr.message }, 500);
    if (!cur) return c.json({ error: "curriculum not found" }, 404);
    if (cur.org_id !== orgId) return c.json({ error: "curriculum not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, cur.class_section_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let displayOrder = 0;
    if (body.displayOrder !== undefined && body.displayOrder !== null) {
      const n = Number(body.displayOrder);
      if (!Number.isFinite(n) || n < 0) {
        return c.json({ error: "displayOrder must be non-negative" }, 400);
      }
      displayOrder = Math.floor(n);
    } else {
      // Default to next available
      const { data: maxRow } = await serviceRoleClient
        .from("curriculum_topic")
        .select("display_order")
        .eq("curriculum_id", curriculumId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder =
        maxRow && (maxRow as any).display_order !== null
          ? Number((maxRow as any).display_order) + 1
          : 0;
    }

    const { data, error } = await serviceRoleClient
      .from("curriculum_topic")
      .insert({
        curriculum_id: curriculumId,
        name: body.name.trim(),
        description: body.description ?? null,
        display_order: displayOrder,
        target_date: body.targetDate ?? null,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ topic: topicToJson(data) }, 201);
  });

  // PATCH /school/orgs/:orgId/topics/:topicId
  school.patch("/orgs/:orgId/topics/:topicId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const topicId = c.req.param("topicId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { data: topic, error: tErr } = await serviceRoleClient
      .from("curriculum_topic")
      .select("id, curriculum_id, curriculum:curriculum_id(org_id, class_section_id)")
      .eq("id", topicId)
      .maybeSingle();
    if (tErr) return c.json({ error: tErr.message }, 500);
    if (!topic) return c.json({ error: "topic not found" }, 404);
    const cur = (topic as any).curriculum;
    if (!cur || cur.org_id !== orgId) {
      return c.json({ error: "topic not in this org" }, 404);
    }

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, cur.class_section_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return c.json({ error: "name must be non-empty string" }, 400);
      }
      update.name = body.name.trim();
    }
    if (body.description !== undefined) update.description = body.description ?? null;
    if (body.displayOrder !== undefined) {
      const n = Number(body.displayOrder);
      if (!Number.isFinite(n) || n < 0) {
        return c.json({ error: "displayOrder must be non-negative" }, 400);
      }
      update.display_order = Math.floor(n);
    }
    if (body.targetDate !== undefined) {
      if (body.targetDate !== null && !isIsoDate(body.targetDate)) {
        return c.json({ error: "targetDate must be YYYY-MM-DD or null" }, 400);
      }
      update.target_date = body.targetDate;
    }
    if (body.completed !== undefined) {
      if (typeof body.completed !== "boolean") {
        return c.json({ error: "completed must be boolean" }, 400);
      }
      update.completed = body.completed;
    }
    if (Object.keys(update).length === 0) {
      return c.json({ error: "no updatable fields supplied" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("curriculum_topic")
      .update(update)
      .eq("id", topicId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ topic: topicToJson(upd) });
  });

  // DELETE /school/orgs/:orgId/topics/:topicId
  school.delete("/orgs/:orgId/topics/:topicId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const topicId = c.req.param("topicId");

    const { data: topic, error: tErr } = await serviceRoleClient
      .from("curriculum_topic")
      .select("id, curriculum:curriculum_id(org_id, class_section_id)")
      .eq("id", topicId)
      .maybeSingle();
    if (tErr) return c.json({ error: tErr.message }, 500);
    if (!topic) return c.json({ error: "topic not found" }, 404);
    const cur = (topic as any).curriculum;
    if (!cur || cur.org_id !== orgId) {
      return c.json({ error: "topic not in this org" }, 404);
    }

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, cur.class_section_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("curriculum_topic")
      .delete()
      .eq("id", topicId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // POST /school/orgs/:orgId/curriculum/:curriculumId/topics/reorder
  school.post("/orgs/:orgId/curriculum/:curriculumId/topics/reorder", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const curriculumId = c.req.param("curriculumId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!Array.isArray(body?.orderedIds) || body.orderedIds.length === 0) {
      return c.json({ error: "orderedIds[] required and non-empty" }, 400);
    }
    for (const id of body.orderedIds) {
      if (typeof id !== "string") return c.json({ error: "orderedIds must be strings" }, 400);
    }

    const { data: cur, error: cErr } = await serviceRoleClient
      .from("curriculum")
      .select("id, org_id, class_section_id")
      .eq("id", curriculumId)
      .maybeSingle();
    if (cErr) return c.json({ error: cErr.message }, 500);
    if (!cur) return c.json({ error: "curriculum not found" }, 404);
    if (cur.org_id !== orgId) return c.json({ error: "curriculum not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, orgId, cur.class_section_id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Verify all topic ids belong to this curriculum.
    const { data: existing, error: exErr } = await serviceRoleClient
      .from("curriculum_topic")
      .select("id")
      .eq("curriculum_id", curriculumId);
    if (exErr) return c.json({ error: exErr.message }, 500);
    const valid = new Set((existing ?? []).map((r: any) => r.id));
    for (const id of body.orderedIds) {
      if (!valid.has(id)) {
        return c.json({ error: `topic ${id} not in this curriculum` }, 400);
      }
    }

    const failures: Array<{ id: string; error: string }> = [];
    for (let i = 0; i < body.orderedIds.length; i++) {
      const id = body.orderedIds[i];
      const { error: uErr } = await serviceRoleClient
        .from("curriculum_topic")
        .update({ display_order: i })
        .eq("id", id);
      if (uErr) failures.push({ id, error: uErr.message });
    }
    if (failures.length > 0) return c.json({ ok: false, failures }, 500);
    return c.json({ ok: true, count: body.orderedIds.length });
  });

  // ===========================================================================
  // FEES
  // ===========================================================================

  // POST /school/orgs/:orgId/students/:studentId/fees
  school.post("/orgs/:orgId/students/:studentId/fees", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body?.period || typeof body.period !== "string" || body.period.trim().length === 0) {
      return c.json({ error: "period required" }, 400);
    }
    let amountDue: number | null = null;
    if (body.amountDue !== undefined && body.amountDue !== null) {
      amountDue = Number(body.amountDue);
      if (!Number.isFinite(amountDue) || amountDue < 0) {
        return c.json({ error: "amountDue must be a non-negative number" }, 400);
      }
    }
    if (body.dueDate !== undefined && body.dueDate !== null && !isIsoDate(body.dueDate)) {
      return c.json({ error: "dueDate must be YYYY-MM-DD" }, 400);
    }

    // PR K: financial_staff can record payments via mark_fees_status.
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json(
        { error: "You don't have permission to record fees.", code: "FORBIDDEN_PERMISSION" },
        403,
      );
    }

    const { data: stu, error: sErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (sErr) return c.json({ error: sErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    const { data, error } = await serviceRoleClient
      .from("fee_status")
      .insert({
        org_id: orgId,
        student_id: studentId,
        period: body.period.trim(),
        amount_due: amountDue,
        amount_paid: 0,
        status: "unpaid",
        due_date: body.dueDate ?? null,
        notes: body.notes ?? null,
        recorded_by: userId,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "fee for this student and period already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ fee: feeToJson(data) }, 201);
  });

  // POST /school/orgs/:orgId/fees/bulk
  //
  // Phase 2 of Import Center (PR feat/import-editable-fee-attendance).
  // Used for opening-balance migration: one row per (student, period).
  // CSV references students by GR so it reads like the paper ledger.
  // amountPaid + status default to "unpaid" with 0 paid; admins can
  // override per row to record carried-over balances from the old
  // system. UNIQUE(student_id, period) catches the duplicate case.
  school.post("/orgs/:orgId/fees/bulk", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const batchId = await createImportBatch(orgId, "fees", userId);

    // Student GR → id lookup once. Saves N queries.
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, gr_number")
      .eq("org_id", orgId);
    const grMap = new Map<string, string>();
    for (const s of (students ?? []) as any[]) {
      grMap.set(String(s.gr_number).toLowerCase().trim(), s.id);
    }

    const errors: Array<{ rowIndex: number; message: string }> = [];
    let inserted = 0;
    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const gr = typeof r.grNumber === "string" ? r.grNumber.trim() : "";
      const period = typeof r.period === "string" ? r.period.trim() : "";
      if (!gr || !period) {
        errors.push({ rowIndex: i, message: "grNumber + period required" });
        continue;
      }
      const studentId = grMap.get(gr.toLowerCase());
      if (!studentId) {
        errors.push({ rowIndex: i, message: `student GR "${gr}" not found` });
        continue;
      }
      const amountDueNum = r.amountDue === undefined || r.amountDue === ""
        ? null
        : Number(r.amountDue);
      if (amountDueNum !== null && (!Number.isFinite(amountDueNum) || amountDueNum < 0)) {
        errors.push({ rowIndex: i, message: "amountDue must be non-negative" });
        continue;
      }
      const amountPaidNum = r.amountPaid === undefined || r.amountPaid === ""
        ? 0
        : Number(r.amountPaid);
      if (!Number.isFinite(amountPaidNum) || amountPaidNum < 0) {
        errors.push({ rowIndex: i, message: "amountPaid must be non-negative" });
        continue;
      }
      const allowedStatus = new Set(["unpaid", "paid", "partial", "waived"]);
      let status = typeof r.status === "string" && r.status.trim() ? r.status.trim() : null;
      if (!status) {
        // Auto-derive: paid >= due → paid; 0 < paid < due → partial; else unpaid.
        if (amountDueNum != null && amountPaidNum >= amountDueNum && amountDueNum > 0) {
          status = "paid";
        } else if (amountPaidNum > 0) {
          status = "partial";
        } else {
          status = "unpaid";
        }
      }
      if (!allowedStatus.has(status)) {
        errors.push({ rowIndex: i, message: "status must be unpaid/paid/partial/waived" });
        continue;
      }
      if (r.dueDate && !isIsoDate(r.dueDate)) {
        errors.push({ rowIndex: i, message: "dueDate must be YYYY-MM-DD" });
        continue;
      }
      if (r.paidDate && !isIsoDate(r.paidDate)) {
        errors.push({ rowIndex: i, message: "paidDate must be YYYY-MM-DD" });
        continue;
      }
      const { error } = await serviceRoleClient
        .from("fee_status")
        .insert({
          org_id: orgId,
          student_id: studentId,
          period,
          amount_due: amountDueNum,
          amount_paid: amountPaidNum,
          status,
          due_date: r.dueDate || null,
          paid_date: r.paidDate || null,
          notes: r.notes || null,
          recorded_by: userId,
          import_batch_id: batchId,
        });
      if (error) {
        const msg = (error as any).code === "23505"
          ? `fee for ${gr} / ${period} already exists`
          : (error as any).message;
        errors.push({ rowIndex: i, message: msg });
      } else {
        inserted++;
      }
    }
    await finalizeImportBatch(batchId, inserted);
    return c.json({ inserted, errors, batchId });
  });

  // GET /school/orgs/:orgId/students/:studentId/fees
  school.get("/orgs/:orgId/students/:studentId/fees", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const startPeriod = c.req.query("startPeriod");
    const endPeriod = c.req.query("endPeriod");

    const { data: stu, error: sErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (sErr) return c.json({ error: sErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    // Authorization: any org role can read, OR a parent linked to this student
    // (via student_parent.user_id mapping is not present — we use child_id_map).
    let authorized = await hasAnyRoleInOrg(userId, orgId);
    if (!authorized) {
      const ids = await callerLinkedStudentIds({ kind: "user", userId }, orgId);
      authorized = ids.includes(studentId);
    }
    if (!authorized) return c.json({ error: "forbidden" }, 403);

    let q = serviceRoleClient
      .from("fee_status")
      .select("*")
      .eq("student_id", studentId)
      .order("period", { ascending: false });
    if (startPeriod) q = q.gte("period", startPeriod);
    if (endPeriod) q = q.lte("period", endPeriod);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ studentId, fees: (data ?? []).map(feeToJson) });
  });

  // GET /school/orgs/:orgId/fees?period&status&sectionId
  school.get("/orgs/:orgId/fees", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const period = c.req.query("period");
    const status = c.req.query("status");
    const sectionId = c.req.query("sectionId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (status && !FEE_STATUSES.has(status)) {
      return c.json({ error: "invalid status" }, 400);
    }

    let q = serviceRoleClient
      .from("fee_status")
      // Pull class + section names alongside student so the table can
      // render 'Grade 3 · 3-A' without N follow-up queries.
      .select(
        "*, student:student_id(id, full_name, gr_number, class_section_id, class_section:class_section_id(name, class:class_id(name)))",
      )
      .eq("org_id", orgId)
      .order("period", { ascending: false });
    if (period) q = q.eq("period", period);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    let rows = data ?? [];
    if (sectionId) {
      rows = rows.filter((r: any) => r.student?.class_section_id === sectionId);
    }

    return c.json({
      fees: rows.map((r: any) => ({
        ...feeToJson(r),
        // Hydrated display fields. Snake_case to match the rest of the
        // FeeStatus payload + the frontend type — was previously camelCase
        // and the table on FeesOverview showed UUIDs because student_name
        // resolved undefined.
        student_name: r.student?.full_name ?? null,
        gr_number: r.student?.gr_number ?? null,
        section_id: r.student?.class_section_id ?? null,
        // Phase: surface class + section names as separate display fields
        // AND as a combined label for the existing FeeStatus.section_label
        // field that the FeesOverview table already reads.
        class_name: r.student?.class_section?.class?.name ?? null,
        section_name: r.student?.class_section?.name ?? null,
        section_label:
          r.student?.class_section
            ? `${r.student.class_section.class?.name ?? ""} · ${r.student.class_section.name ?? ""}`.trim()
            : null,
      })),
    });
  });

  // PATCH /school/orgs/:orgId/fees/:feeId
  school.patch("/orgs/:orgId/fees/:feeId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const feeId = c.req.param("feeId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("fee_status")
      .select("id, org_id")
      .eq("id", feeId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "fee not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "fee not in this org" }, 404);

    // PR K: financial_staff can update fee status via mark_fees_status.
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json(
        { error: "You don't have permission to update fees.", code: "FORBIDDEN_PERMISSION" },
        403,
      );
    }

    const update: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!FEE_STATUSES.has(body.status)) return c.json({ error: "invalid status" }, 400);
      update.status = body.status;
    }
    if (body.amountPaid !== undefined) {
      if (body.amountPaid === null) {
        update.amount_paid = null;
      } else {
        const n = Number(body.amountPaid);
        if (!Number.isFinite(n) || n < 0) {
          return c.json({ error: "amountPaid must be non-negative number" }, 400);
        }
        update.amount_paid = n;
      }
    }
    if (body.amountDue !== undefined) {
      if (body.amountDue === null) {
        update.amount_due = null;
      } else {
        const n = Number(body.amountDue);
        if (!Number.isFinite(n) || n < 0) {
          return c.json({ error: "amountDue must be non-negative number" }, 400);
        }
        update.amount_due = n;
      }
    }
    if (body.paidDate !== undefined) {
      if (body.paidDate !== null && !isIsoDate(body.paidDate)) {
        return c.json({ error: "paidDate must be YYYY-MM-DD or null" }, 400);
      }
      update.paid_date = body.paidDate;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate !== null && !isIsoDate(body.dueDate)) {
        return c.json({ error: "dueDate must be YYYY-MM-DD or null" }, 400);
      }
      update.due_date = body.dueDate;
    }
    if (body.receiptUrl !== undefined) update.receipt_url = body.receiptUrl ?? null;
    if (body.notes !== undefined) update.notes = body.notes ?? null;

    if (Object.keys(update).length === 0) {
      return c.json({ error: "no updatable fields supplied" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("fee_status")
      .update(update)
      .eq("id", feeId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ fee: feeToJson(upd) });
  });

  // -------------------------------------------------------------------------
  // GET /orgs/:orgId/fees/:feeId/receipt — print-ready HTML receipt
  //
  // Returns a self-contained styled HTML page that prints cleanly to A5/A4.
  // The frontend opens this in a new tab; the principal/parent prints to PDF
  // via the browser. This avoids adding a PDF library to the Deno edge
  // runtime and gives real print quality + on-device save-to-PDF on mobile.
  //
  // Visibility: principal / admin / financial_staff of the org, OR the
  // parent linked to this fee's student.
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/fees/:feeId/receipt", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const feeId = c.req.param("feeId");

    const { data: fee, error: feeErr } = await serviceRoleClient
      .from("fee_status")
      .select("*, students:student_id(id, full_name, roll_number, class_section:class_section_id(name))")
      .eq("id", feeId)
      .maybeSingle();
    if (feeErr) return c.json({ error: feeErr.message }, 500);
    if (!fee) return c.json({ error: "fee not found" }, 404);
    if ((fee as any).org_id !== orgId) {
      return c.json({ error: "fee not in this org" }, 404);
    }

    // Visibility check: staff OR linked parent.
    const allowed =
      (await hasAdminOrPrincipal(userId, orgId)) ||
      (await isFinancialStaff(userId, orgId)) ||
      (await isParentOfStudent(userId, (fee as any).student_id));
    if (!allowed) return c.json({ error: "forbidden", code: "FORBIDDEN_ROLE" }, 403);

    const { data: org } = await serviceRoleClient
      .from("organizations")
      .select("name, settings")
      .eq("id", orgId)
      .maybeSingle();
    const orgName = (org as any)?.name ?? "School";
    const orgSettings = (org as any)?.settings ?? {};
    const logoUrl = orgSettings.logo_url || "";
    const motto = orgSettings.school_motto || "";
    const address = orgSettings.address || "";
    const contactEmail = orgSettings.contact_email || "";
    const themeColor = orgSettings.theme_color || "#0f766e";

    const student = (fee as any).students || {};
    const sectionName = student?.class_section?.name || "—";
    const studentName = student?.full_name || "—";
    const rollNumber = student?.roll_number || "—";

    const amountDue = Number((fee as any).amount_due ?? 0);
    const amountPaid = Number((fee as any).amount_paid ?? 0);
    const balance = Math.max(0, amountDue - amountPaid);
    const paidDate = (fee as any).paid_date || (fee as any).updated_at?.slice(0, 10) || "";
    const period = (fee as any).period || "—";
    const status = (fee as any).status || "—";

    // Escape user-controlled strings to prevent XSS in the printed receipt.
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      }[ch]!));

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt — ${esc(studentName)} — ${esc(period)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #0f172a; max-width: 720px; margin: 0 auto; padding: 24px; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid ${esc(themeColor)}; padding-bottom: 16px; }
  header img { height: 56px; max-width: 120px; object-fit: contain; }
  header h1 { margin: 0; font-size: 22px; color: ${esc(themeColor)}; }
  header p { margin: 4px 0 0; font-size: 12px; color: #475569; }
  .meta { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
  .meta div { display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding: 4px 0; }
  .meta dt { color: #64748b; }
  .meta dd { margin: 0; font-weight: 600; }
  .totals { margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .totals .row.grand { border-top: 2px solid #e2e8f0; margin-top: 8px; padding-top: 12px; font-size: 16px; font-weight: 700; }
  .stamp { margin-top: 36px; padding: 12px 16px; background: ${esc(themeColor)}; color: white; border-radius: 6px; display: inline-block; font-weight: 700; letter-spacing: 0.5px; }
  footer { margin-top: 40px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  .print-btn { background: ${esc(themeColor)}; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<header>
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" />` : ""}
  <div>
    <h1>${esc(orgName)}</h1>
    ${motto ? `<p><em>${esc(motto)}</em></p>` : ""}
    ${address ? `<p>${esc(address)}</p>` : ""}
    ${contactEmail ? `<p>${esc(contactEmail)}</p>` : ""}
  </div>
</header>

<h2 style="margin-top:24px;font-size:18px;">Fee Receipt</h2>

<dl class="meta">
  <div><dt>Receipt ID</dt><dd>${esc(feeId.slice(0, 8))}</dd></div>
  <div><dt>Date</dt><dd>${esc(paidDate)}</dd></div>
  <div><dt>Student</dt><dd>${esc(studentName)}</dd></div>
  <div><dt>Roll #</dt><dd>${esc(rollNumber)}</dd></div>
  <div><dt>Class</dt><dd>${esc(sectionName)}</dd></div>
  <div><dt>Period</dt><dd>${esc(period)}</dd></div>
</dl>

<div class="totals">
  <div class="row"><span>Amount due</span><span>${amountDue.toFixed(2)}</span></div>
  <div class="row"><span>Amount paid</span><span>${amountPaid.toFixed(2)}</span></div>
  <div class="row grand"><span>${balance > 0 ? "Balance remaining" : "Balance"}</span><span>${balance.toFixed(2)}</span></div>
</div>

${status === "paid" ? `<div class="stamp">PAID</div>` : ""}

<div class="no-print" style="margin-top:24px;">
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
</div>

<footer>
  Generated ${new Date().toISOString().slice(0, 10)} · This receipt is computer-generated and does not require a signature.
</footer>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  });

  // -------------------------------------------------------------------------
  // Helpers used by the receipt visibility check above.
  // -------------------------------------------------------------------------

  // DELETE /school/orgs/:orgId/fees/:feeId
  school.delete("/orgs/:orgId/fees/:feeId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const feeId = c.req.param("feeId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("fee_status")
      .select("id, org_id")
      .eq("id", feeId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "fee not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "fee not in this org" }, 404);

    if (!(await hasAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("fee_status")
      .delete()
      .eq("id", feeId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // ===========================================================================
  // FORMS — creator endpoints (Admin OR Class Teacher)
  // ===========================================================================

  // POST /school/orgs/:orgId/forms
  school.post("/orgs/:orgId/forms", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "title required" }, 400);
    }
    if (!FORM_AUDIENCES.has(body?.audienceKind)) {
      return c.json({ error: "invalid audienceKind" }, 400);
    }
    if (body.audienceKind === "class_section") {
      if (!body.audienceSectionId || typeof body.audienceSectionId !== "string") {
        return c.json({ error: "audienceSectionId required for class_section audience" }, 400);
      }
    }
    if (body.audienceKind === "specific_students") {
      if (!Array.isArray(body.audienceStudentIds) || body.audienceStudentIds.length === 0) {
        return c.json({ error: "audienceStudentIds[] required for specific_students audience" }, 400);
      }
      for (const id of body.audienceStudentIds) {
        if (typeof id !== "string") {
          return c.json({ error: "audienceStudentIds must be strings" }, 400);
        }
      }
    }
    if (body.deadline !== undefined && body.deadline !== null) {
      if (typeof body.deadline !== "string" || Number.isNaN(Date.parse(body.deadline))) {
        return c.json({ error: "deadline must be ISO timestamp" }, 400);
      }
    }

    // Permissions: Admin+ OR class teacher of the audienceSectionId.
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin) {
      if (body.audienceKind !== "class_section") {
        return c.json({ error: "forbidden" }, 403);
      }
      const section = await loadSection(body.audienceSectionId);
      if (!section || section.org_id !== orgId) {
        return c.json({ error: "section not found" }, 404);
      }
      if (!(await isTeacherOfSection(userId, orgId, body.audienceSectionId))) {
        return c.json({ error: "forbidden" }, 403);
      }
    } else if (body.audienceKind === "class_section") {
      const section = await loadSection(body.audienceSectionId);
      if (!section || section.org_id !== orgId) {
        return c.json({ error: "section not found" }, 404);
      }
    }

    const { data, error } = await serviceRoleClient
      .from("form")
      .insert({
        org_id: orgId,
        title: body.title.trim(),
        description: body.description ?? null,
        audience_kind: body.audienceKind,
        audience_section_id: body.audienceSectionId ?? null,
        audience_student_ids:
          body.audienceKind === "specific_students" ? body.audienceStudentIds : null,
        allow_multiple: !!body.allowMultiple,
        deadline: body.deadline ?? null,
        status: "draft",
        created_by: userId,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ form: formToJson(data) }, 201);
  });

  // GET /school/orgs/:orgId/forms?status&creatorOnly=true
  school.get("/orgs/:orgId/forms", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const status = c.req.query("status");
    const creatorOnly = c.req.query("creatorOnly") === "true";

    if (status && !FORM_STATUSES.has(status)) {
      return c.json({ error: "invalid status" }, 400);
    }
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);

    let q = serviceRoleClient
      .from("form")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    // Filter: drafts visible only to creator or admin; class-teachers see their
    // own + forms whose audience targets a section they teach.
    let rows = data ?? [];

    if (creatorOnly) {
      rows = rows.filter((r: any) => r.created_by === userId);
    } else if (!isAdmin) {
      // Find sections this user teaches in this org.
      const { data: secs } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .eq("class_teacher_user_id", userId);
      const teachingSectionIds = new Set(
        (secs ?? [])
          .filter((s: any) => s.class?.org_id === orgId)
          .map((s: any) => s.id),
      );
      rows = rows.filter((r: any) => {
        if (r.created_by === userId) return true;
        if (r.status === "draft") return false;
        if (r.audience_kind === "whole_school") return true;
        if (r.audience_kind === "class_section" && r.audience_section_id) {
          return teachingSectionIds.has(r.audience_section_id);
        }
        return false;
      });
    } else {
      // Admin sees everything in org. (Drafts visible to admin too.)
    }

    return c.json({ forms: rows.map(formToJson) });
  });

  // GET /school/orgs/:orgId/forms/:formId — full form + fields
  school.get("/orgs/:orgId/forms/:formId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: form, error: fErr } = await serviceRoleClient
      .from("form")
      .select("*")
      .eq("id", formId)
      .maybeSingle();
    if (fErr) return c.json({ error: fErr.message }, 500);
    if (!form) return c.json({ error: "form not found" }, 404);
    if ((form as any).org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    // Draft visibility: only creator or admin.
    if ((form as any).status === "draft") {
      const isAdmin = await hasAdminOrPrincipal(userId, orgId);
      if (!isAdmin && (form as any).created_by !== userId) {
        return c.json({ error: "forbidden" }, 403);
      }
    }

    const { data: fields, error: flErr } = await serviceRoleClient
      .from("form_field")
      .select("*")
      .eq("form_id", formId)
      .order("display_order", { ascending: true });
    if (flErr) return c.json({ error: flErr.message }, 500);

    return c.json({
      form: formToJson(form),
      fields: (fields ?? []).map(fieldToJson),
    });
  });

  // PATCH /school/orgs/:orgId/forms/:formId
  school.patch("/orgs/:orgId/forms/:formId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("form")
      .select("id, org_id, created_by, audience_kind, audience_section_id")
      .eq("id", formId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "form not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && existing.created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const update: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return c.json({ error: "title must be non-empty string" }, 400);
      }
      update.title = body.title.trim();
    }
    if (body.description !== undefined) update.description = body.description ?? null;
    if (body.audienceKind !== undefined) {
      if (!FORM_AUDIENCES.has(body.audienceKind)) {
        return c.json({ error: "invalid audienceKind" }, 400);
      }
      update.audience_kind = body.audienceKind;
    }
    if (body.audienceSectionId !== undefined) update.audience_section_id = body.audienceSectionId ?? null;
    if (body.audienceStudentIds !== undefined) {
      if (body.audienceStudentIds !== null && !Array.isArray(body.audienceStudentIds)) {
        return c.json({ error: "audienceStudentIds must be array or null" }, 400);
      }
      update.audience_student_ids = body.audienceStudentIds;
    }
    if (body.allowMultiple !== undefined) {
      if (typeof body.allowMultiple !== "boolean") {
        return c.json({ error: "allowMultiple must be boolean" }, 400);
      }
      update.allow_multiple = body.allowMultiple;
    }
    if (body.deadline !== undefined) {
      if (body.deadline !== null) {
        if (typeof body.deadline !== "string" || Number.isNaN(Date.parse(body.deadline))) {
          return c.json({ error: "deadline must be ISO timestamp or null" }, 400);
        }
      }
      update.deadline = body.deadline;
    }
    if (Object.keys(update).length === 0) {
      return c.json({ error: "no updatable fields supplied" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("form")
      .update(update)
      .eq("id", formId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ form: formToJson(upd) });
  });

  // POST /school/orgs/:orgId/forms/:formId/publish
  school.post("/orgs/:orgId/forms/:formId/publish", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("form")
      .select("id, org_id, created_by, status")
      .eq("id", formId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "form not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && existing.created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Require at least one field before publish.
    const { count, error: cErr } = await serviceRoleClient
      .from("form_field")
      .select("id", { count: "exact", head: true })
      .eq("form_id", formId);
    if (cErr) return c.json({ error: cErr.message }, 500);
    if ((count ?? 0) === 0) {
      return c.json({ error: "form must have at least one field before publishing" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("form")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", formId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ form: formToJson(upd) });
  });

  // POST /school/orgs/:orgId/forms/:formId/close
  school.post("/orgs/:orgId/forms/:formId/close", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("form")
      .select("id, org_id, created_by")
      .eq("id", formId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "form not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && existing.created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("form")
      .update({ status: "closed" })
      .eq("id", formId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ form: formToJson(upd) });
  });

  // DELETE /school/orgs/:orgId/forms/:formId
  school.delete("/orgs/:orgId/forms/:formId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("form")
      .select("id, org_id, created_by")
      .eq("id", formId)
      .maybeSingle();
    if (exErr) return c.json({ error: exErr.message }, 500);
    if (!existing) return c.json({ error: "form not found" }, 404);
    if (existing.org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && existing.created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("form")
      .delete()
      .eq("id", formId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // FORM FIELDS
  // ---------------------------------------------------------------------------

  function validateFieldBody(body: any, partial: boolean): { ok: true } | { ok: false; error: string } {
    if (!partial || body.kind !== undefined) {
      if (!FORM_FIELD_KINDS.has(body.kind)) {
        return { ok: false, error: "invalid kind" };
      }
    }
    if (!partial || body.label !== undefined) {
      if (typeof body.label !== "string" || body.label.trim().length === 0) {
        return { ok: false, error: "label required" };
      }
    }
    if (body.required !== undefined && typeof body.required !== "boolean") {
      return { ok: false, error: "required must be boolean" };
    }
    if (body.options !== undefined && body.options !== null && !Array.isArray(body.options)) {
      return { ok: false, error: "options must be an array" };
    }
    const effectiveKind = body.kind;
    if (
      (effectiveKind === "single_select" || effectiveKind === "multi_select") &&
      body.options !== undefined &&
      Array.isArray(body.options)
    ) {
      for (const opt of body.options) {
        if (
          !opt ||
          typeof opt !== "object" ||
          typeof opt.value !== "string" ||
          typeof opt.label !== "string"
        ) {
          return { ok: false, error: "options must be {value, label} objects" };
        }
      }
    }
    return { ok: true };
  }

  async function loadFormForFieldEdit(
    formId: string,
    orgId: string,
    userId: string,
  ): Promise<{ ok: true; form: any } | { ok: false; status: 400 | 403 | 404; error: string }> {
    const { data: form, error } = await serviceRoleClient
      .from("form")
      .select("id, org_id, created_by, status")
      .eq("id", formId)
      .maybeSingle();
    if (error) return { ok: false, status: 400, error: error.message };
    if (!form) return { ok: false, status: 404, error: "form not found" };
    if (form.org_id !== orgId) return { ok: false, status: 404, error: "form not in this org" };
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && form.created_by !== userId) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: true, form };
  }

  // POST /school/orgs/:orgId/forms/:formId/fields
  school.post("/orgs/:orgId/forms/:formId/fields", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const v = validateFieldBody(body, false);
    if (!v.ok) return c.json({ error: v.error }, 400);

    const gate = await loadFormForFieldEdit(formId, orgId, userId);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    let displayOrder = 0;
    if (body.displayOrder !== undefined && body.displayOrder !== null) {
      const n = Number(body.displayOrder);
      if (!Number.isFinite(n) || n < 0) {
        return c.json({ error: "displayOrder must be non-negative" }, 400);
      }
      displayOrder = Math.floor(n);
    } else {
      const { data: maxRow } = await serviceRoleClient
        .from("form_field")
        .select("display_order")
        .eq("form_id", formId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder =
        maxRow && (maxRow as any).display_order !== null
          ? Number((maxRow as any).display_order) + 1
          : 0;
    }

    const { data, error } = await serviceRoleClient
      .from("form_field")
      .insert({
        form_id: formId,
        kind: body.kind,
        label: body.label.trim(),
        required: !!body.required,
        options: body.options ?? [],
        help_text: body.helpText ?? null,
        display_order: displayOrder,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ field: fieldToJson(data) }, 201);
  });

  // PATCH /school/orgs/:orgId/fields/:fieldId
  school.patch("/orgs/:orgId/fields/:fieldId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const fieldId = c.req.param("fieldId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const v = validateFieldBody(body, true);
    if (!v.ok) return c.json({ error: v.error }, 400);

    const { data: field, error: fErr } = await serviceRoleClient
      .from("form_field")
      .select("id, form_id, form:form_id(org_id, created_by)")
      .eq("id", fieldId)
      .maybeSingle();
    if (fErr) return c.json({ error: fErr.message }, 500);
    if (!field) return c.json({ error: "field not found" }, 404);
    const form = (field as any).form;
    if (!form || form.org_id !== orgId) return c.json({ error: "field not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && form.created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const update: Record<string, unknown> = {};
    if (body.kind !== undefined) update.kind = body.kind;
    if (body.label !== undefined) update.label = body.label.trim();
    if (body.required !== undefined) update.required = !!body.required;
    if (body.options !== undefined) update.options = body.options ?? [];
    if (body.helpText !== undefined) update.help_text = body.helpText ?? null;
    if (body.displayOrder !== undefined) {
      const n = Number(body.displayOrder);
      if (!Number.isFinite(n) || n < 0) {
        return c.json({ error: "displayOrder must be non-negative" }, 400);
      }
      update.display_order = Math.floor(n);
    }
    if (Object.keys(update).length === 0) {
      return c.json({ error: "no updatable fields supplied" }, 400);
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("form_field")
      .update(update)
      .eq("id", fieldId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ field: fieldToJson(upd) });
  });

  // DELETE /school/orgs/:orgId/fields/:fieldId
  school.delete("/orgs/:orgId/fields/:fieldId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const fieldId = c.req.param("fieldId");

    const { data: field, error: fErr } = await serviceRoleClient
      .from("form_field")
      .select("id, form:form_id(org_id, created_by)")
      .eq("id", fieldId)
      .maybeSingle();
    if (fErr) return c.json({ error: fErr.message }, 500);
    if (!field) return c.json({ error: "field not found" }, 404);
    const form = (field as any).form;
    if (!form || form.org_id !== orgId) return c.json({ error: "field not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && form.created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("form_field")
      .delete()
      .eq("id", fieldId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // POST /school/orgs/:orgId/forms/:formId/fields/reorder
  school.post("/orgs/:orgId/forms/:formId/fields/reorder", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!Array.isArray(body?.orderedIds) || body.orderedIds.length === 0) {
      return c.json({ error: "orderedIds[] required and non-empty" }, 400);
    }
    for (const id of body.orderedIds) {
      if (typeof id !== "string") return c.json({ error: "orderedIds must be strings" }, 400);
    }

    const gate = await loadFormForFieldEdit(formId, orgId, userId);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const { data: existing, error: exErr } = await serviceRoleClient
      .from("form_field")
      .select("id")
      .eq("form_id", formId);
    if (exErr) return c.json({ error: exErr.message }, 500);
    const valid = new Set((existing ?? []).map((r: any) => r.id));
    for (const id of body.orderedIds) {
      if (!valid.has(id)) {
        return c.json({ error: `field ${id} not in this form` }, 400);
      }
    }

    const failures: Array<{ id: string; error: string }> = [];
    for (let i = 0; i < body.orderedIds.length; i++) {
      const id = body.orderedIds[i];
      const { error: uErr } = await serviceRoleClient
        .from("form_field")
        .update({ display_order: i })
        .eq("id", id);
      if (uErr) failures.push({ id, error: uErr.message });
    }
    if (failures.length > 0) return c.json({ ok: false, failures }, 500);
    return c.json({ ok: true, count: body.orderedIds.length });
  });

  // GET /school/orgs/:orgId/forms/:formId/responses — admin/creator only
  school.get("/orgs/:orgId/forms/:formId/responses", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    const { data: form, error: fErr } = await serviceRoleClient
      .from("form")
      .select("id, org_id, created_by")
      .eq("id", formId)
      .maybeSingle();
    if (fErr) return c.json({ error: fErr.message }, 500);
    if (!form) return c.json({ error: "form not found" }, 404);
    if ((form as any).org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && (form as any).created_by !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: responses, error: rErr } = await serviceRoleClient
      .from("form_response")
      .select("*")
      .eq("form_id", formId)
      .order("submitted_at", { ascending: false });
    if (rErr) return c.json({ error: rErr.message }, 500);

    const responseIds = (responses ?? []).map((r: any) => r.id);
    let values: any[] = [];
    if (responseIds.length > 0) {
      const { data: v, error: vErr } = await serviceRoleClient
        .from("form_response_value")
        .select("*")
        .in("response_id", responseIds);
      if (vErr) return c.json({ error: vErr.message }, 500);
      values = v ?? [];
    }

    const valuesByResp: Record<string, any[]> = {};
    for (const v of values) {
      const arr = valuesByResp[v.response_id] ?? [];
      arr.push(responseValueToJson(v));
      valuesByResp[v.response_id] = arr;
    }

    return c.json({
      formId,
      responses: (responses ?? []).map((r: any) => ({
        ...responseToJson(r),
        values: valuesByResp[r.id] ?? [],
      })),
    });
  });

  // ===========================================================================
  // FORMS — parent-facing (family-JWT OR PIN-token)
  // ===========================================================================

  // GET /school/orgs/:orgId/my-forms
  school.get("/orgs/:orgId/my-forms", async (c) => {
    const orgId = c.req.param("orgId");
    const caller = await resolveCaller(c);
    if (!caller) return c.json({ error: "unauthenticated" }, 401);

    const studentIds = await callerLinkedStudentIds(caller, orgId);
    if (studentIds.length === 0) {
      return c.json({ forms: [] });
    }

    // Find sections of those students.
    const { data: students, error: sErr } = await serviceRoleClient
      .from("student")
      .select("id, class_section_id")
      .in("id", studentIds);
    if (sErr) return c.json({ error: sErr.message }, 500);
    const sectionIds = new Set(
      (students ?? [])
        .map((s: any) => s.class_section_id)
        .filter((x: string | null) => !!x),
    );

    const { data: published, error: pErr } = await serviceRoleClient
      .from("form")
      .select("*")
      .eq("org_id", orgId)
      .in("status", ["published", "closed"])
      .order("published_at", { ascending: false });
    if (pErr) return c.json({ error: pErr.message }, 500);

    const targeted = (published ?? []).filter((f: any) => {
      if (f.audience_kind === "whole_school") return true;
      if (f.audience_kind === "class_section") {
        return f.audience_section_id && sectionIds.has(f.audience_section_id);
      }
      if (f.audience_kind === "specific_students") {
        if (!Array.isArray(f.audience_student_ids)) return false;
        return f.audience_student_ids.some((id: string) => studentIds.includes(id));
      }
      return false;
    });

    // Per-form submission status for this caller.
    const formIds = targeted.map((f: any) => f.id);
    let myResponses: any[] = [];
    if (formIds.length > 0) {
      let q = serviceRoleClient.from("form_response").select("form_id").in("form_id", formIds);
      if (caller.kind === "pin") {
        q = q.eq("submitter_parent_id", caller.subjectId);
      } else {
        q = q.eq("submitter_user_id", caller.userId);
      }
      const { data: resp } = await q;
      myResponses = resp ?? [];
    }
    const respondedFormIds = new Set(myResponses.map((r: any) => r.form_id));

    const now = Date.now();
    return c.json({
      forms: targeted.map((f: any) => {
        const submitted = respondedFormIds.has(f.id);
        let myStatus: "not_submitted" | "submitted" | "expired" = "not_submitted";
        if (submitted) {
          myStatus = "submitted";
        } else if (f.status === "closed") {
          myStatus = "expired";
        } else if (f.deadline && Date.parse(f.deadline) < now) {
          myStatus = "expired";
        }
        return {
          ...formToJson(f),
          myStatus,
        };
      }),
    });
  });

  // POST /school/orgs/:orgId/forms/:formId/responses
  school.post("/orgs/:orgId/forms/:formId/responses", async (c) => {
    const orgId = c.req.param("orgId");
    const formId = c.req.param("formId");

    const caller = await resolveCaller(c);
    if (!caller) return c.json({ error: "unauthenticated" }, 401);

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!Array.isArray(body?.values)) {
      return c.json({ error: "values[] required" }, 400);
    }
    if (body.onBehalfOfStudentId !== undefined && body.onBehalfOfStudentId !== null) {
      if (typeof body.onBehalfOfStudentId !== "string") {
        return c.json({ error: "onBehalfOfStudentId must be a string" }, 400);
      }
    }

    // Load form + fields.
    const { data: form, error: fErr } = await serviceRoleClient
      .from("form")
      .select("*")
      .eq("id", formId)
      .maybeSingle();
    if (fErr) return c.json({ error: fErr.message }, 500);
    if (!form) return c.json({ error: "form not found" }, 404);
    if ((form as any).org_id !== orgId) return c.json({ error: "form not in this org" }, 404);

    const f = form as any;
    if (f.status !== "published") {
      return c.json({ error: "form not accepting responses" }, 400);
    }
    if (f.deadline && Date.parse(f.deadline) < Date.now()) {
      return c.json({ error: "deadline passed" }, 400);
    }

    // Caller's linked students (for audience + on-behalf-of check).
    const linkedStudents = await callerLinkedStudentIds(caller, orgId);

    // Audience check.
    let audienceOk = false;
    if (f.audience_kind === "whole_school") {
      audienceOk = linkedStudents.length > 0;
    } else if (f.audience_kind === "class_section") {
      if (f.audience_section_id && linkedStudents.length > 0) {
        const { data: stus } = await serviceRoleClient
          .from("student")
          .select("id, class_section_id")
          .in("id", linkedStudents);
        audienceOk = (stus ?? []).some((s: any) => s.class_section_id === f.audience_section_id);
      }
    } else if (f.audience_kind === "specific_students") {
      if (Array.isArray(f.audience_student_ids)) {
        audienceOk = f.audience_student_ids.some((id: string) => linkedStudents.includes(id));
      }
    }
    if (!audienceOk) return c.json({ error: "form not addressed to you" }, 403);

    // onBehalfOf must be one of the caller's linked students.
    if (body.onBehalfOfStudentId && !linkedStudents.includes(body.onBehalfOfStudentId)) {
      return c.json({ error: "onBehalfOfStudentId is not one of your children" }, 403);
    }

    // Duplicate-submission check unless allow_multiple.
    if (!f.allow_multiple) {
      let dupQ = serviceRoleClient.from("form_response").select("id").eq("form_id", formId);
      if (caller.kind === "pin") {
        dupQ = dupQ.eq("submitter_parent_id", caller.subjectId);
      } else {
        dupQ = dupQ.eq("submitter_user_id", caller.userId);
      }
      const { data: dup } = await dupQ.limit(1);
      if (dup && dup.length > 0) {
        return c.json({ error: "already submitted; multiple submissions not allowed" }, 409);
      }
    }

    // Load fields + validate values.
    const { data: fields, error: flErr } = await serviceRoleClient
      .from("form_field")
      .select("*")
      .eq("form_id", formId);
    if (flErr) return c.json({ error: flErr.message }, 500);
    const fieldsById = new Map<string, any>();
    for (const fld of fields ?? []) fieldsById.set((fld as any).id, fld);

    // Index incoming values.
    const valuesByFieldId = new Map<string, any>();
    for (const v of body.values) {
      if (!v?.fieldId || typeof v.fieldId !== "string") {
        return c.json({ error: "every value needs a fieldId" }, 400);
      }
      if (!fieldsById.has(v.fieldId)) {
        return c.json({ error: `field ${v.fieldId} does not belong to this form` }, 400);
      }
      valuesByFieldId.set(v.fieldId, v);
    }

    // Required + type checks.
    const valueInserts: Array<Record<string, unknown>> = [];
    for (const fld of fields ?? []) {
      const fid = (fld as any).id;
      const kind = (fld as any).kind;
      const required = !!(fld as any).required;
      const v = valuesByFieldId.get(fid);
      const isEmpty =
        !v ||
        (v.valueText === undefined &&
          v.valueNumber === undefined &&
          (v.valueMulti === undefined ||
            (Array.isArray(v.valueMulti) && v.valueMulti.length === 0)));
      if (required && isEmpty) {
        return c.json({ error: `field "${(fld as any).label}" is required` }, 400);
      }
      if (isEmpty) continue;

      const row: Record<string, unknown> = {
        field_id: fid,
        value_text: null,
        value_number: null,
        value_multi: null,
      };
      switch (kind) {
        case "short_text":
        case "long_text":
        case "single_select": {
          if (typeof v.valueText !== "string") {
            return c.json({ error: `field "${(fld as any).label}" expects valueText string` }, 400);
          }
          row.value_text = v.valueText;
          break;
        }
        case "number": {
          const n = Number(v.valueNumber);
          if (!Number.isFinite(n)) {
            return c.json({ error: `field "${(fld as any).label}" expects valueNumber` }, 400);
          }
          row.value_number = n;
          break;
        }
        case "multi_select": {
          if (!Array.isArray(v.valueMulti)) {
            return c.json({ error: `field "${(fld as any).label}" expects valueMulti array` }, 400);
          }
          row.value_multi = v.valueMulti;
          break;
        }
        default:
          return c.json({ error: `unknown field kind ${kind}` }, 400);
      }
      valueInserts.push(row);
    }

    // Create response.
    const responseInsert: Record<string, unknown> = {
      form_id: formId,
      on_behalf_of_student_id: body.onBehalfOfStudentId ?? null,
    };
    if (caller.kind === "pin") {
      if (caller.subjectType !== "parent") {
        return c.json({ error: "only parents may submit form responses via PIN" }, 403);
      }
      responseInsert.submitter_parent_id = caller.subjectId;
    } else {
      responseInsert.submitter_user_id = caller.userId;
    }

    const { data: response, error: insErr } = await serviceRoleClient
      .from("form_response")
      .insert(responseInsert)
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    // Insert values; if any fail, roll back the response.
    if (valueInserts.length > 0) {
      const rows = valueInserts.map((r) => ({ ...r, response_id: (response as any).id }));
      const { error: vErr } = await serviceRoleClient.from("form_response_value").insert(rows);
      if (vErr) {
        await serviceRoleClient.from("form_response").delete().eq("id", (response as any).id);
        return c.json({ error: vErr.message }, 500);
      }
    }

    return c.json({ response: responseToJson(response) }, 201);
  });
}

export default installPhaseCD;
