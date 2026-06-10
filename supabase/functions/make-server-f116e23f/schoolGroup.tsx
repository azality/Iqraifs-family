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

async function callerOrgsInGroup(
  userId: string,
  groupId: string,
): Promise<string[]> {
  // The orgs the caller has admin/principal on, intersected with the
  // orgs that belong to this group. Returns the list (possibly empty).
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
    // Per-campus active student counts. One COUNT per org keeps it
    // simple and Postgres-cached.
    const perCampus: Array<{ orgId: string; name: string; activeStudents: number }> = [];
    let totalActive = 0;
    for (const o of orgs ?? []) {
      const { count } = await serviceRoleClient
        .from("student")
        .select("id", { count: "exact", head: true })
        .eq("org_id", (o as any).id)
        .eq("status", "active")
        .is("archived_at", null);
      const n = count ?? 0;
      totalActive += n;
      perCampus.push({ orgId: (o as any).id, name: (o as any).name, activeStudents: n });
    }
    return c.json({
      totals: { activeStudents: totalActive, campuses: perCampus.length },
      perCampus,
    });
  });

  // ─── GET /school/me/school-groups ──────────────────────────────────
  // Lists every school_group the caller has admin/principal on at
  // least one member org. Powers the campus-switcher UI.
  school.get("/me/school-groups", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const { data: roleRows } = await serviceRoleClient
      .from("user_roles")
      .select("scope_id")
      .eq("user_id", userId)
      .eq("scope_type", "organization")
      .in("role_type", ["principal", "admin"])
      .is("revoked_at", null);
    const orgIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.scope_id)));
    if (orgIds.length === 0) return c.json({ groups: [] });
    const { data: orgs } = await serviceRoleClient
      .from("organizations")
      .select("school_group_id")
      .in("id", orgIds)
      .not("school_group_id", "is", null);
    const groupIds = Array.from(new Set((orgs ?? []).map((o: any) => o.school_group_id).filter(Boolean)));
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
