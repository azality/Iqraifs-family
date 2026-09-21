// How far marks entry has come — for one section, or the whole school.
//
// Pure — no database — so the section page's "Oral 7/9 subjects" and the
// principal's Marking progress board are computed by the same function and
// can never disagree (18 Sep).
//
// A subject is DONE for an exam when every student in the section has a
// mark or an absence in it. Only subjects that actually SIT that exam
// count, which is where the section page used to go wrong: it counted
// every class subject, so Art & Craft and Robotics (no paper at all) and
// Class VIII's written-only subjects (no oral) sat in the denominator
// forever — "Oral 1/8" for a section whose oral was finished.

/** Which paper an exam is, from its name. Server twin of the client's
 *  paperOfExamName — the ONE server copy; schoolAssessment imports it. */
export function paperOfExam(name: string | null | undefined): "oral" | "written" | null {
  const n = (name ?? "").toLowerCase();
  if (/\boral\b/.test(n)) return "oral";
  if (/\bwritten\b/.test(n)) return "written";
  return null;
}

/** Does this subject sit this exam's paper? The marks sheet's own column
 *  rule: null weights = unknown, applies everywhere; [] = the school said
 *  "no paper at all"; components = only the papers that carry marks. */
export function subjectSitsExam(weights: unknown, examName: string): boolean {
  if (!Array.isArray(weights)) return true;
  if (weights.length === 0) return false;
  const paper = paperOfExam(examName);
  if (!paper) return true;
  const marksTyped = weights.filter((w: any) => typeof w?.marks === "number");
  if (!marksTyped.length) return true; // legacy pct shape - no paper info
  return marksTyped.some((w: any) => w.paper === paper && w.marks > 0);
}

/** Is this subject examined at all this term? Drives how many sign-offs a
 *  section owes — the same rule the dashboard's sign-off alert uses. */
export function subjectIsExamined(weights: unknown): boolean {
  return Array.isArray(weights) && weights.some(
    (w: any) => typeof w?.marks === "number" && w.marks > 0,
  );
}

export interface ProgressSubject { id: string; name: string; weights: unknown }
export interface ProgressExam { id: string; name: string }
export interface ProgressScore {
  exam_id: string;
  student_id: string;
  class_subject_id: string;
  obtained_marks: number | null;
  absent: boolean | null;
}

export interface SubjectCell {
  subjectId: string;
  subjectName: string;
  /** Students with a mark or an absence in this subject, this exam. */
  marked: number;
  done: boolean;
}

export interface ExamCell {
  examId: string;
  /** Subjects that sit this exam and have every student marked. */
  subjectsDone: number;
  /** Subjects that sit this exam at all. */
  subjectCount: number;
  /** Marks entered / marks owed, across those subjects. */
  marksEntered: number;
  marksExpected: number;
  /** One line per subject that sits this exam, so a cell can say WHICH
   *  subjects are still missing rather than just how many. */
  subjects: SubjectCell[];
}

export function progressForSection(
  subjects: ProgressSubject[],
  exams: ProgressExam[],
  studentIds: string[],
  scores: ProgressScore[],
): ExamCell[] {
  const roster = new Set(studentIds);
  // exam -> subject -> students marked
  const marked = new Map<string, Map<string, Set<string>>>();
  for (const s of scores) {
    // A null mark without an absence is an empty cell, not an entry.
    if (s.obtained_marks === null && s.absent !== true) continue;
    // A student who has since left must not count towards the ones here.
    if (!roster.has(s.student_id)) continue;
    const bySub = marked.get(s.exam_id) ?? new Map<string, Set<string>>();
    marked.set(s.exam_id, bySub);
    const set = bySub.get(s.class_subject_id) ?? new Set<string>();
    bySub.set(s.class_subject_id, set);
    set.add(s.student_id);
  }

  return exams.map((e) => {
    const sitting = subjects.filter((sub) => subjectSitsExam(sub.weights, e.name));
    const cells: SubjectCell[] = sitting.map((sub) => {
      const n = marked.get(e.id)?.get(sub.id)?.size ?? 0;
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        marked: n,
        done: studentIds.length > 0 && n >= studentIds.length,
      };
    });
    return {
      examId: e.id,
      subjectsDone: cells.filter((c) => c.done).length,
      subjectCount: cells.length,
      marksEntered: cells.reduce((s, c) => s + c.marked, 0),
      marksExpected: cells.length * studentIds.length,
      subjects: cells,
    };
  });
}

/** The state of one cell, for colouring and sorting:
 *    "none"    — nothing sits this exam here (e.g. no oral in Class VIII)
 *    "empty"   — something should be marked and nothing has been
 *    "partial" — started
 *    "done"    — every subject complete */
export type CellState = "none" | "empty" | "partial" | "done";

export function cellState(c: ExamCell): CellState {
  if (c.subjectCount === 0) return "none";
  if (c.subjectsDone === c.subjectCount) return "done";
  if (c.marksEntered === 0) return "empty";
  return "partial";
}

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12,
};

/** Where a class sits in the school, youngest first. Classes carry no
 *  sort column, and sorting by name puts "Class IX" straight after
 *  "Class IV". Early years lead, then Class I-XII by value, then
 *  anything else by name. */
export function classOrder(name: string): number {
  const n = name.trim().toLowerCase();
  const early = ["reception", "junior", "senior"];
  const e = early.indexOf(n);
  if (e !== -1) return e;
  const m = /^class\s+([ivx]+|\d+)$/.exec(n);
  if (m) {
    const v = /^\d+$/.test(m[1]) ? Number(m[1]) : ROMAN[m[1]] ?? 50;
    return 10 + v;
  }
  return 100;
}

/** A term as the marking surfaces need to see it. */
export interface MarkableTerm {
  id: string;
  startDate: string;
  isCurrent: boolean;
}

/** The term whose papers are being marked right now.
 *
 *  Every marking surface used to read `is_current` straight off the
 *  term. On 21 Sep the school rolled into the 2nd Assessment while the
 *  1st Assessment marks were still half entered, and the marking board,
 *  the teachers' "enter marks" nudges and the office sign-off alert all
 *  went blank on the same morning - the term that owns the papers was no
 *  longer the current one.
 *
 *  So: the current term when it actually has gradebook papers, else the
 *  most recent EARLIER term that does. Marking a term only ever runs on
 *  or after its own papers, never ahead of them, so a future term is
 *  never picked.
 */
export function termBeingMarked(
  terms: MarkableTerm[], termIdsWithExams: Set<string>,
): MarkableTerm | null {
  const current = terms.find((t) => t.isCurrent) ?? null;
  if (current && termIdsWithExams.has(current.id)) return current;
  const earlier = terms
    .filter((t) => termIdsWithExams.has(t.id))
    .filter((t) => !current || t.startDate <= current.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return earlier[0] ?? current;
}
