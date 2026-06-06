// =============================================================================
// School module — Academic aggregates for the principal/admin dashboard.
//
// Phase 6a: surfaces the new Phase 1-4 architecture (subjects, curriculum,
// topic resources, tagged lessons/assignments) on the PerformanceDashboard.
//
//   GET /school/orgs/:orgId/academics
//
// Returns:
//   curriculum: {
//     totalTopics, completedTopics, progressPct
//   }
//   resources: {
//     totalResources, byKind: { pdf, video, worksheet, link, quiz }
//   }
//   hygiene: {
//     untaggedLessonsLast30: number,
//     untaggedAssignmentsLast30: number
//   }
//   subjectsAtRisk: Array<{
//     classSubjectId, className, sectionName, subjectName,
//     gradedCount, avgPct
//   }>
//   topSubjects: same shape but highest avg (the "shining stars")
//
// All queries scoped to orgId. Any non-revoked org-role can read.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

async function hasAnyOrgRole(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export function installAcademics(school: Hono) {
  school.get("/orgs/:orgId/academics", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 1. Curriculum coverage. Sum topic counts across the LATEST curriculum
    //    per (class_subject_id) — older years are excluded so the rollup
    //    reflects "this year's syllabus", not historical totals.
    // ────────────────────────────────────────────────────────────────────────

    // class_subjects in this org
    const { data: classSubjects } = await serviceRoleClient
      .from("class_subject")
      .select("id, name, class:class_id(name)")
      .eq("org_id", orgId)
      .is("archived_at", null);
    const csIds = (classSubjects ?? []).map((r: any) => r.id);

    // All curricula for those class_subjects, newest first → first-seen wins.
    const latestCurriculumByClassSubject = new Map<string, string>();
    if (csIds.length > 0) {
      const { data: curricula } = await serviceRoleClient
        .from("curriculum")
        .select("id, class_subject_id, academic_year")
        .in("class_subject_id", csIds)
        .order("academic_year", { ascending: false });
      for (const r of (curricula ?? []) as any[]) {
        if (!latestCurriculumByClassSubject.has(r.class_subject_id)) {
          latestCurriculumByClassSubject.set(r.class_subject_id, r.id);
        }
      }
    }

    // Bulk topic counts for the latest curricula.
    const latestCurIds = Array.from(latestCurriculumByClassSubject.values());
    let totalTopics = 0;
    let completedTopics = 0;
    if (latestCurIds.length > 0) {
      const { data: topics } = await serviceRoleClient
        .from("curriculum_topic")
        .select("completed")
        .in("curriculum_id", latestCurIds);
      for (const t of (topics ?? []) as any[]) {
        totalTopics += 1;
        if (t.completed) completedTopics += 1;
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2. Topic resources tally + per-kind breakdown.
    // ────────────────────────────────────────────────────────────────────────
    let resources = {
      totalResources: 0,
      byKind: { pdf: 0, video: 0, worksheet: 0, link: 0, quiz: 0 } as Record<
        string,
        number
      >,
    };
    if (latestCurIds.length > 0) {
      // Find the topic IDs first, then count resources scoped to them. Faster
      // than per-resource filter on a different table.
      const { data: topicRows } = await serviceRoleClient
        .from("curriculum_topic")
        .select("id")
        .in("curriculum_id", latestCurIds);
      const topicIds = (topicRows ?? []).map((r: any) => r.id);
      if (topicIds.length > 0) {
        // chunk into batches of 500 to keep the IN list manageable
        const chunkSize = 500;
        for (let i = 0; i < topicIds.length; i += chunkSize) {
          const chunk = topicIds.slice(i, i + chunkSize);
          const { data: res } = await serviceRoleClient
            .from("topic_resource")
            .select("kind")
            .in("curriculum_topic_id", chunk)
            .is("archived_at", null);
          for (const r of (res ?? []) as any[]) {
            resources.totalResources += 1;
            if (r.kind in resources.byKind) {
              resources.byKind[r.kind] += 1;
            }
          }
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. Data-hygiene: untagged lessons / assignments in last 30 days.
    // ────────────────────────────────────────────────────────────────────────
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { count: untaggedLessons } = await serviceRoleClient
      .from("lesson")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("lesson_date", cutoffStr)
      .is("section_subject_id", null);

    const { count: untaggedAssignments } = await serviceRoleClient
      .from("assignment")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("assigned_date", cutoffStr)
      .is("section_subject_id", null);

    // ────────────────────────────────────────────────────────────────────────
    // 4. Subjects at risk / top subjects. Compute weighted average per
    //    (section_subject_id) from grade rows in the last 60 days, then
    //    join up to class/section/subject names. Show 5 lowest and 3 top.
    // ────────────────────────────────────────────────────────────────────────
    const sixtyDayCutoff = new Date();
    sixtyDayCutoff.setUTCDate(sixtyDayCutoff.getUTCDate() - 60);
    const sixtyStr = sixtyDayCutoff.toISOString();

    // Pull recent grades with the assignment context inline so we can
    // bucket by section_subject_id without follow-up round trips.
    const { data: recentGrades } = await serviceRoleClient
      .from("grade")
      .select(
        "score, status, assignment:assignment_id(section_subject_id, max_score, weight, class_section_id, class_section:class_section_id(name, class:class_id(name)), section_subject:section_subject_id(class_subject:class_subject_id(name)))",
      )
      .eq("org_id", orgId)
      .eq("status", "graded")
      .gte("graded_at", sixtyStr)
      .not("score", "is", null);

    type Agg = {
      classSectionId: string;
      sectionSubjectId: string | null;
      className: string;
      sectionName: string;
      subjectName: string;
      gradedCount: number;
      weightedScore: number;
      weightTotal: number;
    };
    const aggBySS = new Map<string, Agg>();
    for (const r of (recentGrades ?? []) as any[]) {
      const a = r.assignment;
      if (!a) continue;
      const ssId = a.section_subject_id ?? `__untagged_${a.class_section_id}__`;
      const max = Number(a.max_score);
      const score = Number(r.score);
      const weight = Number(a.weight ?? 1);
      if (!Number.isFinite(max) || max <= 0) continue;
      const pct = score / max;

      const acc =
        aggBySS.get(ssId) ?? {
          classSectionId: a.class_section_id,
          sectionSubjectId: a.section_subject_id ?? null,
          className: a.class_section?.class?.name ?? "Class",
          sectionName: a.class_section?.name ?? "",
          subjectName:
            a.section_subject?.class_subject?.name ?? "General",
          gradedCount: 0,
          weightedScore: 0,
          weightTotal: 0,
        };
      acc.gradedCount += 1;
      acc.weightedScore += pct * weight;
      acc.weightTotal += weight;
      aggBySS.set(ssId, acc);
    }

    const subjectAggregates = Array.from(aggBySS.values())
      // Require at least 3 graded entries before highlighting — avoids
      // flagging a subject with a single bad quiz.
      .filter((a) => a.gradedCount >= 3 && a.weightTotal > 0)
      .map((a) => ({
        sectionSubjectId: a.sectionSubjectId,
        classSectionId: a.classSectionId,
        className: a.className,
        sectionName: a.sectionName,
        subjectName: a.subjectName,
        gradedCount: a.gradedCount,
        avgPct: Math.round((a.weightedScore / a.weightTotal) * 100),
      }));

    const subjectsAtRisk = [...subjectAggregates]
      .sort((a, b) => a.avgPct - b.avgPct)
      .slice(0, 5);
    const topSubjects = [...subjectAggregates]
      .sort((a, b) => b.avgPct - a.avgPct)
      .slice(0, 3);

    return c.json({
      curriculum: {
        totalTopics,
        completedTopics,
        progressPct:
          totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
        subjectCount: csIds.length,
      },
      resources,
      hygiene: {
        untaggedLessonsLast30: untaggedLessons ?? 0,
        untaggedAssignmentsLast30: untaggedAssignments ?? 0,
      },
      subjectsAtRisk,
      topSubjects,
    });
  });
}
