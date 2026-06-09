// School module — Term report card v2 (PR feat/report-card-v2).
//
// Reads aggregate marks from exam_subject_score (no denormalised
// snapshot). The term_report_card row holds the comments + finalize/
// publish workflow only.
//
// Endpoints:
//
//   GET    /school/orgs/:orgId/students/:studentId/terms/:termId/report-card
//          → assembled report card: per-subject totals, attendance,
//            behavior, hifz, comments, finalize/publish status.
//   PUT    /school/orgs/:orgId/students/:studentId/terms/:termId/report-card/comments
//          → upsert principal/teacher/subject comments
//   POST   /school/orgs/:orgId/students/:studentId/terms/:termId/report-card/finalize
//   POST   /school/orgs/:orgId/students/:studentId/terms/:termId/report-card/unfinalize
//   POST   /school/orgs/:orgId/students/:studentId/terms/:termId/report-card/publish
//   POST   /school/orgs/:orgId/students/:studentId/terms/:termId/report-card/unpublish
//
// Parent / student portal:
//   GET    /school/pin-me/students/:studentId/term-report-cards
//          → list of published cards across terms (term name + dates +
//            overall percent + letter grade)
//   GET    /school/pin-me/students/:studentId/terms/:termId/report-card
//          → full assembled card. 404 if not published_at.
//
// Auth:
//   - GET assembled card: any org role
//   - Comments PUT: admin/principal OR class-teacher of student's section
//   - Finalize / publish: admin/principal only
//   - Portal endpoints: parent of the student or the student themselves
//     (gateGettenPerStudent in schoolPortal)

import type { Context, Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { verifyPinToken } from "./schoolPhaseA.tsx";

// ─── Auth helpers (local copies — see other school* files) ────────────
async function hasAnyOrgRole(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles").select("user_id")
    .eq("user_id", userId).eq("scope_type", "organization")
    .eq("scope_id", orgId).is("revoked_at", null).limit(1).maybeSingle();
  return !!data;
}
async function isAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles").select("role_type")
    .eq("user_id", userId).eq("scope_type", "organization")
    .eq("scope_id", orgId).is("revoked_at", null);
  return (data ?? []).some(
    (r: any) => r.role_type === "principal" || r.role_type === "admin",
  );
}
async function isClassTeacherOfStudent(userId: string, studentId: string): Promise<boolean> {
  const { data: stu } = await serviceRoleClient
    .from("student")
    .select("class_section:class_section_id(class_teacher_user_id, class:class_id(class_teacher_user_id))")
    .eq("id", studentId)
    .maybeSingle();
  if (!stu) return false;
  const sec = (stu as any).class_section;
  if (!sec) return false;
  return sec.class_teacher_user_id === userId || sec.class?.class_teacher_user_id === userId;
}

// ─── Grade scale (hardcoded for v2; configurable in PR 3) ─────────────
function letterGrade(pct: number | null): string {
  if (pct === null) return "—";
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}
function gradeRemark(pct: number | null): string {
  if (pct === null) return "Not graded";
  if (pct >= 90) return "Excellent";
  if (pct >= 80) return "Very good";
  if (pct >= 70) return "Good";
  if (pct >= 60) return "Satisfactory";
  if (pct >= 50) return "Needs improvement";
  return "Unsatisfactory";
}

// ─── Card assembly (shared by admin + portal endpoints) ───────────────
//
// Returns a fully-shaped report-card object for (student, term).
// Caller must pre-validate org scope.
async function assembleReportCard(
  orgId: string,
  studentId: string,
  termId: string,
) {
  // ── Org + term ──
  // Branding lives on organizations.settings JSONB (same pattern as
  // the legacy /report-card endpoint).
  const { data: org } = await serviceRoleClient
    .from("organizations")
    .select("name, slug, settings")
    .eq("id", orgId)
    .maybeSingle();
  const orgSettings = ((org as any)?.settings ?? {}) as Record<string, unknown>;
  const { data: term } = await serviceRoleClient
    .from("academic_term")
    .select("id, name, start_date, end_date, org_id")
    .eq("id", termId)
    .maybeSingle();
  if (!term || (term as any).org_id !== orgId) {
    return { error: "term not found", status: 404 as const };
  }

  // ── Student + placement ──
  const { data: stu } = await serviceRoleClient
    .from("student")
    .select(
      "id, full_name, gr_number, date_of_birth, gender, photo_url, program, religion, nationality, " +
      "class_section:class_section_id(name, class_teacher_user_id, hifz_teacher_user_id, class:class_id(name)), " +
      "org_id",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (!stu || (stu as any).org_id !== orgId) {
    return { error: "student not found", status: 404 as const };
  }
  const section = (stu as any).class_section;
  const classTeacherUid = section?.class_teacher_user_id ?? null;
  const hifzTeacherUid = section?.hifz_teacher_user_id ?? null;
  const teacherIds = [classTeacherUid, hifzTeacherUid].filter((x): x is string => !!x);
  const teacherNameById = new Map<string, string>();
  for (const tid of teacherIds) {
    try {
      const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
      const name = u?.user?.user_metadata?.name || u?.user?.email || "";
      if (name) teacherNameById.set(tid, name);
    } catch { /* ignore */ }
  }

  // ── Exams in this term + scores for this student ──
  const { data: exams } = await serviceRoleClient
    .from("exam")
    .select("id, name, exam_type, weight, exam_date")
    .eq("term_id", termId)
    .is("archived_at", null);
  const examIds = ((exams ?? []) as any[]).map((e) => e.id);

  const { data: scores } = examIds.length
    ? await serviceRoleClient
        .from("exam_subject_score")
        .select("*, class_subject:class_subject_id(id, name)")
        .eq("student_id", studentId)
        .in("exam_id", examIds)
    : { data: [] as any[] };

  // Aggregate per subject across exams, weighted by exam.weight.
  // For each subject: sum(weight * obtained) / sum(weight * max) → %.
  const examById = new Map<string, any>();
  for (const e of (exams ?? []) as any[]) examById.set(e.id, e);

  type SubjAgg = {
    classSubjectId: string;
    subjectName: string;
    weightedObtained: number;
    weightedMax: number;
    perExam: Array<{ examId: string; examName: string; obtained: number | null; max: number; absent: boolean }>;
  };
  const bySubj = new Map<string, SubjAgg>();
  for (const sc of (scores ?? []) as any[]) {
    const examId = sc.exam_id;
    const exam = examById.get(examId);
    if (!exam) continue;
    const w = Number(exam.weight);
    const csId = sc.class_subject_id;
    const subjName = sc.class_subject?.name ?? "—";
    if (!bySubj.has(csId)) {
      bySubj.set(csId, {
        classSubjectId: csId, subjectName: subjName,
        weightedObtained: 0, weightedMax: 0, perExam: [],
      });
    }
    const agg = bySubj.get(csId)!;
    const max = Number(sc.max_marks);
    const obt = sc.obtained_marks === null ? null : Number(sc.obtained_marks);
    agg.perExam.push({
      examId, examName: exam.name,
      obtained: obt, max, absent: !!sc.absent,
    });
    // Absent or unscored: don't count toward total (max stays 0 too —
    // otherwise the % drops for cells the student hasn't yet been
    // graded on, which is misleading mid-term).
    if (sc.absent || obt === null) continue;
    agg.weightedObtained += w * obt;
    agg.weightedMax += w * max;
  }

  const subjects = Array.from(bySubj.values()).map((s) => {
    const pct = s.weightedMax > 0 ? (s.weightedObtained / s.weightedMax) * 100 : null;
    return {
      classSubjectId: s.classSubjectId,
      name: s.subjectName,
      totalObtained: s.weightedObtained,
      totalMax: s.weightedMax,
      percentage: pct,
      letter: letterGrade(pct),
      perExam: s.perExam,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Overall: sum across subjects (already weight-baked in totals).
  const overallObtained = subjects.reduce((s, x) => s + x.totalObtained, 0);
  const overallMax = subjects.reduce((s, x) => s + x.totalMax, 0);
  const overallPct = overallMax > 0 ? (overallObtained / overallMax) * 100 : null;

  // ── Attendance in term window ──
  const startD = (term as any).start_date;
  const endD = (term as any).end_date;
  const { data: att } = await serviceRoleClient
    .from("school_attendance")
    .select("status")
    .eq("student_id", studentId)
    .gte("attendance_date", startD)
    .lte("attendance_date", endD);
  let present = 0, late = 0, absent = 0, excused = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === "present") present++;
    else if (a.status === "late") late++;
    else if (a.status === "absent") absent++;
    else if (a.status === "excused") excused++;
  }
  const totalAtt = present + late + absent + excused;
  const attendancePct = totalAtt > 0 ? ((present + late) / totalAtt) * 100 : null;

  // ── Behavior in term window ──
  const { data: beh } = await serviceRoleClient
    .from("behavior_note")
    .select("kind, points")
    .eq("student_id", studentId)
    .gte("observed_at", startD + "T00:00:00")
    .lte("observed_at", endD + "T23:59:59.999Z");
  let positive = 0, concern = 0, netPoints = 0;
  for (const b of (beh ?? []) as any[]) {
    if (b.kind === "positive") positive++;
    else if (b.kind === "concern") concern++;
    netPoints += Number(b.points ?? 0);
  }

  // ── Hifz in term window ──
  // hifz_progress shape mirrors the existing /report-card endpoint —
  // sabaq (new memorization) ayahs counted via (ayah_from, ayah_to);
  // sabqi/manzil = revision; quality + missed tracked per entry.
  const { data: hifz } = await serviceRoleClient
    .from("hifz_progress")
    .select("surah_number, ayah_from, ayah_to, kind, quality, missed, recorded_at")
    .eq("student_id", studentId)
    .gte("recorded_at", startD + "T00:00:00")
    .lte("recorded_at", endD + "T23:59:59.999Z");
  let ayahsMemorized = 0, surahsCompleted = 0, totalEntries = 0, missedCount = 0;
  const qualityCounts = { excellent: 0, good: 0, needs_practice: 0, weak: 0 };
  const completedSurahs = new Set<number>();
  for (const h of (hifz ?? []) as any[]) {
    totalEntries++;
    if (h.missed) { missedCount++; continue; }
    if (h.kind === "sabaq" && h.ayah_from !== null && h.ayah_to !== null) {
      ayahsMemorized += Math.max(0, Number(h.ayah_to) - Number(h.ayah_from) + 1);
    }
    if (h.kind === "sabaq" && typeof h.surah_number === "number") {
      // crude: treat a sabaq entry that hits the surah's last ayah as
      // completion. Without per-surah length we just count distinct
      // surahs touched as a proxy in this report card view.
      completedSurahs.add(h.surah_number);
    }
    if (h.quality && qualityCounts[h.quality as keyof typeof qualityCounts] !== undefined) {
      qualityCounts[h.quality as keyof typeof qualityCounts]++;
    }
  }
  surahsCompleted = completedSurahs.size;

  // ── Comments + finalize/publish state ──
  const { data: card } = await serviceRoleClient
    .from("term_report_card")
    .select("*")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .maybeSingle();

  const subjectComments: Record<string, string> = (card?.subject_comments ?? {}) as Record<string, string>;

  return {
    ok: true as const,
    payload: {
      school: {
        name: (org as any)?.name ?? "",
        slug: (org as any)?.slug ?? null,
        logoUrl: (orgSettings as any).logo_url ?? null,
        motto: (orgSettings as any).school_motto ?? null,
        themeColor: (orgSettings as any).theme_color ?? null,
        address: (orgSettings as any).address ?? null,
      },
      student: {
        id: stu.id,
        fullName: (stu as any).full_name,
        grNumber: (stu as any).gr_number,
        dateOfBirth: (stu as any).date_of_birth,
        gender: (stu as any).gender,
        photoUrl: (stu as any).photo_url,
        program: (stu as any).program,
        religion: (stu as any).religion,
        nationality: (stu as any).nationality,
      },
      placement: {
        className: section?.class?.name ?? null,
        sectionName: section?.name ?? null,
        classTeacherName: classTeacherUid ? teacherNameById.get(classTeacherUid) ?? null : null,
        hifzTeacherName: hifzTeacherUid ? teacherNameById.get(hifzTeacherUid) ?? null : null,
      },
      term: {
        id: term.id,
        name: (term as any).name,
        startDate: startD,
        endDate: endD,
      },
      exams: ((exams ?? []) as any[]).map((e) => ({
        id: e.id, name: e.name, examType: e.exam_type,
        weight: Number(e.weight), examDate: e.exam_date,
      })),
      academic: {
        subjects: subjects.map((s) => ({
          ...s,
          teacherComment: subjectComments[s.classSubjectId] ?? null,
          remark: gradeRemark(s.percentage),
        })),
        overall: {
          obtained: overallObtained,
          max: overallMax,
          percentage: overallPct,
          letter: letterGrade(overallPct),
          remark: gradeRemark(overallPct),
        },
      },
      attendance: {
        present, late, absent, excused, total: totalAtt, attendancePct,
      },
      behavior: { positive, concern, netPoints },
      hifz: {
        ayahsMemorized, surahsCompleted, totalEntries, missedCount, qualityCounts,
      },
      comments: {
        classTeacher: card?.class_teacher_comment ?? null,
        principal: card?.principal_comment ?? null,
        subjects: subjectComments,
      },
      workflow: {
        recordId: card?.id ?? null,
        finalizedAt: card?.finalized_at ?? null,
        publishedAt: card?.published_at ?? null,
      },
    },
  };
}

// ─── Ensure the term_report_card row exists; returns its id ───────────
async function ensureCardRow(orgId: string, studentId: string, termId: string): Promise<string> {
  const { data: existing } = await serviceRoleClient
    .from("term_report_card")
    .select("id").eq("student_id", studentId).eq("term_id", termId).maybeSingle();
  if (existing) return (existing as any).id;
  const { data, error } = await serviceRoleClient
    .from("term_report_card")
    .insert({ org_id: orgId, student_id: studentId, term_id: termId })
    .select("id").single();
  if (error) throw new Error(error.message);
  return (data as any).id;
}

export function installReportCard(school: Hono): void {
  // ─── Admin: assembled card (live aggregate) ────────────────────────
  school.get(
    "/orgs/:orgId/students/:studentId/terms/:termId/report-card",
    async (c) => {
      const userId = getAuthUserId(c);
      const orgId = c.req.param("orgId");
      const studentId = c.req.param("studentId");
      const termId = c.req.param("termId");
      if (!(await hasAnyOrgRole(userId, orgId))) {
        return c.json({ error: "forbidden" }, 403);
      }
      const r = await assembleReportCard(orgId, studentId, termId);
      if (!r.ok) return c.json({ error: r.error }, r.status);
      return c.json(r.payload);
    },
  );

  // ─── Admin: upsert comments ────────────────────────────────────────
  school.put(
    "/orgs/:orgId/students/:studentId/terms/:termId/report-card/comments",
    async (c) => {
      const userId = getAuthUserId(c);
      const orgId = c.req.param("orgId");
      const studentId = c.req.param("studentId");
      const termId = c.req.param("termId");
      const adminOK = await isAdminOrPrincipal(userId, orgId);
      const teacherOK = !adminOK && (await isClassTeacherOfStudent(userId, studentId));
      if (!adminOK && !teacherOK) return c.json({ error: "forbidden" }, 403);

      const body = await c.req.json().catch(() => ({}));
      const id = await ensureCardRow(orgId, studentId, termId);

      // Class teachers can write per-subject + class-teacher comment;
      // only admins/principals can set the principal_comment.
      const patch: Record<string, unknown> = {};
      if ("classTeacherComment" in body) {
        patch.class_teacher_comment = body.classTeacherComment === null
          ? null : String(body.classTeacherComment).slice(0, 2000);
      }
      if ("subjectComments" in body && body.subjectComments && typeof body.subjectComments === "object") {
        // Clamp each value to 1000 chars; keys are class_subject UUIDs.
        const sc: Record<string, string> = {};
        for (const [k, v] of Object.entries(body.subjectComments)) {
          if (typeof v === "string" && v.trim()) sc[k] = v.slice(0, 1000);
        }
        patch.subject_comments = sc;
      }
      if ("principalComment" in body) {
        if (!adminOK) return c.json({ error: "only principal/admin can set principal comment" }, 403);
        patch.principal_comment = body.principalComment === null
          ? null : String(body.principalComment).slice(0, 2000);
      }
      if (Object.keys(patch).length === 0) return c.json({ ok: true });
      const { error } = await serviceRoleClient
        .from("term_report_card").update(patch).eq("id", id);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true });
    },
  );

  // ─── Finalize / publish toggles ────────────────────────────────────
  async function workflowToggle(
    c: Context,
    field: "finalized_at" | "published_at",
    actorField: "finalized_by" | "published_by",
    set: boolean,
  ) {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const id = await ensureCardRow(orgId, studentId, termId);
    const { error } = await serviceRoleClient
      .from("term_report_card")
      .update({
        [field]: set ? new Date().toISOString() : null,
        [actorField]: set ? userId : null,
      })
      .eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  }
  school.post("/orgs/:orgId/students/:studentId/terms/:termId/report-card/finalize",
    (c) => workflowToggle(c, "finalized_at", "finalized_by", true));
  school.post("/orgs/:orgId/students/:studentId/terms/:termId/report-card/unfinalize",
    (c) => workflowToggle(c, "finalized_at", "finalized_by", false));
  school.post("/orgs/:orgId/students/:studentId/terms/:termId/report-card/publish",
    (c) => workflowToggle(c, "published_at", "published_by", true));
  school.post("/orgs/:orgId/students/:studentId/terms/:termId/report-card/unpublish",
    (c) => workflowToggle(c, "published_at", "published_by", false));

  // ─── Portal endpoints (PIN auth) ───────────────────────────────────
  // gatePerStudent equivalent: verify the PIN token, then check that
  // the requested student is one this subject can see. We duplicate
  // the minimal gate here rather than reach into schoolPortal — fine
  // for two endpoints.
  async function pinGate(c: Context, studentId: string): Promise<{ ok: true } | { ok: false; resp: Response }> {
    const authHeader = c.req.header("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const verified = await verifyPinToken(token);
    if (!verified) {
      return { ok: false, resp: c.json({ error: "unauthenticated" }, 401) };
    }
    // Parent: can see any of their children. Student: only themselves.
    if (verified.subjectType === "student") {
      if (verified.subjectId !== studentId) {
        return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
      }
    } else if (verified.subjectType === "parent") {
      const { data: link } = await serviceRoleClient
        .from("student_parent")
        .select("student_id")
        .eq("parent_id", verified.subjectId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (!link) return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    } else {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    return { ok: true };
  }

  school.get("/pin-me/students/:studentId/term-report-cards", async (c) => {
    const studentId = c.req.param("studentId");
    const g = await pinGate(c, studentId);
    if (!g.ok) return g.resp;
    const { data: cards } = await serviceRoleClient
      .from("term_report_card")
      .select(
        "id, term_id, published_at, term:term_id(name, start_date, end_date, archived_at)",
      )
      .eq("student_id", studentId)
      .not("published_at", "is", null);
    const filtered = ((cards ?? []) as any[]).filter((x) => x.term && !x.term.archived_at);
    const out = filtered.map((x) => ({
      termId: x.term_id,
      termName: x.term.name,
      startDate: x.term.start_date,
      endDate: x.term.end_date,
      publishedAt: x.published_at,
    }));
    // Sort newest first.
    out.sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));
    return c.json({ cards: out });
  });

  school.get("/pin-me/students/:studentId/terms/:termId/report-card", async (c) => {
    const studentId = c.req.param("studentId");
    const termId = c.req.param("termId");
    const g = await pinGate(c, studentId);
    if (!g.ok) return g.resp;

    // Need org_id to assemble — pull from student.
    const { data: stu } = await serviceRoleClient
      .from("student").select("org_id").eq("id", studentId).maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    const orgId = (stu as any).org_id;

    // Only published cards are visible to parents.
    const { data: card } = await serviceRoleClient
      .from("term_report_card")
      .select("published_at")
      .eq("student_id", studentId)
      .eq("term_id", termId)
      .maybeSingle();
    if (!card || !(card as any).published_at) {
      return c.json({ error: "report card not published yet" }, 404);
    }
    const r = await assembleReportCard(orgId, studentId, termId);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json(r.payload);
  });
}

export default installReportCard;
