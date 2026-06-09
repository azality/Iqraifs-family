// =============================================================================
// School module — Office staff dashboard data (Phase 6c).
//
// The office staff role spends the day:
//   - Approving / rejecting roster change requests teachers file
//   - Chasing missing parent contacts before a child can be linked
//   - Following up on sections that haven't marked attendance
//   - Sending out invite codes / chasing parents who haven't claimed
//
// This endpoint surfaces all of that on a single OfficeStaffHome page so
// they don't have to navigate three sub-tools.
//
//   GET /school/orgs/:orgId/office-snapshot
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

export function installOffice(school: Hono) {
  school.get("/orgs/:orgId/office-snapshot", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    // ────────────────────────────────────────────────────────────────────
    // 1. Pending roster change requests + recent batch.
    // ────────────────────────────────────────────────────────────────────
    const { count: rosterPendingCount } = await serviceRoleClient
      .from("roster_change_request")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending");

    const { data: rosterRecent } = await serviceRoleClient
      .from("roster_change_request")
      .select(
        "id, kind, reason, created_at, class_section:class_section_id(name, class:class_id(name))",
      )
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);

    const rosterRequests = (rosterRecent ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind as string,
      reason: r.reason as string | null,
      createdAt: r.created_at as string,
      className: r.class_section?.class?.name ?? null,
      sectionName: r.class_section?.name ?? null,
    }));

    // ────────────────────────────────────────────────────────────────────
    // 2. Students missing parent contacts. We define "missing" as no
    //    student_parent row at all. Some schools tolerate one parent on
    //    file, others want both — we surface zero-parent rows here.
    // ────────────────────────────────────────────────────────────────────
    // Pull all org students, then subtract those with at least one parent.
    const { data: allStudents } = await serviceRoleClient
      .from("student")
      .select(
        "id, full_name, gr_number, class_section:class_section_id(name, class:class_id(name))",
      )
      .eq("org_id", orgId);
    const studentIds = (allStudents ?? []).map((s: any) => s.id);
    const linkedIds = new Set<string>();
    if (studentIds.length > 0) {
      // chunk for safety on huge orgs
      const chunkSize = 500;
      for (let i = 0; i < studentIds.length; i += chunkSize) {
        const chunk = studentIds.slice(i, i + chunkSize);
        const { data: links } = await serviceRoleClient
          .from("student_parent")
          .select("student_id")
          .in("student_id", chunk);
        for (const l of (links ?? []) as any[]) linkedIds.add(l.student_id);
      }
    }
    const missing = (allStudents ?? []).filter(
      (s: any) => !linkedIds.has(s.id),
    );
    const missingParents = {
      count: missing.length,
      recent: missing.slice(0, 8).map((s: any) => ({
        studentId: s.id,
        fullName: s.full_name,
        grNumber: s.gr_number,
        className: s.class_section?.class?.name ?? null,
        sectionName: s.class_section?.name ?? null,
      })),
    };

    // ────────────────────────────────────────────────────────────────────
    // 3. Attendance gaps today — sections that haven't recorded any
    //    attendance row for today's date.
    // ────────────────────────────────────────────────────────────────────
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: allSections } = await serviceRoleClient
      .from("class_section")
      .select("id, name, class:class_id(name, org_id)")
      .eq("class.org_id", orgId);
    const orgSections = (allSections ?? []).filter(
      (s: any) => s.class?.org_id === orgId,
    );
    const sectionIdsForToday = orgSections.map((s: any) => s.id);
    const sectionsMarkedToday = new Set<string>();
    if (sectionIdsForToday.length > 0) {
      const { data: attRows } = await serviceRoleClient
        .from("school_attendance")
        .select("class_section_id")
        .eq("attendance_date", todayIso)
        .in("class_section_id", sectionIdsForToday);
      for (const r of (attRows ?? []) as any[]) {
        sectionsMarkedToday.add(r.class_section_id);
      }
    }
    const attendanceGaps = orgSections
      .filter((s: any) => !sectionsMarkedToday.has(s.id))
      .map((s: any) => ({
        sectionId: s.id,
        className: s.class?.name ?? null,
        sectionName: s.name as string,
      }));

    // ────────────────────────────────────────────────────────────────────
    // 4. Pending parent invites (link codes generated, not yet used).
    // ────────────────────────────────────────────────────────────────────
    // Table is `link_code` (phase A migration); open invites have
    // consumed_at IS NULL.
    let pendingInvitesCount = 0;
    try {
      const { count } = await serviceRoleClient
        .from("link_code")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .is("consumed_at", null);
      pendingInvitesCount = count ?? 0;
    } catch (_) {
      /* table missing / different shape — surface zero */
    }

    return c.json({
      rosterRequests: {
        pendingCount: rosterPendingCount ?? 0,
        recent: rosterRequests,
      },
      missingParents,
      attendanceGaps: {
        count: attendanceGaps.length,
        recent: attendanceGaps.slice(0, 8),
      },
      pendingInvitesCount,
      studentCount: studentIds.length,
    });
  });
}
