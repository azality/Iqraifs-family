// =============================================================================
// Per-student exam syllabus — the Hifz "مقدارِ خواندگی" line.
//
// The school's half-yearly Hifz paper (ششماہی امتحان) asks three questions
// out of each child's OWN memorized portion, so every slip carries a
// different syllabus. Today a teacher writes all ~84 of them by hand into
// the children's diaries before each exam (Ambreen, 17 Sep).
//
// We already hold every sabaq the child has ever been heard on, so the
// server PROPOSES each portion from that record and the teacher only
// reviews and corrects. Publishing locks the portions and releases them
// to the parent portal, which is what retires the handwritten notice.
//
//   GET   /orgs/:orgId/exams/:examId/syllabus?sectionId=   roster + proposals
//   PATCH /orgs/:orgId/exams/:examId/syllabus/:studentId   save one line
//   POST  /orgs/:orgId/exams/:examId/syllabus/publish      publish / unpublish
//
// Gated like every other section surface: the section's own teacher (class
// or hifz) plus admin/principal.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { requireTeacherOfSection } from "./schoolAuth.ts";
import { juzOfPosition, formatParaRanges } from "./quranParas.ts";

/** Rows a proposal may be built from. A missed marker is an absence, not
 *  a portion — it must never widen a child's syllabus. */
const PORTION_KINDS = new Set(["sabaq", "memorized", "revised", "tested"]);
const NAZRA_KINDS = new Set(["nazra", "nazra_revision"]);

interface ProgressRow {
  student_id: string;
  kind: string;
  surah_number: number | null;
  ayah_from: number | null;
  ayah_to: number | null;
  juz_number: number | null;
  qaida_lesson: number | null;
  missed: boolean | null;
}

/** Fetch every progress row for these students, paged — an unpaged
 *  select silently stops at 1000 and would quietly shrink a child's
 *  portion (the bug class that zeroed the resources tile, #620). */
async function loadProgress(studentIds: string[]): Promise<ProgressRow[]> {
  const out: ProgressRow[] = [];
  if (studentIds.length === 0) return out;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await serviceRoleClient
      .from("hifz_progress")
      .select("student_id, kind, surah_number, ayah_from, ayah_to, juz_number, qaida_lesson, missed")
      .in("student_id", studentIds)
      .order("recorded_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ProgressRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Which paras a set of rows covers. Para-mode rows carry juz_number
 *  directly; surah/ayah rows are mapped through the Indo-Pak boundaries. */
function parasCovered(rows: ProgressRow[]): number[] {
  const paras = new Set<number>();
  for (const r of rows) {
    if (r.missed) continue;
    if (r.juz_number && r.juz_number >= 1 && r.juz_number <= 30) {
      paras.add(r.juz_number);
      continue;
    }
    if (!r.surah_number || !r.ayah_from) continue;
    const start = juzOfPosition(r.surah_number, r.ayah_from);
    const end = juzOfPosition(r.surah_number, r.ayah_to ?? r.ayah_from);
    for (let p = Math.min(start, end); p <= Math.max(start, end); p++) paras.add(p);
  }
  return [...paras];
}

/** The proposed syllabus line for one child.
 *
 *  Two sources, merged: what the child has been HEARD on since logging
 *  began (3 Sep 2026), plus whatever the office recorded as already
 *  memorized BEFORE that. Without the baseline the first exam's
 *  proposals understate nearly everyone, because we only hold a few
 *  weeks of hearings.
 *
 *  Empty string when we have neither — the teacher types it, and we
 *  never invent a portion a child was not actually heard on. */
export function proposePortion(
  track: string | null,
  rows: ProgressRow[],
  baselineParas: number[] = [],
): string {
  const baseline = baselineParas.filter((p) => p >= 1 && p <= 30);
  if (track === "qaida") {
    // Qaida is counted in takhtis, not paras — the baseline (a para set)
    // has nothing to say about it.
    const lessons = rows
      .filter((r) => !r.missed && r.kind === "qaida" && r.qaida_lesson)
      .map((r) => r.qaida_lesson as number);
    if (lessons.length === 0) return "";
    return `Qaida — takhti 1–${Math.max(...lessons)}`;
  }
  if (track === "nazra") {
    const paras = parasCovered(rows.filter((r) => NAZRA_KINDS.has(r.kind)));
    // A reader who has also been heard on sabaq (mid-move to hifz) still
    // has their reading counted — fall back to everything rather than
    // proposing a blank line.
    const use = paras.length > 0 ? paras : parasCovered(rows);
    return formatParaRanges([...use, ...baseline]);
  }
  // hifz / revision / unknown: what they have memorized.
  const paras = parasCovered(rows.filter((r) => PORTION_KINDS.has(r.kind)));
  return formatParaRanges([...paras, ...baseline]);
}

export function installExamSyllabus(school: Hono): void {
  /** Shared loader: verifies the exam is this org's and the caller may
   *  touch the section, then returns the roster. */
  async function gate(c: any, sectionId: string) {
    const userId = getAuthUserId(c);
    if (!userId) return { ok: false as const, resp: c.json({ error: "unauthenticated" }, 401) };
    const orgId = c.req.param("orgId");
    const examId = c.req.param("examId");
    const { data: exam } = await serviceRoleClient
      .from("exam").select("id, org_id, name, term_id").eq("id", examId).maybeSingle();
    if (!exam || (exam as any).org_id !== orgId) {
      return { ok: false as const, resp: c.json({ error: "exam not found" }, 404) };
    }
    const g = await requireTeacherOfSection(userId, orgId, sectionId);
    if (!g.ok) return { ok: false as const, resp: c.json({ error: g.error, code: "FORBIDDEN" }, g.status) };
    return { ok: true as const, userId, orgId, examId, exam: exam as any };
  }

  // ---------------------------------------------------------------------------
  // GET roster + proposals
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/exams/:examId/syllabus", async (c) => {
    const sectionId = c.req.query("sectionId");
    if (!sectionId) return c.json({ error: "sectionId required" }, 400);
    const g = await gate(c, sectionId);
    if (!g.ok) return g.resp;

    const { data: sec } = await serviceRoleClient
      .from("class_section")
      .select("id, name, schedule_key, class:class_id(id, name, kind)")
      .eq("id", sectionId).maybeSingle();
    const sectionIsHifz =
      (sec as any)?.schedule_key === "hifz" || (sec as any)?.class?.kind === "hifz";

    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number, quran_track, hifz_baseline_paras")
      .eq("org_id", g.orgId).eq("class_section_id", sectionId).eq("status", "active")
      .order("full_name");
    const list = (students ?? []) as any[];
    if (list.length === 0) {
      return c.json({ exam: { id: g.exam.id, name: g.exam.name }, section: sec ?? null, rows: [] });
    }

    const ids = list.map((s) => s.id);
    let progress: ProgressRow[] = [];
    try { progress = await loadProgress(ids); }
    catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 500); }
    const byStudent = new Map<string, ProgressRow[]>();
    for (const r of progress) {
      const arr = byStudent.get(r.student_id) ?? [];
      arr.push(r);
      byStudent.set(r.student_id, arr);
    }

    const { data: saved } = await serviceRoleClient
      .from("student_exam_syllabus")
      .select("*").eq("exam_id", g.examId).in("student_id", ids);
    const savedBy = new Map(((saved ?? []) as any[]).map((r) => [r.student_id, r]));

    const rows = list.map((s) => {
      // Same resolution order the hifz surfaces use: explicit choice
      // wins, else a hifz section means hifz.
      const explicit = s.quran_track as string | null;
      const track = explicit ?? (sectionIsHifz ? "hifz" : null);
      const mine = byStudent.get(s.id) ?? [];
      const baselineParas = ((s.hifz_baseline_paras ?? []) as number[]).map(Number);
      const proposed = proposePortion(track, mine, baselineParas);
      const row = savedBy.get(s.id);
      return {
        studentId: s.id,
        studentName: s.full_name,
        grNumber: s.gr_number,
        track,
        trackInferred: !explicit,
        entriesLogged: mine.filter((r) => !r.missed).length,
        baselineParas,
        proposed,
        portion: row?.portion ?? proposed,
        source: row?.source ?? "proposed",
        notes: row?.notes ?? null,
        publishedAt: row?.published_at ?? null,
        saved: !!row,
      };
    });

    return c.json({
      exam: { id: g.exam.id, name: g.exam.name, termId: g.exam.term_id },
      section: sec
        ? { id: (sec as any).id, name: (sec as any).name, className: (sec as any).class?.name ?? null }
        : null,
      rows,
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH one child's line
  // ---------------------------------------------------------------------------
  school.patch("/orgs/:orgId/exams/:examId/syllabus/:studentId", async (c) => {
    const studentId = c.req.param("studentId");
    const { data: stu } = await serviceRoleClient
      .from("student").select("id, org_id, class_section_id, quran_track")
      .eq("id", studentId).maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    const g = await gate(c, (stu as any).class_section_id);
    if (!g.ok) return g.resp;
    if ((stu as any).org_id !== g.orgId) return c.json({ error: "forbidden" }, 403);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const portion = typeof body?.portion === "string" ? body.portion.trim() : null;
    if (!portion) return c.json({ error: "portion required" }, 400);
    if (portion.length > 400) return c.json({ error: "portion too long" }, 400);

    // A published portion is what the family was told to prepare —
    // unpublish first rather than moving the goalposts underneath them.
    const { data: existing } = await serviceRoleClient
      .from("student_exam_syllabus")
      .select("id, published_at").eq("exam_id", g.examId).eq("student_id", studentId).maybeSingle();
    if (existing && (existing as any).published_at) {
      return c.json({
        error: "this syllabus is already published — unpublish the section to edit it",
        code: "SYLLABUS_PUBLISHED",
      }, 409);
    }

    const { data, error } = await serviceRoleClient
      .from("student_exam_syllabus")
      .upsert({
        org_id: g.orgId,
        exam_id: g.examId,
        student_id: studentId,
        track: (stu as any).quran_track ?? null,
        portion,
        source: "edited",
        notes: typeof body?.notes === "string" ? body.notes.trim() || null : null,
        updated_by: g.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "exam_id,student_id" })
      .select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, row: data });
  });

  // ---------------------------------------------------------------------------
  // PATCH a child's prior-memorization baseline.
  //
  // Lives on the STUDENT, not the exam: it is a fact about the child that
  // every future exam's proposal starts from, so it is entered once and
  // never retyped. Same gate as the syllabus line — the section's own
  // teacher, or admin/principal.
  // ---------------------------------------------------------------------------
  school.patch("/orgs/:orgId/students/:studentId/hifz-baseline", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");

    const { data: stu } = await serviceRoleClient
      .from("student").select("id, org_id, class_section_id").eq("id", studentId).maybeSingle();
    if (!stu || (stu as any).org_id !== orgId) return c.json({ error: "student not found" }, 404);
    const gate = await requireTeacherOfSection(userId, orgId, (stu as any).class_section_id);
    if (!gate.ok) return c.json({ error: gate.error, code: "FORBIDDEN" }, gate.status);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const raw = body?.paras;
    if (raw !== null && !Array.isArray(raw)) {
      return c.json({ error: "paras must be an array of 1..30, or null" }, 400);
    }
    let paras: number[] | null = null;
    if (Array.isArray(raw)) {
      const nums = raw.map((n: unknown) => Number(n));
      if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 30)) {
        return c.json({ error: "every para must be a whole number from 1 to 30" }, 400);
      }
      paras = [...new Set(nums)].sort((a, b) => a - b);
      if (paras.length === 0) paras = null;
    }

    const { error } = await serviceRoleClient
      .from("student").update({ hifz_baseline_paras: paras }).eq("id", studentId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, paras: paras ?? [] });
  });

  // ---------------------------------------------------------------------------
  // POST publish / unpublish a whole section
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/exams/:examId/syllabus/publish", async (c) => {
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const sectionId = body?.sectionId ? String(body.sectionId) : "";
    if (!sectionId) return c.json({ error: "sectionId required" }, 400);
    const g = await gate(c, sectionId);
    if (!g.ok) return g.resp;
    const unpublish = body?.unpublish === true;

    const { data: students } = await serviceRoleClient
      .from("student").select("id, full_name, quran_track, hifz_baseline_paras")
      .eq("org_id", g.orgId).eq("class_section_id", sectionId).eq("status", "active");
    const list = (students ?? []) as any[];
    const ids = list.map((s) => s.id);
    if (ids.length === 0) return c.json({ published: 0, missing: [] });

    if (unpublish) {
      const { error } = await serviceRoleClient
        .from("student_exam_syllabus")
        .update({ published_at: null, updated_at: new Date().toISOString(), updated_by: g.userId })
        .eq("exam_id", g.examId).in("student_id", ids);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ ok: true, published: 0, unpublished: true });
    }

    // Publishing writes down whatever the roster currently shows,
    // including untouched proposals — the teacher has just reviewed the
    // screen, and a blank line helps nobody. Children with nothing
    // logged at all are reported instead, never published blank.
    let progress: ProgressRow[] = [];
    try { progress = await loadProgress(ids); }
    catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 500); }
    const byStudent = new Map<string, ProgressRow[]>();
    for (const r of progress) {
      const arr = byStudent.get(r.student_id) ?? [];
      arr.push(r);
      byStudent.set(r.student_id, arr);
    }
    const { data: saved } = await serviceRoleClient
      .from("student_exam_syllabus").select("*").eq("exam_id", g.examId).in("student_id", ids);
    const savedBy = new Map(((saved ?? []) as any[]).map((r) => [r.student_id, r]));

    const { data: sec } = await serviceRoleClient
      .from("class_section").select("schedule_key, class:class_id(kind)").eq("id", sectionId).maybeSingle();
    const sectionIsHifz =
      (sec as any)?.schedule_key === "hifz" || (sec as any)?.class?.kind === "hifz";

    const now = new Date().toISOString();
    const missing: Array<{ studentId: string; name: string }> = [];
    const toWrite: any[] = [];
    for (const s of list) {
      const row = savedBy.get(s.id);
      const track = (s.quran_track as string | null) ?? (sectionIsHifz ? "hifz" : null);
      const portion = (row?.portion ?? proposePortion(
        track,
        byStudent.get(s.id) ?? [],
        ((s.hifz_baseline_paras ?? []) as number[]).map(Number),
      )).trim();
      if (!portion) { missing.push({ studentId: s.id, name: s.full_name }); continue; }
      toWrite.push({
        ...(row?.id ? { id: row.id } : {}),
        org_id: g.orgId,
        exam_id: g.examId,
        student_id: s.id,
        track,
        portion,
        source: row?.source ?? "proposed",
        notes: row?.notes ?? null,
        published_at: now,
        updated_by: g.userId,
        updated_at: now,
      });
    }
    if (toWrite.length > 0) {
      const { error } = await serviceRoleClient
        .from("student_exam_syllabus").upsert(toWrite, { onConflict: "exam_id,student_id" });
      if (error) return c.json({ error: error.message }, 500);
    }
    return c.json({ ok: true, published: toWrite.length, missing });
  });
}

export default installExamSyllabus;
