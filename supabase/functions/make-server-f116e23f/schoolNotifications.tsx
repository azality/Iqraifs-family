// In-app notifications — the bell.
//
// Derived, not queued. Every alert here is computed from data we already
// hold at the moment the bell is opened, so it can never go stale, can
// never be missed because a cron didn't run, and needed no backfill.
// Only read/dismiss state and preferences are stored.
//
// THREE TIERS (the school's own model, agreed Sep 2026):
//
//   mandatory  Tied to accountability — roll call not taken, a hafiz
//              milestone waiting on you. Nobody can switch these off,
//              because switching them off means the job silently
//              doesn't get done.
//   policy     The principal sets the default per role; a person may
//              opt out of the ones the principal leaves unlocked.
//   personal   Purely the individual's choice.
//
// The scarce resource is credibility. A bell showing forty items is a
// bell nobody reads, and then the mandatory ones stop working too — so
// every kind here must have an action or a consequence. Adding one
// should feel expensive.

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import {
  getOrgRoles,
  hasAdminOrPrincipal,
  hasAnyRoleInOrg,
  teacherSectionIds,
} from "./schoolAuth.ts";
import { todayInOrgTz } from "./tz.ts";

type Tier = "mandatory" | "policy" | "personal";

export interface AlertKindDef {
  kind: string;
  tier: Tier;
  label: string;
  /** Plain-language description for the preferences screen. */
  describe: string;
}

/** The registry IS the contract: the preferences screen renders from
 *  this, and anything not listed cannot be produced. */
export const ALERT_KINDS: AlertKindDef[] = [
  {
    kind: "roll_call_missing",
    tier: "mandatory",
    label: "Roll call not taken",
    describe: "One of your sections has no attendance recorded today.",
  },
  {
    kind: "hafiz_confirm_pending",
    tier: "mandatory",
    label: "Hafiz milestone to confirm",
    describe: "A student has covered all 30 juz and is waiting on your confirmation.",
  },
  {
    kind: "parent_inbox_unread",
    tier: "mandatory",
    label: "Unanswered parent message",
    describe: "A parent has written to the school and nobody has replied.",
  },
  {
    kind: "syllabus_untagged",
    tier: "policy",
    label: "Subject with no syllabus",
    describe: "A subject you teach has no topics set for the current term.",
  },
];

const KIND_BY_NAME = new Map(ALERT_KINDS.map((k) => [k.kind, k]));

export interface Alert {
  /** Stable across recomputation — that is what read state is keyed on. */
  key: string;
  kind: string;
  tier: Tier;
  title: string;
  body: string;
  /** Where acting on it happens. */
  href: string | null;
  read: boolean;
}

/** Resolve which optional kinds this person receives: role default set
 *  by the principal, then the person's own override on top. Mandatory
 *  kinds ignore both. */
async function enabledKinds(
  orgId: string,
  userId: string,
  roles: Set<string>,
): Promise<Set<string>> {
  const { data: prefs } = await serviceRoleClient
    .from("notification_pref")
    .select("scope, scope_id, kind, enabled")
    .eq("org_id", orgId);

  const on = new Set<string>();
  for (const k of ALERT_KINDS) {
    // Optional kinds default ON — a school shouldn't have to switch
    // things on to discover them.
    if (k.tier !== "mandatory") on.add(k.kind);
  }
  for (const p of (prefs ?? []) as any[]) {
    const def = KIND_BY_NAME.get(p.kind);
    if (!def || def.tier === "mandatory") continue;
    const applies =
      (p.scope === "role" && roles.has(p.scope_id)) ||
      (p.scope === "user" && p.scope_id === userId);
    if (!applies) continue;
    // A personal row is written after the role row in this loop only by
    // luck, so apply role first then user explicitly.
    if (p.scope === "role" && p.enabled === false) on.delete(p.kind);
    if (p.scope === "role" && p.enabled === true) on.add(p.kind);
  }
  for (const p of (prefs ?? []) as any[]) {
    const def = KIND_BY_NAME.get(p.kind);
    if (!def || def.tier === "mandatory") continue;
    if (p.scope !== "user" || p.scope_id !== userId) continue;
    if (p.enabled) on.add(p.kind); else on.delete(p.kind);
  }
  for (const k of ALERT_KINDS) if (k.tier === "mandatory") on.add(k.kind);
  return on;
}

export function installNotifications(school: Hono): void {
  // -------------------------------------------------------------------------
  // GET /orgs/:orgId/me/notifications
  // The bell. Computes this person's alerts from live data.
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/me/notifications", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);

    const roles = await getOrgRoles(userId, orgId);
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    const allowed = await enabledKinds(orgId, userId, roles as Set<string>);

    const { data: readRows } = await serviceRoleClient
      .from("notification_read")
      .select("alert_key")
      .eq("org_id", orgId)
      .eq("user_id", userId);
    const readKeys = new Set(((readRows ?? []) as any[]).map((r) => r.alert_key));

    // School-day boundary = the org default wall clock, same as every
    // other rollup in the codebase.
    const today = todayInOrgTz();
    const out: Alert[] = [];
    const push = (a: Omit<Alert, "read" | "tier">) => {
      const def = KIND_BY_NAME.get(a.kind);
      if (!def || !allowed.has(a.kind)) return;
      out.push({ ...a, tier: def.tier, read: readKeys.has(a.key) });
    };

    // ── Roll call not taken (teacher, for their own sections) ──────────
    const mySections = await teacherSectionIds(userId, orgId);
    if (mySections.length > 0) {
      const { data: marked } = await serviceRoleClient
        .from("school_attendance")
        .select("class_section_id")
        .eq("org_id", orgId)
        .eq("attendance_date", today)
        .in("class_section_id", mySections);
      const done = new Set(((marked ?? []) as any[]).map((r) => r.class_section_id));
      const missing = mySections.filter((id) => !done.has(id));
      if (missing.length > 0) {
        const { data: secs } = await serviceRoleClient
          .from("class_section")
          .select("id, name, class:class_id(name)")
          .in("id", missing);
        for (const sec of (secs ?? []) as any[]) {
          const label = `${sec.class?.name ?? ""} ${sec.name}`.trim();
          push({
            key: `roll_call_missing:${sec.id}:${today}`,
            kind: "roll_call_missing",
            title: `Roll call not taken — ${label}`,
            body: "Attendance for today hasn't been recorded yet.",
            href: `/school/orgs/${orgId}/sections/${sec.id}/attendance`,
          });
        }
      }
    }

    // ── Hafiz milestone waiting on a person ────────────────────────────
    // Only reaches people who can act on it: the child's own teachers,
    // or an admin.
    {
      let q = serviceRoleClient
        .from("student")
        .select("id, full_name, class_section_id, hifz_coverage_complete_at")
        .eq("org_id", orgId)
        .not("hifz_coverage_complete_at", "is", null)
        .is("hafiz_since", null)
        .limit(50);
      if (!isAdmin) {
        if (mySections.length === 0) q = q.eq("id", "00000000-0000-0000-0000-000000000000");
        else q = q.in("class_section_id", mySections);
      }
      const { data: pending } = await q;
      for (const s of (pending ?? []) as any[]) {
        push({
          key: `hafiz_confirm_pending:${s.id}`,
          kind: "hafiz_confirm_pending",
          title: `${s.full_name} has covered all 30 juz`,
          body: "Confirm the hafiz milestone once you've heard the full recitation.",
          href: s.class_section_id
            ? `/school/orgs/${orgId}/sections/${s.class_section_id}/hifz`
            : null,
        });
      }
    }

    // ── Unanswered parent messages (office / principal) ────────────────
    if (isAdmin || roles.has("office_staff")) {
      // A message from a parent that no staff member has opened yet.
      const { data: threads } = await serviceRoleClient
        .from("parent_message")
        .select("id, thread_id, created_at, sent_by_role, read_at")
        .eq("org_id", orgId)
        .eq("sent_by_role", "parent")
        .is("read_at", null)
        .limit(50);
      const n = (threads ?? []).length;
      if (n > 0) {
        push({
          key: `parent_inbox_unread:${today}:${n}`,
          kind: "parent_inbox_unread",
          title: `${n} unanswered parent message${n === 1 ? "" : "s"}`,
          body: "Parents are waiting for a reply from the school.",
          href: `/school/orgs/${orgId}/admin/inbox`,
        });
      }
    }

    // Unread first, then mandatory before the rest — the bell should open
    // on what actually needs doing.
    const rank = (a: Alert) => (a.read ? 2 : 0) + (a.tier === "mandatory" ? 0 : 1);
    out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));

    return c.json({
      alerts: out,
      unreadCount: out.filter((a) => !a.read).length,
    });
  });

  // -------------------------------------------------------------------------
  // POST /orgs/:orgId/me/notifications/read   { keys: [...] }
  // Marks alerts seen. Idempotent.
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/me/notifications/read", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const keys: string[] = Array.isArray(body?.keys)
      ? body.keys.filter((k: unknown) => typeof k === "string" && k.length <= 200).slice(0, 200)
      : [];
    if (keys.length === 0) return c.json({ error: "keys required" }, 400);

    const { error } = await serviceRoleClient
      .from("notification_read")
      .upsert(
        keys.map((k) => ({ org_id: orgId, user_id: userId, alert_key: k })),
        { onConflict: "org_id,user_id,alert_key" },
      );
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, marked: keys.length });
  });

  // -------------------------------------------------------------------------
  // GET /orgs/:orgId/notification-prefs
  // The registry plus the rows that apply, so one call renders the
  // preferences screen for either scope.
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/notification-prefs", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data: prefs } = await serviceRoleClient
      .from("notification_pref")
      .select("scope, scope_id, kind, enabled")
      .eq("org_id", orgId);
    return c.json({
      kinds: ALERT_KINDS,
      prefs: (prefs ?? []).map((p: any) => ({
        scope: p.scope, scopeId: p.scope_id, kind: p.kind, enabled: p.enabled,
      })),
      canSetRoleDefaults: await hasAdminOrPrincipal(userId, orgId),
    });
  });

  // -------------------------------------------------------------------------
  // PUT /orgs/:orgId/notification-prefs   { scope, scopeId?, kind, enabled }
  //
  // scope 'role' is the principal's default for a role; scope 'user' is
  // a person's own override and may only ever be their own. Mandatory
  // kinds are refused outright rather than silently ignored, so nobody
  // believes they've turned off something they haven't.
  // -------------------------------------------------------------------------
  school.put("/orgs/:orgId/notification-prefs", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }

    const def = KIND_BY_NAME.get(body?.kind);
    if (!def) return c.json({ error: "unknown notification kind" }, 400);
    if (def.tier === "mandatory") {
      return c.json({
        error: `"${def.label}" can't be switched off — it's tied to something you're accountable for`,
      }, 400);
    }
    if (typeof body?.enabled !== "boolean") {
      return c.json({ error: "enabled must be true or false" }, 400);
    }

    const scope = body?.scope === "role" ? "role" : "user";
    if (scope === "role") {
      if (!(await hasAdminOrPrincipal(userId, orgId))) {
        return c.json({ error: "only a principal can set role defaults" }, 403);
      }
      if (typeof body?.scopeId !== "string" || !body.scopeId) {
        return c.json({ error: "scopeId (the role) required" }, 400);
      }
    }
    const scopeId = scope === "role" ? String(body.scopeId) : userId;

    const { error } = await serviceRoleClient
      .from("notification_pref")
      .upsert(
        { org_id: orgId, scope, scope_id: scopeId, kind: def.kind, enabled: body.enabled, updated_at: new Date().toISOString() },
        { onConflict: "org_id,scope,scope_id,kind" },
      );
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}
