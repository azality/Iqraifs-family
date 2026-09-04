// Teacher Track Record — Phase 1 (scoped Sep 3 2026, built same day on
// Muneeb's go-ahead; the term-over-term comparison stays empty until the
// school flips to 2nd Assessment on Sep 21).
//
// One aggregation endpoint answering "how is this teacher doing?" from
// data teachers already enter: consistency (roll-call, lessons vs
// timetable, gradebook freshness, hifz heard-rate), curriculum pace,
// student outcomes (avg / pass rate / distribution / term movement),
// and engagement (behavior notes, resources, quiz share, substitutions).
//
// Principal/admin only. Read the companion scope artifact for the
// definitions and fairness guardrails (ramp, term-compare-first).

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAdminOrPrincipal, inchargeClassIds } from "./schoolAuth.ts";

const DAY = 86400e3;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function installTeacherPerf(school: Hono) {
  school.get("/orgs/:orgId/teachers/:userId/performance", async (c) => {
    const callerId = getAuthUserId(c);
    if (!callerId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const targetId = c.req.param("userId");
    if (!(await hasAdminOrPrincipal(callerId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // ── Window: requested term, else the current term, else last 90 days.
    const { data: terms } = await serviceRoleClient
      .from("academic_term")
      .select("id, name, start_date, end_date, is_current")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("start_date");
    const reqTerm = c.req.query("term");
    const term =
      (terms ?? []).find((t: any) => t.id === reqTerm) ??
      (terms ?? []).find((t: any) => t.is_current) ??
      null;
    const today = new Date();
    const winStart = term ? new Date(`${term.start_date}T00:00:00Z`) : new Date(Date.now() - 90 * DAY);
    const winEndRaw = term ? new Date(`${term.end_date}T23:59:59Z`) : today;
    const winEnd = winEndRaw < today ? winEndRaw : today;
    const startStr = winStart.toISOString().slice(0, 10);
    const endStr = winEnd.toISOString().slice(0, 10);
    const prevTerm = term
      ? (terms ?? []).filter((t: any) => t.start_date < term.start_date).pop() ?? null
      : null;

    // ── Org settings: pass mark.
    const { data: org } = await serviceRoleClient
      .from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const passMarkPct = Number((org as any)?.settings?.pass_mark_pct) || 40;

    // ── The teacher's footprint: owned sections + taught subjects.
    const [{ data: ownSecs }, { data: hifzSecs }, { data: subjRows }] = await Promise.all([
      serviceRoleClient.from("class_section")
        .select("id, name, class:class_id!inner(id, name, org_id, kind)")
        .eq("class_teacher_user_id", targetId).eq("class.org_id", orgId),
      serviceRoleClient.from("class_section")
        .select("id, name, class:class_id!inner(id, name, org_id, kind)")
        .eq("hifz_teacher_user_id", targetId).eq("class.org_id", orgId),
      serviceRoleClient.from("section_subject")
        .select("id, name, class_subject_id, class_section_id, section:class_section_id(name, class:class_id(id, name, kind))")
        .eq("teacher_user_id", targetId).eq("org_id", orgId).is("archived_at", null),
    ]);
    const ownedSections = (ownSecs ?? []) as any[];
    const hifzSections = [
      ...((hifzSecs ?? []) as any[]),
      ...ownedSections.filter((s) => s.class?.kind === "hifz"),
    ].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
    const subjects = (subjRows ?? []) as any[];
    const allSectionIds = Array.from(new Set([
      ...ownedSections.map((s) => s.id),
      ...hifzSections.map((s) => s.id),
      ...subjects.map((s) => s.class_section_id),
    ]));
    if (allSectionIds.length === 0) {
      return c.json({ empty: true, reason: "no sections or subjects assigned" });
    }

    // ── Ramp: first active role grant.
    const { data: roleRows } = await serviceRoleClient
      .from("user_roles").select("granted_at").eq("user_id", targetId)
      .is("revoked_at", null).order("granted_at").limit(1);
    const firstGrant = roleRows?.[0]?.granted_at ? new Date(roleRows[0].granted_at) : null;
    const rampUntil = firstGrant ? new Date(firstGrant.getTime() + 42 * DAY) : null;
    const inRamp = !!rampUntil && today < rampUntil;

    // ── 1. Consistency ────────────────────────────────────────────────
    // Roll-call discipline (class-teacher sections only): days marked ÷
    // days the SCHOOL took attendance anywhere (proxy for school days).
    let rollCall: { markedDays: number; schoolDays: number } | null = null;
    if (ownedSections.length > 0) {
      const [{ data: mine }, { data: orgDays }] = await Promise.all([
        serviceRoleClient.from("school_attendance")
          .select("attendance_date")
          .in("class_section_id", ownedSections.map((s) => s.id))
          .gte("attendance_date", startStr).lte("attendance_date", endStr)
          .limit(20000),
        serviceRoleClient.from("school_attendance")
          .select("attendance_date")
          .eq("org_id", orgId)
          .gte("attendance_date", startStr).lte("attendance_date", endStr)
          .limit(50000),
      ]);
      const markedDays = new Set((mine ?? []).map((r: any) => r.attendance_date)).size;
      const schoolDays = new Set((orgDays ?? []).map((r: any) => r.attendance_date)).size;
      rollCall = { markedDays, schoolDays };
    }

    // Lessons vs scheduled periods.
    const [{ data: lessons }, { data: ttEntries }] = await Promise.all([
      serviceRoleClient.from("lesson")
        .select("id, lesson_date, attachments, curriculum_topic_id")
        .eq("org_id", orgId).eq("taught_by", targetId)
        .gte("lesson_date", startStr).lte("lesson_date", endStr).limit(2000),
      serviceRoleClient.from("timetable_entry")
        .select("id").eq("org_id", orgId).eq("teacher_user_id", targetId),
    ]);
    const lessonRows = (lessons ?? []) as any[];
    const weeksElapsed = Math.max(1, (winEnd.getTime() - winStart.getTime()) / (7 * DAY));
    const scheduledPerWeek = (ttEntries ?? []).length;

    // Gradebook freshness: teacher's assignments with a past due date →
    // median days from due date to first grade row.
    const { data: myAssignments } = await serviceRoleClient
      .from("assignment")
      .select("id, kind, due_date, assigned_date, max_score, section_subject:section_subject_id(id, name, class_section_id)")
      .eq("org_id", orgId).eq("created_by", targetId)
      .gte("assigned_date", startStr).lte("assigned_date", endStr).limit(1000);
    const assignments = (myAssignments ?? []) as any[];
    const dueDone = assignments.filter((a) => a.due_date && a.due_date <= endStr);
    let freshnessDays: number | null = null;
    let ungradedPastDue = 0;
    if (dueDone.length > 0) {
      const { data: grades } = await serviceRoleClient
        .from("grade").select("assignment_id, created_at")
        .in("assignment_id", dueDone.map((a) => a.id)).limit(20000);
      const firstGrade = new Map<string, string>();
      for (const g of (grades ?? []) as any[]) {
        const cur = firstGrade.get(g.assignment_id);
        if (!cur || g.created_at < cur) firstGrade.set(g.assignment_id, g.created_at);
      }
      const lags: number[] = [];
      for (const a of dueDone) {
        const fg = firstGrade.get(a.id);
        if (!fg) { ungradedPastDue++; continue; }
        const lag = (new Date(fg).getTime() - new Date(`${a.due_date}T00:00:00Z`).getTime()) / DAY;
        lags.push(Math.max(0, Math.round(lag)));
      }
      freshnessDays = median(lags);
    }

    // Hifz heard-rate (staff with hifz sections).
    let hifz: unknown = null;
    if (hifzSections.length > 0) {
      const secIds = hifzSections.map((s) => s.id);
      const { data: students } = await serviceRoleClient
        .from("student").select("id, class_section_id")
        .eq("org_id", orgId).in("class_section_id", secIds).neq("status", "withdrawn");
      const roster = (students ?? []).length;
      const ids = (students ?? []).map((s: any) => s.id);
      const { data: heard } = ids.length
        ? await serviceRoleClient.from("hifz_progress")
            .select("student_id, recorded_at, kind, quality")
            .in("student_id", ids)
            .gte("recorded_at", winStart.toISOString()).lte("recorded_at", winEnd.toISOString())
            .limit(50000)
        : { data: [] };
      const byDay = new Map<string, Set<string>>();
      const qualityMix: Record<string, number> = {};
      let newAyahs = 0;
      for (const h of (heard ?? []) as any[]) {
        const d = new Date(new Date(h.recorded_at).getTime() + 5 * 3600e3).toISOString().slice(0, 10);
        (byDay.get(d) ?? byDay.set(d, new Set()).get(d)!).add(h.student_id);
        if (h.quality) qualityMix[h.quality] = (qualityMix[h.quality] ?? 0) + 1;
      }
      // Ayah velocity: sum of sabaq ranges (same rule as memorized totals).
      const { data: sabaqs } = ids.length
        ? await serviceRoleClient.from("hifz_progress")
            .select("ayah_from, ayah_to, kind, missed")
            .in("student_id", ids).in("kind", ["sabaq", "memorized"])
            .gte("recorded_at", winStart.toISOString()).lte("recorded_at", winEnd.toISOString())
            .limit(50000)
        : { data: [] };
      for (const s of (sabaqs ?? []) as any[]) {
        if (!s.missed) newAyahs += Math.max(0, (s.ayah_to ?? 0) - (s.ayah_from ?? 0) + 1);
      }
      const activeDays = byDay.size;
      const heardAvg = activeDays
        ? Array.from(byDay.values()).reduce((a, s) => a + s.size, 0) / activeDays
        : 0;
      hifz = {
        roster,
        activeDays,
        avgHeardPerDay: Math.round(heardAvg * 10) / 10,
        heardRatePct: roster ? Math.round((heardAvg / roster) * 100) : 0,
        qualityMix,
        newAyahs,
        ayahsPerStudent: roster ? Math.round((newAyahs / roster) * 10) / 10 : 0,
      };
    }

    // ── 2. Curriculum pace per taught subject ─────────────────────────
    const termElapsedPct = term
      ? Math.min(100, Math.max(0, Math.round(
          ((today.getTime() - winStart.getTime()) /
            (new Date(`${term.end_date}T00:00:00Z`).getTime() - winStart.getTime())) * 100)))
      : null;
    const pace: unknown[] = [];
    for (const ss of subjects) {
      const { data: cur } = await serviceRoleClient
        .from("curriculum").select("id")
        .eq("class_subject_id", ss.class_subject_id).eq("academic_year", "2026-27")
        .maybeSingle();
      if (!cur) continue;
      const { data: topics } = await serviceRoleClient
        .from("curriculum_topic").select("completed, academic_term_id")
        .eq("curriculum_id", (cur as any).id);
      // Count current-term + untagged topics (the term-aware convention).
      const rows = ((topics ?? []) as any[]).filter(
        (t) => !term || !t.academic_term_id || t.academic_term_id === term.id,
      );
      if (rows.length === 0) continue;
      const done = rows.filter((t) => t.completed).length;
      const completePct = Math.round((done / rows.length) * 100);
      pace.push({
        subjectName: ss.name,
        sectionLabel: `${ss.section?.class?.name ?? ""} ${ss.section?.name ?? ""}`.trim(),
        topicsDone: done,
        topicsTotal: rows.length,
        completePct,
        expectedPct: termElapsedPct,
        deltaPp: termElapsedPct == null ? null : completePct - termElapsedPct,
      });
    }

    // ── 3. Outcomes per subject ───────────────────────────────────────
    const outcomes: unknown[] = [];
    const bySubject = new Map<string, any[]>();
    for (const a of assignments) {
      const key = a.section_subject?.id ?? "general";
      (bySubject.get(key) ?? bySubject.set(key, []).get(key)!).push(a);
    }
    for (const [ssId, asgs] of bySubject) {
      const { data: grades } = await serviceRoleClient
        .from("grade").select("assignment_id, student_id, score")
        .in("assignment_id", asgs.map((a: any) => a.id)).limit(20000);
      const maxOf = new Map(asgs.map((a: any) => [a.id, Number(a.max_score) || 100]));
      const pcts: number[] = [];
      for (const g of (grades ?? []) as any[]) {
        if (g.score == null) continue;
        const mx = maxOf.get(g.assignment_id) ?? 100;
        pcts.push((Number(g.score) / mx) * 100);
      }
      if (pcts.length === 0) continue;
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      const buckets = { below40: 0, b40to59: 0, b60to79: 0, b80plus: 0 };
      for (const p of pcts) {
        if (p < 40) buckets.below40++;
        else if (p < 60) buckets.b40to59++;
        else if (p < 80) buckets.b60to79++;
        else buckets.b80plus++;
      }
      outcomes.push({
        subjectName: asgs[0].section_subject?.name ?? "General",
        gradesEntered: pcts.length,
        avgPct: Math.round(avg),
        passRatePct: Math.round((pcts.filter((p) => p >= passMarkPct).length / pcts.length) * 100),
        buckets,
        // Term movement lands after a second term exists (Sep 21 flip).
        prevTermAvgPct: null as number | null,
        _ssId: ssId,
      });
    }
    // Term-over-term: previous term's grades on the same subjects.
    if (prevTerm) {
      for (const o of outcomes as any[]) {
        const asgs = bySubject.get(o._ssId) ?? [];
        const ssId = asgs[0]?.section_subject?.id;
        if (!ssId) continue;
        const { data: prevAsg } = await serviceRoleClient
          .from("assignment").select("id, max_score")
          .eq("org_id", orgId).eq("created_by", targetId)
          .eq("section_subject_id", ssId)
          .gte("assigned_date", prevTerm.start_date).lte("assigned_date", prevTerm.end_date)
          .limit(500);
        if (!prevAsg || prevAsg.length === 0) continue;
        const { data: pg } = await serviceRoleClient
          .from("grade").select("assignment_id, score")
          .in("assignment_id", (prevAsg as any[]).map((a) => a.id)).limit(20000);
        const mx = new Map((prevAsg as any[]).map((a) => [a.id, Number(a.max_score) || 100]));
        const pcts = ((pg ?? []) as any[])
          .filter((g) => g.score != null)
          .map((g) => (Number(g.score) / (mx.get(g.assignment_id) ?? 100)) * 100);
        if (pcts.length) o.prevTermAvgPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      }
    }
    for (const o of outcomes as any[]) delete o._ssId;

    // ── 4. Engagement ────────────────────────────────────────────────
    const [{ data: notes }, { data: subsCovered }, { data: myEntries }] = await Promise.all([
      serviceRoleClient.from("behavior_note")
        .select("kind").eq("recorded_by", targetId)
        .gte("created_at", winStart.toISOString()).lte("created_at", winEnd.toISOString())
        .limit(5000),
      serviceRoleClient.from("timetable_substitution")
        .select("id").eq("org_id", orgId).eq("substitute_teacher_user_id", targetId)
        .gte("date", startStr).lte("date", endStr),
      serviceRoleClient.from("timetable_entry")
        .select("id").eq("org_id", orgId).eq("teacher_user_id", targetId),
    ]);
    let subsNeeded = 0;
    if ((myEntries ?? []).length > 0) {
      const { data: needed } = await serviceRoleClient
        .from("timetable_substitution").select("id")
        .in("entry_id", (myEntries ?? []).map((e: any) => e.id))
        .gte("date", startStr).lte("date", endStr);
      subsNeeded = (needed ?? []).length;
    }
    const noteRows = (notes ?? []) as any[];
    const positives = noteRows.filter((n) => n.kind === "positive").length;
    const lessonsWithResources = lessonRows.filter(
      (l) => Array.isArray(l.attachments) && l.attachments.length > 0).length;
    const quizCount = assignments.filter((a) => a.kind === "quiz").length;

    return c.json({
      term: term ? { id: term.id, name: term.name, start: term.start_date, end: term.end_date } : null,
      terms: (terms ?? []).map((t: any) => ({ id: t.id, name: t.name, isCurrent: !!t.is_current })),
      window: { start: startStr, end: endStr },
      passMarkPct,
      ramp: { inRamp, rampUntil: rampUntil ? rampUntil.toISOString().slice(0, 10) : null },
      footprint: {
        ownedSections: ownedSections.map((s) => `${s.class?.name} ${s.name}`),
        // Additive (7a): id+label refs so the profile can deep-link the
        // roll-call stat to the section's attendance page.
        ownedSectionRefs: ownedSections.map((s) => ({ id: s.id, label: `${s.class?.name} ${s.name}` })),
        hifzSectionRefs: hifzSections.map((s) => ({ id: s.id, label: `${s.class?.name} ${s.name}` })),
        hifzSections: hifzSections.map((s) => `${s.class?.name} ${s.name}`),
        subjects: subjects.map((s) => `${s.section?.class?.name ?? ""} ${s.section?.name ?? ""} · ${s.name}`.trim()),
      },
      consistency: {
        rollCall,
        lessonsLogged: lessonRows.length,
        lessonsTopicTagged: lessonRows.filter((l) => l.curriculum_topic_id).length,
        scheduledPerWeek,
        lessonsPerWeek: Math.round((lessonRows.length / weeksElapsed) * 10) / 10,
        gradebookFreshnessDays: freshnessDays,
        ungradedPastDue,
      },
      hifz,
      pace,
      outcomes,
      engagement: {
        behaviorNotes: noteRows.length,
        positiveNotes: positives,
        concernNotes: noteRows.length - positives,
        notesPerWeek: Math.round((noteRows.length / weeksElapsed) * 10) / 10,
        lessonsWithResources,
        resourceRatePct: lessonRows.length
          ? Math.round((lessonsWithResources / lessonRows.length) * 100) : null,
        quizShare: assignments.length
          ? Math.round((quizCount / assignments.length) * 100) : null,
        assignmentsGiven: assignments.length,
        substitutionsCovered: (subsCovered ?? []).length,
        substitutionsNeeded: subsNeeded,
      },
    });
  });
}

// ─── Phase 2: Teaching overview ───────────────────────────────────────
// One screen, every teacher as a row (scope artifact, Phase 2):
// pace delta, gradebook freshness, roll-call, lessons, heard-rate,
// feedback footprint — sorted most-behind-first so the principal's eye
// lands where coaching is needed. Principals/admins see the school;
// incharges automatically see only teachers who teach in their wing.
// All metrics come from ~a dozen org-wide batch queries, not one
// Phase-1 call per teacher.

export function installTeachingOverview(school: Hono) {
  school.get("/orgs/:orgId/teaching-overview", async (c) => {
    const callerId = getAuthUserId(c);
    if (!callerId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const isTop = await hasAdminOrPrincipal(callerId, orgId);
    let wing: string[] | null = null; // class ids; null = whole org
    if (!isTop) {
      const w = await inchargeClassIds(callerId, orgId);
      if (w.length === 0) return c.json({ error: "forbidden" }, 403);
      wing = w;
    }

    // Window = requested/current term, else last 90 days (Phase 1 rule).
    const { data: terms } = await serviceRoleClient
      .from("academic_term")
      .select("id, name, start_date, end_date, is_current")
      .eq("org_id", orgId).is("archived_at", null).order("start_date");
    const reqTerm = c.req.query("term");
    const term =
      (terms ?? []).find((t: any) => t.id === reqTerm) ??
      (terms ?? []).find((t: any) => t.is_current) ?? null;
    const today = new Date();
    const winStart = term ? new Date(`${term.start_date}T00:00:00Z`) : new Date(Date.now() - 90 * DAY);
    const winEndRaw = term ? new Date(`${term.end_date}T23:59:59Z`) : today;
    const winEnd = winEndRaw < today ? winEndRaw : today;
    const startStr = winStart.toISOString().slice(0, 10);
    const endStr = winEnd.toISOString().slice(0, 10);
    const weeksElapsed = Math.max(1, (winEnd.getTime() - winStart.getTime()) / (7 * DAY));
    const termElapsedPct = term
      ? Math.min(100, Math.max(0, Math.round(
          ((today.getTime() - winStart.getTime()) /
            (new Date(`${term.end_date}T00:00:00Z`).getTime() - winStart.getTime())) * 100)))
      : null;

    // ── Teaching footprint (wing-filtered when scoped).
    const [{ data: secs }, { data: subjRows }] = await Promise.all([
      serviceRoleClient.from("class_section")
        .select("id, name, class_teacher_user_id, hifz_teacher_user_id, class:class_id!inner(id, name, org_id, kind)")
        .eq("class.org_id", orgId),
      serviceRoleClient.from("section_subject")
        .select("id, name, class_subject_id, class_section_id, teacher_user_id")
        .eq("org_id", orgId).is("archived_at", null).not("teacher_user_id", "is", null),
    ]);
    const inWingClass = (classId: string | null | undefined) =>
      wing === null || (!!classId && wing.includes(classId));
    const sections = ((secs ?? []) as any[])
      // QA class stays out of the org-wide view; a wing that explicitly
      // contains it (the QA incharge) still sees it.
      .filter((s) => wing !== null || s.class?.name !== "Sandbox")
      .filter((s) => inWingClass(s.class?.id));
    const secById = new Map(sections.map((s) => [s.id, s]));
    const subjects = ((subjRows ?? []) as any[]).filter((ss) => secById.has(ss.class_section_id));

    type Row = {
      userId: string; sections: Set<string>; hifzSections: Set<string>;
      subjects: Set<string>; classSubjects: Set<string>; ownedSections: Set<string>;
    };
    const rows = new Map<string, Row>();
    const rowFor = (uid: string): Row => {
      let r = rows.get(uid);
      if (!r) {
        r = { userId: uid, sections: new Set(), hifzSections: new Set(), subjects: new Set(), classSubjects: new Set(), ownedSections: new Set() };
        rows.set(uid, r);
      }
      return r;
    };
    for (const s of sections) {
      if (s.class_teacher_user_id) {
        const r = rowFor(s.class_teacher_user_id);
        r.sections.add(s.id); r.ownedSections.add(s.id);
        if (s.class?.kind === "hifz") r.hifzSections.add(s.id);
      }
      if (s.hifz_teacher_user_id) {
        const r = rowFor(s.hifz_teacher_user_id);
        r.sections.add(s.id); r.hifzSections.add(s.id);
      }
    }
    for (const ss of subjects) {
      const r = rowFor(ss.teacher_user_id);
      r.sections.add(ss.class_section_id);
      r.subjects.add(ss.name);
      r.classSubjects.add(ss.class_subject_id);
    }
    if (rows.size === 0) return c.json({ term: null, rows: [] });

    const userIds = Array.from(rows.keys());

    // Curriculum pace per class_subject (term-aware topic counting).
    const allCs = Array.from(new Set(subjects.map((ss) => ss.class_subject_id)));
    const paceByCs = new Map<string, { done: number; total: number }>();
    if (allCs.length > 0) {
      const { data: curricula } = await serviceRoleClient
        .from("curriculum").select("id, class_subject_id")
        .in("class_subject_id", allCs).eq("academic_year", "2026-27");
      const curToCs = new Map(((curricula ?? []) as any[]).map((cu) => [cu.id, cu.class_subject_id]));
      if (curToCs.size > 0) {
        const { data: topics } = await serviceRoleClient
          .from("curriculum_topic")
          .select("curriculum_id, completed, academic_term_id")
          .in("curriculum_id", Array.from(curToCs.keys()))
          .limit(20000);
        for (const t of (topics ?? []) as any[]) {
          if (term && t.academic_term_id && t.academic_term_id !== term.id) continue;
          const cs = curToCs.get(t.curriculum_id);
          if (!cs) continue;
          const agg = paceByCs.get(cs) ?? { done: 0, total: 0 };
          agg.total++; if (t.completed) agg.done++;
          paceByCs.set(cs, agg);
        }
      }
    }

    // Lessons in window by taught_by.
    const { data: lessons } = await serviceRoleClient
      .from("lesson").select("taught_by")
      .eq("org_id", orgId).gte("lesson_date", startStr).lte("lesson_date", endStr)
      .in("taught_by", userIds).limit(10000);
    const lessonsBy = new Map<string, number>();
    for (const l of (lessons ?? []) as any[]) {
      lessonsBy.set(l.taught_by, (lessonsBy.get(l.taught_by) ?? 0) + 1);
    }

    // Gradebook freshness by assignment creator.
    const { data: asgs } = await serviceRoleClient
      .from("assignment").select("id, created_by, due_date")
      .eq("org_id", orgId).in("created_by", userIds)
      .gte("assigned_date", startStr).lte("assigned_date", endStr).limit(5000);
    const dueDone = ((asgs ?? []) as any[]).filter((a) => a.due_date && a.due_date <= endStr);
    const firstGrade = new Map<string, string>();
    if (dueDone.length > 0) {
      const { data: grades } = await serviceRoleClient
        .from("grade").select("assignment_id, created_at")
        .in("assignment_id", dueDone.map((a) => a.id)).limit(50000);
      for (const g of (grades ?? []) as any[]) {
        const cur = firstGrade.get(g.assignment_id);
        if (!cur || g.created_at < cur) firstGrade.set(g.assignment_id, g.created_at);
      }
    }
    const lagsBy = new Map<string, number[]>();
    const ungradedBy = new Map<string, number>();
    for (const a of dueDone) {
      const fg = firstGrade.get(a.id);
      if (!fg) { ungradedBy.set(a.created_by, (ungradedBy.get(a.created_by) ?? 0) + 1); continue; }
      const lag = Math.max(0, Math.round((new Date(fg).getTime() - new Date(`${a.due_date}T00:00:00Z`).getTime()) / DAY));
      const arr = lagsBy.get(a.created_by) ?? [];
      arr.push(lag);
      lagsBy.set(a.created_by, arr);
    }

    // Roll-call days per section + org school days.
    const { data: attRows } = await serviceRoleClient
      .from("school_attendance").select("class_section_id, attendance_date")
      .eq("org_id", orgId).gte("attendance_date", startStr).lte("attendance_date", endStr)
      .limit(100000);
    const schoolDays = new Set<string>();
    const secDays = new Map<string, Set<string>>();
    for (const a of (attRows ?? []) as any[]) {
      schoolDays.add(a.attendance_date);
      const set = secDays.get(a.class_section_id) ?? new Set<string>();
      set.add(a.attendance_date);
      secDays.set(a.class_section_id, set);
    }

    // Behavior notes by recorder.
    const { data: notes } = await serviceRoleClient
      .from("behavior_note").select("recorded_by, kind")
      .in("recorded_by", userIds)
      .gte("created_at", winStart.toISOString()).lte("created_at", winEnd.toISOString())
      .limit(20000);
    const notesBy = new Map<string, { pos: number; con: number }>();
    for (const n of (notes ?? []) as any[]) {
      const agg = notesBy.get(n.recorded_by) ?? { pos: 0, con: 0 };
      if (n.kind === "positive") agg.pos++; else agg.con++;
      notesBy.set(n.recorded_by, agg);
    }

    // Hifz heard-rate per hifz section (distinct students per day).
    const hifzSecIds = sections.filter((s) => s.class?.kind === "hifz").map((s) => s.id);
    const heardBySec = new Map<string, { days: Map<string, Set<string>>; roster: number }>();
    if (hifzSecIds.length > 0) {
      const { data: students } = await serviceRoleClient
        .from("student").select("id, class_section_id")
        .eq("org_id", orgId).in("class_section_id", hifzSecIds).neq("status", "withdrawn");
      const secOf = new Map<string, string>();
      for (const st of (students ?? []) as any[]) {
        secOf.set(st.id, st.class_section_id);
        const agg = heardBySec.get(st.class_section_id) ?? { days: new Map(), roster: 0 };
        agg.roster++;
        heardBySec.set(st.class_section_id, agg);
      }
      const ids = Array.from(secOf.keys());
      const { data: heard } = ids.length
        ? await serviceRoleClient.from("hifz_progress")
            .select("student_id, recorded_at").in("student_id", ids)
            .gte("recorded_at", winStart.toISOString()).lte("recorded_at", winEnd.toISOString())
            .limit(100000)
        : { data: [] };
      for (const h of (heard ?? []) as any[]) {
        const sec = secOf.get(h.student_id);
        if (!sec) continue;
        const d = new Date(new Date(h.recorded_at).getTime() + 5 * 3600e3).toISOString().slice(0, 10);
        const agg = heardBySec.get(sec)!;
        const set = agg.days.get(d) ?? new Set<string>();
        set.add(h.student_id);
        agg.days.set(d, set);
      }
    }

    // Ramp: first active grant per user.
    const { data: grants } = await serviceRoleClient
      .from("user_roles").select("user_id, granted_at")
      .in("user_id", userIds).is("revoked_at", null).order("granted_at");
    const firstGrant = new Map<string, string>();
    for (const g of (grants ?? []) as any[]) {
      if (!firstGrant.has(g.user_id)) firstGrant.set(g.user_id, g.granted_at);
    }

    // ── Assemble one row per teacher.
    const out: any[] = [];
    for (const [uid, r] of rows) {
      let name = "Teacher";
      try {
        const { data: u } = await serviceRoleClient.auth.admin.getUserById(uid);
        name = u?.user?.user_metadata?.name || u?.user?.email || "Teacher";
      } catch { /* keep fallback */ }
      let paceDelta: number | null = null;
      if (termElapsedPct != null && r.classSubjects.size > 0) {
        const deltas: number[] = [];
        for (const cs of r.classSubjects) {
          const agg = paceByCs.get(cs);
          if (!agg || agg.total === 0) continue;
          deltas.push(Math.round((agg.done / agg.total) * 100) - termElapsedPct);
        }
        if (deltas.length) paceDelta = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
      }
      // Roll-call: judged by their most-marked owned section.
      let rollCall: { marked: number; schoolDays: number } | null = null;
      if (r.ownedSections.size > 0 && schoolDays.size > 0) {
        let best = 0;
        for (const sid of r.ownedSections) best = Math.max(best, secDays.get(sid)?.size ?? 0);
        rollCall = { marked: best, schoolDays: schoolDays.size };
      }
      let heardRatePct: number | null = null;
      if (r.hifzSections.size > 0) {
        let sum = 0, cnt = 0;
        for (const sid of r.hifzSections) {
          const agg = heardBySec.get(sid);
          if (!agg || agg.roster === 0 || agg.days.size === 0) continue;
          const avg = Array.from(agg.days.values()).reduce((acc, s) => acc + s.size, 0) / agg.days.size;
          sum += (avg / agg.roster) * 100; cnt++;
        }
        if (cnt) heardRatePct = Math.round(sum / cnt);
      }
      const fg = firstGrant.get(uid);
      const rampUntil = fg ? new Date(new Date(fg).getTime() + 42 * DAY) : null;
      out.push({
        userId: uid,
        name,
        sectionCount: r.sections.size,
        subjectCount: r.subjects.size,
        isHifz: r.hifzSections.size > 0,
        paceDeltaPp: paceDelta,
        lessons: lessonsBy.get(uid) ?? 0,
        lessonsPerWeek: Math.round(((lessonsBy.get(uid) ?? 0) / weeksElapsed) * 10) / 10,
        freshnessDays: median(lagsBy.get(uid) ?? []),
        ungradedPastDue: ungradedBy.get(uid) ?? 0,
        rollCall,
        heardRatePct,
        notes: notesBy.get(uid) ?? { pos: 0, con: 0 },
        inRamp: !!rampUntil && today < rampUntil,
      });
    }
    // Most-behind first; rows with no pace data sink below scored rows.
    out.sort((a, b) => (a.paceDeltaPp ?? 999) - (b.paceDeltaPp ?? 999) || a.name.localeCompare(b.name));

    return c.json({
      term: term ? { id: term.id, name: term.name } : null,
      terms: (terms ?? []).map((t: any) => ({ id: t.id, name: t.name, isCurrent: !!t.is_current })),
      window: { start: startStr, end: endStr },
      expectedPct: termElapsedPct,
      wingScoped: wing !== null,
      rows: out,
    });
  });
}
