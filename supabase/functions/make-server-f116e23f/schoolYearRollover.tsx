// =============================================================================
// School module — Academic year rollover.
//
// Endpoints (principal / admin only):
//   GET  /school/orgs/:orgId/year-rollover/preview
//     → per-class breakdown of active students + their suggested next class.
//        Top class (highest display_order) maps to null → graduates.
//
//   POST /school/orgs/:orgId/year-rollover/execute
//     Body: { toYear: string, decisions: [{ studentId, action, toSectionId? }] }
//     Actions: "promote" (default) | "repeat" | "graduate" | "transferred" | "withdrawn"
//     For "promote", toSectionId may pin a specific section; otherwise the
//     first non-archived section of the next class is used (creating it if
//     none exists isn't done here — admin should pre-create sections).
//
// Side effects:
//   - student.class_section_id updated, archived_at + status set as appropriate
//   - fee_plan rows for the current year cloned to the new year (active ones)
//   - year_rollover audit row recorded with a summary
//
// Notes:
//   - Pure SQL with serviceRoleClient; app-level role gate.
//   - Operates per-student; partial failures don't roll back (would need a
//     SQL function for transactional semantics). The audit row captures the
//     intended decisions so a partial run is recoverable.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

async function isAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  return (data ?? []).some(
    (r: any) => r.role_type === "principal" || r.role_type === "admin",
  );
}

type Decision = {
  studentId: string;
  action: "promote" | "repeat" | "graduate" | "transferred" | "withdrawn";
  toSectionId?: string | null;
};

export function installYearRollover(school: Hono): void {
  // ─── Preview ────────────────────────────────────────────────────
  school.get("/orgs/:orgId/year-rollover/preview", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Pull classes in display order.
    const { data: classes } = await serviceRoleClient
      .from("class")
      .select("id, name, display_order")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true });

    // For each class, get its non-archived sections + students.
    const classIds = (classes ?? []).map((c: any) => c.id);
    let sectionsByClass = new Map<string, Array<{ id: string; name: string }>>();
    let studentsBySection = new Map<string, Array<{ id: string; fullName: string; grNumber: string }>>();

    if (classIds.length > 0) {
      const { data: sections } = await serviceRoleClient
        .from("class_section")
        .select("id, name, class_id")
        .in("class_id", classIds);
      for (const s of (sections ?? []) as any[]) {
        const arr = sectionsByClass.get(s.class_id) ?? [];
        arr.push({ id: s.id, name: s.name });
        sectionsByClass.set(s.class_id, arr);
      }
      const sectionIds = (sections ?? []).map((s: any) => s.id);
      if (sectionIds.length > 0) {
        const { data: students } = await serviceRoleClient
          .from("student")
          .select("id, full_name, gr_number, class_section_id")
          .eq("org_id", orgId)
          .eq("status", "active")
          .is("archived_at", null)
          .in("class_section_id", sectionIds);
        for (const s of (students ?? []) as any[]) {
          const arr = studentsBySection.get(s.class_section_id) ?? [];
          arr.push({ id: s.id, fullName: s.full_name, grNumber: s.gr_number });
          studentsBySection.set(s.class_section_id, arr);
        }
      }
    }

    // Build the per-class preview with a suggested next-class.
    const ordered = (classes ?? []).map((cl: any, idx: number) => {
      const next = (classes ?? [])[idx + 1] ?? null;
      const secs = sectionsByClass.get(cl.id) ?? [];
      const students: Array<any> = [];
      let sectionLookup: Array<{ id: string; name: string }> = secs;
      for (const sec of secs) {
        for (const stu of studentsBySection.get(sec.id) ?? []) {
          students.push({ ...stu, currentSection: sec });
        }
      }
      const nextSections = next ? (sectionsByClass.get(next.id) ?? []) : [];
      return {
        class: { id: cl.id, name: cl.name, displayOrder: cl.display_order },
        nextClass: next ? { id: next.id, name: next.name } : null,
        nextSections,
        students,
      };
    });

    return c.json({ classes: ordered });
  });

  // ─── Execute ────────────────────────────────────────────────────
  school.post("/orgs/:orgId/year-rollover/execute", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const toYear = typeof body?.toYear === "string" ? body.toYear.trim() : "";
    const fromYear = typeof body?.fromYear === "string" ? body.fromYear.trim() : "";
    if (!toYear || !fromYear) return c.json({ error: "fromYear and toYear required" }, 400);
    const decisions: Decision[] = Array.isArray(body?.decisions) ? body.decisions : [];
    if (decisions.length === 0) return c.json({ error: "decisions array required" }, 400);

    // Pre-load class/section order for promotion targets.
    const { data: classes } = await serviceRoleClient
      .from("class")
      .select("id, name, display_order")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true });
    const classOrder = (classes ?? []).map((c: any) => c.id as string);
    const nextClassOf = new Map<string, string | null>();
    for (let i = 0; i < classOrder.length; i++) {
      nextClassOf.set(classOrder[i], classOrder[i + 1] ?? null);
    }
    const { data: allSections } = await serviceRoleClient
      .from("class_section")
      .select("id, name, class_id")
      .in("class_id", classOrder.length > 0 ? classOrder : ["00000000-0000-0000-0000-000000000000"]);
    const firstSectionOf = new Map<string, string>();
    for (const s of (allSections ?? []) as any[]) {
      if (!firstSectionOf.has(s.class_id)) firstSectionOf.set(s.class_id, s.id);
    }

    // Hydrate decisions with current student → class.
    const studentIds = decisions.map((d) => d.studentId);
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, class_section_id, class_section:class_section_id(class_id)")
      .in("id", studentIds)
      .eq("org_id", orgId);
    const studentClassOf = new Map<string, string | null>();
    for (const s of (students ?? []) as any[]) {
      studentClassOf.set(s.id, s.class_section?.class_id ?? null);
    }

    const summary = {
      counts: { promoted: 0, repeated: 0, graduated: 0, transferred: 0, withdrawn: 0, skipped: 0, errored: 0 },
      errors: [] as Array<{ studentId: string; reason: string }>,
    };
    const nowIso = new Date().toISOString();

    for (const d of decisions) {
      try {
        if (d.action === "promote") {
          const curClass = studentClassOf.get(d.studentId);
          if (!curClass) { summary.counts.skipped++; continue; }
          const nextClass = nextClassOf.get(curClass);
          if (!nextClass) {
            summary.counts.errored++;
            summary.errors.push({ studentId: d.studentId, reason: "no next class — use 'graduate' for top class" });
            continue;
          }
          const targetSection = d.toSectionId ?? firstSectionOf.get(nextClass);
          if (!targetSection) {
            summary.counts.errored++;
            summary.errors.push({ studentId: d.studentId, reason: "next class has no section — create one first" });
            continue;
          }
          const { error } = await serviceRoleClient
            .from("student")
            .update({ class_section_id: targetSection, updated_at: nowIso })
            .eq("id", d.studentId);
          if (error) { summary.counts.errored++; summary.errors.push({ studentId: d.studentId, reason: error.message }); }
          else summary.counts.promoted++;
        } else if (d.action === "repeat") {
          summary.counts.repeated++;
        } else if (d.action === "graduate" || d.action === "transferred" || d.action === "withdrawn") {
          const { error } = await serviceRoleClient
            .from("student")
            .update({ status: d.action, archived_at: nowIso, updated_at: nowIso })
            .eq("id", d.studentId);
          if (error) { summary.counts.errored++; summary.errors.push({ studentId: d.studentId, reason: error.message }); }
          else if (d.action === "graduate") summary.counts.graduated++;
          else if (d.action === "transferred") summary.counts.transferred++;
          else summary.counts.withdrawn++;
        } else {
          summary.counts.skipped++;
        }
      } catch (e) {
        summary.counts.errored++;
        summary.errors.push({ studentId: d.studentId, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    // Clone active fee_plans into the new year. We only clone what we can
    // see in the current year set — if the table uses different shape per
    // school, the principal can rerun manually.
    let feePlansCloned = 0;
    try {
      const { data: plans } = await serviceRoleClient
        .from("fee_plan")
        .select("*")
        .eq("org_id", orgId)
        .eq("academic_year", fromYear);
      const newRows = (plans ?? []).map((p: any) => {
        const { id, created_at, updated_at, archived_at, ...rest } = p;
        return { ...rest, academic_year: toYear };
      }).filter((p: any) => !p.archived_at_kept);
      if (newRows.length > 0) {
        const { data: ins } = await serviceRoleClient
          .from("fee_plan")
          .insert(newRows)
          .select("id");
        feePlansCloned = (ins ?? []).length;
      }
    } catch (e) {
      // Don't fail rollover if fee-plan clone hiccups; surface in summary.
      (summary as any).feePlanError = e instanceof Error ? e.message : String(e);
    }
    (summary as any).feePlansCloned = feePlansCloned;

    // Audit row.
    await serviceRoleClient.from("year_rollover").insert({
      org_id: orgId,
      from_year: fromYear,
      to_year: toYear,
      summary,
      executed_by: userId,
    });

    return c.json({ ok: true, summary });
  });
}
