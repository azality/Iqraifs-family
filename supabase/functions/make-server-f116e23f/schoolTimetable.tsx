// School module — Timetable (PR feat/timetable-foundation).
//
// Two tables, paired endpoints:
//
//   timetable_slot   — org-wide recurring period definition
//                      (Mon Period 3, 10:40-11:25, kind=academic)
//   timetable_entry  — fills a slot with a section's subject OR a
//                      Hifz group's block. Polymorphic scope via the
//                      scope_section_id / scope_hifz_group_id XOR.
//
// Endpoints:
//     GET    /school/orgs/:orgId/timetable-slots
//     POST   /school/orgs/:orgId/timetable-slots
//     PATCH  /school/orgs/:orgId/timetable-slots/:slotId
//     DELETE /school/orgs/:orgId/timetable-slots/:slotId    (soft archive)
//
//     GET    /school/orgs/:orgId/sections/:sectionId/timetable
//     GET    /school/orgs/:orgId/hifz-groups/:groupId/timetable
//
//     POST   /school/orgs/:orgId/timetable-entries
//     PATCH  /school/orgs/:orgId/timetable-entries/:entryId
//     DELETE /school/orgs/:orgId/timetable-entries/:entryId
//
// Read endpoints (slot list + weekly views) accept any org role; write
// endpoints require admin/principal. A teacher home / parent portal
// view consume the same weekly endpoints and arrive in a follow-up PR.

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

const SLOT_KINDS = new Set([
  "academic", "break", "prayer", "hifz", "assembly", "other",
]);

// Local copies of role helpers — duplicating these is cheaper than
// pulling them out into a shared module mid-PR. Mirrors the pattern
// used in other schoolPhase* files.
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

function slotToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time,
    kind: r.kind,
    displayOrder: r.display_order,
  };
}

function subToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    entryId: r.entry_id,
    date: r.date,
    substituteTeacherUserId: r.substitute_teacher_user_id,
    reason: r.reason,
    createdAt: r.created_at,
  };
}

function entryToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    slotId: r.slot_id,
    scopeSectionId: r.scope_section_id,
    scopeHifzGroupId: r.scope_hifz_group_id,
    sectionSubjectId: r.section_subject_id,
    teacherUserId: r.teacher_user_id,
    room: r.room,
    notes: r.notes,
  };
}

export function installTimetable(school: Hono): void {
  // ─── Slots ──────────────────────────────────────────────────────────
  school.get("/orgs/:orgId/timetable-slots", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("timetable_slot")
      .select("*")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ slots: (data ?? []).map(slotToJson) });
  });

  school.post("/orgs/:orgId/timetable-slots", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const day = Number(body?.dayOfWeek);
    const start = typeof body?.startTime === "string" ? body.startTime : "";
    const end = typeof body?.endTime === "string" ? body.endTime : "";
    const kind = typeof body?.kind === "string" ? body.kind : "academic";
    if (!name) return c.json({ error: "name required" }, 400);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return c.json({ error: "dayOfWeek must be 1..7 (Mon..Sun)" }, 400);
    }
    if (!/^\d{2}:\d{2}/.test(start) || !/^\d{2}:\d{2}/.test(end)) {
      return c.json({ error: "startTime / endTime must be HH:MM" }, 400);
    }
    if (start >= end) return c.json({ error: "startTime must be before endTime" }, 400);
    if (!SLOT_KINDS.has(kind)) {
      return c.json({ error: `kind must be one of ${Array.from(SLOT_KINDS).join("/")}` }, 400);
    }
    const { data, error } = await serviceRoleClient
      .from("timetable_slot")
      .insert({
        org_id: orgId,
        name,
        day_of_week: day,
        start_time: start,
        end_time: end,
        kind,
        display_order: typeof body?.displayOrder === "number" ? body.displayOrder : 0,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(slotToJson(data), 201);
  });

  school.patch("/orgs/:orgId/timetable-slots/:slotId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const slotId = c.req.param("slotId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { data: existing } = await serviceRoleClient
      .from("timetable_slot").select("org_id").eq("id", slotId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "slot not found" }, 404);
    }
    const patch: Record<string, unknown> = {};
    if (typeof body?.name === "string") patch.name = body.name.trim();
    if (Number.isInteger(body?.dayOfWeek) && body.dayOfWeek >= 1 && body.dayOfWeek <= 7) {
      patch.day_of_week = body.dayOfWeek;
    }
    if (typeof body?.startTime === "string") patch.start_time = body.startTime;
    if (typeof body?.endTime === "string") patch.end_time = body.endTime;
    if (typeof body?.kind === "string" && SLOT_KINDS.has(body.kind)) patch.kind = body.kind;
    if (typeof body?.displayOrder === "number") patch.display_order = body.displayOrder;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("timetable_slot").update(patch).eq("id", slotId).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(slotToJson(data));
  });

  school.delete("/orgs/:orgId/timetable-slots/:slotId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const slotId = c.req.param("slotId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("timetable_slot").select("org_id").eq("id", slotId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "slot not found" }, 404);
    }
    // Soft-archive — keeps any historical entries readable. Entries on
    // archived slots will hide in the read endpoints below.
    const { error } = await serviceRoleClient
      .from("timetable_slot")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", slotId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Entries ────────────────────────────────────────────────────────
  school.post("/orgs/:orgId/timetable-entries", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.slotId) return c.json({ error: "slotId required" }, 400);
    const scopeSection = body?.scopeSectionId ?? null;
    const scopeGroup = body?.scopeHifzGroupId ?? null;
    if ((!scopeSection && !scopeGroup) || (scopeSection && scopeGroup)) {
      return c.json({ error: "exactly one of scopeSectionId / scopeHifzGroupId required" }, 400);
    }
    // Validate scopes belong to the org so we can't paste a foreign id.
    if (scopeSection) {
      const { data: sec } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .eq("id", scopeSection)
        .maybeSingle();
      if (!sec || (sec as any).class?.org_id !== orgId) {
        return c.json({ error: "section not in this org" }, 404);
      }
    }
    if (scopeGroup) {
      const { data: grp } = await serviceRoleClient
        .from("hifz_group").select("org_id").eq("id", scopeGroup).maybeSingle();
      if (!grp || (grp as any).org_id !== orgId) {
        return c.json({ error: "Hifz group not in this org" }, 404);
      }
    }
    const { data: slot } = await serviceRoleClient
      .from("timetable_slot").select("org_id").eq("id", body.slotId).maybeSingle();
    if (!slot || (slot as any).org_id !== orgId) {
      return c.json({ error: "slot not in this org" }, 404);
    }

    const { data, error } = await serviceRoleClient
      .from("timetable_entry")
      .insert({
        org_id: orgId,
        slot_id: body.slotId,
        scope_section_id: scopeSection,
        scope_hifz_group_id: scopeGroup,
        section_subject_id: body?.sectionSubjectId ?? null,
        teacher_user_id: body?.teacherUserId ?? null,
        room: body?.room ?? null,
        notes: body?.notes ?? null,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "this slot already has an entry for that section / group" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json(entryToJson(data), 201);
  });

  school.patch("/orgs/:orgId/timetable-entries/:entryId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const entryId = c.req.param("entryId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { data: existing } = await serviceRoleClient
      .from("timetable_entry").select("org_id").eq("id", entryId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "entry not found" }, 404);
    }
    const patch: Record<string, unknown> = {};
    if ("sectionSubjectId" in (body ?? {})) patch.section_subject_id = body.sectionSubjectId ?? null;
    if ("teacherUserId" in (body ?? {})) patch.teacher_user_id = body.teacherUserId ?? null;
    if ("room" in (body ?? {})) patch.room = body.room ?? null;
    if ("notes" in (body ?? {})) patch.notes = body.notes ?? null;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("timetable_entry").update(patch).eq("id", entryId).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(entryToJson(data));
  });

  school.delete("/orgs/:orgId/timetable-entries/:entryId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const entryId = c.req.param("entryId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("timetable_entry").select("org_id").eq("id", entryId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "entry not found" }, 404);
    }
    const { error } = await serviceRoleClient
      .from("timetable_entry").delete().eq("id", entryId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Weekly views ───────────────────────────────────────────────────
  // Section / group week views return slot rows joined with the entries
  // for the requested scope. Empty cells (slots without an entry) come
  // through with `entry: null` so the UI can render the slot as
  // "free" / "no class".
  async function weeklyView(orgId: string, scope: "section" | "group", scopeId: string) {
    const { data: slots, error: slotErr } = await serviceRoleClient
      .from("timetable_slot")
      .select("*")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (slotErr) throw new Error(slotErr.message);
    let entryQ = serviceRoleClient
      .from("timetable_entry")
      .select(
        "*, section_subject:section_subject_id(class_subject:class_subject_id(name))",
      )
      .eq("org_id", orgId);
    if (scope === "section") entryQ = entryQ.eq("scope_section_id", scopeId);
    else entryQ = entryQ.eq("scope_hifz_group_id", scopeId);
    const { data: entries, error: entryErr } = await entryQ;
    if (entryErr) throw new Error(entryErr.message);
    // Hydrate teacher names — one batch via auth admin.
    const teacherIds = Array.from(
      new Set(((entries ?? []) as any[])
        .map((e) => e.teacher_user_id)
        .filter((x): x is string => !!x)),
    );
    const teacherNames = new Map<string, string>();
    for (const tid of teacherIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) teacherNames.set(tid, name);
      } catch { /* ignore */ }
    }
    const entryBySlot = new Map<string, any>();
    for (const e of (entries ?? []) as any[]) {
      entryBySlot.set(e.slot_id, e);
    }
    const cells = ((slots ?? []) as any[]).map((s) => {
      const e = entryBySlot.get(s.id);
      return {
        slot: slotToJson(s),
        entry: e
          ? {
              ...entryToJson(e),
              subjectName: e.section_subject?.class_subject?.name ?? null,
              teacherName: e.teacher_user_id
                ? teacherNames.get(e.teacher_user_id) ?? null
                : null,
            }
          : null,
      };
    });
    return cells;
  }

  school.get("/orgs/:orgId/sections/:sectionId/timetable", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    try {
      const cells = await weeklyView(orgId, "section", sectionId);
      return c.json({ scope: { kind: "section", id: sectionId }, cells });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  school.get("/orgs/:orgId/hifz-groups/:groupId/timetable", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const groupId = c.req.param("groupId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    try {
      const cells = await weeklyView(orgId, "group", groupId);
      return c.json({ scope: { kind: "hifz_group", id: groupId }, cells });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  // ─── Teacher view ───────────────────────────────────────────────────
  // GET /school/orgs/:orgId/me/timetable?day=N
  // Returns the caller's own entries (slots where teacher_user_id =
  // the JWT subject). Optional day param 1..7 narrows to one day for
  // the "My today's schedule" card; omit for full week.
  school.get("/orgs/:orgId/me/timetable", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const dayQ = c.req.query("day");
    let day: number | null = null;
    if (dayQ !== undefined) {
      const n = Number(dayQ);
      if (!Number.isInteger(n) || n < 1 || n > 7) {
        return c.json({ error: "day must be 1..7" }, 400);
      }
      day = n;
    }

    // Pull the entries first — we only care about slots tied to one of
    // them, so joining on the entry side keeps this cheap.
    const { data: entries, error: entryErr } = await serviceRoleClient
      .from("timetable_entry")
      .select(
        "*, slot:slot_id(*), section_subject:section_subject_id(class_subject:class_subject_id(name)), section:scope_section_id(name, class:class_id(name)), hifz_group:scope_hifz_group_id(name)",
      )
      .eq("org_id", orgId)
      .eq("teacher_user_id", userId);
    if (entryErr) return c.json({ error: entryErr.message }, 500);

    // Substitutions today: caller might be covering (subbing IN) or
    // covered (subbing OUT). Caller passes `date` to anchor to their
    // local day; falls back to server today.
    const dateQ = c.req.query("date");
    const today =
      dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ)
        ? dateQ
        : new Date().toISOString().slice(0, 10);

    // Subbing IN — entries where I'm the substitute for today.
    const { data: subbingIn } = await serviceRoleClient
      .from("timetable_substitution")
      .select(
        "*, entry:entry_id(*, slot:slot_id(*), section_subject:section_subject_id(class_subject:class_subject_id(name)), section:scope_section_id(name, class:class_id(name)), hifz_group:scope_hifz_group_id(name))",
      )
      .eq("org_id", orgId)
      .eq("date", today)
      .eq("substitute_teacher_user_id", userId);

    // Subbing OUT — I'm the original teacher and someone is covering today.
    const myEntryIds = ((entries ?? []) as any[]).map((e) => e.id);
    const { data: subbingOut } = myEntryIds.length
      ? await serviceRoleClient
          .from("timetable_substitution")
          .select("entry_id, substitute_teacher_user_id, reason")
          .eq("date", today)
          .in("entry_id", myEntryIds)
      : { data: [] as any[] };
    const subbingOutByEntry = new Map<string, any>();
    for (const s of (subbingOut ?? []) as any[]) {
      subbingOutByEntry.set(s.entry_id, s);
    }

    // Hydrate names for sub-out entries (the teacher covering me).
    const subTeacherIds = Array.from(
      new Set(
        ((subbingOut ?? []) as any[])
          .map((s) => s.substitute_teacher_user_id)
          .filter((x): x is string => !!x),
      ),
    );
    const subTeacherNames = new Map<string, string>();
    for (const tid of subTeacherIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) subTeacherNames.set(tid, name);
      } catch { /* ignore */ }
    }
    // And original-teacher names for entries I'm covering today.
    const origIds = Array.from(
      new Set(
        ((subbingIn ?? []) as any[])
          .map((s) => s.entry?.teacher_user_id)
          .filter((x): x is string => !!x),
      ),
    );
    const origNames = new Map<string, string>();
    for (const tid of origIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) origNames.set(tid, name);
      } catch { /* ignore */ }
    }

    // Build a synthetic row for each entry I'm subbing IN to.
    const subbedInRows = ((subbingIn ?? []) as any[])
      .filter((s) => s.entry && s.entry.slot && !s.entry.slot.archived_at)
      .map((s) => ({
        ...s.entry,
        __sub_in: {
          reason: s.reason,
          originalTeacherName:
            s.entry.teacher_user_id ? origNames.get(s.entry.teacher_user_id) ?? null : null,
        },
      }));

    let rows = [
      ...((entries ?? []) as any[]).filter((r) => r.slot && !r.slot.archived_at),
      ...subbedInRows,
    ];
    if (day !== null) rows = rows.filter((r) => r.slot.day_of_week === day);

    // Sort by (day, start_time). The slot is embedded so we sort
    // client-side; faster than a SQL join+order with PostgREST quirks.
    rows.sort((a, b) =>
      a.slot.day_of_week - b.slot.day_of_week ||
      a.slot.start_time.localeCompare(b.slot.start_time),
    );

    const cells = rows.map((r) => {
      const sIn = r.__sub_in;
      const sOut = sIn ? null : subbingOutByEntry.get(r.id);
      return {
        slot: slotToJson(r.slot),
        entry: {
          ...entryToJson(r),
          subjectName: r.section_subject?.class_subject?.name ?? null,
          teacherName: null, // it's the caller — UI knows
        },
        scopeLabel:
          r.section
            ? `${r.section.class?.name ?? "Class"} — ${r.section.name}`
            : r.hifz_group?.name ?? "—",
        // PR feat/timetable-substitutions — UI badges drive off these.
        substitution: sIn
          ? { role: "covering", originalTeacherName: sIn.originalTeacherName, reason: sIn.reason }
          : sOut
          ? {
              role: "covered",
              substituteTeacherName:
                subTeacherNames.get(sOut.substitute_teacher_user_id) ?? null,
              reason: sOut.reason,
            }
          : null,
      };
    });
    return c.json({ cells });
  });

  // ─── Teacher's entries (admin-only helper for sub picker) ───────────
  // GET /school/orgs/:orgId/teachers/:teacherId/entries
  school.get("/orgs/:orgId/teachers/:teacherId/entries", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const teacherId = c.req.param("teacherId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("timetable_entry")
      .select(
        "*, slot:slot_id(*), section_subject:section_subject_id(class_subject:class_subject_id(name)), section:scope_section_id(name, class:class_id(name)), hifz_group:scope_hifz_group_id(name)",
      )
      .eq("org_id", orgId)
      .eq("teacher_user_id", teacherId);
    if (error) return c.json({ error: error.message }, 500);

    const rows = ((data ?? []) as any[])
      .filter((r) => r.slot && !r.slot.archived_at)
      .sort(
        (a, b) =>
          a.slot.day_of_week - b.slot.day_of_week ||
          a.slot.start_time.localeCompare(b.slot.start_time),
      )
      .map((r) => ({
        id: r.id,
        slot: slotToJson(r.slot),
        subjectName: r.section_subject?.class_subject?.name ?? null,
        scopeLabel: r.section
          ? `${r.section.class?.name ?? "Class"} — ${r.section.name}`
          : r.hifz_group?.name ?? "—",
      }));
    return c.json({ entries: rows });
  });

  // ─── Substitutions CRUD ─────────────────────────────────────────────
  // Listing for the admin/principal substitution panel — defaults to
  // today, optional ?date=YYYY-MM-DD or ?from/?to range.
  school.get("/orgs/:orgId/timetable/substitutions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const date = c.req.query("date");
    const from = c.req.query("from");
    const to = c.req.query("to");
    let q = serviceRoleClient
      .from("timetable_substitution")
      .select(
        "*, entry:entry_id(*, slot:slot_id(*), section:scope_section_id(name, class:class_id(name)), hifz_group:scope_hifz_group_id(name), section_subject:section_subject_id(class_subject:class_subject_id(name)))",
      )
      .eq("org_id", orgId)
      .order("date", { ascending: true });
    if (date) q = q.eq("date", date);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    // Hydrate substitute teacher names.
    const tids = Array.from(
      new Set(
        ((data ?? []) as any[])
          .map((s) => s.substitute_teacher_user_id)
          .filter((x): x is string => !!x),
      ),
    );
    const names = new Map<string, string>();
    for (const tid of tids) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) names.set(tid, name);
      } catch { /* ignore */ }
    }
    // Original teacher names too.
    const otids = Array.from(
      new Set(
        ((data ?? []) as any[])
          .map((s) => s.entry?.teacher_user_id)
          .filter((x): x is string => !!x),
      ),
    );
    for (const tid of otids) {
      if (names.has(tid)) continue;
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) names.set(tid, name);
      } catch { /* ignore */ }
    }

    const subs = ((data ?? []) as any[]).map((s) => ({
      ...subToJson(s),
      substituteTeacherName: names.get(s.substitute_teacher_user_id) ?? null,
      entry: s.entry
        ? {
            id: s.entry.id,
            slot: s.entry.slot ? slotToJson(s.entry.slot) : null,
            subjectName: s.entry.section_subject?.class_subject?.name ?? null,
            originalTeacherUserId: s.entry.teacher_user_id ?? null,
            originalTeacherName:
              s.entry.teacher_user_id ? names.get(s.entry.teacher_user_id) ?? null : null,
            scopeLabel: s.entry.section
              ? `${s.entry.section.class?.name ?? "Class"} — ${s.entry.section.name}`
              : s.entry.hifz_group?.name ?? "—",
          }
        : null,
    }));
    return c.json({ substitutions: subs });
  });

  // Create. Admin/principal only — a teacher reporting their own sick
  // day shouldn't be self-serve here without a workflow we don't have yet.
  school.post("/orgs/:orgId/timetable/substitutions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const entry_id = String(body.entryId ?? "");
    const date = String(body.date ?? "");
    const sub_id = String(body.substituteTeacherUserId ?? "");
    const reason = body.reason ? String(body.reason).slice(0, 500) : null;
    if (!entry_id || !sub_id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "entryId, date (YYYY-MM-DD), substituteTeacherUserId required" }, 400);
    }
    // Verify the entry belongs to this org.
    const { data: ent } = await serviceRoleClient
      .from("timetable_entry")
      .select("id, org_id, teacher_user_id")
      .eq("id", entry_id)
      .maybeSingle();
    if (!ent || (ent as any).org_id !== orgId) {
      return c.json({ error: "entry not found in this org" }, 404);
    }
    // Substitute must be a member of this org (any role).
    if (!(await hasAnyOrgRole(sub_id, orgId))) {
      return c.json({ error: "substitute is not a member of this org" }, 400);
    }
    if (sub_id === (ent as any).teacher_user_id) {
      return c.json({ error: "substitute is the same as the original teacher" }, 400);
    }

    const { data, error } = await serviceRoleClient
      .from("timetable_substitution")
      .insert({
        org_id: orgId,
        entry_id,
        date,
        substitute_teacher_user_id: sub_id,
        reason,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) {
      if (String(error.message).includes("duplicate")) {
        return c.json({ error: "a substitution already exists for this slot on this date" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json({ substitution: subToJson(data) });
  });

  school.delete("/orgs/:orgId/timetable/substitutions/:subId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const subId = c.req.param("subId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("timetable_substitution")
      .delete()
      .eq("id", subId)
      .eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}

export default installTimetable;
