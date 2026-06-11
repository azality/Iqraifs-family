// =============================================================================
// School module — Time-off / absence requests.
//
// Endpoints:
//   Teacher (JWT):
//     POST   /school/orgs/:orgId/me/time-off             create
//     GET    /school/orgs/:orgId/me/time-off             list own
//     PATCH  /school/orgs/:orgId/me/time-off/:id/cancel  cancel own pending
//
//   Parent/student (PIN):
//     POST   /school/pin-me/students/:studentId/time-off create
//     GET    /school/pin-me/students/:studentId/time-off list own
//
//   Admin/principal (JWT):
//     GET    /school/orgs/:orgId/time-off                list all
//     PATCH  /school/orgs/:orgId/time-off/:id/decide     approve|reject
// =============================================================================

import type { Hono, Context } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { verifyPinToken } from "./schoolPhaseA.tsx";

// Inclusive list of ISO dates between start and end (YYYY-MM-DD).
// Capped at 60 days so a runaway "vacation for the next decade"
// request can't blow up the coverage query.
function enumerateDates(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const s = new Date(`${startIso}T00:00:00Z`);
  const e = new Date(`${endIso}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return out;
  const cur = new Date(s);
  let count = 0;
  while (cur <= e && count < 60) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    count++;
  }
  return out;
}

const VALID_KINDS = new Set([
  "vacation", "sick", "personal", "short_break",
  "family_emergency", "medical", "other",
]);

async function isAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  return (data ?? []).some(
    (r: any) => r.role_type === "principal" || r.role_type === "admin",
  );
}

function toJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    subjectName: r.subject_name ?? null,
    kind: r.kind,
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: r.start_time,
    endTime: r.end_time,
    reason: r.reason,
    status: r.status,
    requestedBy: r.requested_by,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewerNotes: r.reviewer_notes,
    createdAt: r.created_at,
  };
}

function parseBody(body: any) {
  const kind = typeof body?.kind === "string" ? body.kind : "";
  if (!VALID_KINDS.has(kind)) return { error: `kind must be one of: ${Array.from(VALID_KINDS).join(", ")}` };
  const startDate = typeof body?.startDate === "string" ? body.startDate : "";
  const endDate = typeof body?.endDate === "string" ? body.endDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "startDate must be YYYY-MM-DD" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { error: "endDate must be YYYY-MM-DD" };
  if (endDate < startDate) return { error: "endDate must be ≥ startDate" };
  const startTime = typeof body?.startTime === "string" && /^\d{2}:\d{2}/.test(body.startTime)
    ? body.startTime : null;
  const endTime = typeof body?.endTime === "string" && /^\d{2}:\d{2}/.test(body.endTime)
    ? body.endTime : null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : null;
  return { kind, startDate, endDate, startTime, endTime, reason };
}

export function installTimeOff(school: Hono): void {
  // ─── Teacher: create + list own + cancel own ─────────────────────
  school.post("/orgs/:orgId/me/time-off", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    // Teacher must have at least one role in this org.
    const { data: roles } = await serviceRoleClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("scope_id", orgId)
      .is("revoked_at", null)
      .limit(1);
    if (!roles || roles.length === 0) return c.json({ error: "not a member of this org" }, 403);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const parsed = parseBody(body);
    if ((parsed as any).error) return c.json({ error: (parsed as any).error }, 400);
    const p = parsed as { kind: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; reason: string | null };

    const { data, error } = await serviceRoleClient
      .from("time_off_request")
      .insert({
        org_id: orgId,
        subject_type: "teacher",
        subject_id: userId,
        kind: p.kind,
        start_date: p.startDate,
        end_date: p.endDate,
        start_time: p.startTime,
        end_time: p.endTime,
        reason: p.reason,
        requested_by: userId,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(toJson(data), 201);
  });

  school.get("/orgs/:orgId/me/time-off", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const { data } = await serviceRoleClient
      .from("time_off_request")
      .select("*")
      .eq("org_id", orgId)
      .eq("subject_type", "teacher")
      .eq("subject_id", userId)
      .order("created_at", { ascending: false });
    return c.json({ requests: (data ?? []).map(toJson) });
  });

  school.patch("/orgs/:orgId/me/time-off/:id/cancel", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("id");
    const { data: row } = await serviceRoleClient
      .from("time_off_request")
      .select("subject_id, status")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!row) return c.json({ error: "not found" }, 404);
    if ((row as any).subject_id !== userId) return c.json({ error: "forbidden" }, 403);
    if ((row as any).status !== "pending") return c.json({ error: "can only cancel pending requests" }, 400);
    const { error } = await serviceRoleClient
      .from("time_off_request")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Parent/student PIN: create + list ───────────────────────────
  school.post("/pin-me/students/:studentId/time-off", async (c: Context) => {
    const header = c.req.header("X-Pin-Token") || "";
    if (!header) return c.json({ error: "missing pin token" }, 401);
    const subj: any = await verifyPinToken(header);
    if (!subj) return c.json({ error: "invalid or expired pin token" }, 401);
    const studentId = c.req.param("studentId");

    // Scope check.
    if (subj.subjectType === "student" && subj.subjectId !== studentId) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (subj.subjectType === "parent") {
      const { data: link } = await serviceRoleClient
        .from("student_parent")
        .select("student_id")
        .eq("parent_id", subj.subjectId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (!link) return c.json({ error: "forbidden" }, 403);
    }

    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const parsed = parseBody(body);
    if ((parsed as any).error) return c.json({ error: (parsed as any).error }, 400);
    const p = parsed as { kind: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; reason: string | null };

    const { data, error } = await serviceRoleClient
      .from("time_off_request")
      .insert({
        org_id: (stu as any).org_id,
        subject_type: "student",
        subject_id: studentId,
        kind: p.kind,
        start_date: p.startDate,
        end_date: p.endDate,
        start_time: p.startTime,
        end_time: p.endTime,
        reason: p.reason,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(toJson(data), 201);
  });

  school.get("/pin-me/students/:studentId/time-off", async (c: Context) => {
    const header = c.req.header("X-Pin-Token") || "";
    if (!header) return c.json({ error: "missing pin token" }, 401);
    const subj: any = await verifyPinToken(header);
    if (!subj) return c.json({ error: "invalid or expired pin token" }, 401);
    const studentId = c.req.param("studentId");

    if (subj.subjectType === "student" && subj.subjectId !== studentId) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (subj.subjectType === "parent") {
      const { data: link } = await serviceRoleClient
        .from("student_parent")
        .select("student_id")
        .eq("parent_id", subj.subjectId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (!link) return c.json({ error: "forbidden" }, 403);
    }
    const { data } = await serviceRoleClient
      .from("time_off_request")
      .select("*")
      .eq("subject_type", "student")
      .eq("subject_id", studentId)
      .order("created_at", { ascending: false });
    return c.json({ requests: (data ?? []).map(toJson) });
  });

  // ─── Admin: list all + decide ────────────────────────────────────
  school.get("/orgs/:orgId/time-off", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const status = c.req.query("status");
    let q = serviceRoleClient
      .from("time_off_request")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
      q = q.eq("status", status);
    }
    const { data } = await q;

    // Resolve subject display names — students by id, teachers by auth lookup.
    const studentIds = (data ?? []).filter((r: any) => r.subject_type === "student").map((r: any) => r.subject_id);
    const teacherIds = (data ?? []).filter((r: any) => r.subject_type === "teacher").map((r: any) => r.subject_id);
    const nameById = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: studs } = await serviceRoleClient
        .from("student")
        .select("id, full_name")
        .in("id", studentIds);
      for (const s of (studs ?? []) as any[]) nameById.set(s.id, s.full_name);
    }
    for (const tid of new Set(teacherIds)) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const n = u?.user?.user_metadata?.name || u?.user?.email || "Teacher";
        nameById.set(tid as string, n);
      } catch { /* ignore */ }
    }

    // Coverage info — for each teacher request, list the classes /
    // subjects they teach on each affected day so the admin can plan
    // substitutes without bouncing to the timetable page.
    const coverageById = new Map<string, any[]>();
    const teacherRequestRows = (data ?? []).filter((r: any) => r.subject_type === "teacher");
    if (teacherRequestRows.length > 0) {
      // Pull every entry for the affected teachers in one query; we'll
      // filter per-row by date range in JS. Cheap enough — a teacher's
      // weekly entry count is tiny.
      const uniqueTeacherIds = Array.from(new Set(teacherRequestRows.map((r: any) => r.subject_id)));
      const { data: entries } = await serviceRoleClient
        .from("timetable_entry")
        .select("teacher_user_id, room, slot:slot_id(day_of_week, start_time, end_time, name), section_subject:section_subject_id(class_subject:class_subject_id(name)), section:scope_section_id(name, class:class_id(name)), hifz_group:scope_hifz_group_id(name)")
        .eq("org_id", orgId)
        .in("teacher_user_id", uniqueTeacherIds);

      const byTeacher = new Map<string, any[]>();
      for (const e of (entries ?? []) as any[]) {
        if (!byTeacher.has(e.teacher_user_id)) byTeacher.set(e.teacher_user_id, []);
        byTeacher.get(e.teacher_user_id)!.push(e);
      }

      for (const r of teacherRequestRows) {
        const days = enumerateDates(r.start_date, r.end_date);
        const teacherEntries = byTeacher.get(r.subject_id) ?? [];
        const coverage: any[] = [];
        for (const d of days) {
          const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
          const matched = teacherEntries.filter((e: any) => e.slot?.day_of_week === dow);
          if (matched.length === 0) continue;
          coverage.push({
            date: d,
            dayOfWeek: dow,
            entries: matched.map((e: any) => ({
              slotName: e.slot?.name ?? null,
              startTime: e.slot?.start_time ?? null,
              endTime: e.slot?.end_time ?? null,
              subjectName: e.section_subject?.class_subject?.name ?? null,
              sectionLabel: e.section
                ? `${e.section.class?.name ?? ""} · ${e.section.name ?? ""}`.trim()
                : e.hifz_group?.name ?? null,
              room: e.room ?? null,
            })).sort((a: any, b: any) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
          });
        }
        coverageById.set(r.id, coverage);
      }
    }

    return c.json({
      requests: (data ?? []).map((r: any) => ({
        ...toJson({ ...r, subject_name: nameById.get(r.subject_id) ?? null }),
        coverage: coverageById.get(r.id) ?? null,
      })),
    });
  });

  school.patch("/orgs/:orgId/time-off/:id/decide", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("id");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const decision = body?.decision;
    if (decision !== "approved" && decision !== "rejected") {
      return c.json({ error: "decision must be 'approved' or 'rejected'" }, 400);
    }
    const notes = typeof body?.notes === "string" ? body.notes.slice(0, 1000) : null;
    const { error } = await serviceRoleClient
      .from("time_off_request")
      .update({
        status: decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes,
      })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}
