// =============================================================================
// School module — Multi-campus (school_group) endpoints (Phase 1).
//
// What's in this PR:
//   - List the orgs belonging to a school_group ("show me my 4 campuses")
//   - Cross-campus snapshot: totals + per-campus breakdown
//   - Read a single school_group + its settings
//
// Auth model (Phase 1):
//   A caller is allowed to query the group if they have admin/principal
//   role in ANY org belonging to the group. Cross-group permissions
//   (scope_type='school_group' in user_roles) are deliberately out of
//   scope here — that's a follow-up that touches the role machinery.
//
// Not in this PR (separate follow-ups):
//   - Transfer-student endpoint (moves a student between sibling orgs)
//   - Shared-parent flow (one PIN works across all orgs in the group)
//   - Group-level role grants
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { todayInOrgTz } from "./tz.ts";

async function callerOrgsInGroup(
  userId: string,
  groupId: string,
): Promise<string[]> {
  // Two paths to access:
  //   1. group-scoped role — admin/principal directly on the school_group.
  //      Grants access to every member org in one row.
  //   2. org-scoped role — admin/principal on at least one member org.
  //      Limited access; only the orgs they hold a role in count.
  // Either path returns the full member-org list (the dashboard shows
  // all campuses regardless of per-org admin coverage; per-campus deep-
  // links re-check org-level access on landing).
  const { data: groupRoles } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "school_group")
    .eq("scope_id", groupId)
    .in("role_type", ["principal", "admin"])
    .is("revoked_at", null)
    .limit(1);
  if (groupRoles && groupRoles.length > 0) {
    const { data: orgs } = await serviceRoleClient
      .from("organizations")
      .select("id")
      .eq("school_group_id", groupId);
    return (orgs ?? []).map((o: any) => o.id);
  }
  // Org-scoped fallback.
  const { data: roleRows } = await serviceRoleClient
    .from("user_roles")
    .select("scope_id, role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .in("role_type", ["principal", "admin"])
    .is("revoked_at", null);
  const candidateOrgIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.scope_id)));
  if (candidateOrgIds.length === 0) return [];
  const { data: orgs } = await serviceRoleClient
    .from("organizations")
    .select("id")
    .in("id", candidateOrgIds)
    .eq("school_group_id", groupId);
  return (orgs ?? []).map((o: any) => o.id);
}

export function installSchoolGroup(school: Hono): void {
  // ─── GET /school/school-groups/:groupId ────────────────────────────
  school.get("/school-groups/:groupId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const groupId = c.req.param("groupId");
    const callerOrgs = await callerOrgsInGroup(userId, groupId);
    if (callerOrgs.length === 0) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: group } = await serviceRoleClient
      .from("school_group")
      .select("id, name, slug, settings, created_at")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) return c.json({ error: "school group not found" }, 404);
    const { data: orgs } = await serviceRoleClient
      .from("organizations")
      .select("id, name, slug, settings")
      .eq("school_group_id", groupId)
      .order("name", { ascending: true });
    return c.json({
      group: {
        id: (group as any).id,
        name: (group as any).name,
        slug: (group as any).slug,
        settings: (group as any).settings ?? {},
        createdAt: (group as any).created_at,
      },
      campuses: (orgs ?? []).map((o: any) => ({
        orgId: o.id,
        name: o.name,
        slug: o.slug,
        themeColor: o.settings?.theme_color ?? null,
      })),
    });
  });

  // ─── GET /school/school-groups/:groupId/snapshot ───────────────────
  // Per-campus active student count + total. Lays the foundation for
  // a chain-wide dashboard; metrics will grow over time (fees, etc).
  school.get("/school-groups/:groupId/snapshot", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const groupId = c.req.param("groupId");
    const callerOrgs = await callerOrgsInGroup(userId, groupId);
    if (callerOrgs.length === 0) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: orgs } = await serviceRoleClient
      .from("organizations")
      .select("id, name")
      .eq("school_group_id", groupId)
      .order("name", { ascending: true });
    const orgIds = (orgs ?? []).map((o: any) => o.id);
    if (orgIds.length === 0) {
      return c.json({ totals: { activeStudents: 0, campuses: 0 }, perCampus: [] });
    }
    // Per-campus metrics (Phase 5). Each campus contributes:
    //   activeStudents — non-archived, status='active' student count
    //   attendancePct  — today's present rate (school-day tz)
    //   feesCollected  — sum(amount_paid) for current period
    //   feesInvoiced   — sum(amount_due) for current period
    //   behavior       — positive vs concern this calendar month
    //
    // One pass per metric keeps the SQL simple; the count is small
    // (Iqra's 4 campuses) so we don't bother batching.
    const today = todayInOrgTz();
    const period = today.slice(0, 7); // YYYY-MM
    const monthStart = `${period}-01T00:00:00Z`;

    type Campus = {
      orgId: string; name: string;
      activeStudents: number;
      attendancePct: number | null;
      feesCollected: number; feesInvoiced: number;
      behavior: { positive: number; concern: number };
    };
    const perCampus: Campus[] = [];

    let chainActive = 0;
    let chainPresent = 0, chainAttRows = 0;
    let chainCollected = 0, chainInvoiced = 0;
    let chainPositive = 0, chainConcern = 0;

    for (const o of orgs ?? []) {
      const orgId = (o as any).id as string;

      // Active students
      const { count: activeCount } = await serviceRoleClient
        .from("student")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "active")
        .is("archived_at", null);
      const activeStudents = activeCount ?? 0;
      chainActive += activeStudents;

      // Attendance today — present / total
      const { data: attRows } = await serviceRoleClient
        .from("school_attendance")
        .select("status")
        .eq("org_id", orgId)
        .eq("attendance_date", today);
      const total = (attRows ?? []).length;
      const present = (attRows ?? []).filter((r: any) => r.status === "present").length;
      const attendancePct = total > 0 ? (present / total) * 100 : null;
      chainPresent += present;
      chainAttRows += total;

      // Fees for current period
      const { data: feeRows } = await serviceRoleClient
        .from("fee_status")
        .select("amount_due, amount_paid")
        .eq("org_id", orgId)
        .eq("period", period);
      let collected = 0, invoiced = 0;
      for (const f of (feeRows ?? []) as any[]) {
        collected += Number(f.amount_paid ?? 0);
        invoiced += Number(f.amount_due ?? 0);
      }
      chainCollected += collected;
      chainInvoiced += invoiced;

      // Behavior this month
      const { data: behRows } = await serviceRoleClient
        .from("behavior_note")
        .select("kind")
        .eq("org_id", orgId)
        .gte("observed_at", monthStart);
      let positive = 0, concern = 0;
      for (const b of (behRows ?? []) as any[]) {
        if (b.kind === "positive") positive++;
        else if (b.kind === "concern") concern++;
      }
      chainPositive += positive;
      chainConcern += concern;

      perCampus.push({
        orgId, name: (o as any).name,
        activeStudents,
        attendancePct,
        feesCollected: collected, feesInvoiced: invoiced,
        behavior: { positive, concern },
      });
    }

    return c.json({
      totals: {
        activeStudents: chainActive,
        campuses: perCampus.length,
        attendancePct: chainAttRows > 0 ? (chainPresent / chainAttRows) * 100 : null,
        feesCollected: chainCollected,
        feesInvoiced: chainInvoiced,
        behavior: { positive: chainPositive, concern: chainConcern },
      },
      period,
      attendanceDate: today,
      perCampus,
    });
  });

  // ─── GET /school/me/school-groups ──────────────────────────────────
  // Lists every school_group the caller has admin/principal on at
  // least one member org. Powers the campus-switcher UI.
  school.get("/me/school-groups", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    // Group-scoped roles count directly.
    const { data: directGroupRoles } = await serviceRoleClient
      .from("user_roles")
      .select("scope_id")
      .eq("user_id", userId)
      .eq("scope_type", "school_group")
      .in("role_type", ["principal", "admin"])
      .is("revoked_at", null);
    const directGroupIds = (directGroupRoles ?? []).map((r: any) => r.scope_id);
    // Plus any group reachable via an org-scoped role.
    const { data: roleRows } = await serviceRoleClient
      .from("user_roles")
      .select("scope_id")
      .eq("user_id", userId)
      .eq("scope_type", "organization")
      .in("role_type", ["principal", "admin"])
      .is("revoked_at", null);
    const orgIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.scope_id)));
    let viaOrgGroupIds: string[] = [];
    if (orgIds.length > 0) {
      const { data: orgs } = await serviceRoleClient
        .from("organizations")
        .select("school_group_id")
        .in("id", orgIds)
        .not("school_group_id", "is", null);
      viaOrgGroupIds = (orgs ?? []).map((o: any) => o.school_group_id).filter(Boolean);
    }
    const groupIds = Array.from(new Set([...directGroupIds, ...viaOrgGroupIds]));
    if (groupIds.length === 0) return c.json({ groups: [] });
    const { data: groups } = await serviceRoleClient
      .from("school_group")
      .select("id, name, slug")
      .in("id", groupIds)
      .order("name", { ascending: true });
    return c.json({
      groups: (groups ?? []).map((g: any) => ({ id: g.id, name: g.name, slug: g.slug })),
    });
  });
}
