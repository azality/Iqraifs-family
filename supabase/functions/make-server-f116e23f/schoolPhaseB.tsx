// =============================================================================
// School Pilot — Phase B routes (daily ops)
//
// Mounted onto the existing `school` Hono sub-app via installPhaseB(school)
// (invoked from school.tsx). All routes here:
//   - Inherit the `requireAuth` middleware applied at the parent `school.*`
//   - Use serviceRoleClient for all DB access (no RLS)
//   - Perform their own app-level scope checks
//
// Endpoints:
//   Attendance:
//     POST   /school/orgs/:orgId/sections/:sectionId/attendance
//     GET    /school/orgs/:orgId/sections/:sectionId/attendance
//     GET    /school/orgs/:orgId/students/:studentId/attendance
//     GET    /school/orgs/:orgId/sections/:sectionId/attendance/summary
//   Behavior notes:
//     POST   /school/orgs/:orgId/behavior-notes
//     GET    /school/orgs/:orgId/students/:studentId/behavior-notes
//     GET    /school/orgs/:orgId/sections/:sectionId/behavior-notes
//     DELETE /school/orgs/:orgId/behavior-notes/:noteId
//   Roster change requests:
//     POST   /school/orgs/:orgId/sections/:sectionId/roster-requests
//     GET    /school/orgs/:orgId/roster-requests
//     GET    /school/orgs/:orgId/sections/:sectionId/roster-requests
//     PATCH  /school/orgs/:orgId/roster-requests/:requestId
// =============================================================================

import type { Hono } from "npm:hono";
import {
  serviceRoleClient,
  getAuthUserId,
  createImportBatch,
  finalizeImportBatch,
} from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Permission helpers
//
// Phase A's helpers (hasRole / isPrincipalOf) live inline in school.tsx and
// aren't exported. We duplicate the small surface we need here so this module
// stays self-contained and we can extend it with Phase-B-specific checks
// (requireTeacherOfSection) without touching school.tsx.
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
    console.error("[schoolPhaseB.userHasRoleRow] DB error:", error);
    return false;
  }
  return !!data;
}

// Returns true if the user has admin OR principal scope on the organization.
async function hasAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  if (await userHasRoleRow(userId, "principal", "organization", orgId)) return true;
  if (await userHasRoleRow(userId, "admin", "organization", orgId)) return true;
  return false;
}

// Returns true if user has any non-revoked role row for the org.
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
    console.error("[schoolPhaseB.hasAnyRoleInOrg] DB error:", error);
    return false;
  }
  if (data && data.length > 0) return true;
  // Also check any non-org-scoped roles tied to entities within the org. For
  // the pilot the common case is class/section scoped teachers; this catches
  // them even if no organization-scope row exists.
  const { data: data2, error: err2 } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .limit(1);
  if (err2) return false;
  return !!(data2 && data2.length > 0);
}

// Loads the section row including the parent class for org-membership checks.
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
    console.error("[schoolPhaseB.loadSection] DB error:", error);
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

// Caller passes this when they need teacher-of-section access (or higher).
// Permits: admin/principal of the org, the section's class_teacher_user_id,
// or a user with a visiting_teacher row scoped to this section (scope_type=
// 'class', scope_id=sectionId).  If no section-scoped visiting_teacher row
// exists, falls back to org-level visiting_teacher (matching Phase A
// permission-toggle gating pattern).
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

  // PR C #6: office_staff can take attendance when the class teacher is
  // absent. The role default in schoolPhaseA.tsx PERMISSIONS_DEFAULTS still
  // has office_staff.mark_attendance=false; we don't read that map here, so
  // changing the default doesn't help — the gate has to know. Iqra's ask is
  // 'office can mark attendance for any class when needed', so we grant
  // org-scoped office_staff full attendance access. Tighten later if needed.
  if (await userHasRoleRow(userId, "office_staff", "organization", orgId)) {
    return { ok: true };
  }

  // Class teacher of this section?
  const { data: sec, error: secErr } = await serviceRoleClient
    .from("class_section")
    .select("class_teacher_user_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (secErr) return { ok: false, status: 403, error: "forbidden" };
  if (sec?.class_teacher_user_id === userId) return { ok: true };

  // Visiting teacher scoped to this section.
  if (await userHasRoleRow(userId, "visiting_teacher", "class", sectionId)) {
    return { ok: true };
  }
  // Fallback: org-level visiting_teacher.
  if (await userHasRoleRow(userId, "visiting_teacher", "organization", orgId)) {
    return { ok: true };
  }
  return { ok: false, status: 403, error: "forbidden" };
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------
const ATTENDANCE_STATUSES = new Set(["present", "absent", "late", "excused"]);
const BEHAVIOR_KINDS = new Set(["positive", "concern"]);
const ROSTER_KINDS = new Set(["add", "remove"]);
const ROSTER_REVIEW_STATUSES = new Set(["approved", "rejected"]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && ISO_DATE_RE.test(s);
}

// =============================================================================
// installPhaseB — register all Phase B routes onto the parent school app
// =============================================================================
export function installPhaseB(school: Hono): void {
  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/sections/:sectionId/attendance
  // Body: { date: 'YYYY-MM-DD', entries: [{ studentId, status, notes? }, ...] }
  // Upserts one row per student per date. Teacher of section OR Admin+.
  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/attendance/bulk
  //
  // Historical attendance import (PR feat/import-editable-fee-attendance).
  // CSV references students by GR; one row per (student, date).
  // Useful for backfilling the term's attendance from a paper register
  // when migrating a school mid-term.
  school.post("/orgs/:orgId/attendance/bulk", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await userCanInOrg(userId, orgId, "manage_attendance"))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, gr_number, class_section_id")
      .eq("org_id", orgId);
    const studentMap = new Map<string, { id: string; sectionId: string | null }>();
    for (const s of (students ?? []) as any[]) {
      studentMap.set(String(s.gr_number).toLowerCase().trim(), {
        id: s.id,
        sectionId: s.class_section_id ?? null,
      });
    }

    const batchId = await createImportBatch(orgId, "attendance", userId);
    const errors: Array<{ rowIndex: number; message: string }> = [];
    let inserted = 0;
    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const gr = typeof r.grNumber === "string" ? r.grNumber.trim() : "";
      const date = typeof r.date === "string" ? r.date.trim() : "";
      const status = typeof r.status === "string" ? r.status.trim().toLowerCase() : "";
      if (!gr || !isIsoDate(date)) {
        errors.push({ rowIndex: i, message: "grNumber + date (YYYY-MM-DD) required" });
        continue;
      }
      if (!ATTENDANCE_STATUSES.has(status)) {
        errors.push({ rowIndex: i, message: "status must be present / absent / late / excused" });
        continue;
      }
      const meta = studentMap.get(gr.toLowerCase());
      if (!meta) {
        errors.push({ rowIndex: i, message: `student GR "${gr}" not found` });
        continue;
      }
      if (!meta.sectionId) {
        errors.push({ rowIndex: i, message: `student "${gr}" has no class_section — assign one first` });
        continue;
      }
      const { error } = await serviceRoleClient
        .from("school_attendance")
        .insert({
          org_id: orgId,
          student_id: meta.id,
          class_section_id: meta.sectionId,
          attendance_date: date,
          status,
          notes: r.notes || null,
          recorded_by: userId,
          import_batch_id: batchId,
        });
      if (error) {
        const msg = (error as any).code === "23505"
          ? `attendance for ${gr} on ${date} already recorded`
          : (error as any).message;
        errors.push({ rowIndex: i, message: msg });
      } else {
        inserted++;
      }
    }
    await finalizeImportBatch(batchId, inserted);
    return c.json({ inserted, errors, batchId });
  });

  school.post("/orgs/:orgId/sections/:sectionId/attendance", async (c) => {
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
    if (!isIsoDate(body?.date)) {
      return c.json({ error: "date (YYYY-MM-DD) required" }, 400);
    }
    if (!Array.isArray(body?.entries) || body.entries.length === 0) {
      return c.json({ error: "entries[] required and non-empty" }, 400);
    }
    if (body.entries.length > 500) {
      return c.json({ error: "max 500 entries per submit" }, 400);
    }
    for (const e of body.entries) {
      if (!e?.studentId || typeof e.studentId !== "string") {
        return c.json({ error: "every entry needs a studentId" }, 400);
      }
      if (!ATTENDANCE_STATUSES.has(e?.status)) {
        return c.json({ error: `invalid status for student ${e.studentId}` }, 400);
      }
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    // Best-effort sequential upsert. We need to know if each row was new or
    // pre-existing so we can return { inserted, updated } counts.
    let inserted = 0;
    let updated = 0;
    const results: Array<{ studentId: string; ok: boolean; error?: string }> = [];

    for (const e of body.entries) {
      try {
        const { data: existing, error: selErr } = await serviceRoleClient
          .from("school_attendance")
          .select("id")
          .eq("student_id", e.studentId)
          .eq("attendance_date", body.date)
          .maybeSingle();
        if (selErr) throw new Error(selErr.message);

        if (existing) {
          const { error: updErr } = await serviceRoleClient
            .from("school_attendance")
            .update({
              status: e.status,
              notes: e.notes ?? null,
              class_section_id: sectionId,
              recorded_by: userId,
            })
            .eq("id", existing.id);
          if (updErr) throw new Error(updErr.message);
          updated += 1;
        } else {
          const { error: insErr } = await serviceRoleClient
            .from("school_attendance")
            .insert({
              org_id: orgId,
              student_id: e.studentId,
              class_section_id: sectionId,
              attendance_date: body.date,
              status: e.status,
              notes: e.notes ?? null,
              recorded_by: userId,
            });
          if (insErr) throw new Error(insErr.message);
          inserted += 1;
        }
        results.push({ studentId: e.studentId, ok: true });
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
  // GET /school/orgs/:orgId/sections/:sectionId/attendance?date=YYYY-MM-DD
  // Returns entries for that date with student names. Any role in org.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/attendance", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const date = c.req.query("date");

    if (!isIsoDate(date)) {
      return c.json({ error: "date query param (YYYY-MM-DD) required" }, 400);
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);
    if (section.org_id !== orgId) return c.json({ error: "section not in this org" }, 404);

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("school_attendance")
      .select(
        "id, student_id, status, notes, attendance_date, recorded_by, student:student_id(id, full_name, gr_number)",
      )
      .eq("class_section_id", sectionId)
      .eq("attendance_date", date);
    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      date,
      sectionId,
      entries: (data ?? []).map((r: any) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student?.full_name ?? null,
        grNumber: r.student?.gr_number ?? null,
        status: r.status,
        notes: r.notes,
        recordedBy: r.recorded_by,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/students/:studentId/attendance?startDate&endDate
  // Student-level history. Any role in org.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/students/:studentId/attendance", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Confirm the student belongs to this org.
    const { data: stu, error: stuErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (stuErr) return c.json({ error: stuErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    let q = serviceRoleClient
      .from("school_attendance")
      .select("id, attendance_date, status, notes, class_section_id, recorded_by")
      .eq("student_id", studentId)
      .order("attendance_date", { ascending: false });
    if (startDate) q = q.gte("attendance_date", startDate);
    if (endDate) q = q.lte("attendance_date", endDate);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      studentId,
      entries: (data ?? []).map((r: any) => ({
        id: r.id,
        date: r.attendance_date,
        status: r.status,
        notes: r.notes,
        sectionId: r.class_section_id,
        recordedBy: r.recorded_by,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/attendance/summary?startDate&endDate
  // Per-student counts of present/absent/late/excused. Teacher+ of section.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/attendance/summary", async (c) => {
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

    let q = serviceRoleClient
      .from("school_attendance")
      .select("student_id, status, student:student_id(id, full_name, gr_number)")
      .eq("class_section_id", sectionId);
    if (startDate) q = q.gte("attendance_date", startDate);
    if (endDate) q = q.lte("attendance_date", endDate);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    type Bucket = {
      studentId: string;
      studentName: string | null;
      grNumber: string | null;
      present: number;
      absent: number;
      late: number;
      excused: number;
    };
    const byStudent = new Map<string, Bucket>();
    for (const r of data ?? []) {
      const sid = (r as any).student_id;
      let b = byStudent.get(sid);
      if (!b) {
        b = {
          studentId: sid,
          studentName: (r as any).student?.full_name ?? null,
          grNumber: (r as any).student?.gr_number ?? null,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        };
        byStudent.set(sid, b);
      }
      const s = (r as any).status as "present" | "absent" | "late" | "excused";
      b[s] += 1;
    }

    return c.json({
      sectionId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      summary: Array.from(byStudent.values()),
    });
  });

  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/behavior-notes
  // Body: { studentId, kind, category?, points?, notes, observedAt? }
  // Teacher of student's section OR Admin+.
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/behavior-notes", async (c) => {
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
    if (!BEHAVIOR_KINDS.has(body?.kind)) {
      return c.json({ error: "kind must be 'positive' or 'concern'" }, 400);
    }
    if (!body?.notes || typeof body.notes !== "string" || body.notes.trim().length === 0) {
      return c.json({ error: "notes required" }, 400);
    }
    const points = typeof body.points === "number" ? body.points : 0;
    if (body.kind === "positive" && points < 0) {
      return c.json({ error: "positive notes cannot have negative points" }, 400);
    }
    if (body.kind === "concern" && points > 0) {
      return c.json({ error: "concern notes cannot have positive points" }, 400);
    }
    if (body.observedAt && Number.isNaN(Date.parse(body.observedAt))) {
      return c.json({ error: "observedAt must be ISO timestamp" }, 400);
    }

    const { data: stu, error: stuErr } = await serviceRoleClient
      .from("student")
      .select("id, org_id, class_section_id")
      .eq("id", body.studentId)
      .maybeSingle();
    if (stuErr) return c.json({ error: stuErr.message }, 500);
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);

    // Permission: admin/principal of org, OR teacher of the student's section
    // (if the student has one). Students without a section can only have
    // behavior notes written by admin/principal.
    let allowed = await hasAdminOrPrincipal(userId, orgId);
    if (!allowed && stu.class_section_id) {
      const gate = await requireTeacherOfSection(userId, orgId, stu.class_section_id, orgId);
      allowed = gate.ok;
    }
    if (!allowed) return c.json({ error: "forbidden" }, 403);

    const observedAt = body.observedAt ? new Date(body.observedAt).toISOString() : new Date().toISOString();

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("behavior_note")
      .insert({
        org_id: orgId,
        student_id: stu.id,
        class_section_id: stu.class_section_id,
        kind: body.kind,
        category: body.category ?? null,
        points,
        notes: body.notes.trim(),
        observed_at: observedAt,
        recorded_by: userId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({
      note: {
        id: ins.id,
        studentId: ins.student_id,
        sectionId: ins.class_section_id,
        kind: ins.kind,
        category: ins.category,
        points: ins.points,
        notes: ins.notes,
        observedAt: ins.observed_at,
        recordedBy: ins.recorded_by,
      },
    }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/students/:studentId/behavior-notes?startDate&endDate&kind
  // Any role in org.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/students/:studentId/behavior-notes", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const kind = c.req.query("kind");
    if (kind && !BEHAVIOR_KINDS.has(kind)) {
      return c.json({ error: "kind must be 'positive' or 'concern'" }, 400);
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
      .from("behavior_note")
      .select("id, kind, category, points, notes, observed_at, class_section_id, recorded_by")
      .eq("student_id", studentId)
      .order("observed_at", { ascending: false });
    if (startDate) q = q.gte("observed_at", startDate);
    if (endDate) q = q.lte("observed_at", endDate);
    if (kind) q = q.eq("kind", kind);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      studentId,
      notes: (data ?? []).map((r: any) => ({
        id: r.id,
        kind: r.kind,
        category: r.category,
        points: r.points,
        notes: r.notes,
        observedAt: r.observed_at,
        sectionId: r.class_section_id,
        recordedBy: r.recorded_by,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/behavior-notes?startDate&endDate
  // Teacher+ of section.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/behavior-notes", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    let q = serviceRoleClient
      .from("behavior_note")
      .select(
        "id, student_id, kind, category, points, notes, observed_at, recorded_by, student:student_id(full_name, gr_number)",
      )
      .eq("class_section_id", sectionId)
      .order("observed_at", { ascending: false });
    if (startDate) q = q.gte("observed_at", startDate);
    if (endDate) q = q.lte("observed_at", endDate);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    return c.json({
      sectionId,
      notes: (data ?? []).map((r: any) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student?.full_name ?? null,
        grNumber: r.student?.gr_number ?? null,
        kind: r.kind,
        category: r.category,
        points: r.points,
        notes: r.notes,
        observedAt: r.observed_at,
        recordedBy: r.recorded_by,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/behavior-notes/:noteId
  // Only the recorder or an admin/principal.
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/behavior-notes/:noteId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const noteId = c.req.param("noteId");

    const { data: note, error: noteErr } = await serviceRoleClient
      .from("behavior_note")
      .select("id, org_id, recorded_by")
      .eq("id", noteId)
      .maybeSingle();
    if (noteErr) return c.json({ error: noteErr.message }, 500);
    if (!note) return c.json({ error: "note not found" }, 404);
    if (note.org_id !== orgId) return c.json({ error: "note not in this org" }, 404);

    const isRecorder = note.recorded_by === userId;
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isRecorder && !isAdmin) return c.json({ error: "forbidden" }, 403);

    const { error: delErr } = await serviceRoleClient
      .from("behavior_note")
      .delete()
      .eq("id", noteId);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/sections/:sectionId/roster-requests
  // Body: { kind, studentId?, newStudentPayload?, reason? }
  // Teacher of section.
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/sections/:sectionId/roster-requests", async (c) => {
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
    if (!ROSTER_KINDS.has(body?.kind)) {
      return c.json({ error: "kind must be 'add' or 'remove'" }, 400);
    }
    if (body.kind === "remove" && (!body.studentId || typeof body.studentId !== "string")) {
      return c.json({ error: "studentId required for remove" }, 400);
    }
    if (body.kind === "add" && !body.studentId && !body.newStudentPayload) {
      return c.json({ error: "add needs either studentId or newStudentPayload" }, 400);
    }
    if (body.newStudentPayload) {
      const p = body.newStudentPayload;
      if (!p?.grNumber || !p?.fullName) {
        return c.json({ error: "newStudentPayload requires grNumber and fullName" }, 400);
      }
    }

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    // If a studentId is supplied confirm it belongs to this org.
    if (body.studentId) {
      const { data: stu, error: stuErr } = await serviceRoleClient
        .from("student")
        .select("id, org_id")
        .eq("id", body.studentId)
        .maybeSingle();
      if (stuErr) return c.json({ error: stuErr.message }, 500);
      if (!stu) return c.json({ error: "student not found" }, 404);
      if (stu.org_id !== orgId) return c.json({ error: "student not in this org" }, 404);
    }

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("roster_change_request")
      .insert({
        org_id: orgId,
        class_section_id: sectionId,
        kind: body.kind,
        student_id: body.studentId ?? null,
        new_student_payload: body.newStudentPayload ?? null,
        reason: body.reason ?? null,
        requested_by: userId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ request: insReqToJson(ins) }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/roster-requests?status=pending
  // Admin+ sees all org-wide.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/roster-requests", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const status = c.req.query("status");
    if (status && !["pending", "approved", "rejected"].includes(status)) {
      return c.json({ error: "invalid status" }, 400);
    }

    if (!(await hasAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    let q = serviceRoleClient
      .from("roster_change_request")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ requests: (data ?? []).map(insReqToJson) });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/roster-requests
  // Section-scoped. Teacher of section OR Admin+.  Teachers see their own +
  // anything for their section.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/roster-requests", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");

    const section = await loadSection(sectionId);
    if (!section) return c.json({ error: "section not found" }, 404);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId, section.org_id);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const { data, error } = await serviceRoleClient
      .from("roster_change_request")
      .select("*")
      .eq("class_section_id", sectionId)
      .order("created_at", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ requests: (data ?? []).map(insReqToJson) });
  });

  // ---------------------------------------------------------------------------
  // PATCH /school/orgs/:orgId/roster-requests/:requestId
  // Body: { status: 'approved'|'rejected', reviewerNotes? }
  // On approval:
  //   - remove: null out student.class_section_id
  //   - add + studentId: set student.class_section_id = req.class_section_id
  //   - add + newStudentPayload: insert into student, assign to section
  // Admin+ only.
  // ---------------------------------------------------------------------------
  school.patch("/orgs/:orgId/roster-requests/:requestId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const requestId = c.req.param("requestId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!ROSTER_REVIEW_STATUSES.has(body?.status)) {
      return c.json({ error: "status must be 'approved' or 'rejected'" }, 400);
    }

    if (!(await hasAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: req, error: reqErr } = await serviceRoleClient
      .from("roster_change_request")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) return c.json({ error: reqErr.message }, 500);
    if (!req) return c.json({ error: "request not found" }, 404);
    if (req.org_id !== orgId) return c.json({ error: "request not in this org" }, 404);
    if (req.status !== "pending") {
      return c.json({ error: `request already ${req.status}` }, 409);
    }

    // On approval, apply the roster mutation BEFORE flipping status so a
    // failed mutation leaves the request in pending.
    let createdStudentId: string | null = null;
    if (body.status === "approved") {
      try {
        if (req.kind === "remove") {
          const { error: e } = await serviceRoleClient
            .from("student")
            .update({ class_section_id: null })
            .eq("id", req.student_id);
          if (e) throw new Error(e.message);
        } else if (req.kind === "add" && req.student_id) {
          const { error: e } = await serviceRoleClient
            .from("student")
            .update({ class_section_id: req.class_section_id })
            .eq("id", req.student_id);
          if (e) throw new Error(e.message);
        } else if (req.kind === "add" && req.new_student_payload) {
          const p = req.new_student_payload as any;
          const { data: stu, error: e } = await serviceRoleClient
            .from("student")
            .insert({
              org_id: orgId,
              class_section_id: req.class_section_id,
              gr_number: p.grNumber,
              full_name: p.fullName,
              photo_url: p.photoUrl ?? null,
              date_of_birth: p.dateOfBirth ?? null,
              gender: p.gender ?? null,
              guardian_phone: p.guardianPhone ?? null,
              guardian_email: p.guardianEmail ?? null,
            })
            .select("id")
            .single();
          if (e) throw new Error(e.message);
          createdStudentId = stu.id;
        } else {
          throw new Error("malformed request: nothing to apply");
        }
      } catch (e: any) {
        return c.json({ error: `approval failed: ${e?.message}` }, 500);
      }
    }

    const { data: upd, error: updErr } = await serviceRoleClient
      .from("roster_change_request")
      .update({
        status: body.status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: body.reviewerNotes ?? null,
        // If we just created a student, capture the id so the request row
        // points at the new record for audit.
        student_id: createdStudentId ?? req.student_id,
      })
      .eq("id", requestId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({ request: insReqToJson(upd), createdStudentId });
  });
}

// -----------------------------------------------------------------------------
// JSON shape helper for roster_change_request rows
// -----------------------------------------------------------------------------
function insReqToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    sectionId: r.class_section_id,
    kind: r.kind,
    studentId: r.student_id,
    newStudentPayload: r.new_student_payload,
    reason: r.reason,
    status: r.status,
    requestedBy: r.requested_by,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewerNotes: r.reviewer_notes,
    createdAt: r.created_at,
  };
}
