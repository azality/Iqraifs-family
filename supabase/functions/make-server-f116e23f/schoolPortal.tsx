// =============================================================================
// School Pilot — Phase E routes (student/parent portal, PIN-authenticated)
//
// Mounted onto the existing `school` Hono sub-app via installPortal(school)
// (invoked from school.tsx). All routes here authenticate via X-Pin-Token
// (issued by /school/auth/pin-login). They do NOT use the family-JWT.
//
// Because school.tsx applies `requireAuth` to everything except the explicit
// PUBLIC_SCHOOL_PATHS set, these /pin-me/* routes must ALSO be public to that
// middleware and rely on `requirePinSubject` for auth. We register them on a
// nested Hono instance mounted at /pin-me that intercepts the middleware path
// check — but the simpler approach (and the one used here) is to instead
// register paths beginning with /pin-me and add them to PUBLIC_SCHOOL_PATHS
// in school.tsx. We follow the second approach: school.tsx allows /pin-me/*
// through, and every handler here enforces requirePinSubject() at the top.
//
// Endpoints:
//   GET /school/pin-me                                       — subject context
//   GET /school/pin-me/students/:studentId/lessons
//   GET /school/pin-me/students/:studentId/grades
//   GET /school/pin-me/students/:studentId/hifz
//   GET /school/pin-me/students/:studentId/attendance
//   GET /school/pin-me/students/:studentId/behavior
//   GET /school/pin-me/students/:studentId/dashboard
// =============================================================================

import type { Hono, Context } from "npm:hono";
import { serviceRoleClient } from "./middleware.tsx";
import { computeMemorizedTotals } from "./schoolPhaseC.tsx";

// -----------------------------------------------------------------------------
// PIN token verification — same algorithm as schoolPhaseA.tsx. Duplicated here
// because the helper there isn't exported. Keep this in sync with
// makePinToken / verifyPinToken in schoolPhaseA.tsx.
// -----------------------------------------------------------------------------

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function getJwtSecret(): string {
  return (
    Deno.env.get("SUPABASE_JWT_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "dev-pin-secret"
  );
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64encode(new Uint8Array(sig));
}

interface PinTokenPayload {
  subjectType: "student" | "parent";
  subjectId: string;
  orgId: string;
  exp: number;
}

async function verifyPinToken(token: string): Promise<PinTokenPayload | null> {
  if (!token || !token.startsWith("pin.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const body = parts[1];
  const sig = parts[2];
  const expected = await hmacSign(body, getJwtSecret());
  if (expected !== sig) return null;
  let payload: PinTokenPayload;
  try {
    payload = JSON.parse(atob(body));
  } catch {
    return null;
  }
  if (!payload || (payload.subjectType !== "student" && payload.subjectType !== "parent")) {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// -----------------------------------------------------------------------------
// Middleware — requirePinSubject. Reads X-Pin-Token, verifies, stashes the
// subject on c via c.set('pinSubject', ...). Handlers read it with
// c.get('pinSubject').
// -----------------------------------------------------------------------------

async function requirePinSubject(
  c: Context,
): Promise<PinTokenPayload | { __error: true; status: 401; body: { error: string } }> {
  const header = c.req.header("X-Pin-Token") || "";
  if (!header) {
    return { __error: true, status: 401, body: { error: "missing pin token" } };
  }
  const payload = await verifyPinToken(header);
  if (!payload) {
    return { __error: true, status: 401, body: { error: "invalid or expired pin token" } };
  }
  c.set("pinSubject", payload);
  return payload;
}

// Helper: returns set of studentIds the subject is allowed to view.
async function resolveAccessibleStudents(
  subject: PinTokenPayload,
): Promise<string[]> {
  if (subject.subjectType === "student") return [subject.subjectId];
  // parent
  const { data, error } = await serviceRoleClient
    .from("student_parent")
    .select("student_id")
    .eq("parent_id", subject.subjectId);
  if (error) {
    console.error("[schoolPortal.resolveAccessibleStudents]", error);
    return [];
  }
  return (data ?? []).map((r: any) => r.student_id);
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && ISO_DATE_RE.test(s);
}

const ASSIGNMENT_KINDS = new Set([
  "quiz",
  "test",
  "homework",
  "project",
  "class_participation",
  "other",
]);
const HIFZ_KINDS = new Set([
  "memorized",
  "revised",
  "tested",
  "sabaq",
  "sabqi",
  "manzil",
]);
const BEHAVIOR_KINDS = new Set(["positive", "concern"]);

// -----------------------------------------------------------------------------
// Row → JSON shape helpers (match Phase B/C/C2 wire formats).
// -----------------------------------------------------------------------------
function lessonToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    sectionId: r.class_section_id,
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
function attendanceToJson(r: any) {
  return {
    id: r.id,
    date: r.attendance_date,
    status: r.status,
    notes: r.notes,
    sectionId: r.class_section_id,
    recordedBy: r.recorded_by,
  };
}
function behaviorToJson(r: any) {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    points: r.points,
    notes: r.notes,
    observedAt: r.observed_at,
    sectionId: r.class_section_id,
    recordedBy: r.recorded_by,
  };
}

// -----------------------------------------------------------------------------
// Hydrate a student row with section + class names for portal display.
// -----------------------------------------------------------------------------
async function loadStudentWithContext(studentId: string, orgId: string): Promise<
  | {
      id: string;
      fullName: string;
      grNumber: string;
      photoUrl: string | null;
      sectionId: string | null;
      sectionName: string | null;
      className: string | null;
    }
  | null
> {
  const { data: stu } = await serviceRoleClient
    .from("student")
    .select("id, full_name, gr_number, photo_url, class_section_id, org_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!stu) return null;
  if ((stu as any).org_id !== orgId) return null;

  let sectionName: string | null = null;
  let className: string | null = null;
  if ((stu as any).class_section_id) {
    const { data: sec } = await serviceRoleClient
      .from("class_section")
      .select("name, class:class_id(name)")
      .eq("id", (stu as any).class_section_id)
      .maybeSingle();
    if (sec) {
      sectionName = (sec as any).name ?? null;
      className = (sec as any).class?.name ?? null;
    }
  }
  return {
    id: (stu as any).id,
    fullName: (stu as any).full_name,
    grNumber: (stu as any).gr_number,
    photoUrl: (stu as any).photo_url ?? null,
    sectionId: (stu as any).class_section_id ?? null,
    sectionName,
    className,
  };
}

// =============================================================================
// installPortal
// =============================================================================
export function installPortal(school: Hono): void {
  // ---------------------------------------------------------------------------
  // GET /school/pin-me — subject context for the portal.
  // ---------------------------------------------------------------------------
  school.get("/pin-me", async (c) => {
    const auth = await requirePinSubject(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return c.json(e.body, e.status);
    }
    const subject = auth as PinTokenPayload;

    const { data: org } = await serviceRoleClient
      .from("organizations")
      .select("id, name")
      .eq("id", subject.orgId)
      .maybeSingle();

    const { data: cred } = await serviceRoleClient
      .from("pin_credential")
      .select("must_change")
      .eq("org_id", subject.orgId)
      .eq("subject_type", subject.subjectType)
      .eq("subject_id", subject.subjectId)
      .maybeSingle();

    const base = {
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      orgId: subject.orgId,
      orgName: org?.name ?? null,
      mustChange: !!cred?.must_change,
    };

    if (subject.subjectType === "student") {
      const stu = await loadStudentWithContext(subject.subjectId, subject.orgId);
      return c.json({ ...base, student: stu });
    }

    // parent
    const { data: parentRow } = await serviceRoleClient
      .from("parent")
      .select("id, full_name, phone, email, relationship, org_id")
      .eq("id", subject.subjectId)
      .maybeSingle();
    const parent =
      parentRow && (parentRow as any).org_id === subject.orgId
        ? {
            id: (parentRow as any).id,
            fullName: (parentRow as any).full_name,
            phone: (parentRow as any).phone,
            email: (parentRow as any).email,
            relationship: (parentRow as any).relationship,
          }
        : null;

    const { data: links } = await serviceRoleClient
      .from("student_parent")
      .select("is_primary, student_id")
      .eq("parent_id", subject.subjectId);

    const linkedIds = (links ?? []).map((l: any) => l.student_id);
    const students: Array<any> = [];
    for (const sid of linkedIds) {
      const ctx = await loadStudentWithContext(sid, subject.orgId);
      if (ctx) {
        const link = (links ?? []).find((l: any) => l.student_id === sid);
        students.push({ ...ctx, isPrimary: !!link?.is_primary });
      }
    }

    return c.json({ ...base, parent, students });
  });

  // ---------------------------------------------------------------------------
  // Per-student gate — verifies studentId in accessible set + same org.
  // Returns null if ok, or a c.json response if denied/not-found.
  // ---------------------------------------------------------------------------
  async function gatePerStudent(c: Context): Promise<
    | { ok: true; subject: PinTokenPayload; studentId: string }
    | { ok: false; resp: Response }
  > {
    const auth = await requirePinSubject(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return { ok: false, resp: c.json(e.body, e.status) };
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    if (!studentId) {
      return { ok: false, resp: c.json({ error: "studentId required" }, 400) };
    }
    const accessible = await resolveAccessibleStudents(subject);
    if (!accessible.includes(studentId)) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    // Also verify the student belongs to the subject's org.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return { ok: false, resp: c.json({ error: "student not found" }, 404) };
    if ((stu as any).org_id !== subject.orgId) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    return { ok: true, subject, studentId };
  }

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/lessons
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/lessons", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const limitRaw = c.req.query("limit");
    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }
    let limit = 30;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 200) {
        return c.json({ error: "limit must be 1..200" }, 400);
      }
      limit = Math.floor(n);
    }

    // Need student's section to load section lessons.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("class_section_id")
      .eq("id", studentId)
      .maybeSingle();
    const sectionId = (stu as any)?.class_section_id ?? null;
    if (!sectionId) return c.json({ lessons: [] });

    let q = serviceRoleClient
      .from("lesson")
      .select("*")
      .eq("class_section_id", sectionId)
      .order("lesson_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("lesson_date", startDate);
    if (endDate) q = q.lte("lesson_date", endDate);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const lessons = (data ?? []) as any[];

    // Lookup completion flags for this student across these lessons.
    const lessonIds = lessons.map((l) => l.id);
    const completed = new Set<string>();
    if (lessonIds.length > 0) {
      const { data: comps } = await serviceRoleClient
        .from("lesson_completion")
        .select("lesson_id")
        .eq("student_id", studentId)
        .in("lesson_id", lessonIds);
      for (const r of (comps ?? []) as any[]) completed.add(r.lesson_id);
    }

    return c.json({
      lessons: lessons.map((r) => ({
        ...lessonToJson(r),
        completed: completed.has(r.id),
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/grades
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/grades", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

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
    if (kind && !ASSIGNMENT_KINDS.has(kind)) {
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

    const { data, error } = await serviceRoleClient
      .from("grade")
      .select(
        "*, assignment:assignment_id(id, title, kind, max_score, weight, due_date, assigned_date, class_section_id, related_topic)",
      )
      .eq("student_id", studentId)
      .order("graded_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return c.json({ error: error.message }, 500);

    const filtered = (data ?? []).filter((r: any) => {
      const a = r.assignment;
      if (!a) return false;
      if (kind && a.kind !== kind) return false;
      if (startDate && a.assigned_date && a.assigned_date < startDate) return false;
      if (endDate && a.assigned_date && a.assigned_date > endDate) return false;
      return true;
    });

    const grades = filtered.map((r: any) => ({
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
    }));

    // Summary computation matching Phase C2 /grades/summary shape.
    let assignmentsGraded = 0;
    let weightedSum = 0;
    let weightTotal = 0;
    let lastGradedAt: string | null = null;
    const perKindAgg = new Map<string, { sum: number; weight: number; count: number }>();
    for (const r of grades) {
      const a = r.assignment;
      if (!a || r.score === null || r.score === undefined) continue;
      const max = Number(a.maxScore);
      const w = Number(a.weight ?? 1);
      const score = Number(r.score);
      if (!Number.isFinite(max) || max <= 0) continue;
      assignmentsGraded += 1;
      const pct = score / max;
      weightedSum += pct * w;
      weightTotal += w;
      if (r.gradedAt && (!lastGradedAt || r.gradedAt > lastGradedAt)) lastGradedAt = r.gradedAt;
      let bucket = perKindAgg.get(a.kind);
      if (!bucket) {
        bucket = { sum: 0, weight: 0, count: 0 };
        perKindAgg.set(a.kind, bucket);
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
      grades,
      summary: { assignmentsGraded, average, lastGradedAt, perKindAverage },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/hifz
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/hifz", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

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

    let q = serviceRoleClient
      .from("hifz_progress")
      .select("*")
      .eq("student_id", studentId)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("recorded_at", startDate);
    if (endDate) q = q.lte("recorded_at", `${endDate}T23:59:59.999Z`);
    if (kind) q = q.eq("kind", kind);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    // For the summary use ALL rows (not the limited slice) so totals stay
    // correct regardless of pagination params.
    const { data: allRows } = await serviceRoleClient
      .from("hifz_progress")
      .select("surah_number, ayah_from, ayah_to, kind, recorded_at")
      .eq("student_id", studentId)
      .order("recorded_at", { ascending: false });

    const rows = (allRows ?? []) as Array<{
      surah_number: number;
      ayah_from: number;
      ayah_to: number;
      kind: string;
      recorded_at: string;
    }>;
    const { ayahsMemorized, surahsCompleted } = computeMemorizedTotals(rows);
    const lastEntry = rows.length > 0 ? rows[0].recorded_at : null;

    return c.json({
      entries: (data ?? []).map(hifzToJson),
      summary: { ayahsMemorized, surahsCompleted, lastEntry },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/attendance
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/attendance", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const limitRaw = c.req.query("limit");
    if (startDate && !isIsoDate(startDate)) {
      return c.json({ error: "startDate must be YYYY-MM-DD" }, 400);
    }
    if (endDate && !isIsoDate(endDate)) {
      return c.json({ error: "endDate must be YYYY-MM-DD" }, 400);
    }
    let limit = 60;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 500) {
        return c.json({ error: "limit must be 1..500" }, 400);
      }
      limit = Math.floor(n);
    }

    let q = serviceRoleClient
      .from("school_attendance")
      .select("id, attendance_date, status, notes, class_section_id, recorded_by")
      .eq("student_id", studentId)
      .order("attendance_date", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("attendance_date", startDate);
    if (endDate) q = q.lte("attendance_date", endDate);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    let present = 0, late = 0, absent = 0, excused = 0;
    for (const r of data ?? []) {
      const s = (r as any).status;
      if (s === "present") present++;
      else if (s === "late") late++;
      else if (s === "absent") absent++;
      else if (s === "excused") excused++;
    }
    const total = present + late + absent + excused;
    // present + late + excused all count as "attended" for the headline %
    const attended = present + late + excused;
    const attendancePct = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;

    return c.json({
      entries: (data ?? []).map(attendanceToJson),
      summary: { present, late, absent, excused, attendancePct },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/behavior
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/behavior", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

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
    if (kind && !BEHAVIOR_KINDS.has(kind)) {
      return c.json({ error: "kind must be 'positive' or 'concern'" }, 400);
    }
    let limit = 60;
    if (limitRaw !== undefined) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 500) {
        return c.json({ error: "limit must be 1..500" }, 400);
      }
      limit = Math.floor(n);
    }

    let q = serviceRoleClient
      .from("behavior_note")
      .select("id, kind, category, points, notes, observed_at, class_section_id, recorded_by")
      .eq("student_id", studentId)
      .order("observed_at", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("observed_at", startDate);
    if (endDate) q = q.lte("observed_at", `${endDate}T23:59:59.999Z`);
    if (kind) q = q.eq("kind", kind);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    let positiveCount = 0, concernCount = 0, netPoints = 0;
    for (const r of data ?? []) {
      const row = r as any;
      if (row.kind === "positive") positiveCount++;
      else if (row.kind === "concern") concernCount++;
      netPoints += Number(row.points ?? 0);
    }

    return c.json({
      entries: (data ?? []).map(behaviorToJson),
      summary: { positiveCount, concernCount, netPoints },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/dashboard — one-shot portal landing.
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/dashboard", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { subject, studentId } = g;

    const stuCtx = await loadStudentWithContext(studentId, subject.orgId);
    if (!stuCtx) return c.json({ error: "student not found" }, 404);

    // Date window: last 30 days for tile metrics.
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const cutoffIso = cutoff.toISOString();

    // ---- Attendance (last 30 days) ----
    let attendancePct = 0;
    try {
      const { data: att } = await serviceRoleClient
        .from("school_attendance")
        .select("status")
        .eq("student_id", studentId)
        .gte("attendance_date", cutoffDate);
      let p = 0, l = 0, a = 0, e = 0;
      for (const r of att ?? []) {
        const s = (r as any).status;
        if (s === "present") p++;
        else if (s === "late") l++;
        else if (s === "absent") a++;
        else if (s === "excused") e++;
      }
      const total = p + l + a + e;
      const attended = p + l + e;
      attendancePct = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;
    } catch (_err) { /* graceful 0 */ }

    // ---- Average grade (weighted % across all graded items) ----
    let averageGrade: number | null = null;
    try {
      const { data: grades } = await serviceRoleClient
        .from("grade")
        .select("score, assignment:assignment_id(max_score, weight)")
        .eq("student_id", studentId);
      let sum = 0;
      let weight = 0;
      for (const r of grades ?? []) {
        const row = r as any;
        if (row.score === null || row.score === undefined || !row.assignment) continue;
        const max = Number(row.assignment.max_score);
        const w = row.assignment.weight !== null && row.assignment.weight !== undefined
          ? Number(row.assignment.weight)
          : 1;
        if (!Number.isFinite(max) || max <= 0) continue;
        sum += (Number(row.score) / max) * w;
        weight += w;
      }
      if (weight > 0) averageGrade = Math.round((sum / weight) * 1000) / 10;
    } catch (_err) { /* graceful null */ }

    // ---- Hifz totals ----
    let ayahsMemorized = 0;
    try {
      const { data: hifz } = await serviceRoleClient
        .from("hifz_progress")
        .select("surah_number, ayah_from, ayah_to, kind, recorded_at")
        .eq("student_id", studentId);
      const totals = computeMemorizedTotals((hifz ?? []) as any);
      ayahsMemorized = totals.ayahsMemorized;
    } catch (_err) { /* graceful 0 */ }

    // ---- Behavior score (net points last 30 days) ----
    let behaviorScore = 0;
    try {
      const { data: notes } = await serviceRoleClient
        .from("behavior_note")
        .select("points")
        .eq("student_id", studentId)
        .gte("observed_at", cutoffIso);
      for (const r of notes ?? []) behaviorScore += Number((r as any).points ?? 0);
    } catch (_err) { /* graceful 0 */ }

    // ---- Recent activity: latest 10 across the 5 kinds ----
    type Activity = { id: string; at: string; kind: string; summary: string };
    const activities: Activity[] = [];

    // Lessons — section's recent
    if (stuCtx.sectionId) {
      const { data: lessons } = await serviceRoleClient
        .from("lesson")
        .select("id, lesson_date, title, created_at")
        .eq("class_section_id", stuCtx.sectionId)
        .order("lesson_date", { ascending: false })
        .limit(10);
      for (const r of lessons ?? []) {
        const row = r as any;
        activities.push({
          id: row.id,
          at: row.lesson_date,
          kind: "lesson",
          summary: row.title ?? "Lesson",
        });
      }
    }

    // Grades
    {
      const { data: gradesRecent } = await serviceRoleClient
        .from("grade")
        .select(
          "id, score, graded_at, assignment:assignment_id(title, max_score)",
        )
        .eq("student_id", studentId)
        .not("graded_at", "is", null)
        .order("graded_at", { ascending: false })
        .limit(10);
      for (const r of gradesRecent ?? []) {
        const row = r as any;
        const title = row.assignment?.title ?? "Assignment";
        const max = row.assignment?.max_score;
        const scoreText =
          row.score !== null && row.score !== undefined && max
            ? `${row.score}/${max}`
            : "graded";
        activities.push({
          id: row.id,
          at: row.graded_at,
          kind: "grade",
          summary: `${title} — ${scoreText}`,
        });
      }
    }

    // Hifz
    {
      const { data: hifzRecent } = await serviceRoleClient
        .from("hifz_progress")
        .select("id, surah_number, ayah_from, ayah_to, kind, recorded_at")
        .eq("student_id", studentId)
        .order("recorded_at", { ascending: false })
        .limit(10);
      for (const r of hifzRecent ?? []) {
        const row = r as any;
        activities.push({
          id: row.id,
          at: row.recorded_at,
          kind: "hifz",
          summary: `Surah ${row.surah_number} ayah ${row.ayah_from}-${row.ayah_to} (${row.kind})`,
        });
      }
    }

    // Attendance
    {
      const { data: attRecent } = await serviceRoleClient
        .from("school_attendance")
        .select("id, attendance_date, status")
        .eq("student_id", studentId)
        .order("attendance_date", { ascending: false })
        .limit(10);
      for (const r of attRecent ?? []) {
        const row = r as any;
        activities.push({
          id: row.id,
          at: row.attendance_date,
          kind: "attendance",
          summary: `Attendance: ${row.status}`,
        });
      }
    }

    // Behavior
    {
      const { data: behRecent } = await serviceRoleClient
        .from("behavior_note")
        .select("id, kind, points, notes, observed_at")
        .eq("student_id", studentId)
        .order("observed_at", { ascending: false })
        .limit(10);
      for (const r of behRecent ?? []) {
        const row = r as any;
        const snippet = (row.notes ?? "").slice(0, 60);
        activities.push({
          id: row.id,
          at: row.observed_at,
          kind: "behavior",
          summary: `${row.kind === "positive" ? "+" : ""}${row.points ?? 0} — ${snippet}`,
        });
      }
    }

    // Mixed sort by `at` desc, take 10. `at` is either YYYY-MM-DD or ISO.
    activities.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const recentActivity = activities.slice(0, 10);

    return c.json({
      student: {
        id: stuCtx.id,
        fullName: stuCtx.fullName,
        grNumber: stuCtx.grNumber,
        photoUrl: stuCtx.photoUrl,
        sectionName: stuCtx.sectionName,
        className: stuCtx.className,
      },
      tiles: {
        attendancePct: {
          value: attendancePct,
          hint: "Last 30 days",
        },
        averageGrade: {
          value: averageGrade,
          hint: averageGrade === null ? "No grades yet" : "Weighted % across graded items",
        },
        hifzAyahsMemorized: {
          value: ayahsMemorized,
          hint: "Total ayahs memorized",
        },
        behaviorScore: {
          value: behaviorScore,
          hint: "Net points, last 30 days",
        },
      },
      recentActivity,
    });
  });
}

export default installPortal;
