// =============================================================================
// Marking progress — every section's marks entry on one screen.
//
// "For the admin or the incharge and the principal, if they want to see how
// the marking progress is going, as there's papers going on" (Muneeb,
// 18 Sep). Until now the only way was to open each section in turn.
//
//   GET /orgs/:orgId/marking-progress?termId=   the whole grid
//
// Admin and principal see the whole school; an incharge sees only their
// own wing's classes. Hifz is left out — it is marked on its own paper
// (Exam marks), not the subject gradebook — and so is the Sandbox.
//
// The counting itself is markingProgress.ts, shared with the section page
// so the two can never disagree.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAdminOrPrincipal, inchargeClassIds } from "./schoolAuth.ts";
import { buildSitsResolver } from "./subjectStreams.ts";
import {
  progressForSection, subjectIsExamined, paperOfExam, classOrder, termBeingMarked,
  type ProgressScore,
} from "./markingProgress.ts";

/** Every score row for these exams and students, PAGED. An unpaged select
 *  stops silently at 1000 rows; across a school this is several thousand,
 *  and the board would show half-finished columns as empty (#620 class). */
export async function loadExamScores(
  examIds: string[],
  studentIds: string[],
): Promise<ProgressScore[]> {
  const out: ProgressScore[] = [];
  if (!examIds.length || !studentIds.length) return out;
  const PAGE = 1000;
  // Chunk the student list too: an .in() with hundreds of ids makes a URL
  // long enough for the gateway to refuse.
  for (let i = 0; i < studentIds.length; i += 150) {
    const chunk = studentIds.slice(i, i + 150);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await serviceRoleClient
        .from("exam_subject_score")
        .select("exam_id, student_id, class_subject_id, obtained_marks, absent")
        .in("exam_id", examIds)
        .in("student_id", chunk)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ProgressScore[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

/** The subject-gradebook exams of a term. Exams that carry their own paper
 *  (exam_component — the Hifz half-yearly) are marked elsewhere, and their
 *  names name no oral/written paper, so every subject would appear to sit
 *  them: left off this board deliberately. */
export async function gradebookExams(termId: string) {
  const { data: exams } = await serviceRoleClient
    .from("exam").select("id, name, exam_date")
    .eq("term_id", termId).is("archived_at", null)
    .order("exam_date", { ascending: true });
  const list = (exams ?? []) as Array<{ id: string; name: string; exam_date: string | null }>;
  if (!list.length) return list;
  const { data: comps } = await serviceRoleClient
    .from("exam_component").select("exam_id")
    .in("exam_id", list.map((e) => e.id)).is("archived_at", null);
  const ownPaper = new Set(((comps ?? []) as any[]).map((c) => c.exam_id));
  return list.filter((e) => !ownPaper.has(e.id));
}

/** The term whose papers are being marked - what every marking surface
 *  should default to. The rule is termBeingMarked(); this just feeds it
 *  the school's terms and which of them have gradebook papers.
 *  Shared by the board, the teachers' marks nudges and the office
 *  sign-off alert, so the three can never disagree again (21 Sep). */
export async function resolveMarkingTerm(orgId: string): Promise<
  { id: string; name: string } | null
> {
  const { data: terms } = await serviceRoleClient
    .from("academic_term").select("id, name, start_date, is_current")
    .eq("org_id", orgId).is("archived_at", null)
    .order("start_date", { ascending: true });
  const list = (terms ?? []) as any[];
  if (!list.length) return null;
  const withExams = new Set<string>();
  for (const t of list) {
    const exams = await gradebookExams(t.id);
    if (exams.length) withExams.add(t.id);
  }
  const picked = termBeingMarked(
    list.map((t) => ({ id: t.id, startDate: t.start_date, isCurrent: !!t.is_current })),
    withExams,
  );
  if (!picked) return null;
  const row = list.find((t) => t.id === picked.id)!;
  return { id: row.id, name: row.name };
}
export function installMarkingProgress(school: Hono): void {
  school.get("/orgs/:orgId/marking-progress", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    // Who sees what: the office sees every section; an incharge their own
    // wing. Nobody else — a teacher's own progress lives on their section.
    const isOffice = await hasAdminOrPrincipal(userId, orgId);
    let wingClassIds: string[] | null = null;
    if (!isOffice) {
      wingClassIds = await inchargeClassIds(userId, orgId);
      if (!wingClassIds.length) {
        return c.json({ error: "marking progress is for the office and incharges", code: "FORBIDDEN" }, 403);
      }
    }

    // Term: the one asked for, else the current one.
    let termId = c.req.query("termId") ?? "";
    if (!termId) {
      // NOT simply the current term: the school rolled into the 2nd
      // Assessment on 21 Sep with the 1st still half marked, and the
      // board went blank (21 Sep).
      termId = (await resolveMarkingTerm(orgId))?.id ?? "";
    }
    const { data: term } = await serviceRoleClient
      .from("academic_term").select("id, name, org_id")
      .eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) {
      return c.json({ term: null, terms: [], exams: [], sections: [] });
    }

    // Every term, so the page can offer a picker - a school finishing
    // one assessment inside the next one needs to reach both.
    const { data: allTerms } = await serviceRoleClient
      .from("academic_term").select("id, name, start_date, is_current")
      .eq("org_id", orgId).is("archived_at", null)
      .order("start_date", { ascending: true });
    const termList = ((allTerms ?? []) as any[]).map((t) => ({
      id: t.id, name: t.name, isCurrent: !!t.is_current,
    }));

    const exams = await gradebookExams(termId);

    // Sections: not hifz, not sandbox, and inside the caller's wing.
    let secQ = serviceRoleClient
      .from("class_section")
      .select("id, name, schedule_key, class:class_id(id, name, kind, org_id)");
    if (wingClassIds) secQ = secQ.in("class_id", wingClassIds);
    const { data: secRows } = await secQ;
    const sections = ((secRows ?? []) as any[]).filter((s) =>
      s.class?.org_id === orgId &&
      s.class?.kind !== "hifz" &&
      s.schedule_key !== "sandbox",
    );
    if (!sections.length) {
      return c.json({ term: { id: termId, name: (term as any).name }, terms: termList, exams: [], sections: [] });
    }
    const secIds = sections.map((s) => s.id);
    const classIds = [...new Set(sections.map((s) => s.class.id))];

    // Active students only: a withdrawn child must not hold a column open.
    const { data: stuRows } = await serviceRoleClient
      .from("student").select("id, class_section_id")
      .in("class_section_id", secIds).eq("status", "active");
    const studentsBySec = new Map<string, string[]>();
    for (const r of ((stuRows ?? []) as any[])) {
      const arr = studentsBySec.get(r.class_section_id) ?? [];
      arr.push(r.id);
      studentsBySec.set(r.class_section_id, arr);
    }

    const { data: subRows } = await serviceRoleClient
      .from("class_subject").select("id, name, class_id, assessment_weights, sort_order, elective_group")
      .in("class_id", classIds).is("archived_at", null)
      .order("sort_order");
    const subjectsByClass = new Map<string, any[]>();
    for (const r of ((subRows ?? []) as any[])) {
      const arr = subjectsByClass.get(r.class_id) ?? [];
      arr.push({ id: r.id, name: r.name, weights: r.assessment_weights, elective_group: r.elective_group });
      subjectsByClass.set(r.class_id, arr);
    }

    // Streams: one choices query for the handful of elective subjects
    // (Class IX/X's Biology|Computer), resolvers built per class below.
    // Classes without elective groups pay nothing here.
    const electiveSubjectIds = ((subRows ?? []) as any[])
      .filter((r) => (r.elective_group ?? "").toString().trim() !== "")
      .map((r) => r.id);
    const allChoices: Array<{ student_id: string; class_subject_id: string }> = [];
    if (electiveSubjectIds.length) {
      for (let from = 0; ; from += 1000) {
        const { data: page } = await serviceRoleClient
          .from("student_subject_choice")
          .select("student_id, class_subject_id")
          .in("class_subject_id", electiveSubjectIds)
          .order("id").range(from, from + 999);
        allChoices.push(...((page ?? []) as any[]));
        if (!page || page.length < 1000) break;
      }
    }

    let scores: ProgressScore[] = [];
    try {
      scores = await loadExamScores(
        exams.map((e) => e.id),
        [...studentsBySec.values()].flat(),
      );
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
    const scoresByStudent = new Map<string, ProgressScore[]>();
    for (const s of scores) {
      const arr = scoresByStudent.get(s.student_id) ?? [];
      arr.push(s);
      scoresByStudent.set(s.student_id, arr);
    }

    // Sign-offs: one kv object per (term, section), keyed by subject.
    const { data: kvRows } = await serviceRoleClient
      .from("kv_store_f116e23f").select("key, value")
      .like("key", `school:marksconfirm:${termId}:%`);
    const confirmedBySec = new Map<string, Set<string>>();
    for (const r of ((kvRows ?? []) as any[])) {
      const sid = String(r.key).split(":").pop() ?? "";
      confirmedBySec.set(sid, new Set(Object.keys(r.value ?? {})));
    }

    // Report cards for this term (24 Sep: "can I see that everyone has
    // finalized"). Marks entered is NOT the same question as cards
    // finalized, and the office was opening one tabulation sheet per
    // section to find out. Paged - a whole school's cards pass 1000.
    const finalizedIds = new Set<string>();
    const publishedIds = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: page } = await serviceRoleClient
        .from("term_report_card")
        .select("student_id, finalized_at, published_at")
        .eq("term_id", termId)
        .order("student_id").range(from, from + 999);
      for (const r of ((page ?? []) as any[])) {
        if (r.finalized_at) finalizedIds.add(r.student_id);
        if (r.published_at) publishedIds.add(r.student_id);
      }
      if (!page || page.length < 1000) break;
    }

    const out = sections.map((s) => {
      const students = studentsBySec.get(s.id) ?? [];
      const subjects = subjectsByClass.get(s.class.id) ?? [];
      const secScores = students.flatMap((id) => scoresByStudent.get(id) ?? []);
      const secSits = buildSitsResolver(subjects as any[], allChoices);
      const cells = progressForSection(subjects, exams, students, secScores, secSits.sits);
      // A sign-off only counts for a subject that is actually examined —
      // a stale key for a subject since set to "no paper" is not progress.
      const examined = subjects.filter((x) => subjectIsExamined(x.weights));
      const confirmed = confirmedBySec.get(s.id) ?? new Set<string>();
      return {
        sectionId: s.id,
        label: `${s.class.name} — ${s.name}`,
        className: s.class.name,
        classSort: classOrder(s.class.name),
        studentCount: students.length,
        exams: cells,
        signedOff: examined.filter((x) => confirmed.has(x.id)).length,
        signOffNeeded: examined.length,
        // Report-card state for the section: finalized is what makes a
        // card publishable on results day; unmarked names the children
        // who would carry a BLANK card if it went out as-is (new
        // admissions and mid-term movers - Yousuf 2081, Safia 2488).
        finalized: students.filter((id) => finalizedIds.has(id)).length,
        published: students.filter((id) => publishedIds.has(id)).length,
        unmarked: students.filter((id) => (scoresByStudent.get(id) ?? []).length === 0).length,
        // The blank-card WARNING is the intersection: a child with no
        // marks whose own card is finalized. Un-finalizing the child
        // clears the warning even while the rest of the section stays
        // finalized (the office did exactly this for 2081/2488/2484).
        blankFinalized: students.filter((id) =>
          finalizedIds.has(id) && (scoresByStudent.get(id) ?? []).length === 0).length,
      };
    }).sort((a, b) =>
      (a.classSort - b.classSort) || a.label.localeCompare(b.label));

    return c.json({
      term: { id: termId, name: (term as any).name },
      terms: termList,
      exams: exams.map((e) => ({
        id: e.id, name: e.name, examDate: e.exam_date, paper: paperOfExam(e.name),
      })),
      sections: out,
    });
  });
}

export default installMarkingProgress;
