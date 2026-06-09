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
  // Shape matches the shared Lesson interface in src/utils/schoolApi.ts
  // (snake_case for the legacy columns, camelCase for fields added in
  // Phase 2). Earlier the portal returned everything camelCase, but
  // StudentLessons.tsx reads l.lesson_date, l.video_url, l.taught_by_name
  // etc. — when those resolved to undefined the date column rendered
  // 'Invalid Date' on every row.
  return {
    id: r.id,
    org_id: r.org_id,
    class_section_id: r.class_section_id,
    // Phase 2: subject + topic FKs (camelCase intentional; frontend
    // reads l.sectionSubjectId).
    sectionSubjectId: r.section_subject_id ?? null,
    curriculumTopicId: r.curriculum_topic_id ?? null,
    // Phase 4b: hydrated display fields.
    subjectName: (r as any).subject_name ?? null,
    topicName: (r as any).topic_name ?? null,
    topicResources: (r as any).topic_resources ?? [],
    lesson_date: r.lesson_date,
    title: r.title,
    body: r.body,
    video_url: r.video_url,
    audio_url: r.audio_url,
    attachments: r.attachments ?? [],
    taught_by: r.taught_by,
    taught_by_name: (r as any).taught_by_name ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
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
    missed: !!r.missed,
    // Legacy `notes` is preserved for parent display because rows
    // written before the full-module split lived there. New writes go
    // to teacher_remarks (teacher-only, NOT returned) and
    // parent_comments (parent-visible). UI prefers parentComments and
    // falls back to notes when null.
    notes: r.notes,
    parentComments: r.parent_comments ?? null,
    parentAction: r.parent_action ?? null,
    tajweedNotes: r.tajweed_notes ?? null,
    fluencyNotes: r.fluency_notes ?? null,
    juzNumber: r.juz_number ?? null,
    pageNumber: r.page_number ?? null,
    mistakesCount: r.mistakes_count ?? null,
    dailyTarget: r.daily_target ?? null,
    nextTarget: r.next_target ?? null,
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
      .select("id, name, slug, settings")
      .eq("id", subject.orgId)
      .maybeSingle();
    const orgSettings = ((org as any)?.settings ?? {}) as Record<string, unknown>;

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
      // Branding for the portal layout header. The login page already
      // pulls these from /auth/org-by-slug; once the user is in we
      // include them on /pin-me so the inner pages can drop the
      // generic 'Student & Parent Portal' header.
      orgSlug: (org as any)?.slug ?? null,
      orgLogoUrl: (orgSettings.logo_url as string | undefined) ?? null,
      orgMotto: (orgSettings.school_motto as string | undefined) ?? null,
      orgThemeColor: (orgSettings.theme_color as string | undefined) ?? null,
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

    // Phase 4b: hydrate subject + topic + the topic's durable resources
    // so the parent / student portal can group lessons by subject and
    // show worksheets/videos/quizzes inline on each lesson card. Mirrors
    // the staff-side endpoint in schoolPhaseC.tsx.
    //
    // Phase 7 (visibility): students only see lessons that are PUBLISHED.
    // Two conditions OR'd together:
    //   - published_at IS NOT NULL AND published_at <= now()
    //     (teacher explicitly published, possibly early)
    //   - published_at IS NULL AND lesson_date <= today (UTC)
    //     (legacy / auto-publish on the lesson date)
    // PostgREST .or() takes a comma-separated string of conditions.
    const todayIso = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    let q = serviceRoleClient
      .from("lesson")
      .select(
        "*, section_subject:section_subject_id(class_subject:class_subject_id(name)), curriculum_topic:curriculum_topic_id(name, topic_resource(id, kind, label, url, sort_order, archived_at))",
      )
      .eq("class_section_id", sectionId)
      .or(
        `and(published_at.not.is.null,published_at.lte.${nowIso}),and(published_at.is.null,lesson_date.lte.${todayIso})`,
      )
      .order("lesson_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte("lesson_date", startDate);
    if (endDate) q = q.lte("lesson_date", endDate);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const lessons = ((data ?? []) as any[]).map((r) => {
      const rawResources = (r.curriculum_topic?.topic_resource ?? []) as any[];
      const topic_resources = rawResources
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
        topic_resources,
      };
    });

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
  // GET /school/pin-me/students/:studentId/diary?date=YYYY-MM-DD
  //
  // Daily Diary digest — the "what happened today + what to do tonight"
  // panel the parent portal home renders. Aggregates lessons today,
  // assignments due today+tomorrow, latest Hifz entry, and reminder
  // lines extracted heuristically from lesson bodies.
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/diary", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

    const dateQ = c.req.query("date");
    if (dateQ && !isIsoDate(dateQ)) {
      return c.json({ error: "date must be YYYY-MM-DD" }, 400);
    }
    const today = dateQ ?? new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(today + "T00:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);

    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, full_name, class_section_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    const sectionId = (stu as any).class_section_id;

    // ─── Today's lessons (visibility-filtered) ────────────────────
    let lessons: Array<{
      id: string;
      subject: string | null;
      title: string;
      body: string | null;
    }> = [];
    if (sectionId) {
      const nowIso = new Date().toISOString();
      const { data: ls } = await serviceRoleClient
        .from("lesson")
        .select(
          "id, title, body, section_subject:section_subject_id(class_subject:class_subject_id(name))",
        )
        .eq("class_section_id", sectionId)
        .eq("lesson_date", today)
        .or(
          `and(published_at.not.is.null,published_at.lte.${nowIso}),and(published_at.is.null,lesson_date.lte.${today})`,
        )
        .order("created_at", { ascending: true })
        .limit(20);
      lessons = ((ls ?? []) as any[]).map((r) => ({
        id: r.id,
        subject: r.section_subject?.class_subject?.name ?? null,
        title: r.title,
        body: r.body,
      }));
    }

    // ─── Assignments due today + tomorrow ─────────────────────────
    let assignments: Array<{
      id: string;
      subject: string | null;
      title: string;
      kind: string;
      dueDate: string;
    }> = [];
    if (sectionId) {
      const { data: asg } = await serviceRoleClient
        .from("assignment")
        .select(
          "id, title, kind, due_date, section_subject:section_subject_id(class_subject:class_subject_id(name))",
        )
        .eq("class_section_id", sectionId)
        .in("due_date", [today, tomorrowIso])
        .order("due_date", { ascending: true })
        .limit(20);
      assignments = ((asg ?? []) as any[]).map((r) => ({
        id: r.id,
        subject: r.section_subject?.class_subject?.name ?? null,
        title: r.title,
        kind: r.kind,
        dueDate: r.due_date,
      }));
    }

    // ─── Latest Hifz entry (sabaq + revision) ─────────────────────
    let hifz: {
      sabaq: { surahNumber: number; ayahFrom: number; ayahTo: number; quality: string | null } | null;
      revision: { kind: string; surahNumber: number; ayahFrom: number; ayahTo: number; quality: string | null } | null;
      teacherNote: string | null;
      parentAction: string | null;
    } | null = null;
    const { data: hifzRows } = await serviceRoleClient
      .from("hifz_progress")
      .select("kind, surah_number, ayah_from, ayah_to, quality, tajweed_notes, fluency_notes, parent_comments, notes, parent_action, recorded_at, missed")
      .eq("student_id", studentId)
      .order("recorded_at", { ascending: false })
      .limit(20);
    const recent = ((hifzRows ?? []) as any[]).filter((h) =>
      !h.missed && (h.recorded_at ?? "").slice(0, 10) === today,
    );
    const sabaqRow = recent.find((h) => h.kind === "sabaq");
    const revisionRow = recent.find((h) => h.kind === "sabqi" || h.kind === "manzil");
    const latest = recent[0] ?? null;
    if (latest) {
      hifz = {
        sabaq: sabaqRow
          ? {
              surahNumber: sabaqRow.surah_number,
              ayahFrom: sabaqRow.ayah_from,
              ayahTo: sabaqRow.ayah_to,
              quality: sabaqRow.quality,
            }
          : null,
        revision: revisionRow
          ? {
              kind: revisionRow.kind,
              surahNumber: revisionRow.surah_number,
              ayahFrom: revisionRow.ayah_from,
              ayahTo: revisionRow.ayah_to,
              quality: revisionRow.quality,
            }
          : null,
        teacherNote:
          latest.tajweed_notes ||
          latest.fluency_notes ||
          latest.parent_comments ||
          latest.notes ||
          null,
        parentAction: latest.parent_action ?? null,
      };
    }

    // ─── Reminders ─────────────────────────────────────────────────
    // Cheap heuristic for v1: scan today's lesson bodies for lines
    // that LOOK like reminders ("bring …" / "remind…" / "reminder:"
    // / "tomorrow…"). Real reminder structure can come later as a
    // dedicated column. Cap to 5 to avoid leaking long notes.
    const reminders: string[] = [];
    const rxReminder = /^.{0,20}(bring|remind(er)?|tomorrow)\b.*$/im;
    for (const l of lessons) {
      if (reminders.length >= 5) break;
      const body = (l.body ?? "").trim();
      if (!body) continue;
      for (const line of body.split(/\r?\n/)) {
        if (rxReminder.test(line) && line.trim().length < 200) {
          reminders.push(line.trim());
          break;
        }
      }
    }

    return c.json({
      date: today,
      studentName: (stu as any).full_name,
      lessons,
      assignments,
      hifz,
      reminders,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/timetable
  //
  // Parent / student portal weekly timetable view. Joins the org-wide
  // slot list with the student's section's entries — Hifz group entries
  // also flow through if the student is in a group, deduped by slot
  // (section entry wins when both exist on the same slot).
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/timetable", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId } = g;

    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("class_section_id, hifz_group_id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);

    // Pull all slots for the org so empty cells render too.
    const { data: slots } = await serviceRoleClient
      .from("timetable_slot")
      .select("*")
      .eq("org_id", (stu as any).org_id)
      .is("archived_at", null)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    // Entries for the section + (optional) hifz group.
    const scopes: string[] = [];
    if ((stu as any).class_section_id) scopes.push((stu as any).class_section_id);
    const { data: secEntries } = (stu as any).class_section_id
      ? await serviceRoleClient
          .from("timetable_entry")
          .select(
            "*, section_subject:section_subject_id(class_subject:class_subject_id(name))",
          )
          .eq("scope_section_id", (stu as any).class_section_id)
      : { data: [] as any[] };
    const { data: groupEntries } = (stu as any).hifz_group_id
      ? await serviceRoleClient
          .from("timetable_entry")
          .select(
            "*, section_subject:section_subject_id(class_subject:class_subject_id(name))",
          )
          .eq("scope_hifz_group_id", (stu as any).hifz_group_id)
      : { data: [] as any[] };

    // Hydrate teacher names once.
    const all = [...(secEntries ?? []), ...(groupEntries ?? [])] as any[];
    const teacherIds = Array.from(
      new Set(all.map((e) => e.teacher_user_id).filter((x): x is string => !!x)),
    );
    const teacherNames = new Map<string, string>();
    for (const tid of teacherIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) teacherNames.set(tid, name);
      } catch { /* ignore */ }
    }

    // Section entries win when both exist on the same slot — that
    // shouldn't happen given the UNIQUE constraints + the editor
    // enforces one scope at a time, but being explicit costs nothing.
    const bySlot = new Map<string, any>();
    for (const e of (groupEntries ?? []) as any[]) bySlot.set(e.slot_id, e);
    for (const e of (secEntries ?? []) as any[]) bySlot.set(e.slot_id, e);

    // PR feat/timetable-substitutions — overlay today's subs onto the
    // weekly view. Caller may pass ?date=YYYY-MM-DD to anchor today in
    // their tz; otherwise we use server-local today.
    const dateQ = c.req.query("date");
    const today =
      dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ)
        ? dateQ
        : new Date().toISOString().slice(0, 10);
    const entryIdsForSub = all.map((e) => e.id);
    const { data: subsToday } = entryIdsForSub.length
      ? await serviceRoleClient
          .from("timetable_substitution")
          .select("entry_id, substitute_teacher_user_id, reason")
          .eq("date", today)
          .in("entry_id", entryIdsForSub)
      : { data: [] as any[] };
    const subByEntry = new Map<string, any>();
    for (const s of (subsToday ?? []) as any[]) subByEntry.set(s.entry_id, s);

    // Hydrate sub teacher names not already known.
    const subTids = Array.from(
      new Set(
        ((subsToday ?? []) as any[])
          .map((s) => s.substitute_teacher_user_id)
          .filter((x): x is string => !!x && !teacherNames.has(x)),
      ),
    );
    for (const tid of subTids) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) teacherNames.set(tid, name);
      } catch { /* ignore */ }
    }

    // Today's ISO day-of-week (Mon=1..Sun=7) for limiting sub overlay.
    const tDate = new Date(today + "T00:00:00");
    const jsDay = tDate.getDay();
    const todayDow = jsDay === 0 ? 7 : jsDay;

    const cells = ((slots ?? []) as any[]).map((s) => {
      const e = bySlot.get(s.id);
      const sub = e && s.day_of_week === todayDow ? subByEntry.get(e.id) : null;
      const subName =
        sub && sub.substitute_teacher_user_id
          ? teacherNames.get(sub.substitute_teacher_user_id) ?? null
          : null;
      return {
        slot: {
          id: s.id,
          name: s.name,
          dayOfWeek: s.day_of_week,
          startTime: s.start_time,
          endTime: s.end_time,
          kind: s.kind,
        },
        entry: e
          ? {
              subjectName: e.section_subject?.class_subject?.name ?? null,
              // If today is covered, show the substitute's name with
              // the original kept around so the UI can render
              // "Sub: B (covering A)".
              teacherName: sub
                ? subName
                : e.teacher_user_id
                ? teacherNames.get(e.teacher_user_id) ?? null
                : null,
              room: e.room,
              notes: e.notes,
              scope: e.scope_section_id ? "section" : "hifz_group",
              substitution: sub
                ? {
                    originalTeacherName: e.teacher_user_id
                      ? teacherNames.get(e.teacher_user_id) ?? null
                      : null,
                    reason: sub.reason ?? null,
                  }
                : null,
            }
          : null,
      };
    });
    return c.json({ cells });
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

    // Phase 4b: pull subject + topic alongside so the parent portal can
    // group grades by subject.
    const { data, error } = await serviceRoleClient
      .from("grade")
      .select(
        "*, assignment:assignment_id(id, title, kind, max_score, weight, due_date, assigned_date, class_section_id, related_topic, section_subject_id, curriculum_topic_id, section_subject:section_subject_id(class_subject:class_subject_id(name)), curriculum_topic:curriculum_topic_id(name))",
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
            // Phase 4b: subject + topic for parent-portal grouping.
            sectionSubjectId: r.assignment.section_subject_id ?? null,
            curriculumTopicId: r.assignment.curriculum_topic_id ?? null,
            subjectName: r.assignment.section_subject?.class_subject?.name ?? null,
            topicName: r.assignment.curriculum_topic?.name ?? null,
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

    // Parent-friendly "today" snapshot. The card on the portal home
    // surface reads this — much higher signal than the raw log table.
    // Pull the latest sabaq, sabqi/manzil (revision), and any parent
    // action so the family knows what to do tonight at one glance.
    const entries = (data ?? []) as any[];
    const todaySabaq = entries.find((e) => e.kind === "sabaq") ?? null;
    const todayRevision =
      entries.find((e) => e.kind === "sabqi" || e.kind === "manzil") ?? null;
    const latestEntry = entries[0] ?? null;
    const today = latestEntry
      ? {
          // Most recent entry, regardless of kind — drives the
          // "last logged" header.
          recordedAt: latestEntry.recorded_at,
          // What the teacher worked on today (sabaq = new lesson).
          sabaq: todaySabaq
            ? {
                surahNumber: todaySabaq.surah_number,
                ayahFrom: todaySabaq.ayah_from,
                ayahTo: todaySabaq.ayah_to,
                quality: todaySabaq.quality,
              }
            : null,
          // Either sabqi (recent revision) or manzil (older revision).
          revision: todayRevision
            ? {
                kind: todayRevision.kind,
                surahNumber: todayRevision.surah_number,
                ayahFrom: todayRevision.ayah_from,
                ayahTo: todayRevision.ayah_to,
                quality: todayRevision.quality,
              }
            : null,
          // Pulled from whichever row carries the latest parent-facing
          // guidance. Prefer the explicit parent_action / parent_comments
          // fields; fall back to legacy `notes` so existing rows still
          // give the parent something useful.
          teacherNote:
            latestEntry.tajweed_notes ||
            latestEntry.fluency_notes ||
            latestEntry.parent_comments ||
            latestEntry.notes ||
            null,
          parentAction: latestEntry.parent_action ?? null,
          nextTarget: latestEntry.next_target ?? null,
          mistakesCount: latestEntry.mistakes_count ?? null,
        }
      : null;

    // 14-day daily snapshot. The parent portal renders this as a row
    // of colored squares so the family sees streaks + missed days at a
    // glance. We aggregate per LOCAL day relative to UTC midnight —
    // good enough at Karachi's UTC+5 since teachers usually log in the
    // afternoon. A timezone-aware aggregation is a follow-up.
    type DayCell = {
      date: string;
      logged: boolean;
      missed: boolean;
      quality: string | null;
      mistakesCount: number | null;
    };
    const last14Days: DayCell[] = [];
    // The Monthly view (parent portal) renders 30 calendar days
    // alongside the 14-day quick strip. We build both arrays here in
    // one pass — both indexed by the same byDate map — so we don't
    // round-trip per call. 30 days is a sensible "month" anchor at
    // pilot scale (no DST/lunar-month nuance yet).
    const last30Days: DayCell[] = [];
    const today0 = new Date();
    today0.setUTCHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today0);
      d.setUTCDate(today0.getUTCDate() - i);
      const cell: DayCell = {
        date: d.toISOString().slice(0, 10),
        logged: false,
        missed: false,
        quality: null,
        mistakesCount: null,
      };
      last30Days.push(cell);
      // last14Days references the LAST 14 entries of the same array —
      // so updating the cell in place updates both views.
      if (i <= 13) last14Days.push(cell);
    }
    const byDate = new Map(last30Days.map((d) => [d.date, d]));
    // We want the BEST representative entry per day. Most recent first
    // works because if a teacher logs sabaq, then sabqi later same day,
    // the latest one is what surfaces in the cell.
    for (const e of entries) {
      const dateKey = (e.recorded_at ?? "").slice(0, 10);
      const cell = byDate.get(dateKey);
      if (!cell) continue;
      // Take the FIRST hit per day (entries are recorded_at DESC, so
      // this is the most recent of that day). The flag we update can
      // be overridden by an even-more-recent miss / log; loop semantics
      // already guarantee we win on first match.
      if (cell.logged || cell.missed) continue;
      cell.logged = !e.missed;
      cell.missed = !!e.missed;
      cell.quality = e.quality ?? null;
      cell.mistakesCount = e.mistakes_count ?? null;
    }

    return c.json({
      entries: entries.map(hifzToJson),
      summary: { ayahsMemorized, surahsCompleted, lastEntry },
      today,
      last14Days,
      last30Days,
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

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/today-snapshot
  //
  // PR feat/parent-portal-home — small, plain-language summary built from
  // existing data sources. Powers the multi-child landing page AND the
  // child dashboard's status pills. Designed to be cheap enough that
  // multi-child parents can hit it once per kid in parallel without a
  // batched endpoint.
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/today-snapshot", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId, subject } = g;
    const stuCtx = await loadStudentWithContext(studentId, subject.orgId);
    if (!stuCtx) return c.json({ error: "student not found" }, 404);

    const today = new Date().toISOString().slice(0, 10);

    // ── Attendance today ──
    let attendanceToday: { status: string; takenAt: string | null } | null = null;
    {
      const { data: row } = await serviceRoleClient
        .from("school_attendance")
        .select("status, created_at")
        .eq("student_id", studentId)
        .eq("attendance_date", today)
        .maybeSingle();
      if (row) {
        attendanceToday = {
          status: (row as any).status,
          takenAt: (row as any).created_at ?? null,
        };
      }
    }

    // ── Homework pending: assignments past created_at, due in the
    // future (or today), no grade row for this student yet. Crude but
    // matches how teachers actually use the gradebook today.
    let homeworkPending = { count: 0, soonestDueDate: null as string | null };
    if (stuCtx.sectionId) {
      const { data: assigns } = await serviceRoleClient
        .from("assignment")
        .select(
          "id, due_date, section_subject:section_subject_id(class_section_id)",
        )
        .gte("due_date", today)
        .limit(50);
      const mine = ((assigns ?? []) as any[]).filter(
        (a) => a.section_subject?.class_section_id === stuCtx.sectionId,
      );
      if (mine.length > 0) {
        const assignIds = mine.map((a) => a.id);
        const { data: gradedRows } = await serviceRoleClient
          .from("grade")
          .select("assignment_id")
          .eq("student_id", studentId)
          .in("assignment_id", assignIds);
        const graded = new Set(((gradedRows ?? []) as any[]).map((g) => g.assignment_id));
        const pending = mine.filter((a) => !graded.has(a.id));
        homeworkPending.count = pending.length;
        if (pending.length > 0) {
          const dates = pending.map((a) => a.due_date).filter(Boolean).sort();
          homeworkPending.soonestDueDate = dates[0] ?? null;
        }
      }
    }

    // ── Fees due now: any unpaid/partial row in fee_status whose
    // due_date is on or before today (or has no due_date — treat as
    // overdue placeholder). Returns just the next-due bill.
    let feesDueNow: { amount: number; periodLabel: string; dueDate: string | null } | null = null;
    {
      const { data: rows } = await serviceRoleClient
        .from("fee_status")
        .select("amount_due, amount_paid, period, due_date, status")
        .eq("student_id", studentId)
        .in("status", ["unpaid", "partial"])
        .order("due_date", { ascending: true, nullsFirst: true });
      const unpaid = ((rows ?? []) as any[]).filter((r) =>
        !r.due_date || r.due_date <= today,
      );
      if (unpaid.length > 0) {
        const r = unpaid[0];
        const owed = Math.max(0, Number(r.amount_due ?? 0) - Number(r.amount_paid ?? 0));
        feesDueNow = {
          amount: owed,
          periodLabel: r.period ?? "",
          dueDate: r.due_date ?? null,
        };
      }
    }

    // ── Hifz revision needed: latest sabqi/manzil entry older than 3
    // days OR no revision entry in the last 7 days flags revision.
    let hifzRevisionNeeded: { lastEntryDate: string; daysSince: number } | null = null;
    {
      const { data: hifz } = await serviceRoleClient
        .from("hifz_progress")
        .select("recorded_at, kind")
        .eq("student_id", studentId)
        .order("recorded_at", { ascending: false })
        .limit(20);
      const lastRevision = ((hifz ?? []) as any[]).find(
        (h) => h.kind === "sabqi" || h.kind === "manzil",
      );
      if (lastRevision) {
        const last = new Date(lastRevision.recorded_at);
        const days = Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000));
        if (days >= 3) {
          hifzRevisionNeeded = {
            lastEntryDate: lastRevision.recorded_at,
            daysSince: days,
          };
        }
      } else if ((hifz ?? []).length > 0) {
        // Student has Hifz entries but never any revision — flag immediately.
        const last = (hifz as any)[0].recorded_at;
        const days = Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
        hifzRevisionNeeded = { lastEntryDate: last, daysSince: days };
      }
    }

    // ── Latest teacher note (last 14 days) ──
    let latestTeacherNote: { kind: string; summary: string; observedAt: string } | null = null;
    {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: n } = await serviceRoleClient
        .from("behavior_note")
        .select("kind, notes, observed_at")
        .eq("student_id", studentId)
        .gte("observed_at", cutoff)
        .order("observed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (n) {
        latestTeacherNote = {
          kind: (n as any).kind,
          summary: ((n as any).notes ?? "").slice(0, 140),
          observedAt: (n as any).observed_at,
        };
      }
    }

    // ── Latest published report card term name (just for the chip) ──
    let publishedReportCardTermName: string | null = null;
    {
      const { data: card } = await serviceRoleClient
        .from("term_report_card")
        .select("term:term_id(name, end_date, archived_at)")
        .eq("student_id", studentId)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const term = (card as any)?.term;
      if (term && !term.archived_at) publishedReportCardTermName = term.name;
    }

    return c.json({
      student: {
        id: stuCtx.id,
        fullName: stuCtx.fullName,
        grNumber: stuCtx.grNumber,
        photoUrl: stuCtx.photoUrl,
        className: stuCtx.className,
        sectionName: stuCtx.sectionName,
      },
      today,
      attendanceToday,
      homeworkPending,
      feesDueNow,
      hifzRevisionNeeded,
      latestTeacherNote,
      publishedReportCardTermName,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/students/:studentId/teacher-comments
  //
  // PR feat/teacher-comments-feed — consolidates every teacher-authored
  // remark about a student into one chronological feed. Sources:
  //   - behavior_note (positive/concern)
  //   - hifz_progress notes fields (tajweed_notes, fluency_notes,
  //     parent_comments, parent_action, notes)
  //   - exam_subject_score.notes (per-exam per-subject)
  //   - term_report_card published cards (subject_comments,
  //     class_teacher_comment, principal_comment)
  //   - lesson body (when prose, last 60 days, this student's section)
  //
  // Capped to last 120 days OR 200 items, whichever bigger. Newest first.
  // ---------------------------------------------------------------------------
  school.get("/pin-me/students/:studentId/teacher-comments", async (c) => {
    const g = await gatePerStudent(c);
    if (!g.ok) return g.resp;
    const { studentId, subject } = g;

    const stuCtx = await loadStudentWithContext(studentId, subject.orgId);
    if (!stuCtx) return c.json({ error: "student not found" }, 404);

    const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const cutoffIso = cutoff.toISOString();

    interface FeedItem {
      id: string;
      kind: "behavior" | "hifz" | "exam_note" | "report_card_subject"
          | "report_card_class_teacher" | "report_card_principal" | "lesson";
      at: string;
      authorName: string | null;
      title: string;
      body: string;
      link: string | null;  // portal route — caller composes /students/:id base
      tone?: "positive" | "concern" | "neutral";
    }
    const out: FeedItem[] = [];
    const authorIds = new Set<string>();

    // ── behavior_note ──
    const { data: behRows } = await serviceRoleClient
      .from("behavior_note")
      .select("id, kind, notes, observed_at, recorded_by, category")
      .eq("student_id", studentId)
      .gte("observed_at", cutoffIso)
      .order("observed_at", { ascending: false })
      .limit(80);
    for (const r of (behRows ?? []) as any[]) {
      if (r.recorded_by) authorIds.add(r.recorded_by);
      out.push({
        id: `behavior:${r.id}`,
        kind: "behavior",
        at: r.observed_at,
        authorName: r.recorded_by, // resolved below
        title: r.kind === "positive" ? "Positive note" : "Concern",
        body: r.notes ?? "",
        link: "/behavior",
        tone: r.kind === "positive" ? "positive" : "concern",
      });
    }

    // ── hifz_progress prose fields ──
    const { data: hifzRows } = await serviceRoleClient
      .from("hifz_progress")
      .select("id, kind, surah_number, ayah_from, ayah_to, recorded_at, recorded_by, tajweed_notes, fluency_notes, teacher_remarks, parent_comments, parent_action, notes")
      .eq("student_id", studentId)
      .gte("recorded_at", cutoffIso)
      .order("recorded_at", { ascending: false })
      .limit(60);
    for (const r of (hifzRows ?? []) as any[]) {
      const lines: string[] = [];
      if (r.teacher_remarks) lines.push(r.teacher_remarks);
      if (r.tajweed_notes) lines.push(`Tajweed: ${r.tajweed_notes}`);
      if (r.fluency_notes) lines.push(`Fluency: ${r.fluency_notes}`);
      if (r.notes) lines.push(r.notes);
      if (r.parent_comments) lines.push(`Parent comment: ${r.parent_comments}`);
      if (r.parent_action) lines.push(`What to do: ${r.parent_action}`);
      if (lines.length === 0) continue;
      if (r.recorded_by) authorIds.add(r.recorded_by);
      out.push({
        id: `hifz:${r.id}`,
        kind: "hifz",
        at: r.recorded_at,
        authorName: r.recorded_by,
        title: `Hifz ${r.kind}${r.surah_number ? ` · Surah ${r.surah_number}${r.ayah_from && r.ayah_to ? `:${r.ayah_from}-${r.ayah_to}` : ""}` : ""}`,
        body: lines.join("\n"),
        link: "/hifz",
        tone: "neutral",
      });
    }

    // ── exam_subject_score.notes (per-exam per-subject) ──
    const { data: scoreRows } = await serviceRoleClient
      .from("exam_subject_score")
      .select("id, notes, updated_at, recorded_by, max_marks, obtained_marks, exam:exam_id(name), class_subject:class_subject_id(name)")
      .eq("student_id", studentId)
      .not("notes", "is", null)
      .gte("updated_at", cutoffIso)
      .order("updated_at", { ascending: false })
      .limit(40);
    for (const r of (scoreRows ?? []) as any[]) {
      if (!r.notes || !r.notes.trim()) continue;
      if (r.recorded_by) authorIds.add(r.recorded_by);
      out.push({
        id: `exam_note:${r.id}`,
        kind: "exam_note",
        at: r.updated_at,
        authorName: r.recorded_by,
        title: `${r.class_subject?.name ?? "Subject"} · ${r.exam?.name ?? "Exam"}`,
        body: r.notes,
        link: "/grades",
        tone: "neutral",
      });
    }

    // ── term_report_card (published only) ──
    const { data: cardRows } = await serviceRoleClient
      .from("term_report_card")
      .select("id, principal_comment, class_teacher_comment, subject_comments, published_at, finalized_by, published_by, term:term_id(name)")
      .eq("student_id", studentId)
      .not("published_at", "is", null);
    // Pull class_subject names once for any subject_comments keys we hit.
    const subjIdsFromCards = new Set<string>();
    for (const card of (cardRows ?? []) as any[]) {
      const sc = card.subject_comments ?? {};
      for (const k of Object.keys(sc)) subjIdsFromCards.add(k);
    }
    const subjNameById = new Map<string, string>();
    if (subjIdsFromCards.size > 0) {
      const { data: subs } = await serviceRoleClient
        .from("class_subject")
        .select("id, name")
        .in("id", Array.from(subjIdsFromCards));
      for (const s of ((subs ?? []) as any[])) subjNameById.set(s.id, s.name);
    }
    for (const card of (cardRows ?? []) as any[]) {
      const termName = card.term?.name ?? "Term";
      if (card.published_by) authorIds.add(card.published_by);
      if (card.class_teacher_comment) {
        out.push({
          id: `rc_ct:${card.id}`,
          kind: "report_card_class_teacher",
          at: card.published_at,
          authorName: card.published_by,
          title: `${termName} report card · class teacher`,
          body: card.class_teacher_comment,
          link: "/report-card",
          tone: "neutral",
        });
      }
      if (card.principal_comment) {
        out.push({
          id: `rc_p:${card.id}`,
          kind: "report_card_principal",
          at: card.published_at,
          authorName: card.published_by,
          title: `${termName} report card · principal`,
          body: card.principal_comment,
          link: "/report-card",
          tone: "neutral",
        });
      }
      const sc = (card.subject_comments ?? {}) as Record<string, string>;
      for (const [csId, txt] of Object.entries(sc)) {
        if (!txt || !txt.trim()) continue;
        const subjectName = subjNameById.get(csId) ?? "Subject";
        out.push({
          id: `rc_subj:${card.id}:${csId}`,
          kind: "report_card_subject",
          at: card.published_at,
          authorName: null,
          title: `${termName} report card · ${subjectName}`,
          body: txt,
          link: "/report-card",
          tone: "neutral",
        });
      }
    }

    // ── lesson prose (this student's section, has body) ──
    if (stuCtx.sectionId) {
      const { data: lessons } = await serviceRoleClient
        .from("lesson")
        .select("id, title, body, lesson_date, taught_by, section_subject:section_subject_id(class_subject:class_subject_id(name))")
        .eq("class_section_id", stuCtx.sectionId)
        .gte("lesson_date", cutoffDate)
        .order("lesson_date", { ascending: false })
        .limit(60);
      for (const r of (lessons ?? []) as any[]) {
        const body = (r.body ?? "").trim();
        if (!body) continue;
        if (r.taught_by) authorIds.add(r.taught_by);
        out.push({
          id: `lesson:${r.id}`,
          kind: "lesson",
          at: r.lesson_date,
          authorName: r.taught_by,
          title: `${r.section_subject?.class_subject?.name ?? "Lesson"}${r.title ? ` — ${r.title}` : ""}`,
          body,
          link: "/lessons",
          tone: "neutral",
        });
      }
    }

    // ── Hydrate author names once ──
    const nameById = new Map<string, string>();
    for (const uid of authorIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(uid);
        const n = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (n) nameById.set(uid, n);
      } catch { /* ignore */ }
    }
    for (const item of out) {
      if (item.authorName && nameById.has(item.authorName)) {
        item.authorName = nameById.get(item.authorName)!;
      } else if (item.authorName && !nameById.has(item.authorName)) {
        // It was a uid we couldn't resolve — null it out so the UI shows
        // a generic "Teacher" label rather than a uuid.
        item.authorName = null;
      }
    }

    // Sort newest first, cap to 200.
    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    const items = out.slice(0, 200);

    return c.json({ items });
  });
}

export default installPortal;
