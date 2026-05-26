// =============================================================================
// School Pilot — Phase F routes (announcements + lesson completion + PIN fees)
//
// Mounted onto the existing `school` Hono sub-app via installAnnounce(school)
// (invoked from school.tsx).
//
// Creator endpoints (require family JWT, inherit requireAuth):
//   POST   /school/orgs/:orgId/announcements
//   GET    /school/orgs/:orgId/announcements?creatorOnly=true
//   GET    /school/orgs/:orgId/announcements/:announcementId
//   DELETE /school/orgs/:orgId/announcements/:announcementId
//
//   GET    /school/orgs/:orgId/sections/:sectionId/lessons/:lessonId/completions
//
// PIN-authenticated endpoints (X-Pin-Token, /pin-me/* bypasses requireAuth):
//   GET    /school/pin-me/announcements
//   POST   /school/pin-me/students/:studentId/lessons/:lessonId/complete
//   DELETE /school/pin-me/students/:studentId/lessons/:lessonId/complete
//   GET    /school/pin-me/students/:studentId/lessons/:lessonId/completion
//   GET    /school/pin-me/students/:studentId/fees
// =============================================================================

import type { Hono, Context } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { verifyPinToken } from "./schoolPhaseA.tsx";
import type { PinTokenPayload } from "./schoolPhaseA.tsx";

// -----------------------------------------------------------------------------
// Permission helpers (duplicate of schoolPhaseB pattern, self-contained).
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
    console.error("[schoolAnnounce.userHasRoleRow] DB error:", error);
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
    console.error("[schoolAnnounce.hasAnyRoleInOrg] DB error:", error);
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

// Returns set of section ids this teacher "owns":
//   - class_section.class_teacher_user_id = userId (in this org)
//   - user_roles with role_type=visiting_teacher, scope_type=class, scope_id=<sectionId>
//     and the section belongs to this org.
async function getTeacherSections(userId: string, orgId: string): Promise<string[]> {
  const out = new Set<string>();

  // 1) Class teacher rows. class_section -> class -> org_id.
  const { data: ctRows, error: ctErr } = await serviceRoleClient
    .from("class_section")
    .select("id, class:class_id(org_id)")
    .eq("class_teacher_user_id", userId);
  if (!ctErr && ctRows) {
    for (const r of ctRows as any[]) {
      if (r?.class?.org_id === orgId) out.add(r.id);
    }
  }

  // 2) visiting_teacher rows scoped to specific class_section ids.
  const { data: vtRows, error: vtErr } = await serviceRoleClient
    .from("user_roles")
    .select("scope_id")
    .eq("user_id", userId)
    .eq("role_type", "visiting_teacher")
    .eq("scope_type", "class")
    .is("revoked_at", null);
  if (!vtErr && vtRows && vtRows.length > 0) {
    const ids = (vtRows as any[]).map((r) => r.scope_id).filter(Boolean);
    if (ids.length > 0) {
      const { data: secs } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .in("id", ids);
      if (secs) {
        for (const r of secs as any[]) {
          if (r?.class?.org_id === orgId) out.add(r.id);
        }
      }
    }
  }

  return Array.from(out);
}

// -----------------------------------------------------------------------------
// PIN auth helper (reads X-Pin-Token directly to avoid coupling to schoolPortal).
// -----------------------------------------------------------------------------
async function requirePin(
  c: Context,
): Promise<PinTokenPayload | { __error: true; status: 401; body: { error: string } }> {
  const header = c.req.header("X-Pin-Token") || "";
  if (!header) return { __error: true, status: 401, body: { error: "missing pin token" } };
  const payload = await verifyPinToken(header);
  if (!payload) {
    return { __error: true, status: 401, body: { error: "invalid or expired pin token" } };
  }
  return payload;
}

async function resolveAccessibleStudents(subject: PinTokenPayload): Promise<string[]> {
  if (subject.subjectType === "student") return [subject.subjectId];
  const { data, error } = await serviceRoleClient
    .from("student_parent")
    .select("student_id")
    .eq("parent_id", subject.subjectId);
  if (error) {
    console.error("[schoolAnnounce.resolveAccessibleStudents]", error);
    return [];
  }
  return (data ?? []).map((r: any) => r.student_id);
}

// -----------------------------------------------------------------------------
// Row shapes
// -----------------------------------------------------------------------------
const AUDIENCE_KINDS = new Set([
  "whole_school",
  "class_section",
  "parents_only",
  "students_only",
  "specific_students",
]);

function announcementToJson(r: any, authorName?: string | null) {
  return {
    id: r.id,
    orgId: r.org_id,
    authorUserId: r.author_user_id,
    authorName: authorName ?? null,
    audienceKind: r.audience_kind,
    audienceSectionId: r.audience_section_id,
    audienceStudentIds: r.audience_student_ids ?? [],
    title: r.title,
    body: r.body,
    attachments: r.attachments ?? [],
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

function feeToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    studentId: r.student_id,
    period: r.period,
    amountDue: r.amount_due === null || r.amount_due === undefined ? null : Number(r.amount_due),
    amountPaid: r.amount_paid === null || r.amount_paid === undefined ? null : Number(r.amount_paid),
    status: r.status,
    dueDate: r.due_date,
    paidDate: r.paid_date,
    receiptUrl: r.receipt_url,
    notes: r.notes,
    recordedBy: r.recorded_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Batch resolve auth.users names for display.
async function resolveAuthorNames(userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = Array.from(new Set(userIds.filter(Boolean)));
  if (uniq.length === 0) return out;
  // Try kv-like store? Use admin auth API via service-role client.
  for (const uid of uniq) {
    try {
      // @ts-ignore — supabase-js admin api
      const { data, error } = await (serviceRoleClient as any).auth.admin.getUserById(uid);
      if (!error && data?.user) {
        const u = data.user;
        const name =
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.email ||
          null;
        out.set(uid, name);
      } else {
        out.set(uid, null);
      }
    } catch (e) {
      console.error("[schoolAnnounce.resolveAuthorNames]", e);
      out.set(uid, null);
    }
  }
  return out;
}

// =============================================================================
// installAnnounce
// =============================================================================
export function installAnnounce(school: Hono): void {
  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/announcements — create
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/announcements", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body?.body === "string" ? body.body : "";
    const audienceKind = body?.audienceKind;
    const audienceSectionId = body?.audienceSectionId ?? null;
    const audienceStudentIds: string[] = Array.isArray(body?.audienceStudentIds)
      ? body.audienceStudentIds.filter((x: any) => typeof x === "string")
      : [];
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
    const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt : null;

    if (!title) return c.json({ error: "title required" }, 400);
    if (!bodyText) return c.json({ error: "body required" }, 400);
    if (!AUDIENCE_KINDS.has(audienceKind)) {
      return c.json({ error: "invalid audienceKind" }, 400);
    }
    if (audienceKind === "class_section" && !audienceSectionId) {
      return c.json({ error: "audienceSectionId required for class_section" }, 400);
    }
    if (audienceKind === "specific_students" && audienceStudentIds.length === 0) {
      return c.json({ error: "audienceStudentIds required for specific_students" }, 400);
    }

    // Permission: admin/principal can target anything in org.
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin) {
      // class_teacher / visiting_teacher only — must constrain to their sections.
      const teacherSections = await getTeacherSections(userId, orgId);
      if (teacherSections.length === 0) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (audienceKind === "whole_school" || audienceKind === "parents_only" || audienceKind === "students_only") {
        return c.json({ error: "forbidden: only admin/principal can post school-wide" }, 403);
      }
      if (audienceKind === "class_section") {
        if (!teacherSections.includes(audienceSectionId)) {
          return c.json({ error: "forbidden: not your section" }, 403);
        }
      }
      if (audienceKind === "specific_students") {
        // Verify every student is in one of the teacher's sections.
        const { data: stus, error: stuErr } = await serviceRoleClient
          .from("student")
          .select("id, class_section_id, org_id")
          .in("id", audienceStudentIds);
        if (stuErr) return c.json({ error: stuErr.message }, 500);
        for (const s of stus ?? []) {
          if ((s as any).org_id !== orgId) {
            return c.json({ error: "forbidden: student not in org" }, 403);
          }
          const secId = (s as any).class_section_id;
          if (!secId || !teacherSections.includes(secId)) {
            return c.json({ error: "forbidden: student not in your sections" }, 403);
          }
        }
      }
    }

    // Verify audience section, if provided, belongs to org.
    if (audienceSectionId) {
      const { data: sec } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .eq("id", audienceSectionId)
        .maybeSingle();
      if (!sec || (sec as any).class?.org_id !== orgId) {
        return c.json({ error: "section not in this org" }, 404);
      }
    }

    const insertRow: any = {
      org_id: orgId,
      author_user_id: userId,
      audience_kind: audienceKind,
      audience_section_id: audienceSectionId,
      audience_student_ids: audienceKind === "specific_students" ? audienceStudentIds : null,
      title,
      body: bodyText,
      attachments,
      expires_at: expiresAt,
    };

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("announcement")
      .insert(insertRow)
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ announcement: announcementToJson(ins) }, 201);
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/announcements
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/announcements", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const creatorOnly = c.req.query("creatorOnly") === "true";
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);

    let q = serviceRoleClient
      .from("announcement")
      .select("*")
      .eq("org_id", orgId)
      .order("published_at", { ascending: false })
      .limit(200);

    if (creatorOnly || !isAdmin) {
      q = q.eq("author_user_id", userId);
    }

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    const names = await resolveAuthorNames(((data ?? []) as any[]).map((r) => r.author_user_id));
    const announcements = (data ?? []).map((r: any) =>
      announcementToJson(r, names.get(r.author_user_id) ?? null),
    );
    return c.json({ announcements });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/announcements/:announcementId
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/announcements/:announcementId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("announcementId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: row, error } = await serviceRoleClient
      .from("announcement")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!row) return c.json({ error: "not found" }, 404);
    if ((row as any).org_id !== orgId) return c.json({ error: "not found" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && (row as any).author_user_id !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const names = await resolveAuthorNames([(row as any).author_user_id]);
    return c.json({
      announcement: announcementToJson(row, names.get((row as any).author_user_id) ?? null),
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/announcements/:announcementId
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/announcements/:announcementId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("announcementId");

    const { data: row, error: rErr } = await serviceRoleClient
      .from("announcement")
      .select("id, org_id, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (rErr) return c.json({ error: rErr.message }, 500);
    if (!row) return c.json({ error: "not found" }, 404);
    if ((row as any).org_id !== orgId) return c.json({ error: "not found" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && (row as any).author_user_id !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("announcement")
      .delete()
      .eq("id", id);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/announcements — recipient feed
  // ---------------------------------------------------------------------------
  school.get("/pin-me/announcements", async (c) => {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return c.json(e.body, e.status);
    }
    const subject = auth as PinTokenPayload;

    // Resolve accessible students + section ids for filter.
    const studentIds = await resolveAccessibleStudents(subject);
    let sectionIds: string[] = [];
    if (studentIds.length > 0) {
      const { data: stus } = await serviceRoleClient
        .from("student")
        .select("id, class_section_id")
        .in("id", studentIds);
      sectionIds = ((stus ?? []) as any[])
        .map((s) => s.class_section_id)
        .filter((x) => !!x);
    }

    // Pull recent announcements for this org and filter in-memory (small set).
    const { data, error } = await serviceRoleClient
      .from("announcement")
      .select("*")
      .eq("org_id", subject.orgId)
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);

    const now = Date.now();
    const matched = ((data ?? []) as any[]).filter((r) => {
      if (r.expires_at && new Date(r.expires_at).getTime() < now) return false;
      const kind = r.audience_kind;
      if (kind === "whole_school") return true;
      if (subject.subjectType === "student") {
        if (kind === "students_only") return true;
        if (kind === "class_section") {
          return sectionIds.includes(r.audience_section_id);
        }
        if (kind === "specific_students") {
          const ids: string[] = r.audience_student_ids ?? [];
          return studentIds.some((sid) => ids.includes(sid));
        }
        return false;
      }
      // parent
      if (kind === "parents_only") return true;
      if (kind === "class_section") {
        return sectionIds.includes(r.audience_section_id);
      }
      if (kind === "specific_students") {
        const ids: string[] = r.audience_student_ids ?? [];
        return studentIds.some((sid) => ids.includes(sid));
      }
      return false;
    }).slice(0, 50);

    const names = await resolveAuthorNames(matched.map((r) => r.author_user_id));
    const announcements = matched.map((r) =>
      announcementToJson(r, names.get(r.author_user_id) ?? null),
    );
    return c.json({ announcements });
  });

  // ===========================================================================
  // Lesson completion
  // ===========================================================================

  // Helper: validate student access for pin subject + ensure student is the
  // subject themselves (writes only allowed by student, not parent).
  async function gateStudentSelf(
    c: Context,
  ): Promise<
    | { ok: true; subject: PinTokenPayload; studentId: string; lessonId: string }
    | { ok: false; resp: Response }
  > {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return { ok: false, resp: c.json(e.body, e.status) };
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    const lessonId = c.req.param("lessonId");
    if (!studentId || !lessonId) {
      return { ok: false, resp: c.json({ error: "studentId and lessonId required" }, 400) };
    }
    if (subject.subjectType !== "student" || subject.subjectId !== studentId) {
      return { ok: false, resp: c.json({ error: "forbidden: only the student may mark complete" }, 403) };
    }
    // Verify the lesson is for the student's section.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, class_section_id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return { ok: false, resp: c.json({ error: "student not found" }, 404) };
    if ((stu as any).org_id !== subject.orgId) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    const { data: lesson } = await serviceRoleClient
      .from("lesson")
      .select("id, org_id, class_section_id")
      .eq("id", lessonId)
      .maybeSingle();
    if (!lesson) return { ok: false, resp: c.json({ error: "lesson not found" }, 404) };
    if ((lesson as any).org_id !== subject.orgId) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    if ((lesson as any).class_section_id !== (stu as any).class_section_id) {
      return { ok: false, resp: c.json({ error: "forbidden: lesson not for student's section" }, 403) };
    }
    return { ok: true, subject, studentId, lessonId };
  }

  // Helper for GET completion — allow parent too (read).
  async function gateStudentRead(
    c: Context,
  ): Promise<
    | { ok: true; subject: PinTokenPayload; studentId: string; lessonId: string }
    | { ok: false; resp: Response }
  > {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return { ok: false, resp: c.json(e.body, e.status) };
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    const lessonId = c.req.param("lessonId");
    if (!studentId || !lessonId) {
      return { ok: false, resp: c.json({ error: "studentId and lessonId required" }, 400) };
    }
    const accessible = await resolveAccessibleStudents(subject);
    if (!accessible.includes(studentId)) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    return { ok: true, subject, studentId, lessonId };
  }

  // POST /school/pin-me/students/:studentId/lessons/:lessonId/complete
  school.post("/pin-me/students/:studentId/lessons/:lessonId/complete", async (c) => {
    const g = await gateStudentSelf(c);
    if (!g.ok) return g.resp;
    const { subject, studentId, lessonId } = g;

    const { data: existing } = await serviceRoleClient
      .from("lesson_completion")
      .select("id, completed_at")
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (existing) {
      return c.json({ ok: true, completedAt: (existing as any).completed_at });
    }

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("lesson_completion")
      .insert({
        org_id: subject.orgId,
        lesson_id: lessonId,
        student_id: studentId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ ok: true, completedAt: (ins as any).completed_at });
  });

  // DELETE /school/pin-me/students/:studentId/lessons/:lessonId/complete
  school.delete("/pin-me/students/:studentId/lessons/:lessonId/complete", async (c) => {
    const g = await gateStudentSelf(c);
    if (!g.ok) return g.resp;
    const { studentId, lessonId } = g;

    const { error: delErr } = await serviceRoleClient
      .from("lesson_completion")
      .delete()
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // GET /school/pin-me/students/:studentId/lessons/:lessonId/completion
  school.get("/pin-me/students/:studentId/lessons/:lessonId/completion", async (c) => {
    const g = await gateStudentRead(c);
    if (!g.ok) return g.resp;
    const { studentId, lessonId } = g;

    const { data, error } = await serviceRoleClient
      .from("lesson_completion")
      .select("completed_at")
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);

    if (!data) return c.json({ completed: false, completedAt: null });
    return c.json({ completed: true, completedAt: (data as any).completed_at });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/lessons/:lessonId/completions
  // Teacher-of-section OR admin+.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/lessons/:lessonId/completions", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const lessonId = c.req.param("lessonId");

    // Verify section belongs to org.
    const { data: sec } = await serviceRoleClient
      .from("class_section")
      .select("id, class_teacher_user_id, class:class_id(org_id)")
      .eq("id", sectionId)
      .maybeSingle();
    if (!sec || (sec as any).class?.org_id !== orgId) {
      return c.json({ error: "section not in this org" }, 404);
    }

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    let allowed = isAdmin;
    if (!allowed) {
      if ((sec as any).class_teacher_user_id === userId) {
        allowed = true;
      } else if (await userHasRoleRow(userId, "visiting_teacher", "class", sectionId)) {
        allowed = true;
      } else if (await userHasRoleRow(userId, "visiting_teacher", "organization", orgId)) {
        allowed = true;
      }
    }
    if (!allowed) return c.json({ error: "forbidden" }, 403);

    // Verify lesson exists + belongs to section.
    const { data: lesson } = await serviceRoleClient
      .from("lesson")
      .select("id, class_section_id, org_id")
      .eq("id", lessonId)
      .maybeSingle();
    if (!lesson) return c.json({ error: "lesson not found" }, 404);
    if ((lesson as any).org_id !== orgId || (lesson as any).class_section_id !== sectionId) {
      return c.json({ error: "lesson not in this section" }, 404);
    }

    const { data: comps, error: compErr } = await serviceRoleClient
      .from("lesson_completion")
      .select("student_id, completed_at")
      .eq("lesson_id", lessonId);
    if (compErr) return c.json({ error: compErr.message }, 500);

    const { count: sectionSize } = await serviceRoleClient
      .from("student")
      .select("id", { count: "exact", head: true })
      .eq("class_section_id", sectionId);

    const completions = (comps ?? []).map((r: any) => ({
      studentId: r.student_id,
      completedAt: r.completed_at,
    }));
    return c.json({
      completions,
      totalStudents: sectionSize ?? 0,
      completedCount: completions.length,
    });
  });

  // ===========================================================================
  // GET /school/pin-me/students/:studentId/fees
  // ===========================================================================
  school.get("/pin-me/students/:studentId/fees", async (c) => {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return c.json(e.body, e.status);
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    if (!studentId) return c.json({ error: "studentId required" }, 400);

    const accessible = await resolveAccessibleStudents(subject);
    if (!accessible.includes(studentId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Verify same org.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    if ((stu as any).org_id !== subject.orgId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("fee_status")
      .select("*")
      .eq("student_id", studentId)
      .order("period", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ fees: (data ?? []).map(feeToJson) });
  });
}

export default installAnnounce;
