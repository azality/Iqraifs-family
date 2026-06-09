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

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

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
async function isTeacherOfSection(userId: string, sectionId: string): Promise<boolean> {
  // Class teacher of the section's class OR section's class_teacher_user_id.
  const { data: sec } = await serviceRoleClient
    .from("class_section")
    .select("class_teacher_user_id, class:class_id(class_teacher_user_id)")
    .eq("id", sectionId).maybeSingle();
  if (!sec) return false;
  if ((sec as any).class_teacher_user_id === userId) return true;
  if ((sec as any).class?.class_teacher_user_id === userId) return true;
  return false;
}

function termToJson(r: any) {
  return {
    id: r.id, orgId: r.org_id,
    academicYearId: r.academic_year_id,
    name: r.name,
    startDate: r.start_date, endDate: r.end_date,
    isCurrent: r.is_current,
    archivedAt: r.archived_at,
  };
}
function examToJson(r: any) {
  return {
    id: r.id, orgId: r.org_id, termId: r.term_id,
    name: r.name, examType: r.exam_type,
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
    return c.json({ exams: (data ?? []).map(examToJson) });
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
      .select("id, name, sort_order")
      .eq("class_id", classId)
      .order("sort_order", { ascending: true });

    // Students in this section. The student table has no roll_number
    // column in this codebase (the original 0007 migration never added
    // it); ordering by it silently emptied the array. Sort by name only.
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number")
      .eq("class_section_id", sectionId)
      .order("full_name", { ascending: true });

    const studentIds = ((students ?? []) as any[]).map((s) => s.id);
    const subjectIds = ((subjects ?? []) as any[]).map((s) => s.id);

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

    return c.json({
      section: { id: section.id, name: (section as any).name, className: (section as any).class.name },
      subjects: ((subjects ?? []) as any[]).map((s) => ({ id: s.id, name: s.name })),
      students: ((students ?? []) as any[]).map((s) => ({
        id: s.id,
        fullName: s.full_name,
        grNumber: s.gr_number,
        rollNumber: null,  // column doesn't exist in this codebase yet
        scores: ((subjects ?? []) as any[]).map((subj) => {
          const k = `${s.id}:${subj.id}`;
          const sc = scoreMap.get(k);
          return sc ? scoreToJson(sc) : {
            id: null, examId, studentId: s.id, classSubjectId: subj.id,
            maxMarks: null, obtainedMarks: null, absent: false, notes: null,
          };
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

    // Auth — admin/principal OR class teacher of this section.
    const isAdmin = await isAdminOrPrincipal(userId, orgId);
    if (!isAdmin && !(await isTeacherOfSection(userId, sectionId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: exam } = await serviceRoleClient
      .from("exam").select("org_id").eq("id", examId).maybeSingle();
    if (!exam || (exam as any).org_id !== orgId) {
      return c.json({ error: "exam not found" }, 404);
    }

    const defaultsMax = body.defaults?.maxMarks ? Number(body.defaults.maxMarks) : null;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return c.json({ ok: true, written: 0 });

    // Build inserts. Skip rows with no obtained_marks AND not-absent AND
    // no maxMarks/notes — they're empty cells, no point creating a row.
    const toUpsert: any[] = [];
    const toDelete: { student_id: string; class_subject_id: string }[] = [];
    for (const r of rows) {
      const studentId = String(r.studentId ?? "");
      const subjectId = String(r.classSubjectId ?? "");
      if (!studentId || !subjectId) continue;
      const absent = r.absent === true;
      const obtained = r.obtainedMarks === null || r.obtainedMarks === undefined || r.obtainedMarks === ""
        ? null : Number(r.obtainedMarks);
      const maxMarks = r.maxMarks === null || r.maxMarks === undefined || r.maxMarks === ""
        ? defaultsMax : Number(r.maxMarks);
      const notes = r.notes ? String(r.notes).slice(0, 500) : null;

      // Truly empty cell — clear any existing score row.
      if (!absent && obtained === null && !notes && maxMarks === null) {
        toDelete.push({ student_id: studentId, class_subject_id: subjectId });
        continue;
      }
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
