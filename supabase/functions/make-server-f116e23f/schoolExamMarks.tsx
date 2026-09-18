// =============================================================================
// Exam marks — the rows of a paper, and one child's mark against each.
//
// The Hifz half-yearly (17 Oct) is marked out of 100 across six rows, and
// the three questions are drawn from the child's OWN memorised portion —
// so the marks screen carries each child's syllabus line beside their
// name. Without it the examiner is holding 84 different syllabi in their
// head while entering numbers.
//
//   GET   /orgs/:orgId/exams/:examId/components          the paper
//   PUT   /orgs/:orgId/exams/:examId/components          replace it (admin)
//   GET   /orgs/:orgId/exams/:examId/marks?sectionId=    roster + marks
//   PUT   /orgs/:orgId/exams/:examId/marks/:studentId    save one child
//
// Gated like the syllabus: the section's own teacher, plus admin and
// principal. Editing the paper itself is admin-only — a component's max
// changes what every mark already entered means.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { requireTeacherOfSection, hasAdminOrPrincipal } from "./schoolAuth.ts";
import {
  totalsFor, bandFor, markIsValid,
  type Component, type Band,
} from "./examScoring.ts";

const rowToComponent = (r: Record<string, unknown>): Component => ({
  id: String(r.id),
  name: String(r.name),
  groupLabel: (r.group_label as string | null) ?? null,
  maxMarks: Number(r.max_marks),
  sortOrder: Number(r.sort_order ?? 0),
});

async function componentsOf(examId: string): Promise<Component[]> {
  const { data } = await serviceRoleClient
    .from("exam_component")
    .select("id, name, group_label, max_marks, sort_order")
    .eq("exam_id", examId).is("archived_at", null)
    .order("sort_order");
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToComponent);
}

/** The bands this paper is graded against, or [] when none is attached. */
async function bandsOf(examRow: { grade_scale_id?: string | null }): Promise<Band[]> {
  if (!examRow.grade_scale_id) return [];
  const { data } = await serviceRoleClient
    .from("grade_scale_band")
    .select("letter, min_pct, max_pct, remark")
    .eq("scale_id", examRow.grade_scale_id)
    .order("min_pct", { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((b) => ({
    letter: String(b.letter),
    minPct: Number(b.min_pct),
    maxPct: Number(b.max_pct),
    remark: (b.remark as string | null) ?? null,
  }));
}

export function installExamMarks(school: Hono): void {
  /** Verifies the exam belongs to this org and the caller may touch the
   *  section. Mirrors the syllabus gate deliberately — the two screens
   *  are used by the same people for the same paper. */
  async function gate(c: any, sectionId: string) {
    const userId = getAuthUserId(c);
    if (!userId) return { ok: false as const, resp: c.json({ error: "unauthenticated" }, 401) };
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    const { data: exam } = await serviceRoleClient
      .from("exam").select("id, org_id, name, exam_date, grade_scale_id")
      .eq("id", examId).maybeSingle();
    if (!exam || (exam as any).org_id !== orgId) {
      return { ok: false as const, resp: c.json({ error: "exam not found" }, 404) };
    }
    const g = await requireTeacherOfSection(userId, orgId, sectionId);
    if (!g.ok) return { ok: false as const, resp: c.json({ error: g.error, code: "FORBIDDEN" }, g.status) };
    return { ok: true as const, userId, orgId, examId, exam: exam as any };
  }

  // ---------------------------------------------------------------------------
  // The paper
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/exams/:examId/components", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    const { data: exam } = await serviceRoleClient
      .from("exam").select("id, org_id, name, grade_scale_id")
      .eq("id", examId).maybeSingle();
    if (!exam || (exam as any).org_id !== orgId) return c.json({ error: "exam not found" }, 404);
    const components = await componentsOf(examId);
    return c.json({
      components,
      total: components.reduce((s, x) => s + x.maxMarks, 0),
      bands: await bandsOf(exam as any),
    });
  });

  school.put("/orgs/:orgId/exams/:examId/components", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    if (!(await hasAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "admins only", code: "FORBIDDEN" }, 403);
    }
    const { data: exam } = await serviceRoleClient
      .from("exam").select("id, org_id").eq("id", examId).maybeSingle();
    if (!exam || (exam as any).org_id !== orgId) return c.json({ error: "exam not found" }, 404);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const rows = Array.isArray(body?.components) ? body.components : null;
    if (!rows) return c.json({ error: "components must be an array" }, 400);
    if (rows.length > 40) return c.json({ error: "that is more rows than any paper has" }, 400);

    const clean: Array<Record<string, unknown>> = [];
    for (const [i, r] of rows.entries()) {
      const name = typeof r?.name === "string" ? r.name.trim() : "";
      const max = Number(r?.maxMarks);
      if (!name) return c.json({ error: `row ${i + 1} needs a name` }, 400);
      if (!Number.isFinite(max) || max <= 0) {
        return c.json({ error: `"${name}" needs marks greater than zero` }, 400);
      }
      clean.push({
        org_id: orgId, exam_id: examId, name,
        group_label: typeof r?.groupLabel === "string" && r.groupLabel.trim()
          ? r.groupLabel.trim() : null,
        max_marks: max,
        sort_order: i,
      });
    }

    // Marks already entered are keyed to a component, so replacing the
    // paper discards them. Say so rather than doing it silently.
    const existing = await componentsOf(examId);
    if (existing.length > 0) {
      const { count } = await serviceRoleClient
        .from("exam_component_score")
        .select("id", { count: "exact", head: true })
        .in("component_id", existing.map((x) => x.id));
      if ((count ?? 0) > 0 && body?.discardMarks !== true) {
        return c.json({
          error: `${count} mark${count === 1 ? " has" : "s have"} already been entered against this paper. ` +
            "Changing the rows will delete them.",
          code: "MARKS_EXIST",
          marks: count,
        }, 409);
      }
      const { error: delErr } = await serviceRoleClient
        .from("exam_component").delete().eq("exam_id", examId);
      if (delErr) return c.json({ error: delErr.message }, 500);
    }

    if (clean.length > 0) {
      const { error } = await serviceRoleClient.from("exam_component").insert(clean);
      if (error) return c.json({ error: error.message }, 500);
    }
    return c.json({ ok: true, components: await componentsOf(examId) });
  });

  // ---------------------------------------------------------------------------
  // The roster, with each child's portion and marks
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/exams/:examId/marks", async (c) => {
    const sectionId = c.req.query("sectionId");
    if (!sectionId) return c.json({ error: "sectionId required" }, 400);
    const g = await gate(c, sectionId);
    if (!g.ok) return g.resp;

    const components = await componentsOf(g.examId);
    const bands = await bandsOf(g.exam);

    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number, quran_track, hifz_baseline_paras, hafiz_since")
      .eq("org_id", g.orgId).eq("class_section_id", sectionId).eq("status", "active")
      .order("full_name");
    const list = (students ?? []) as any[];
    if (list.length === 0) {
      return c.json({ exam: { id: g.exam.id, name: g.exam.name }, components, bands, rows: [] });
    }
    const ids = list.map((s) => s.id);

    // The published syllabus is what the child was told to prepare, so it
    // is what the examiner should see — falling back to the proposal only
    // where nothing has been published yet.
    const { data: syl } = await serviceRoleClient
      .from("student_exam_syllabus")
      .select("student_id, portion, published_at")
      .eq("exam_id", g.examId).in("student_id", ids);
    const portionOf = new Map(
      ((syl ?? []) as any[]).map((r) => [r.student_id, r.portion as string]),
    );

    const { data: scoreRows } = await serviceRoleClient
      .from("exam_component_score")
      .select("component_id, student_id, obtained, absent")
      .in("student_id", ids);
    const byStudent = new Map<string, Map<string, number | null>>();
    const absentOf = new Map<string, boolean>();
    for (const r of ((scoreRows ?? []) as any[])) {
      if (!components.some((x) => x.id === r.component_id)) continue;
      const m = byStudent.get(r.student_id) ?? new Map<string, number | null>();
      m.set(r.component_id, r.obtained === null ? null : Number(r.obtained));
      byStudent.set(r.student_id, m);
      if (r.absent) absentOf.set(r.student_id, true);
    }

    const rows = list.map((s) => {
      const marks = byStudent.get(s.id) ?? new Map<string, number | null>();
      const t = totalsFor(components, marks);
      const band = bandFor(bands, t.pct);
      return {
        studentId: s.id,
        studentName: s.full_name,
        grNumber: s.gr_number,
        portion: portionOf.get(s.id) ?? "",
        portionPublished: portionOf.has(s.id),
        absent: absentOf.get(s.id) ?? false,
        marks: Object.fromEntries(marks),
        totals: t,
        band: band ? { letter: band.letter, remark: band.remark } : null,
      };
    });

    return c.json({
      exam: { id: g.exam.id, name: g.exam.name, examDate: g.exam.exam_date ?? null },
      components,
      bands,
      rows,
    });
  });

  // ---------------------------------------------------------------------------
  // Save one child's marks
  // ---------------------------------------------------------------------------
  school.put("/orgs/:orgId/exams/:examId/marks/:studentId", async (c) => {
    const studentId = c.req.param("studentId");
    const { data: stu } = await serviceRoleClient
      .from("student").select("id, org_id, class_section_id").eq("id", studentId).maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    const g = await gate(c, (stu as any).class_section_id);
    if (!g.ok) return g.resp;
    if ((stu as any).org_id !== g.orgId) return c.json({ error: "forbidden" }, 403);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const marks = body?.marks;
    if (marks && typeof marks !== "object") return c.json({ error: "marks must be an object" }, 400);
    const absent = body?.absent === true;

    const components = await componentsOf(g.examId);
    const byId = new Map(components.map((x) => [x.id, x]));

    const toWrite: Array<Record<string, unknown>> = [];
    for (const [componentId, raw] of Object.entries(marks ?? {})) {
      const comp = byId.get(componentId);
      if (!comp) return c.json({ error: "that row is not on this paper" }, 400);
      const mark = raw === null || raw === "" ? null : Number(raw);
      if (!markIsValid(comp, mark)) {
        return c.json({
          error: `"${comp.name}" is out of ${comp.maxMarks} — ${raw} cannot be right`,
          code: "MARK_OUT_OF_RANGE",
        }, 400);
      }
      toWrite.push({
        org_id: g.orgId, component_id: componentId, student_id: studentId,
        obtained: mark, absent, recorded_by: g.userId,
        updated_at: new Date().toISOString(),
      });
    }
    if (toWrite.length > 0) {
      const { error } = await serviceRoleClient
        .from("exam_component_score")
        .upsert(toWrite, { onConflict: "component_id,student_id" });
      if (error) return c.json({ error: error.message }, 500);
    }

    // Read back so the caller gets the totals the server computed rather
    // than adding up on its own and drifting.
    const { data: after } = await serviceRoleClient
      .from("exam_component_score")
      .select("component_id, obtained")
      .eq("student_id", studentId)
      .in("component_id", components.map((x) => x.id));
    const now = new Map<string, number | null>(
      ((after ?? []) as any[]).map((r) => [r.component_id, r.obtained === null ? null : Number(r.obtained)]),
    );
    const t = totalsFor(components, now);
    const band = bandFor(await bandsOf(g.exam), t.pct);
    return c.json({
      ok: true,
      marks: Object.fromEntries(now),
      totals: t,
      band: band ? { letter: band.letter, remark: band.remark } : null,
    });
  });
}

export default installExamMarks;
