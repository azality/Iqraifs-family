// =============================================================================
// School module — Cmd-K global search.
//
//   GET /school/orgs/:orgId/search?q=<query>&limit=20
//
// Searches across:
//   - student (full_name, gr_number)
//   - parent  (full_name, phone, email)
//   - message_thread.subject + thread participants
//
// Returns grouped results with a deep-link path for each row. Any
// staff org-role can search; results aren't further scope-filtered yet
// (a class teacher still sees other sections' students in search; that
// matches the F4-style "I need to look something up across the org"
// expectation). Tighten if a pilot school flags it.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

async function hasAnyOrgRole(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export function installSchoolSearch(school: Hono): void {
  school.get("/orgs/:orgId/search", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) {
      return c.json({ students: [], parents: [], threads: [] });
    }
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 50);
    const ilike = `%${q.replace(/[%_]/g, "\\$&")}%`;

    // ── Students ──
    const { data: students } = await serviceRoleClient
      .from("student")
      .select("id, full_name, gr_number, class_section:class_section_id(name, class:class_id(name))")
      .eq("org_id", orgId)
      .or(`full_name.ilike.${ilike},gr_number.ilike.${ilike}`)
      .limit(limit);

    // ── Parents ──
    const { data: parents } = await serviceRoleClient
      .from("parent")
      .select("id, full_name, phone, email")
      .eq("org_id", orgId)
      .or(`full_name.ilike.${ilike},phone.ilike.${ilike},email.ilike.${ilike}`)
      .limit(limit);

    // For each surfaced parent, fetch their linked students so we can
    // deep-link the result row to "Parent → Hassan Ali".
    const parentIds = (parents ?? []).map((p: any) => p.id);
    const linkedByParent = new Map<string, Array<{ id: string; fullName: string }>>();
    if (parentIds.length > 0) {
      const { data: links } = await serviceRoleClient
        .from("student_parent")
        .select("parent_id, student:student_id(id, full_name)")
        .in("parent_id", parentIds);
      for (const l of (links ?? []) as any[]) {
        const arr = linkedByParent.get(l.parent_id) ?? [];
        if (l.student) arr.push({ id: l.student.id, fullName: l.student.full_name });
        linkedByParent.set(l.parent_id, arr);
      }
    }

    // ── Message threads ──
    const { data: threads } = await serviceRoleClient
      .from("message_thread")
      .select("id, subject, last_message_at, student:student_id(id, full_name)")
      .eq("org_id", orgId)
      .ilike("subject", ilike)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    return c.json({
      query: q,
      students: (students ?? []).map((s: any) => ({
        id: s.id,
        fullName: s.full_name,
        grNumber: s.gr_number,
        className: s.class_section?.class?.name ?? null,
        sectionName: s.class_section?.name ?? null,
        path: `/school/orgs/${orgId}/admin/students/${s.id}`,
      })),
      parents: (parents ?? []).map((p: any) => ({
        id: p.id,
        fullName: p.full_name,
        phone: p.phone,
        email: p.email,
        children: linkedByParent.get(p.id) ?? [],
        path: `/school/orgs/${orgId}/admin/parents/${p.id}`,
      })),
      threads: (threads ?? []).map((t: any) => ({
        id: t.id,
        subject: t.subject,
        studentName: t.student?.full_name ?? null,
        studentId: t.student?.id ?? null,
        lastMessageAt: t.last_message_at,
        path: `/school/orgs/${orgId}/admin/inbox?thread=${t.id}`,
      })),
    });
  });
}
