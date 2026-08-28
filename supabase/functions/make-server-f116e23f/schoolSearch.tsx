// =============================================================================
// School module — Cmd-K global search.
//
//   GET /school/orgs/:orgId/search?q=<query>&limit=20
//
// Searches across:
//   - student (full_name, gr_number)
//   - parent  (full_name, phone, email)
//   - message_thread.subject + thread participants
//   - staff/teachers (name, email — org role holders)
//   - classes/sections (class name → each section, deep-linked)
//   - curriculum topics (name — deep-linked to the class subjects panel)
//
// Returns grouped results with a deep-link path for each row. Any
// staff org-role can search; results aren't further scope-filtered yet
// (a class teacher still sees other sections' students in search; that
// matches the F4-style "I need to look something up across the org"
// expectation). Tighten if a pilot school flags it.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAnyRoleInOrg as hasAnyOrgRole } from "./schoolAuth.ts";

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

    // ── Teachers / staff ── org role holders matched on name/email.
    // QA scaffolding accounts (qa-*@azality.com) are excluded.
    const { data: roleRows } = await serviceRoleClient
      .from("user_roles")
      .select("user_id, role_type")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null);
    const roleByUser = new Map<string, string>();
    for (const r of (roleRows ?? []) as any[]) {
      if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role_type);
    }
    const teachers: any[] = [];
    if (roleByUser.size > 0) {
      const { data: usersPage } = await (serviceRoleClient as any).auth.admin.listUsers({ page: 1, perPage: 500 });
      const qLower = q.toLowerCase();
      for (const u of usersPage?.users ?? []) {
        if (!roleByUser.has(u.id)) continue;
        const email = (u.email ?? "").toLowerCase();
        if (/^qa-.*@azality\.com$/.test(email)) continue;
        const name = u.user_metadata?.name ?? "";
        if (!name.toLowerCase().includes(qLower) && !email.includes(qLower)) continue;
        teachers.push({
          userId: u.id,
          name: name || u.email,
          email: u.email ?? null,
          roleType: roleByUser.get(u.id),
          path: `/school/orgs/${orgId}/admin/teachers/${u.id}`,
        });
        if (teachers.length >= 10) break;
      }
    }

    // ── Classes / sections ── class-name match → one row per section.
    const { data: classHits } = await serviceRoleClient
      .from("class")
      .select("id, name, kind, class_section(id, name, schedule_key)")
      .eq("org_id", orgId)
      .ilike("name", ilike)
      .limit(10);
    const sections: any[] = [];
    for (const cl of (classHits ?? []) as any[]) {
      for (const sec of cl.class_section ?? []) {
        if (sec.schedule_key === "sandbox") continue;
        sections.push({
          sectionId: sec.id,
          label: `${cl.name} · ${sec.name}`,
          kind: cl.kind ?? "academic",
          path: `/school/orgs/${orgId}/sections/${sec.id}`,
        });
        if (sections.length >= 10) break;
      }
      if (sections.length >= 10) break;
    }

    // ── Curriculum topics ── deep-linked to a section's subjects panel
    // (?openSubject expands the matching subject there).
    const { data: topicHits } = await serviceRoleClient
      .from("curriculum_topic")
      .select("id, name, curriculum:curriculum_id(class_subject:class_subject_id(id, name, class:class_id(id, name, org_id)))")
      .ilike("name", ilike)
      .limit(30);
    const topics: any[] = [];
    const sectionOfClass = new Map<string, string>();
    for (const t of (topicHits ?? []) as any[]) {
      const cs = t.curriculum?.class_subject;
      const cl = cs?.class;
      if (!cl || cl.org_id !== orgId || cl.name === "Sandbox") continue;
      let secId = sectionOfClass.get(cl.id);
      if (secId === undefined) {
        const { data: sec } = await serviceRoleClient
          .from("class_section").select("id").eq("class_id", cl.id).limit(1).maybeSingle();
        secId = sec?.id ?? "";
        sectionOfClass.set(cl.id, secId);
      }
      topics.push({
        id: t.id,
        name: t.name,
        subjectName: cs.name,
        className: cl.name,
        path: secId
          ? `/school/orgs/${orgId}/sections/${secId}?openSubject=${cs.id}`
          : `/school/orgs/${orgId}/admin/classes`,
      });
      if (topics.length >= 10) break;
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
      teachers,
      sections,
      topics,
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
