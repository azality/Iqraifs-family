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

    return c.json({
      requests: (data ?? []).map((r: any) => toJson({ ...r, subject_name: nameById.get(r.subject_id) ?? null })),
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
