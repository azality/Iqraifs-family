// School module — Assessment structure (PR feat/assessment-foundation).
//
// Three layers below report cards:
//
//   academic_term      org-wide period (Term 1, Term 2, Term 3)
//   exam               term-scoped (Mid-term, Final, Monthly Test)
//   exam_subject_score (exam, student, class_subject) → max + obtained
//
// Endpoints:
//   GET    /school/orgs/:orgId/terms
//   POST   /school/orgs/:orgId/terms
//   PATCH  /school/orgs/:orgId/terms/:termId
//   DELETE /school/orgs/:orgId/terms/:termId             (soft archive)
//
//   GET    /school/orgs/:orgId/terms/:termId/exams
//   POST   /school/orgs/:orgId/terms/:termId/exams
//   PATCH  /school/orgs/:orgId/exams/:examId
//   DELETE /school/orgs/:orgId/exams/:examId             (soft archive)
//
//   GET    /school/orgs/:orgId/exams/:examId/marks-sheet?sectionId=…
//          → returns students × subjects sheet for that section
//   POST   /school/orgs/:orgId/exams/:examId/marks-sheet
//          → bulk upsert (whole sheet save in one round-trip)
//
// Writes require admin/principal or class-teacher of the section (for
// marks entry). Reads accept any org role.

import { paperOfExam, subjectSitsExam, progressForSection } from "./markingProgress.ts";
import { loadSitsResolver } from "./subjectStreamsLoad.ts";
import { deadlineState, effectiveSchedule, type DeadlineState } from "./marksDeadline.ts";
import { loadExamScores, gradebookExams, resolveMarkingTerm } from "./schoolMarkingProgress.tsx";
import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAnyRoleInOrg as hasAnyOrgRole, hasAdminOrPrincipal as isAdminOrPrincipal, isInchargeOfClass } from "./schoolAuth.ts";
import { orgTimezone, todayInOrgTz } from "./tz.ts";
import { orgPassMarkPct, isFailing, failedTerm } from "./passMark.ts";
import * as kv from "./kv_store.tsx";

// Per-subject "my column is complete" sign-off, one small map per
// (term, section): { [classSubjectId]: { by, byName, at } }. Lives in
// the kv store because this codebase has no migration path to the live
// database from here - it is tiny, single-writer metadata, and the two
// helpers below are the only code that knows where it lives, so moving
// it into a real table later is a two-function change.
const confirmKey = (termId: string, sectionId: string) =>
  `school:marksconfirm:${termId}:${sectionId}`;
async function readConfirmations(termId: string, sectionId: string):
  Promise<Record<string, { by: string; byName: string; at: string }>> {
  try { return (await kv.get(confirmKey(termId, sectionId))) ?? {}; }
  catch { return {}; }
}

// The paper rule (paperOfExam / subjectSitsExam) lives in markingProgress.ts
// so the marks sheet, the section page and the Marking progress board all
// judge "does this subject sit this exam" the same way.

// Which subject columns this caller may edit in this section.
// null = ALL (admin/principal/class teacher — they own the section);
// otherwise the class_subject_ids they teach here. A subject teacher
// sees and writes only their own columns (Muneeb, 11 Sep: Rizwana
// enters Sindhi and cannot see the rest).
async function editableSubjects(
  userId: string,
  orgId: string,
  sectionId: string,
): Promise<Set<string> | null> {
  if (await isAdminOrPrincipal(userId, orgId)) return null;
  const { data: sec } = await serviceRoleClient
    .from("class_section")
    .select("class_teacher_user_id")
    .eq("id", sectionId).maybeSingle();
  if ((sec as any)?.class_teacher_user_id === userId) return null;
  const { data } = await serviceRoleClient
    .from("section_subject")
    .select("class_subject_id")
    .eq("class_section_id", sectionId)
    .eq("teacher_user_id", userId)
    .is("archived_at", null);
  return new Set(
    ((data ?? []) as any[]).map((r) => r.class_subject_id).filter(Boolean),
  );
}

function termToJson(r: any) {
  return {
    id: r.id, orgId: r.org_id,
    academicYearId: r.academic_year_id,
    name: r.name,
    startDate: r.start_date, endDate: r.end_date,
    isCurrent: r.is_current,
    archivedAt: r.archived_at,
    // Marks deadline + results day (23 Sep): the admin's clock on the
    // term. Null = not set.
    marksDeadlineAt: r.marks_deadline_at ?? null,
    resultsPublishAt: r.results_publish_at ?? null,
    // When class teachers stop writing remarks (27 Sep). Null = no
    // cutoff; finalizing a card is then the only lock.
    remarksDeadlineAt: r.remarks_deadline_at ?? null,
  };
}

/** This caller's deadline state for a term - the one gate every marks
 *  write asks. Admin/principal are never locked; a teacher may hold a
 *  personal exception with its own later moment. */
async function marksLockFor(
  orgId: string,
  termId: string | null | undefined,
  userId: string,
  classId?: string | null,
): Promise<DeadlineState> {
  if (!termId) return deadlineState({ deadlineAt: null, exceptionUntil: null, isAdmin: false });
  const [{ data: term }, admin] = await Promise.all([
    serviceRoleClient.from("academic_term")
      .select("marks_deadline_at, results_publish_at").eq("id", termId).maybeSingle(),
    isAdminOrPrincipal(userId, orgId),
  ]);
  // The class may hold its own moment - or an exemption (24 Sep: the
  // school-wide deadline, "if they want to omit they should be able").
  let deadlineAt: string | null = (term as any)?.marks_deadline_at ?? null;
  if (classId) {
    const { data: ov } = await serviceRoleClient
      .from("term_class_schedule")
      .select("marks_deadline_at, marks_deadline_off, results_publish_at")
      .eq("term_id", termId).eq("class_id", classId).maybeSingle();
    if (ov) {
      deadlineAt = effectiveSchedule(
        { marksDeadlineAt: deadlineAt, resultsPublishAt: null },
        { marksDeadlineAt: (ov as any).marks_deadline_at ?? null,
          marksDeadlineOff: !!(ov as any).marks_deadline_off,
          resultsPublishAt: null },
      ).marksDeadlineAt;
    }
  }
  let exceptionUntil: string | null = null;
  if (!admin && deadlineAt) {
    const { data: ex } = await serviceRoleClient
      .from("marks_deadline_exception")
      .select("until_at").eq("term_id", termId).eq("user_id", userId)
      .order("until_at", { ascending: false }).limit(1).maybeSingle();
    exceptionUntil = (ex as any)?.until_at ?? null;
  }
  return deadlineState({
    deadlineAt,
    exceptionUntil,
    isAdmin: admin,
  });
}

/** Names for exception rows - same resolution as schoolSubjects'
 *  hydrateTeacherNames (user_metadata.name, then full_name, then email). */
async function hydrateTeacherNamesAssess(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(ids.filter(Boolean))).map(async (uid) => {
      try {
        const { data } = await serviceRoleClient.auth.admin.getUserById(uid);
        const name =
          ((data?.user as any)?.user_metadata?.name as string | undefined) ??
          ((data?.user as any)?.user_metadata?.full_name as string | undefined) ??
          ((data?.user as any)?.email as string | undefined) ?? "Teacher";
        out.set(uid, name);
      } catch (_) { /* swallow */ }
    }),
  );
  return out;
}

/** Results day, without a cron: FINALIZED cards whose term's
 *  results_publish_at has passed get their published_at stamped on the
 *  next read. Every surface keeps its published_at semantics. Exported
 *  for the portal, which reads cards without knowing the term. */
export async function applyScheduledPublish(orgId: string): Promise<void> {
  const nowIso = new Date().toISOString();

  // A class's OWN results day (primary one day, secondary another,
  // Hifz its own - 24 Sep): stamp that class's finalized cards at its
  // own moment.
  const { data: dueOv } = await serviceRoleClient
    .from("term_class_schedule")
    .select("term_id, class_id, results_publish_at")
    .eq("org_id", orgId)
    .not("results_publish_at", "is", null)
    .lte("results_publish_at", nowIso);
  const studentsOfClass = async (classId: string): Promise<string[]> => {
    const { data: secs } = await serviceRoleClient
      .from("class_section").select("id").eq("class_id", classId);
    const secIds = ((secs ?? []) as any[]).map((s) => s.id);
    if (!secIds.length) return [];
    const { data: stus } = await serviceRoleClient
      .from("student").select("id").in("class_section_id", secIds);
    return ((stus ?? []) as any[]).map((s) => s.id);
  };
  for (const ov of (dueOv ?? []) as any[]) {
    const ids = await studentsOfClass(ov.class_id);
    if (!ids.length) continue;
    await serviceRoleClient
      .from("term_report_card")
      .update({ published_at: ov.results_publish_at })
      .eq("term_id", ov.term_id)
      .in("student_id", ids)
      .not("finalized_at", "is", null)
      .is("published_at", null);
  }

  // The whole school's day - skipping any class that has its OWN day
  // (due or not: its cards wait for its own moment).
  const { data: due } = await serviceRoleClient
    .from("academic_term")
    .select("id, results_publish_at")
    .eq("org_id", orgId)
    .not("results_publish_at", "is", null)
    .lte("results_publish_at", nowIso);
  for (const t of (due ?? []) as any[]) {
    const { data: ownDay } = await serviceRoleClient
      .from("term_class_schedule")
      .select("class_id")
      .eq("term_id", t.id)
      .not("results_publish_at", "is", null);
    let excluded: string[] = [];
    for (const o of (ownDay ?? []) as any[]) {
      excluded = excluded.concat(await studentsOfClass(o.class_id));
    }
    let q = serviceRoleClient
      .from("term_report_card")
      .update({ published_at: t.results_publish_at })
      .eq("term_id", t.id)
      .not("finalized_at", "is", null)
      .is("published_at", null);
    if (excluded.length) {
      q = q.not("student_id", "in", `(${excluded.join(",")})`);
    }
    await q;
  }
}
function examToJson(r: any) {
  return {
    id: r.id, orgId: r.org_id, termId: r.term_id,
    name: r.name, nameEn: r.name_en ?? null, examType: r.exam_type,
    weight: Number(r.weight),
    examDate: r.exam_date,
    archivedAt: r.archived_at,
  };
}
function scoreToJson(r: any) {
  return {
    id: r.id,
    examId: r.exam_id,
    studentId: r.student_id,
    classSubjectId: r.class_subject_id,
    maxMarks: Number(r.max_marks),
    obtainedMarks: r.obtained_marks === null ? null : Number(r.obtained_marks),
    absent: r.absent,
    notes: r.notes,
  };
}

export function installAssessment(school: Hono): void {
  // ─── Terms CRUD ─────────────────────────────────────────────────────
  school.get("/orgs/:orgId/terms", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("academic_term")
      .select("*")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("start_date", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ terms: (data ?? []).map(termToJson) });
  });

  school.post("/orgs/:orgId/terms", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const start = String(body.startDate ?? "");
    const end = String(body.endDate ?? "");
    if (!name) return c.json({ error: "name required" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return c.json({ error: "startDate / endDate must be YYYY-MM-DD" }, 400);
    }
    if (end < start) return c.json({ error: "endDate must be >= startDate" }, 400);
    const yearId = body.academicYearId ?? null;
    const isCurrent = body.isCurrent === true;

    // If marking current, flip any existing current term for this org
    // first (DB partial index would reject the insert otherwise).
    if (isCurrent) {
      await serviceRoleClient
        .from("academic_term")
        .update({ is_current: false })
        .eq("org_id", orgId)
        .is("archived_at", null)
        .eq("is_current", true);
    }
    const { data, error } = await serviceRoleClient
      .from("academic_term")
      .insert({
        org_id: orgId,
        academic_year_id: yearId,
        name, start_date: start, end_date: end,
        is_current: isCurrent,
      })
      .select("*").single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a term with that name already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ term: termToJson(data) }, 201);
  });

  school.patch("/orgs/:orgId/terms/:termId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("academic_term").select("org_id").eq("id", termId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "term not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if ("name" in body) patch.name = String(body.name ?? "").trim();
    if ("startDate" in body) patch.start_date = body.startDate;
    if ("endDate" in body) patch.end_date = body.endDate;
    if ("academicYearId" in body) patch.academic_year_id = body.academicYearId ?? null;
    if ("isCurrent" in body) {
      if (body.isCurrent === true) {
        await serviceRoleClient
          .from("academic_term")
          .update({ is_current: false })
          .eq("org_id", orgId)
          .is("archived_at", null)
          .eq("is_current", true)
          .neq("id", termId);
      }
      patch.is_current = body.isCurrent === true;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("academic_term").update(patch).eq("id", termId).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ term: termToJson(data) });
  });

  school.delete("/orgs/:orgId/terms/:termId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("academic_term")
      .update({ archived_at: new Date().toISOString(), is_current: false })
      .eq("id", termId).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Exams CRUD ─────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────
  // GET /orgs/:orgId/exam-schedule?termId=… — the published written
  // datesheet, grouped by class. Any staff role may read it: it is a
  // notice, not a record. Labels are the school's own ("Sst",
  // "Computer/Biology") and are never rewritten here.
  // ───────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────
  // GET /orgs/:orgId/sections/:sectionId/tabulation?termId=…
  //
  // The end-of-term tabulation sheet (Ambreen, 11 Sep): oral and written
  // are entered as separate exams, each with its own percentage, but the
  // register the school actually closes a term with is ONE grid — every
  // student, every subject, each exam's marks side by side, combined into
  // the subject's total ("60 + 15 = out of 75, aur 75 main se kitne
  // aaye"), then the grand total, percentage and position.
  //
  // Generic by construction, not iqraifs-shaped: it combines WHATEVER
  // exams the term holds (two here, any number elsewhere), weighted by
  // exam.weight exactly like the report card, so the two can never
  // disagree. termId omitted = the current term. Reads accept any org
  // role, same as every assessment read.
  // ───────────────────────────────────────────────────────────────────────
  school.get("/orgs/:orgId/sections/:sectionId/tabulation", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: sec } = await serviceRoleClient
      .from("class_section")
      .select("id, name, class_teacher_user_id, hifz_teacher_user_id, class:class_id(id, name, org_id)")
      .eq("id", sectionId).maybeSingle();
    if (!sec || (sec as any).class?.org_id !== orgId) {
      return c.json({ error: "section not found" }, 404);
    }
    // The register is for the office and the section's own teacher.
    // Subject teachers deliberately do NOT get it - they see only their
    // own column on the marks sheets (the Rizwana rule), and their
    // sign-off lives there too.
    const isOffice = await isAdminOrPrincipal(userId, orgId);
    const isSectionTeacher =
      (sec as any).class_teacher_user_id === userId ||
      (sec as any).hifz_teacher_user_id === userId;
    // Incharge: their OWN wing's sections only. The old check accepted any
    // incharge for every section in the school (permissions audit, 16 Sep).
    if (!isOffice && !isSectionTeacher && !(await isInchargeOfClass(userId, orgId, (sec as any).class?.id))) {
      return c.json({ error: "the tabulation sheet is for the office, the incharge and the class teacher" }, 403);
    }

    let termId = c.req.query("termId") ?? "";
    if (!termId) {
      const { data: cur } = await serviceRoleClient
        .from("academic_term")
        .select("id").eq("org_id", orgId).eq("is_current", true)
        .is("archived_at", null).maybeSingle();
      termId = (cur as any)?.id ?? "";
    }
    const { data: term } = await serviceRoleClient
      .from("academic_term")
      .select("id, name, org_id, start_date, end_date, marks_deadline_at, results_publish_at")
      .eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) {
      return c.json({ error: "term not found" }, 404);
    }

    const { data: exams } = await serviceRoleClient
      .from("exam")
      .select("id, name, name_en, weight, exam_date")
      .eq("term_id", termId).is("archived_at", null)
      .order("exam_date");
    const examList = (exams ?? []) as any[];
    const examIds = examList.map((e) => e.id);

    // No roll_number in this codebase's student table (see the
    // marks-sheet note below) - selecting it 400s the whole query.
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number")
      .eq("class_section_id", sectionId).eq("status", "active")
      .order("full_name");
    const stuList = (students ?? []) as any[];
    const stuIds = stuList.map((s) => s.id);

    const { data: subs } = await serviceRoleClient
      .from("class_subject")
      .select("id, name, sort_order, assessment_weights, elective_group")
      .eq("class_id", (sec as any).class.id).is("archived_at", null)
      .order("sort_order").order("name");

    // Streams: a child sits ONE subject of an elective group (Class IX:
    // Biology or Computer). Score rows for the other one - including
    // the 21 "absent" stamps the Biology teacher gave her computer
    // students - are never counted (23 Sep).
    const sitsRes = await loadSitsResolver((subs ?? []) as any[], stuIds);

    // PAGED: an unpaged select stops silently at 1000 rows (#620 class).
    // Class I already holds 778 for one term; one more paper crosses it,
    // and half a register would simply not be there.
    const scores: any[] = [];
    if (stuIds.length && examIds.length) {
      for (let i = 0; i < stuIds.length; i += 150) {
        const chunk = stuIds.slice(i, i + 150);
        for (let from = 0; ; from += 1000) {
          const { data: page } = await serviceRoleClient
            .from("exam_subject_score")
            .select("student_id, exam_id, class_subject_id, obtained_marks, max_marks, absent")
            .in("student_id", chunk).in("exam_id", examIds)
            .order("id").range(from, from + 999);
          scores.push(...(page ?? []));
          if (!page || page.length < 1000) break;
        }
      }
    }

    // The subject's expected combined total from the school's marks
    // distribution — the "out of 75" on the printed register. Null when
    // no distribution exists; such a subject still appears if it holds
    // marks (a mark must never fall off the register).
    const expected = (w: any): number | null => {
      if (!Array.isArray(w) || w.length === 0) return null;
      const t = w.reduce(
        (sum: number, x: any) => sum + (typeof x?.marks === "number" ? x.marks : 0), 0);
      return t > 0 ? t : null;
    };

    const weightByExam = new Map<string, number>(
      examList.map((e) => [e.id, Number(e.weight) || 1]));
    type Cell = {
      obtained: number; max: number;
      perExam: Record<string, { obtained: number | null; max: number; absent: boolean }>;
    };
    const byStudent = new Map<string, Map<string, Cell>>();
    const heldSubjects = new Set<string>();
    for (const r of (scores ?? []) as any[]) {
      if (!sitsRes.sits(r.student_id, r.class_subject_id)) continue;
      const w = weightByExam.get(r.exam_id) ?? 1;
      const m = byStudent.get(r.student_id) ?? new Map<string, Cell>();
      const cell = m.get(r.class_subject_id) ?? { obtained: 0, max: 0, perExam: {} };
      const obt = r.obtained_marks === null ? null : Number(r.obtained_marks);
      cell.perExam[r.exam_id] = { obtained: obt, max: Number(r.max_marks), absent: !!r.absent };
      // An ABSENT paper keeps its maximum: the child scored 0 of it,
      // they did not shrink the paper. Ayesha missed a 70-mark written,
      // her register read 505/505-max and she ranked 11th on the
      // smaller denominator (Ambreen, 22 Sep). Only an UNMARKED row
      // (null, not absent) stays out of both sides - the register is
      // read mid-marking and pending papers must not deflate anyone.
      if (r.absent) {
        // The max lands in the cell, but an absence alone does not make
        // the subject a COLUMN - an absent stamp in a not-examined
        // subject (Art & Craft holds stale null stamps on Class I)
        // must not conjure a column and skew one child's total.
        cell.max += w * Number(r.max_marks);
      } else if (obt !== null) {
        cell.obtained += w * obt;
        cell.max += w * Number(r.max_marks);
        heldSubjects.add(r.class_subject_id);
      }
      m.set(r.class_subject_id, cell);
      byStudent.set(r.student_id, m);
    }

    // Columns: every EXAMINED subject (has a marks distribution), plus
    // any subject that holds marks anyway.
    const subjectCols = ((subs ?? []) as any[])
      .filter((s) => expected(s.assessment_weights) !== null || heldSubjects.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, expectedMax: expected(s.assessment_weights) }));

    const rows = stuList.map((s) => {
      const m = byStudent.get(s.id) ?? new Map<string, Cell>();
      let totalObtained = 0, totalMax = 0, absentPapers = 0;
      const subjects: Record<string, any> = {};
      for (const col of subjectCols) {
        const cell = m.get(col.id);
        if (!cell) continue;
        const cellAbsent = Object.values(cell.perExam).filter((p) => p.absent).length;
        absentPapers += cellAbsent;
        subjects[col.id] = {
          obtained: cell.obtained, max: cell.max,
          percentage: cell.max > 0 ? (cell.obtained / cell.max) * 100 : null,
          absentPapers: cellAbsent,
          perExam: cell.perExam,
        };
        totalObtained += cell.obtained;
        totalMax += cell.max;
      }
      // A child who missed a paper is not RANKED against those who sat
      // them all: no percentage line and no position - Maryam took
      // 189/195 across the two papers she sat and ranked 7th over
      // children who sat everything (Ambreen, 22 Sep). Their marks and
      // the honest total (absences included) still print.
      return {
        studentId: s.id, studentName: s.full_name,
        grNumber: s.gr_number, rollNumber: null,
        subjects, totalObtained, totalMax, absentPapers,
        percentage: absentPapers === 0 && totalMax > 0 ? (totalObtained / totalMax) * 100 : null,
      };
    });

    // Results day may have arrived since the last read - stamp before
    // the counts below so finalized/published tallies tell the truth.
    await applyScheduledPublish(orgId);

    // The school's pass line — one reader for every surface (passMark.ts).
    const passMarkPct = await orgPassMarkPct(orgId);

    // Position: rank by percentage, equal percentages share a position —
    // how the school's own registers do it.
    //
    // A child who FAILED is not ranked. Ambreen said it in the same
    // breath as the absentees ("agar koi fail ho raha hai... to phir
    // bhi position count kar raha hai") and only the absent half was
    // built; the school then saw a failing child still holding a
    // position (22 Sep).
    //
    // 26 Sep REVERSES the rule that stood here: a fail in ANY subject
    // now fails the child, "irrespective agar woh baqi sarey subjects
    // main A+ hi keyo na aaya ho" - so a single dropped subject costs
    // the rank too. The report card reads the same function, so the
    // register and the card can never disagree about who failed.
    const failed = (r: { percentage: number | null; subjects: Record<string, any> }) =>
      failedTerm(
        r.percentage,
        subjectCols.map((c: any) => {
          const cell = r.subjects?.[c.id];
          return { name: c.name, percentage: cell ? cell.percentage ?? null : null };
        }),
        passMarkPct,
      );
    const ranked = rows
      .filter((r) => r.percentage !== null && !failed(r))
      .sort((a, b) => (b.percentage! - a.percentage!));
    const posByStudent = new Map<string, number>();
    let pos = 0, prevPct: number | null = null;
    ranked.forEach((r, i) => {
      if (prevPct === null || Math.abs(r.percentage! - prevPct) > 1e-9) { pos = i + 1; prevPct = r.percentage!; }
      posByStudent.set(r.studentId, pos);
    });

    // Sign-offs and the finalize/publish state, so the register shows
    // where the term stands: which columns are confirmed, how many
    // report cards are finalized and published.
    const confirmations = await readConfirmations(termId, sectionId);
    let finalizedCount = 0, publishedCount = 0;
    if (stuIds.length) {
      const { data: cards } = await serviceRoleClient
        .from("term_report_card")
        .select("student_id, finalized_at, published_at")
        .eq("term_id", termId).in("student_id", stuIds);
      for (const cRow of (cards ?? []) as any[]) {
        if (cRow.finalized_at) finalizedCount++;
        if (cRow.published_at) publishedCount++;
      }
    }


    // A child with no stream choice sits neither subject of the group -
    // named here so the register says WHO is undecided instead of
    // quietly totalling them smaller.
    const nameOf = new Map(stuList.map((s) => [s.id, s.full_name]));
    const unchosenStreams = sitsRes.unchosen(stuIds).map((u) => ({
      group: u.group,
      students: u.studentIds.map((id) => nameOf.get(id) ?? id),
    }));

    return c.json({
      section: { id: (sec as any).id, name: (sec as any).name, className: (sec as any).class.name },
      term: { id: (term as any).id, name: (term as any).name },
      // The admin's clock on this term (23 Sep): teachers' entry locks
      // at the deadline; finalized cards reach parents at results day.
      // Whole-school values + per-class overrides (24 Sep: primary and
      // secondary publish on different days, Hifz on its own; a class
      // can be exempt from the deadline) + what THIS class ends up with.
      schedule: await (async () => {
        const school = {
          marksDeadlineAt: (term as any).marks_deadline_at ?? null,
          resultsPublishAt: (term as any).results_publish_at ?? null,
        };
        const { data: ovRows } = await serviceRoleClient
          .from("term_class_schedule")
          .select("class_id, marks_deadline_at, marks_deadline_off, results_publish_at, class:class_id(name)")
          .eq("term_id", termId).eq("org_id", orgId);
        const overrides = ((ovRows ?? []) as any[]).map((o) => ({
          classId: o.class_id,
          className: o.class?.name ?? "",
          marksDeadlineAt: o.marks_deadline_at ?? null,
          marksDeadlineOff: !!o.marks_deadline_off,
          resultsPublishAt: o.results_publish_at ?? null,
        }));
        const mine = overrides.find((o) => o.classId === (sec as any).class?.id) ?? null;
        return {
          ...school,
          overrides,
          effective: effectiveSchedule(school, mine),
        };
      })(),
      unchosenStreams,
      passMarkPct,
      exams: examList.map((e) => ({ id: e.id, name: e.name, nameEn: e.name_en ?? null, weight: Number(e.weight) || 1 })),
      subjects: subjectCols,
      students: rows.map((r) => ({
        ...r,
        position: posByStudent.get(r.studentId) ?? null,
        /** Why there is no position: the grand total is under the pass
         *  mark. Absence is reported separately as absentPapers. */
        failedOverall: failed(r),
      })),
      confirmations,
      reportCards: { studentCount: stuList.length, finalizedCount, publishedCount },
      canFinalize: isOffice,
    });
  });

  // ---------------------------------------------------------------------
  // POST /orgs/:orgId/sections/:sectionId/subjects/:subjectId/marks-confirmation
  // Body: { termId?, confirmed: boolean }
  //
  // The subject teacher's green check: "my column for this term is
  // complete". Allowed for whoever may EDIT that column on the marks
  // sheet - the subject's own teacher, the class teacher, the office -
  // and recorded with name and time so the register shows who signed.
  // ---------------------------------------------------------------------
  school.post("/orgs/:orgId/sections/:sectionId/subjects/:subjectId/marks-confirmation", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const subjectId = c.req.param("subjectId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const editable = await editableSubjects(userId, orgId, sectionId);
    if (editable !== null && !editable.has(subjectId)) {
      return c.json({ error: "only the subject's own teacher (or the class teacher) can sign off this column" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    let termId = String(body.termId ?? "");
    if (!termId) {
      const { data: cur } = await serviceRoleClient
        .from("academic_term").select("id").eq("org_id", orgId)
        .eq("is_current", true).is("archived_at", null).maybeSingle();
      termId = (cur as any)?.id ?? "";
    }
    if (!termId) return c.json({ error: "no current term" }, 400);
    const { data: subj } = await serviceRoleClient
      .from("class_subject").select("id, org_id").eq("id", subjectId).maybeSingle();
    if (!subj || (subj as any).org_id !== orgId) {
      return c.json({ error: "subject not found" }, 404);
    }

    const map = await readConfirmations(termId, sectionId);
    if (body.confirmed === true) {
      let byName = "";
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(userId);
        byName = u?.user?.user_metadata?.name || u?.user?.email || "";
      } catch { /* name is cosmetic */ }
      map[subjectId] = { by: userId, byName, at: new Date().toISOString() };
    } else {
      delete map[subjectId];
    }
    await kv.set(confirmKey(termId, sectionId), map);
    return c.json({ termId, confirmations: map });
  });

  // ---------------------------------------------------------------------
  // POST /orgs/:orgId/sections/:sectionId/terms/:termId/report-cards/bulk
  // Body: { action: "finalize" | "unfinalize" | "publish" | "unpublish" }
  //
  // The principal's end-of-term buttons, section-wide. Finalize marks
  // every active student's report card signed-off AND locks the marks
  // sheets for this term (the marks-sheet save refuses finalized
  // students). Publish makes the cards visible in the parent portal -
  // only cards that are finalized. Unfinalize reopens the term and,
  // because a visible-but-reopened card would mislead parents, also
  // unpublishes. Admin/principal only.
  // ---------------------------------------------------------------------
  school.post("/orgs/:orgId/sections/:sectionId/terms/:termId/report-cards/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "finalize and publish are for the office" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (!["finalize", "unfinalize", "publish", "unpublish"].includes(action)) {
      return c.json({ error: "action must be finalize | unfinalize | publish | unpublish" }, 400);
    }
    const { data: sec } = await serviceRoleClient
      .from("class_section").select("id, class:class_id(org_id)").eq("id", sectionId).maybeSingle();
    if (!sec || (sec as any).class?.org_id !== orgId) {
      return c.json({ error: "section not found" }, 404);
    }
    const { data: term } = await serviceRoleClient
      .from("academic_term").select("id, org_id").eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) {
      return c.json({ error: "term not found" }, 404);
    }
    const { data: students } = await serviceRoleClient
      .from("student").select("id")
      .eq("class_section_id", sectionId).eq("status", "active");
    const ids = ((students ?? []) as any[]).map((s) => s.id);
    if (!ids.length) return c.json({ ok: true, action, updated: 0, studentCount: 0 });

    const now = new Date().toISOString();
    let updated = 0;
    if (action === "finalize") {
      // Ensure a card row per student, then stamp them all.
      for (const sid of ids) {
        const { error } = await serviceRoleClient
          .from("term_report_card")
          .upsert(
            { org_id: orgId, student_id: sid, term_id: termId, finalized_at: now },
            { onConflict: "student_id,term_id" },
          );
        if (!error) updated++;
      }
    } else if (action === "unfinalize") {
      const { data } = await serviceRoleClient
        .from("term_report_card")
        .update({ finalized_at: null, published_at: null })
        .eq("term_id", termId).in("student_id", ids).select("id");
      updated = (data ?? []).length;
    } else if (action === "publish") {
      const { data } = await serviceRoleClient
        .from("term_report_card")
        .update({ published_at: now })
        .eq("term_id", termId).in("student_id", ids)
        .not("finalized_at", "is", null).select("id");
      updated = (data ?? []).length;
    } else {
      const { data } = await serviceRoleClient
        .from("term_report_card")
        .update({ published_at: null })
        .eq("term_id", termId).in("student_id", ids).select("id");
      updated = (data ?? []).length;
    }
    return c.json({ ok: true, action, updated, studentCount: ids.length });
  });

  school.get("/orgs/:orgId/exam-schedule", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const termId = c.req.query("termId");
    let q = serviceRoleClient
      .from("exam_schedule")
      .select("id, class_id, subject_label, exam_date, start_time, end_time, notes, class:class_id(name), term:term_id(id, name, exam_instructions)")
      .eq("org_id", orgId)
      .order("exam_date")
      .limit(2000);
    if (termId) q = q.eq("term_id", termId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    // Sandbox carries a demo datesheet for the demo family; it never
    // belongs in the school's own view (same convention as every other
    // rollup).
    const rows = ((data ?? []) as any[]).filter((r) => r.class?.name !== "Sandbox");
    const term = rows[0]?.term ?? null;
    const byClass = new Map<string, { classId: string; className: string; papers: any[] }>();
    const dates = new Set<string>();
    for (const r of rows) {
      dates.add(r.exam_date);
      const key = r.class_id;
      const g = byClass.get(key) ?? {
        classId: r.class_id, className: r.class?.name ?? "—", papers: [],
      };
      g.papers.push({
        id: r.id,
        subjectLabel: r.subject_label,
        examDate: r.exam_date,
        startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
        endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
        notes: r.notes ?? null,
      });
      byClass.set(key, g);
    }
    // School order, not alphabetical: "Class IX" must not sort before
    // "Class V" on a sheet the office compares against their printout.
    const ROMAN: Record<string, number> = {
      I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
    };
    const rank = (name: string): number => {
      const m = /^Class\s+([IVX]+)$/i.exec(name.trim());
      if (m) return ROMAN[m[1].toUpperCase()] ?? 90;
      // Named classes (Reception, Junior, Senior, Catch Up) follow the
      // numbered ones, alphabetically among themselves.
      return 100;
    };
    return c.json({
      termId: term?.id ?? null,
      termName: term?.name ?? null,
      instructions: (term?.exam_instructions ?? []) as string[],
      dates: Array.from(dates).sort(),
      classes: Array.from(byClass.values()).sort(
        (a, b) => rank(a.className) - rank(b.className) || a.className.localeCompare(b.className),
      ),
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Datesheet authoring. Until this existed the only way to publish a
  // datesheet was a seed script with the service-role key — fine for one
  // pilot, useless for the next school. Every school's office can now
  // build and correct its own from Academics → Assessment.
  //
  //   POST   /orgs/:orgId/exam-schedule            one paper, or {papers:[…]}
  //   PATCH  /orgs/:orgId/exam-schedule/:paperId
  //   DELETE /orgs/:orgId/exam-schedule/:paperId
  //   PUT    /orgs/:orgId/terms/:termId/exam-instructions
  //
  // Writes are admin/principal only: a datesheet is a school-wide notice
  // that parents act on, not a per-teacher record.
  // ───────────────────────────────────────────────────────────────────────
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  school.post("/orgs/:orgId/exam-schedule", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }

    const input: any[] = Array.isArray(body?.papers) ? body.papers : [body];
    if (input.length === 0) return c.json({ error: "no papers given" }, 400);
    if (input.length > 500) return c.json({ error: "too many papers in one request" }, 400);

    const rows: any[] = [];
    for (const p of input) {
      const label = String(p?.subjectLabel ?? "").trim();
      if (!p?.termId || !p?.classId || !p?.examDate || !label) {
        return c.json({ error: "termId, classId, examDate and subjectLabel are required" }, 400);
      }
      if (!ISO_DATE.test(String(p.examDate))) {
        return c.json({ error: "examDate must be YYYY-MM-DD" }, 400);
      }
      for (const [k, v] of [["startTime", p.startTime], ["endTime", p.endTime]] as const) {
        if (v && !HHMM.test(String(v))) return c.json({ error: `${k} must be HH:MM` }, 400);
      }
      rows.push({
        org_id: orgId,
        term_id: p.termId,
        class_id: p.classId,
        class_subject_id: p.classSubjectId ?? null,
        subject_label: label,
        exam_date: p.examDate,
        start_time: p.startTime || null,
        end_time: p.endTime || null,
        notes: String(p.notes ?? "").trim() || null,
        created_by: userId,
      });
    }

    // Every class and term named must belong to THIS org — otherwise a
    // principal could write a paper onto another school's calendar.
    const classIds = Array.from(new Set(rows.map((r) => r.class_id)));
    const { data: okClasses } = await serviceRoleClient
      .from("class").select("id").eq("org_id", orgId).in("id", classIds);
    if ((okClasses ?? []).length !== classIds.length) {
      return c.json({ error: "class not found in this org" }, 404);
    }
    const termIds = Array.from(new Set(rows.map((r) => r.term_id)));
    const { data: okTerms } = await serviceRoleClient
      .from("academic_term").select("id").eq("org_id", orgId).in("id", termIds);
    if ((okTerms ?? []).length !== termIds.length) {
      return c.json({ error: "term not found in this org" }, 404);
    }

    const { data, error } = await serviceRoleClient
      .from("exam_schedule").insert(rows).select("id");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, created: (data ?? []).length, ids: (data ?? []).map((r: any) => r.id) });
  });

  school.patch("/orgs/:orgId/exam-schedule/:paperId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const paperId = c.req.param("paperId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }

    const patch: any = {};
    if (body.subjectLabel !== undefined) {
      const label = String(body.subjectLabel).trim();
      if (!label) return c.json({ error: "subjectLabel cannot be empty" }, 400);
      patch.subject_label = label;
    }
    if (body.examDate !== undefined) {
      if (!ISO_DATE.test(String(body.examDate))) return c.json({ error: "examDate must be YYYY-MM-DD" }, 400);
      patch.exam_date = body.examDate;
    }
    for (const [key, col] of [["startTime", "start_time"], ["endTime", "end_time"]] as const) {
      if (body[key] !== undefined) {
        if (body[key] && !HHMM.test(String(body[key]))) return c.json({ error: `${key} must be HH:MM` }, 400);
        patch[col] = body[key] || null;
      }
    }
    if (body.notes !== undefined) patch.notes = String(body.notes ?? "").trim() || null;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    patch.updated_at = new Date().toISOString();

    const { data, error } = await serviceRoleClient
      .from("exam_schedule").update(patch)
      .eq("id", paperId).eq("org_id", orgId).select("id").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "paper not found" }, 404);
    return c.json({ ok: true });
  });

  school.delete("/orgs/:orgId/exam-schedule/:paperId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const paperId = c.req.param("paperId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data, error } = await serviceRoleClient
      .from("exam_schedule").delete()
      .eq("id", paperId).eq("org_id", orgId).select("id").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "paper not found" }, 404);
    return c.json({ ok: true });
  });

  school.put("/orgs/:orgId/terms/:termId/exam-instructions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.instructions)) {
      return c.json({ error: "instructions must be an array of lines" }, 400);
    }
    const lines = body.instructions
      .map((l: unknown) => String(l ?? "").trim())
      .filter((l: string) => l.length > 0)
      .slice(0, 20);

    const { data, error } = await serviceRoleClient
      .from("academic_term").update({ exam_instructions: lines })
      .eq("id", termId).eq("org_id", orgId).select("id").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "term not found" }, 404);
    return c.json({ ok: true, instructions: lines });
  });

  // ── Marks deadline + results day (23 Sep) ──────────────────────────
  // GET /orgs/:orgId/terms/:termId/schedule
  // The standalone "Deadlines & results day" page (24 Sep: "should it
  // be part of the settings page") reads one term's whole clock here -
  // school-wide moments + every class difference - without needing a
  // section's tabulation.
  school.get("/orgs/:orgId/terms/:termId/schedule", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data: term } = await serviceRoleClient
      .from("academic_term")
      .select("org_id, marks_deadline_at, results_publish_at, remarks_deadline_at")
      .eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) return c.json({ error: "term not found" }, 404);
    const { data: ovRows } = await serviceRoleClient
      .from("term_class_schedule")
      .select("class_id, marks_deadline_at, marks_deadline_off, results_publish_at, class:class_id(name)")
      .eq("term_id", termId).eq("org_id", orgId);
    return c.json({
      schedule: {
        marksDeadlineAt: (term as any).marks_deadline_at ?? null,
        resultsPublishAt: (term as any).results_publish_at ?? null,
        remarksDeadlineAt: (term as any).remarks_deadline_at ?? null,
        overrides: ((ovRows ?? []) as any[]).map((o) => ({
          classId: o.class_id,
          className: o.class?.name ?? "",
          marksDeadlineAt: o.marks_deadline_at ?? null,
          marksDeadlineOff: !!o.marks_deadline_off,
          resultsPublishAt: o.results_publish_at ?? null,
        })),
      },
    });
  });

  // PATCH /orgs/:orgId/terms/:termId/schedule
  //   { marksDeadlineAt?: iso|null, resultsPublishAt?: iso|null }
  // Setting a new marksDeadlineAt IS the extension. Admin only.
  school.patch("/orgs/:orgId/terms/:termId/schedule", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: term } = await serviceRoleClient
      .from("academic_term").select("org_id").eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) return c.json({ error: "term not found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    const iso = (v: unknown): string | null | undefined => {
      if (v === null) return null;
      if (typeof v !== "string") return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    };
    if ("marksDeadlineAt" in body) {
      const v = iso(body.marksDeadlineAt);
      if (v === undefined && body.marksDeadlineAt !== null) return c.json({ error: "marksDeadlineAt invalid" }, 400);
      patch.marks_deadline_at = v ?? null;
    }
    if ("resultsPublishAt" in body) {
      const v = iso(body.resultsPublishAt);
      if (v === undefined && body.resultsPublishAt !== null) return c.json({ error: "resultsPublishAt invalid" }, 400);
      patch.results_publish_at = v ?? null;
    }
    // When class teachers stop writing remarks, leaving the office a
    // quiet window to finalize and print (27 Sep). Deliberately its own
    // moment, not the marks deadline: remarks are written after the
    // marks are in.
    if ("remarksDeadlineAt" in body) {
      const v = iso(body.remarksDeadlineAt);
      if (v === undefined && body.remarksDeadlineAt !== null) return c.json({ error: "remarksDeadlineAt invalid" }, 400);
      patch.remarks_deadline_at = v ?? null;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("academic_term").update(patch).eq("id", termId).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ term: termToJson(data) });
  });

  // PUT /orgs/:orgId/terms/:termId/class-schedule/:classId
  //   { marksDeadlineAt?: iso|null, marksDeadlineOff?: bool, resultsPublishAt?: iso|null }
  // One class's own clock: its own deadline, an exemption, or its own
  // results day (24 Sep). Upserts; all-null/off rows are removed via
  // DELETE. Admin only.
  school.put("/orgs/:orgId/terms/:termId/class-schedule/:classId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    const classId = c.req.param("classId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const [{ data: term }, { data: klass }] = await Promise.all([
      serviceRoleClient.from("academic_term").select("org_id").eq("id", termId).maybeSingle(),
      serviceRoleClient.from("class").select("org_id").eq("id", classId).maybeSingle(),
    ]);
    if (!term || (term as any).org_id !== orgId) return c.json({ error: "term not found" }, 404);
    if (!klass || (klass as any).org_id !== orgId) return c.json({ error: "class not found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    const iso = (v: unknown): string | null | undefined => {
      if (v === null || v === undefined) return null;
      if (typeof v !== "string") return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    };
    const dl = iso(body.marksDeadlineAt);
    const rp = iso(body.resultsPublishAt);
    if (dl === undefined || rp === undefined) return c.json({ error: "invalid datetime" }, 400);
    const { error } = await serviceRoleClient
      .from("term_class_schedule")
      .upsert({
        org_id: orgId, term_id: termId, class_id: classId,
        marks_deadline_at: dl, marks_deadline_off: body.marksDeadlineOff === true,
        results_publish_at: rp,
      }, { onConflict: "term_id,class_id" });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  school.delete("/orgs/:orgId/terms/:termId/class-schedule/:classId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("term_class_schedule")
      .delete().eq("term_id", c.req.param("termId"))
      .eq("class_id", c.req.param("classId")).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // Exceptions: one teacher, until one moment. Admin only.
  school.get("/orgs/:orgId/terms/:termId/marks-exceptions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data } = await serviceRoleClient
      .from("marks_deadline_exception")
      .select("id, user_id, until_at, note, created_at")
      .eq("org_id", orgId).eq("term_id", c.req.param("termId"))
      .order("until_at", { ascending: false });
    const names = await hydrateTeacherNamesAssess(((data ?? []) as any[]).map((r) => r.user_id));
    return c.json({
      exceptions: ((data ?? []) as any[]).map((r) => ({
        id: r.id, userId: r.user_id,
        userName: names.get(r.user_id) ?? null,
        untilAt: r.until_at, note: r.note ?? null, createdAt: r.created_at,
      })),
    });
  });

  school.post("/orgs/:orgId/terms/:termId/marks-exceptions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const target = String(body.userId ?? "");
    const until = new Date(String(body.untilAt ?? ""));
    if (!target || Number.isNaN(until.getTime())) {
      return c.json({ error: "userId and a valid untilAt are required" }, 400);
    }
    const { data, error } = await serviceRoleClient
      .from("marks_deadline_exception")
      .insert({
        org_id: orgId, term_id: termId, user_id: target,
        until_at: until.toISOString(),
        note: body.note ? String(body.note).slice(0, 300) : null,
        granted_by: userId,
      }).select("id").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, id: (data as any).id }, 201);
  });

  school.delete("/orgs/:orgId/marks-exceptions/:exceptionId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("marks_deadline_exception")
      .delete().eq("id", c.req.param("exceptionId")).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  school.get("/orgs/:orgId/terms/:termId/exams", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("exam")
      .select("*")
      .eq("term_id", termId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("exam_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);

    // ?sectionId= scopes the list to exams this SECTION actually sits.
    // Exams are org-wide rows, and Class II's homework page offered
    // "ششماہی امتحان — Half-yearly (Hifz) — enter marks" (Ambreen,
    // 23 Sep). A COMPONENT exam (it has exam_component rows - its own
    // paper slip, like the Hifz half-yearly) belongs to a section when:
    //   - the section's CLASS KIND is "hifz" - the audience these slips
    //     are built for, and a school-settable attribute; or
    //   - any of its students is actually in it (a per-child syllabus
    //     row or a component score) - which is how another school's
    //     component exam for an academic class gets its tile.
    // Ordinary oral/written exams stay for everyone.
    const sectionId = c.req.query("sectionId");
    let exams = (data ?? []) as any[];
    if (sectionId && exams.length) {
      const examIds = exams.map((e) => e.id);
      const { data: comps } = await serviceRoleClient
        .from("exam_component").select("exam_id").in("exam_id", examIds);
      const componentExamIds = [...new Set(((comps ?? []) as any[]).map((r) => r.exam_id))];
      if (componentExamIds.length) {
        const { data: secRow } = await serviceRoleClient
          .from("class_section").select("class:class_id(kind)")
          .eq("id", sectionId).maybeSingle();
        const isHifzKind = (secRow as any)?.class?.kind === "hifz";
        if (!isHifzKind) {
          const { data: students } = await serviceRoleClient
            .from("student").select("id")
            .eq("class_section_id", sectionId).eq("status", "active");
          const stuIds = ((students ?? []) as any[]).map((s) => s.id);
          const inIt = new Set<string>();
          if (stuIds.length) {
            const [{ data: syl }, { data: sc }] = await Promise.all([
              serviceRoleClient.from("student_exam_syllabus")
                .select("exam_id").in("exam_id", componentExamIds).in("student_id", stuIds),
              serviceRoleClient.from("exam_component_score")
                .select("exam_id").in("exam_id", componentExamIds).in("student_id", stuIds),
            ]);
            for (const r of ((syl ?? []) as any[])) inIt.add(r.exam_id);
            for (const r of ((sc ?? []) as any[])) inIt.add(r.exam_id);
          }
          exams = exams.filter((e) => !componentExamIds.includes(e.id) || inIt.has(e.id));
        }
      }
    }
    return c.json({ exams: exams.map(examToJson) });
  });

  school.post("/orgs/:orgId/terms/:termId/exams", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const termId = c.req.param("termId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: term } = await serviceRoleClient
      .from("academic_term").select("org_id").eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) {
      return c.json({ error: "term not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const examType = ["midterm","final","test","quiz","other"].includes(body.examType)
      ? body.examType : "midterm";
    const weight = Number(body.weight ?? 1);
    const examDate = body.examDate || null;
    if (!name) return c.json({ error: "name required" }, 400);
    if (!Number.isFinite(weight) || weight <= 0) {
      return c.json({ error: "weight must be > 0" }, 400);
    }
    const { data, error } = await serviceRoleClient
      .from("exam")
      .insert({
        org_id: orgId, term_id: termId,
        name, exam_type: examType, weight, exam_date: examDate,
      })
      .select("*").single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "exam with that name already exists in this term" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ exam: examToJson(data) }, 201);
  });

  school.patch("/orgs/:orgId/exams/:examId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("exam").select("org_id").eq("id", examId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "exam not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if ("name" in body) patch.name = String(body.name).trim();
    if ("nameEn" in body) {
      patch.name_en = body.nameEn === null || String(body.nameEn).trim() === ""
        ? null : String(body.nameEn).trim();
    }
    if ("examType" in body && ["midterm","final","test","quiz","other"].includes(body.examType)) {
      patch.exam_type = body.examType;
    }
    if ("weight" in body) {
      const w = Number(body.weight);
      if (!Number.isFinite(w) || w <= 0) return c.json({ error: "weight invalid" }, 400);
      patch.weight = w;
    }
    if ("examDate" in body) patch.exam_date = body.examDate ?? null;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("exam").update(patch).eq("id", examId).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ exam: examToJson(data) });
  });

  school.delete("/orgs/:orgId/exams/:examId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("exam")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", examId).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Exam marks progress ────────────────────────────────────────────
  // How far a section's marks entry has come for each current-term exam:
  // a student counts as marked once they have ANY score row (a mark or
  // an absence) in that exam. Drives the Today-panel "Enter exam marks"
  // links, which stay up until every student is marked (Muneeb, 11 Sep:
  // "until they enter those marks", not a fixed number of days).
  school.get("/orgs/:orgId/sections/:sectionId/exam-marks-progress", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: term } = await serviceRoleClient
      .from("academic_term")
      .select("id, name")
      .eq("org_id", orgId).eq("is_current", true)
      .is("archived_at", null)
      .maybeSingle();
    if (!term) return c.json({ termName: null, exams: [] });

    // Same exams, same subjects, same counting as the Marking progress
    // board (markingProgress.ts), so the section page and the principal's
    // grid never disagree. Before 18 Sep this counted EVERY class subject,
    // so Art & Craft and Robotics (no paper) and Class VIII's written-only
    // subjects (no oral) held the count below complete forever. It also
    // counted withdrawn children, whose empty columns never fill.
    const exams = await gradebookExams((term as any).id);
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id")
      .eq("class_section_id", sectionId)
      .eq("status", "active");
    const studentIds = ((students ?? []) as any[]).map((s) => s.id);

    const { data: secRow } = await serviceRoleClient
      .from("class_section")
      .select("class_id")
      .eq("id", sectionId).maybeSingle();
    const { data: subjects } = await serviceRoleClient
      .from("class_subject")
      .select("id, name, assessment_weights, elective_group")
      .eq("class_id", (secRow as any)?.class_id ?? "")
      .is("archived_at", null);
    const subjectList = ((subjects ?? []) as any[]).map((s) => ({
      id: s.id, name: s.name, weights: s.assessment_weights,
    }));
    const progSits = await loadSitsResolver((subjects ?? []) as any[], studentIds);

    let scores: Awaited<ReturnType<typeof loadExamScores>> = [];
    try {
      scores = await loadExamScores(exams.map((e) => e.id), studentIds);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
    const cells = progressForSection(subjectList, exams, studentIds, scores, progSits.sits);

    // Kept for the existing link text: how many children have ANY mark.
    const markedByExam = new Map<string, Set<string>>();
    for (const sc of scores) {
      if (sc.obtained_marks === null && sc.absent !== true) continue;
      const set = markedByExam.get(sc.exam_id) ?? new Set<string>();
      markedByExam.set(sc.exam_id, set);
      set.add(sc.student_id);
    }

    return c.json({
      termName: (term as any).name,
      exams: exams.map((e, i) => ({
        id: e.id,
        name: e.name,
        studentsMarked: markedByExam.get(e.id)?.size ?? 0,
        studentCount: studentIds.length,
        subjectsDone: cells[i].subjectsDone,
        subjectCount: cells[i].subjectCount,
      })),
    });
  });

  // ─── My exam-marks to-do (teacher subject cards) ────────────────────
  // The calling teacher's OWN incomplete exam columns: for every
  // section_subject they teach, every current-term exam whose window
  // has opened (exam_date <= today+3, school tz) and whose column
  // still misses students. Powers the nudge on TeacherHome's subject
  // cards — scoped to exactly what this teacher teaches, nothing else.
  school.get("/orgs/:orgId/me/exam-marks-todo", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    // The term being MARKED, not merely the current one: marking runs
    // past a term boundary and the nudges used to vanish with it
    // (21 Sep).
    const term = await resolveMarkingTerm(orgId);
    if (!term) return c.json({ todos: [] });

    const tz = await orgTimezone(orgId);
    const windowEdge = todayInOrgTz(tz, new Date(Date.now() + 3 * 86400000));
    const { data: exams } = await serviceRoleClient
      .from("exam")
      .select("id, name, name_en, exam_date")
      .eq("term_id", (term as any).id)
      .is("archived_at", null)
      .lte("exam_date", windowEdge)
      .order("exam_date", { ascending: true });
    if (!exams?.length) return c.json({ todos: [] });

    const { data: taught } = await serviceRoleClient
      .from("section_subject")
      .select("id, class_section_id, class_subject_id, class_subject:class_subject_id(name, archived_at, class:class_id(org_id))")
      .eq("teacher_user_id", userId)
      .is("archived_at", null);
    // Archived subjects keep their section_subject rows — never nag for
    // a column the marks sheet no longer shows.
    const mine = ((taught ?? []) as any[]).filter(
      (r) => r.class_subject?.class?.org_id === orgId && !r.class_subject?.archived_at,
    );
    if (!mine.length) return c.json({ todos: [] });

    const sectionIds = [...new Set(mine.map((r) => r.class_section_id))];
    // Left students must not keep a column forever "incomplete".
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, class_section_id")
      .eq("status", "active")
      .in("class_section_id", sectionIds);
    // Names so the home page can say "Sindhi - Class IV A" without a
    // second round-trip.
    const { data: secRows } = await serviceRoleClient
      .from("class_section")
      .select("id, name, class:class_id(name)")
      .in("id", sectionIds);
    const secName = new Map<string, string>(
      ((secRows ?? []) as any[]).map((r) => [r.id, `${r.class?.name ?? ""} ${r.name ?? ""}`.trim()]),
    );
    const { data: subjWeights } = await serviceRoleClient
      .from("class_subject")
      .select("id, assessment_weights, elective_group")
      .in("id", [...new Set(mine.map((r) => r.class_subject_id))]);
    const weightsById = new Map<string, any>(
      ((subjWeights ?? []) as any[]).map((r) => [r.id, r.assessment_weights]),
    );
    // Streams: a Biology column belongs to the biology children only -
    // the teacher's count reads 5 of 5, never 5 of 25 (23 Sep).
    const todoSits = await loadSitsResolver(
      (subjWeights ?? []) as any[],
      ((students ?? []) as any[]).map((s) => s.id),
    );
    const bySection = new Map<string, string[]>();
    for (const s of ((students ?? []) as any[])) {
      const arr = bySection.get(s.class_section_id) ?? [];
      arr.push(s.id);
      bySection.set(s.class_section_id, arr);
    }

    const subjectIds = [...new Set(mine.map((r) => r.class_subject_id))];
    const { data: scores } = await serviceRoleClient
      .from("exam_subject_score")
      .select("exam_id, student_id, class_subject_id, obtained_marks, absent")
      .in("exam_id", (exams as any[]).map((e) => e.id))
      .in("class_subject_id", subjectIds);
    const marked = new Map<string, Set<string>>(); // examId|subjectId -> student ids
    // Absences counted apart, so a teacher reviewing the column can see
    // "26 marked, 2 absent" rather than one undifferentiated number.
    const absentees = new Map<string, Set<string>>();
    for (const sc of ((scores ?? []) as any[])) {
      if (sc.obtained_marks === null && sc.absent !== true) continue;
      const key = `${sc.exam_id}|${sc.class_subject_id}`;
      let set = marked.get(key);
      if (!set) { set = new Set(); marked.set(key, set); }
      set.add(sc.student_id);
      if (sc.absent === true) {
        let abs = absentees.get(key);
        if (!abs) { abs = new Set(); absentees.set(key, abs); }
        abs.add(sc.student_id);
      }
    }

    const todos: any[] = [];
    // EVERY column this teacher owns, finished ones included. The nudge
    // lists below drop a column the moment it is done, which left a
    // teacher with no way back to check or correct it - the only
    // doorway into a marks sheet was a nudge that had disappeared
    // (teachers, 22 Sep). "My marks" reads this.
    const columns: any[] = [];
    // "My column is complete but unsigned" - the green-check nudge
    // (Muneeb, 12 Sep). Confirmation maps are per (term, section).
    const signOffs: any[] = [];
    const confBySection = new Map<string, Record<string, any>>();
    for (const sid of sectionIds) {
      confBySection.set(sid, await readConfirmations((term as any).id, sid));
    }
    for (const row of mine) {
      const stuIds = (bySection.get(row.class_section_id) ?? [])
        .filter((id) => todoSits.sits(id, row.class_subject_id));
      if (stuIds.length === 0) continue;
      const w = weightsById.get(row.class_subject_id);
      if (Array.isArray(w) && w.length === 0) continue; // not examined
      let applicable = 0, complete = 0;
      let lastExamId: string | null = null;
      for (const e of (exams as any[])) {
        // A paper the subject does not sit must never nag - Nazra has
        // no written paper, Science IV-V no oral.
        if (!subjectSitsExam(w, e.name)) continue;
        applicable += 1;
        lastExamId = e.id;
        const key = `${e.id}|${row.class_subject_id}`;
        const done = stuIds.filter((id) => marked.get(key)?.has(id)).length;
        const absentCount = stuIds.filter((id) => absentees.get(key)?.has(id)).length;
        const signed = confBySection.get(row.class_section_id)?.[row.class_subject_id] ?? null;
        columns.push({
          examId: e.id,
          examName: e.name,
          examNameEn: e.name_en ?? null,
          examDate: e.exam_date,
          termId: (term as any).id,
          classSectionId: row.class_section_id,
          sectionLabel: secName.get(row.class_section_id) ?? "",
          classSubjectId: row.class_subject_id,
          subjectName: row.class_subject?.name ?? "",
          marked: done,
          absent: absentCount,
          studentCount: stuIds.length,
          signedOff: signed ? { byName: signed.byName ?? "", at: signed.at ?? null } : null,
        });
        if (done >= stuIds.length) { complete += 1; continue; }
        todos.push({
          examId: e.id,
          examName: e.name,
          classSectionId: row.class_section_id,
          sectionLabel: secName.get(row.class_section_id) ?? "",
          classSubjectId: row.class_subject_id,
          subjectName: row.class_subject?.name ?? "",
          marked: done,
          studentCount: stuIds.length,
        });
      }
      if (applicable > 0 && complete === applicable &&
          !confBySection.get(row.class_section_id)?.[row.class_subject_id]) {
        signOffs.push({
          termId: (term as any).id,
          examId: lastExamId,
          classSectionId: row.class_section_id,
          sectionLabel: secName.get(row.class_section_id) ?? "",
          classSubjectId: row.class_subject_id,
          subjectName: row.class_subject?.name ?? "",
        });
      }
    }
    // Newest paper first, then class, so "My marks" opens on the work
    // most likely still in hand.
    columns.sort((a, b) =>
      String(b.examDate ?? "").localeCompare(String(a.examDate ?? "")) ||
      a.sectionLabel.localeCompare(b.sectionLabel) ||
      a.subjectName.localeCompare(b.subjectName));
    return c.json({ todos, signOffs, columns, term: { id: term.id, name: (term as any).name ?? null } });
  });

  // ─── Marks sheet ────────────────────────────────────────────────────
  // Returns a section's gradebook-shaped sheet for one exam: students
  // (rows) × class_subjects (columns) with the current score per cell.
  school.get("/orgs/:orgId/exams/:examId/marks-sheet", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    const sectionId = c.req.query("sectionId") ?? "";
    if (!sectionId) return c.json({ error: "sectionId required" }, 400);
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: section } = await serviceRoleClient
      .from("class_section")
      .select("id, name, class:class_id(id, name, org_id)")
      .eq("id", sectionId)
      .maybeSingle();
    if (!section || (section as any).class?.org_id !== orgId) {
      return c.json({ error: "section not in this org" }, 404);
    }
    const classId = (section as any).class.id;

    // Subjects for this class. NB: class_subject's order column is
    // `sort_order`, not `display_order` — selecting / ordering by a
    // non-existent column makes the Supabase JS client return null
    // with an error, which we then silently coerce to [] downstream.
    const { data: subjects } = await serviceRoleClient
      .from("class_subject")
      .select("id, name, sort_order, assessment_weights, elective_group")
      .eq("class_id", classId)
      .order("sort_order", { ascending: true });

    // Subject teachers get ONLY their own columns — fewer mistakes, no
    // peeking at colleagues' marks. Admin/class teacher see everything.
    const editable = await editableSubjects(userId, orgId, sectionId);
    // An incharge oversees the wing: they READ every column, so they can
    // check what each teacher has entered — which is the whole reason they
    // open this sheet (18 Sep: "you don't teach a subject in this section",
    // shown to Class I's own incharge). Viewing only. Saving still goes
    // through editableSubjects, so an incharge edits only a subject they
    // actually teach — the POST below is unchanged.
    const oversees = editable !== null &&
      await isInchargeOfClass(userId, orgId, classId);
    if (editable !== null && editable.size === 0 && !oversees) {
      return c.json({ error: "you don't teach a subject in this section" }, 403);
    }
    const visibleSubjects = editable === null || oversees
      ? ((subjects ?? []) as any[])
      : ((subjects ?? []) as any[]).filter((s) => editable.has(s.id));

    // Students in this section. The student table has no roll_number
    // column in this codebase (the original 0007 migration never added
    // it); ordering by it silently emptied the array. Sort by name only.
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number")
      .eq("class_section_id", sectionId)
      .order("full_name", { ascending: true });

    const studentIds = ((students ?? []) as any[]).map((s) => s.id);
    const subjectIds = visibleSubjects.map((s) => s.id);

    // Streams: a Biology column holds only the children who TAKE
    // Biology. The sheet still lists the whole section, but a cell in
    // the other stream's column is not theirs to mark - stamping those
    // children "absent" is what unranked all of Class IX (23 Sep).
    const sheetSits = await loadSitsResolver((subjects ?? []) as any[], studentIds);

    const { data: scores } = studentIds.length && subjectIds.length
      ? await serviceRoleClient
          .from("exam_subject_score")
          .select("*")
          .eq("exam_id", examId)
          .in("student_id", studentIds)
          .in("class_subject_id", subjectIds)
      : { data: [] as any[] };
    const scoreMap = new Map<string, any>();
    for (const s of (scores ?? []) as any[]) {
      scoreMap.set(`${s.student_id}:${s.class_subject_id}`, s);
    }

    // The sheet needs to know WHICH paper it is: the marks distribution
    // stores a per-paper total ("English oral 15, written 60"), and the
    // client uses it as each column's max.
    const { data: examRow } = await serviceRoleClient
      .from("exam").select("id, name, name_en, exam_type, term_id").eq("id", examId).maybeSingle();
    const sheetTermId = (examRow as any)?.term_id ?? null;
    const confirmations = sheetTermId
      ? await readConfirmations(sheetTermId, sectionId)
      : {};

    return c.json({
      exam: examRow
        ? { id: (examRow as any).id, name: (examRow as any).name, nameEn: (examRow as any).name_en ?? null, examType: (examRow as any).exam_type, termId: sheetTermId }
        : null,
      // This CALLER's deadline state - their exception makes their own
      // countdown honest (23 Sep).
      marksDeadline: await marksLockFor(orgId, sheetTermId, userId, classId),
      // The school's pass line, so a mark under it reads red AS IT IS
      // TYPED rather than only on the register afterwards (22 Sep).
      passMarkPct: await orgPassMarkPct(orgId),
      // Which subject columns are signed off for this exam's TERM (the
      // sign-off covers both papers at once).
      confirmations,
      section: { id: section.id, name: (section as any).name, className: (section as any).class.name },
      subjects: visibleSubjects.map((s) => ({
        id: s.id,
        name: s.name,
        assessmentWeights: s.assessment_weights ?? null,
      })),
      editableSubjectIds: editable === null ? null : Array.from(editable),
      // True when the caller sees columns they cannot edit — an incharge
      // viewing their wing. The screen locks those columns read-only.
      oversees,
      students: ((students ?? []) as any[]).map((s) => ({
        id: s.id,
        fullName: s.full_name,
        grNumber: s.gr_number,
        rollNumber: null,  // column doesn't exist in this codebase yet
        scores: ((subjects ?? []) as any[]).map((subj) => {
          const k = `${s.id}:${subj.id}`;
          const sc = scoreMap.get(k);
          const enrolled = sheetSits.sits(s.id, subj.id);
          const base = sc ? scoreToJson(sc) : {
            id: null, examId, studentId: s.id, classSubjectId: subj.id,
            maxMarks: null, obtainedMarks: null, absent: false, notes: null,
          };
          // enrolled: false = the child takes the OTHER subject of this
          // elective group - the cell renders as not-theirs and stays
          // out of every completeness count.
          return { ...base, enrolled };
        }),
      })),
    });
  });

  // Bulk upsert. Body: { sectionId, defaults?: { maxMarks }, rows: [{studentId, classSubjectId, maxMarks, obtainedMarks, absent, notes}] }
  // Defaults.maxMarks fills in for rows where maxMarks omitted (teachers
  // typically pick "100 across the board" then edit exceptions).
  school.post("/orgs/:orgId/exams/:examId/marks-sheet", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    const body = await c.req.json().catch(() => ({}));
    const sectionId = String(body.sectionId ?? "");
    if (!sectionId) return c.json({ error: "sectionId required" }, 400);

    // Auth + per-subject enforcement in one computation: null means the
    // caller owns the whole sheet (admin/principal/class teacher), a set
    // means only those columns, empty means no marks entry here at all.
    // (Was two overlapping gates — the first one carried the 42703 bug
    // fixed in #524. One computation, one truth.)
    const editableForWrite = await editableSubjects(userId, orgId, sectionId);
    if (editableForWrite !== null && editableForWrite.size === 0) {
      return c.json({ error: "you don't teach a subject in this section" }, 403);
    }

    const { data: exam } = await serviceRoleClient
      .from("exam").select("org_id, term_id").eq("id", examId).maybeSingle();
    if (!exam || (exam as any).org_id !== orgId) {
      return c.json({ error: "exam not found" }, 404);
    }

    // A finalized term is CLOSED: its marks no longer move. The bulk
    // finalize on the tabulation sheet locks the whole section at once;
    // a per-student finalize locks that child's row the same way.
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];
    const lockIds = [...new Set(rowsIn.map((r: any) => String(r.studentId ?? "")).filter(Boolean))];
    if ((exam as any).term_id && lockIds.length) {
      const { data: locked } = await serviceRoleClient
        .from("term_report_card").select("student_id")
        .eq("term_id", (exam as any).term_id)
        .in("student_id", lockIds)
        .not("finalized_at", "is", null)
        .limit(1);
      if (locked?.length) {
        return c.json({
          error: "This term is finalized — marks are locked. Unfinalize from the tabulation sheet to make a correction.",
        }, 409);
      }
    }

    // A signed-off column is locked too (Muneeb, 14 Sep: "lock the
    // column on sign-off") — the green check now MEANS the marks no
    // longer move. Corrections are deliberate: untick the sign-off on
    // the marks sheet (subject teacher, class teacher or office), edit,
    // tick it again. Finalize remains the term-wide lock above this.
    if ((exam as any).term_id && rowsIn.length) {
      const signed = await readConfirmations((exam as any).term_id, sectionId);
      const hit = rowsIn.find((r: any) => signed[String(r.classSubjectId ?? "")]);
      if (hit) {
        const { data: subjRow } = await serviceRoleClient
          .from("class_subject").select("name")
          .eq("id", String((hit as any).classSubjectId)).maybeSingle();
        return c.json({
          error: `${(subjRow as any)?.name ?? "This column"} is signed off — its marks are locked. ` +
            `Untick the sign-off on the marks sheet to make a correction, then sign it off again.`,
        }, 409);
      }
    }

    // The admin's clock (23 Sep): past the marks deadline a teacher's
    // saves are refused - the admin extends the deadline or grants them
    // their own later moment. Admin/principal never lock. The section's
    // CLASS may hold its own deadline or an exemption (24 Sep), so the
    // class is resolved first (and reused by the stream gate below).
    const { data: secForWrite } = await serviceRoleClient
      .from("class_section").select("class_id").eq("id", sectionId).maybeSingle();
    const lock = await marksLockFor(
      orgId, (exam as any).term_id, userId, (secForWrite as any)?.class_id ?? null);
    if (lock.locked) {
      const when = new Date(lock.effectiveAt!).toLocaleString("en-GB", { timeZone: "Asia/Karachi", hour12: true });
      return c.json({
        error: `Marks entry closed at ${when} (Pakistan time). Ask the office to extend the deadline or grant you access.`,
        code: "MARKS_DEADLINE_PASSED",
      }, 403);
    }

    const defaultsMax = body.defaults?.maxMarks ? Number(body.defaults.maxMarks) : null;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return c.json({ ok: true, written: 0 });

    // Streams: a mark - or an absent stamp - may only land on a child
    // who TAKES the subject. The Biology teacher stamping her computer
    // students "absent" is exactly what this refuses (23 Sep).
    const { data: subsForWrite } = await serviceRoleClient
      .from("class_subject").select("id, name, elective_group")
      .eq("class_id", (secForWrite as any)?.class_id ?? "");
    const writeSits = await loadSitsResolver(
      (subsForWrite ?? []) as any[],
      [...new Set(rows.map((r: any) => String(r.studentId ?? "")).filter(Boolean))],
    );
    for (const r of rows) {
      const stuId = String(r.studentId ?? "");
      const subId = String(r.classSubjectId ?? "");
      if (!stuId || !subId) continue;
      const holdsSomething = r.absent === true || (r.obtainedMarks !== null && r.obtainedMarks !== undefined && r.obtainedMarks !== "");
      if (holdsSomething && !writeSits.sits(stuId, subId)) {
        const subjName = ((subsForWrite ?? []) as any[]).find((s) => s.id === subId)?.name ?? "this subject";
        return c.json({
          error: `That student does not take ${subjName} - they are in the other stream. ` +
            `If the choice is wrong, change it under the class's subjects first.`,
        }, 400);
      }
    }

    // Build inserts. Skip rows with no obtained_marks AND not-absent AND
    // no maxMarks/notes — they're empty cells, no point creating a row.
    const toUpsert: any[] = [];
    const toDelete: { student_id: string; class_subject_id: string }[] = [];
    for (const r of rows) {
      const studentId = String(r.studentId ?? "");
      const subjectId = String(r.classSubjectId ?? "");
      if (!studentId || !subjectId) continue;
      if (editableForWrite !== null && !editableForWrite.has(subjectId)) {
        return c.json({ error: "you can only enter marks for your own subject" }, 403);
      }
      const absent = r.absent === true;
      const obtained = r.obtainedMarks === null || r.obtainedMarks === undefined || r.obtainedMarks === ""
        ? null : Number(r.obtainedMarks);
      const rawMax = r.maxMarks === null || r.maxMarks === undefined || r.maxMarks === ""
        ? null : Number(r.maxMarks);
      const notes = r.notes ? String(r.notes).slice(0, 500) : null;

      // Truly empty cell — clear any existing score row. Decided BEFORE
      // defaults apply: stamping defaults.maxMarks onto cells that hold
      // nothing is what froze old sheet defaults into every empty cell
      // and buried the school's marks distribution when it arrived later
      // (Ambreen's "why is there two boxes", 11 Sep).
      if (!absent && obtained === null && !notes && rawMax === null) {
        toDelete.push({ student_id: studentId, class_subject_id: subjectId });
        continue;
      }
      const maxMarks = rawMax === null ? defaultsMax : rawMax;
      if (maxMarks === null || !Number.isFinite(maxMarks) || maxMarks <= 0) {
        return c.json({
          error: `maxMarks required for student ${studentId} / subject ${subjectId}`,
        }, 400);
      }
      if (!absent && obtained !== null && (!Number.isFinite(obtained) || obtained < 0)) {
        return c.json({ error: "obtainedMarks invalid" }, 400);
      }
      if (!absent && obtained !== null && obtained > maxMarks) {
        return c.json({
          error: `obtainedMarks (${obtained}) exceeds maxMarks (${maxMarks}) for student ${studentId}`,
        }, 400);
      }
      toUpsert.push({
        org_id: orgId,
        exam_id: examId,
        student_id: studentId,
        class_subject_id: subjectId,
        max_marks: maxMarks,
        obtained_marks: absent ? null : obtained,
        absent,
        notes,
        recorded_by: userId,
      });
    }

    if (toDelete.length > 0) {
      for (const d of toDelete) {
        await serviceRoleClient
          .from("exam_subject_score")
          .delete()
          .eq("exam_id", examId)
          .eq("student_id", d.student_id)
          .eq("class_subject_id", d.class_subject_id);
      }
    }

    if (toUpsert.length > 0) {
      const { error } = await serviceRoleClient
        .from("exam_subject_score")
        .upsert(toUpsert, { onConflict: "exam_id,student_id,class_subject_id" });
      if (error) return c.json({ error: error.message }, 500);
    }
    return c.json({ ok: true, written: toUpsert.length, deleted: toDelete.length });
  });
}

export default installAssessment;
