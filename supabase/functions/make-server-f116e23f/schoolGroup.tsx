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

async function isAdminOrPrincipalOrg(userId: string, orgId: string): Promise<boolean> {
  // Direct org-level admin/principal.
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  if ((data ?? []).some((r: any) => r.role_type === "principal" || r.role_type === "admin")) return true;
  // Group-scoped role on this org's group counts (Phase 4).
  const { data: org } = await serviceRoleClient
    .from("organizations")
    .select("school_group_id")
    .eq("id", orgId)
    .maybeSingle();
  const groupId = (org as any)?.school_group_id;
  if (!groupId) return false;
  const { data: g } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "school_group")
    .eq("scope_id", groupId)
    .in("role_type", ["principal", "admin"])
    .is("revoked_at", null)
    .limit(1);
  return !!(g && g.length > 0);
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
  // ─── POST /school/parents/:parentId/canonical ─────────────────────
  // Mark `parentId` as an alias of `canonicalParentId`. After this, any
  // PIN login as either row sees children from both (via
  // resolveAccessibleStudents walking the alias graph).
  //
  // Both parent rows must be in the same school_group. Caller must hold
  // admin/principal at one of the two orgs (or via group role).
  school.post("/parents/:parentId/canonical", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const aliasId = c.req.param("parentId");
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const canonicalId = typeof body?.canonicalParentId === "string" ? body.canonicalParentId : "";
    if (!canonicalId) return c.json({ error: "canonicalParentId required" }, 400);
    if (canonicalId === aliasId) return c.json({ error: "cannot alias a row to itself" }, 400);

    const { data: rows } = await serviceRoleClient
      .from("parent")
      .select("id, org_id, school_group_id, canonical_id, full_name")
      .in("id", [aliasId, canonicalId]);
    const alias = (rows ?? []).find((r: any) => r.id === aliasId);
    const canonical = (rows ?? []).find((r: any) => r.id === canonicalId);
    if (!alias || !canonical) return c.json({ error: "parent not found" }, 404);
    if ((canonical as any).canonical_id) {
      return c.json({
        error: "canonical target is itself an alias — link to its root instead",
      }, 400);
    }

    // Same school_group required so the alias chain stays inside the chain.
    const { data: orgs } = await serviceRoleClient
      .from("organizations")
      .select("id, school_group_id")
      .in("id", [(alias as any).org_id, (canonical as any).org_id]);
    const groupOf = new Map<string, string | null>();
    for (const o of (orgs ?? []) as any[]) groupOf.set(o.id, o.school_group_id ?? null);
    const aliasGroup = groupOf.get((alias as any).org_id);
    const canonicalGroup = groupOf.get((canonical as any).org_id);
    if (!aliasGroup || aliasGroup !== canonicalGroup) {
      return c.json({ error: "orgs are not in the same school group" }, 400);
    }

    // Permission: admin/principal at either org.
    const canAlias = await isAdminOrPrincipalOrg(userId, (alias as any).org_id);
    const canCanonical = await isAdminOrPrincipalOrg(userId, (canonical as any).org_id);
    if (!canAlias && !canCanonical) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: updErr } = await serviceRoleClient
      .from("parent")
      .update({ canonical_id: canonicalId })
      .eq("id", aliasId);
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({
      ok: true,
      alias: { id: aliasId, name: (alias as any).full_name },
      canonical: { id: canonicalId, name: (canonical as any).full_name },
    });
  });

  // ─── DELETE /school/parents/:parentId/canonical ───────────────────
  // Break the alias link; the row reverts to being its own canonical.
  school.delete("/parents/:parentId/canonical", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const aliasId = c.req.param("parentId");
    const { data: row } = await serviceRoleClient
      .from("parent")
      .select("org_id, canonical_id")
      .eq("id", aliasId)
      .maybeSingle();
    if (!row) return c.json({ error: "parent not found" }, 404);
    if (!(row as any).canonical_id) {
      return c.json({ ok: true, note: "row was already canonical" });
    }
    if (!(await isAdminOrPrincipalOrg(userId, (row as any).org_id))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("parent")
      .update({ canonical_id: null })
      .eq("id", aliasId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── POST /school/students/:studentId/transfer ─────────────────────
  // Move a student between two campuses in the same school_group.
  // Body: { toOrgId, toSectionId, reason? }
  // Caller must be admin/principal in BOTH the source and target org
  // (either via direct role or a group-scoped role).
  school.post("/students/:studentId/transfer", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const studentId = c.req.param("studentId");
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const toOrgId = typeof body?.toOrgId === "string" ? body.toOrgId : "";
    const toSectionId = typeof body?.toSectionId === "string" ? body.toSectionId : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;
    if (!toOrgId || !toSectionId) {
      return c.json({ error: "toOrgId and toSectionId required" }, 400);
    }

    // Load student + current org.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, org_id, class_section_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    const fromOrgId = (stu as any).org_id as string;
    if (fromOrgId === toOrgId) {
      return c.json({ error: "student already at target campus" }, 400);
    }

    // Both orgs must be in the same school_group.
    const { data: orgs } = await serviceRoleClient
      .from("organizations")
      .select("id, school_group_id")
      .in("id", [fromOrgId, toOrgId]);
    const fromOrg = (orgs ?? []).find((o: any) => o.id === fromOrgId);
    const toOrg = (orgs ?? []).find((o: any) => o.id === toOrgId);
    if (!fromOrg || !toOrg) return c.json({ error: "org not found" }, 404);
    if (!(fromOrg as any).school_group_id ||
        (fromOrg as any).school_group_id !== (toOrg as any).school_group_id) {
      return c.json({ error: "orgs are not in the same school group" }, 400);
    }
    const groupId = (fromOrg as any).school_group_id as string;

    // Caller must have admin/principal in both.
    if (!(await isAdminOrPrincipalOrg(userId, fromOrgId))) {
      return c.json({ error: "forbidden at source campus" }, 403);
    }
    if (!(await isAdminOrPrincipalOrg(userId, toOrgId))) {
      return c.json({ error: "forbidden at target campus" }, 403);
    }

    // Target section must belong to the target org.
    const { data: sec } = await serviceRoleClient
      .from("class_section")
      .select("id, class:class_id(org_id)")
      .eq("id", toSectionId)
      .maybeSingle();
    if (!sec || (sec as any).class?.org_id !== toOrgId) {
      return c.json({ error: "target section not in target org" }, 400);
    }

    // Hard move: update student row.
    const nowIso = new Date().toISOString();
    const { error: updErr } = await serviceRoleClient
      .from("student")
      .update({
        org_id: toOrgId,
        class_section_id: toSectionId,
        updated_at: nowIso,
      })
      .eq("id", studentId);
    if (updErr) return c.json({ error: updErr.message }, 500);

    const { data: ins, error: auditErr } = await serviceRoleClient
      .from("student_transfer")
      .insert({
        student_id: studentId,
        school_group_id: groupId,
        from_org_id: fromOrgId,
        to_org_id: toOrgId,
        from_section_id: (stu as any).class_section_id ?? null,
        to_section_id: toSectionId,
        reason,
        executed_by: userId,
      })
      .select("id, executed_at")
      .single();
    if (auditErr) {
      // Move already happened; surface as a soft warning rather than failure.
      return c.json({
        ok: true,
        warning: `transfer succeeded but audit insert failed: ${auditErr.message}`,
      });
    }
    return c.json({
      ok: true,
      transferId: (ins as any).id,
      executedAt: (ins as any).executed_at,
    });
  });

  // ─── GET /school/students/:studentId/transfers ─────────────────────
  // Audit trail for one student. Returns ordered list newest-first.
  school.get("/students/:studentId/transfers", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const studentId = c.req.param("studentId");
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    if (!(await isAdminOrPrincipalOrg(userId, (stu as any).org_id))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data } = await serviceRoleClient
      .from("student_transfer")
      .select(
        "id, executed_at, reason, from_org_id, to_org_id, from_section_id, to_section_id, " +
          "from_org:from_org_id(name, slug), to_org:to_org_id(name, slug)",
      )
      .eq("student_id", studentId)
      .order("executed_at", { ascending: false });
    return c.json({
      transfers: (data ?? []).map((r: any) => ({
        id: r.id,
        executedAt: r.executed_at,
        reason: r.reason,
        fromOrg: { id: r.from_org_id, name: r.from_org?.name ?? null, slug: r.from_org?.slug ?? null },
        toOrg: { id: r.to_org_id, name: r.to_org?.name ?? null, slug: r.to_org?.slug ?? null },
        fromSectionId: r.from_section_id,
        toSectionId: r.to_section_id,
      })),
    });
  });

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
