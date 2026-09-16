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
// Returns grouped results with a deep-link path for each row. Any staff
// org-role can search, but the PRIVATE groups (students, parents, message
// threads) are scoped the same way as GET /students (permissions audit,
// 16 Sep): callers without manage_students or mark_fees_status only see
// students of sections they teach, parents linked to those students, and
// threads about them. Teachers/classes/topics stay org-wide — they're the
// "look something up across the org" part and carry no family data.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAnyRoleInOrg as hasAnyOrgRole, userCanInOrg, teacherSectionIds } from "./schoolAuth.ts";

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

    // null = org-wide; [] / ids = the only sections whose students,
    // parents and threads this caller may see.
    let allowedSections: string[] | null = null;
    if (
      !(await userCanInOrg(userId, orgId, "manage_students")) &&
      !(await userCanInOrg(userId, orgId, "mark_fees_status"))
    ) {
      allowedSections = await teacherSectionIds(userId, orgId);
    }
    const sectionAllowed = (secId: string | null | undefined) =>
      allowedSections === null || (!!secId && allowedSections.includes(secId));

    // ── Students ──
    let students: any[] = [];
    if (allowedSections === null || allowedSections.length > 0) {
      let sq = serviceRoleClient
        .from("student")
        .select("id, full_name, gr_number, class_section_id, class_section:class_section_id(name, class:class_id(name))")
        .eq("org_id", orgId)
        .or(`full_name.ilike.${ilike},gr_number.ilike.${ilike}`);
      if (allowedSections !== null) sq = sq.in("class_section_id", allowedSections);
      students = (await sq.limit(limit)).data ?? [];
    }

    // ── Parents ──
    let parents: any[] = [];
    if (allowedSections === null || allowedSections.length > 0) {
      parents = (await serviceRoleClient
        .from("parent")
        .select("id, full_name, phone, email")
        .eq("org_id", orgId)
        .or(`full_name.ilike.${ilike},phone.ilike.${ilike},email.ilike.${ilike}`)
        .limit(limit)).data ?? [];
    }

    // For each surfaced parent, fetch their linked students so we can
    // deep-link the result row to "Parent → Hassan Ali". Scoped callers
    // only keep parents with at least one child in their sections, and
    // the children list itself is trimmed to those sections.
    const parentIds = (parents ?? []).map((p: any) => p.id);
    const linkedByParent = new Map<string, Array<{ id: string; fullName: string }>>();
    if (parentIds.length > 0) {
      const { data: links } = await serviceRoleClient
        .from("student_parent")
        .select("parent_id, student:student_id(id, full_name, class_section_id)")
        .in("parent_id", parentIds);
      for (const l of (links ?? []) as any[]) {
        if (!l.student || !sectionAllowed(l.student.class_section_id)) continue;
        const arr = linkedByParent.get(l.parent_id) ?? [];
        arr.push({ id: l.student.id, fullName: l.student.full_name });
        linkedByParent.set(l.parent_id, arr);
      }
    }
    if (allowedSections !== null) {
      parents = parents.filter((p: any) => (linkedByParent.get(p.id) ?? []).length > 0);
    }

    // ── Teachers / staff ── org role holders matched on name/email.
    // QA scaffolding accounts (qa-*@azality.com) are excluded.
    const { data: roleRows } = await serviceRoleClient
      .from("user_roles")
      .select("user_id, role_type")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null);
    // Only roles the TeacherDetail page can actually render — routing an
    // admin/principal there produced "Staff member not found" (pilot bug:
    // searching "Ambreen" surfaced the head teacher's ADMIN account).
    const LINKABLE_ROLES = new Set([
      "class_teacher", "visiting_teacher", "teacher", "hifz_teacher",
      "office_staff", "financial_staff",
    ]);
    const roleByUser = new Map<string, string>();
    for (const r of (roleRows ?? []) as any[]) {
      if (!LINKABLE_ROLES.has(r.role_type)) continue;
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

    // ── Message threads ── scoped callers only see threads about a
    // student in their sections (a thread with no student stays private).
    const { data: threadRows } = await serviceRoleClient
      .from("message_thread")
      .select("id, subject, last_message_at, student:student_id(id, full_name, class_section_id)")
      .eq("org_id", orgId)
      .ilike("subject", ilike)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    const threads = ((threadRows ?? []) as any[]).filter(
      (t) => allowedSections === null || (t.student && sectionAllowed(t.student.class_section_id)),
    );

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
        // There is no parent DETAIL page — /admin/parents/:id never
        // existed, so this used to 404 into the router's catch-all,
        // which bounced the user to "/" and could land them in a
        // DIFFERENT org (7 Sep: clicking a parent result put the
        // principal on the demo academy's dashboard). Deep-link to
        // the parents list pre-filtered to this parent instead.
        path: `/school/orgs/${orgId}/admin/parents?q=${encodeURIComponent(p.full_name ?? "")}`,
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
