// =============================================================================
// School module — Behavior categories (org-configurable, Islamic-context defaults).
//
// Endpoints (all mounted on the school sub-app):
//   GET    /school/orgs/:orgId/behavior-categories
//   POST   /school/orgs/:orgId/behavior-categories
//   PATCH  /school/orgs/:orgId/behavior-categories/:id
//   DELETE /school/orgs/:orgId/behavior-categories/:id   (soft archive)
//
// On first GET for an org with zero rows we lazy-seed a sensible
// Islamic-context default set (adab, akhlaq, salah punctuality, Quran
// etiquette, etc.). The principal can then rename / archive / re-order.
//
// Reads accept any org role (every staff member needs to see the list).
// Writes require principal/admin.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAnyRoleInOrg as hasAnyOrgRole, hasAdminOrPrincipal as isAdminOrPrincipal } from "./schoolAuth.ts";

// Iqra Academy / Hifz-school sensible defaults. Principal may delete or
// rename any of these after the first run.
// points_* are MAGNITUDES set by the school (fairness: the same act earns
// the same points in every classroom). Sign is applied by the note's kind.
const DEFAULTS: { key: string; label: string; kind: "positive" | "concern" | "both"; sort_order: number; points_positive: number; points_concern: number }[] = [
  { key: "adab",              label: "Adab",                   kind: "both",     sort_order: 10, points_positive: 1, points_concern: 1 },
  { key: "akhlaq",            label: "Akhlaq",                 kind: "both",     sort_order: 20, points_positive: 1, points_concern: 1 },
  { key: "salah_punctuality", label: "Salah punctuality",      kind: "both",     sort_order: 30, points_positive: 2, points_concern: 1 },
  { key: "quran_etiquette",   label: "Quran etiquette",        kind: "both",     sort_order: 40, points_positive: 2, points_concern: 1 },
  { key: "helpfulness",       label: "Helpfulness",            kind: "positive", sort_order: 50, points_positive: 1, points_concern: 1 },
  { key: "effort",            label: "Effort",                 kind: "positive", sort_order: 60, points_positive: 2, points_concern: 1 },
  { key: "honesty",           label: "Honesty",                kind: "positive", sort_order: 70, points_positive: 3, points_concern: 1 },
  { key: "leadership",        label: "Leadership",             kind: "positive", sort_order: 80, points_positive: 2, points_concern: 1 },
  { key: "disruption",        label: "Disruption",             kind: "concern",  sort_order: 110, points_positive: 1, points_concern: 1 },
  { key: "late_assignment",   label: "Late assignment",        kind: "concern",  sort_order: 120, points_positive: 1, points_concern: 1 },
  { key: "attendance",        label: "Attendance",             kind: "concern",  sort_order: 130, points_positive: 1, points_concern: 1 },
  { key: "peer_conflict",     label: "Behaviour toward peers", kind: "concern",  sort_order: 140, points_positive: 1, points_concern: 2 },
];

async function seedDefaultsIfEmpty(orgId: string): Promise<void> {
  const { count } = await serviceRoleClient
    .from("behavior_category")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if ((count ?? 0) > 0) return;
  const rows = DEFAULTS.map((d) => ({ ...d, org_id: orgId }));
  // Best-effort: if a race causes a UNIQUE violation, silently swallow —
  // a concurrent first GET in another tab already seeded.
  await serviceRoleClient.from("behavior_category").insert(rows).select();
}

function toJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    key: r.key,
    label: r.label,
    kind: r.kind as "positive" | "concern" | "both",
    sortOrder: r.sort_order,
    pointsPositive: r.points_positive ?? 1,
    pointsConcern: r.points_concern ?? 1,
    archivedAt: r.archived_at,
  };
}

const validMagnitude = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10;

export function installBehaviorCategories(school: Hono): void {
  school.get("/orgs/:orgId/behavior-categories", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    await seedDefaultsIfEmpty(orgId);
    const { data, error } = await serviceRoleClient
      .from("behavior_category")
      .select("*")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ categories: (data ?? []).map(toJson) });
  });

  school.post("/orgs/:orgId/behavior-categories", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    const kind = body?.kind;
    if (!label) return c.json({ error: "label required" }, 400);
    if (!["positive", "concern", "both"].includes(kind)) {
      return c.json({ error: "kind must be positive|concern|both" }, 400);
    }
    const key = typeof body?.key === "string" && body.key.trim()
      ? body.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
      : label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const sort_order = Number.isInteger(body?.sortOrder) ? body.sortOrder : 0;
    const points_positive = validMagnitude(body?.pointsPositive) ? body.pointsPositive : 1;
    const points_concern = validMagnitude(body?.pointsConcern) ? body.pointsConcern : 1;
    const { data, error } = await serviceRoleClient
      .from("behavior_category")
      .insert({ org_id: orgId, key, label, kind, sort_order, points_positive, points_concern })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a category with that key already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json(toJson(data), 201);
  });

  school.patch("/orgs/:orgId/behavior-categories/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("id");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const patch: Record<string, unknown> = {};
    if (typeof body?.label === "string") patch.label = body.label.trim();
    if (["positive", "concern", "both"].includes(body?.kind)) patch.kind = body.kind;
    if (Number.isInteger(body?.sortOrder)) patch.sort_order = body.sortOrder;
    if (validMagnitude(body?.pointsPositive)) patch.points_positive = body.pointsPositive;
    if (validMagnitude(body?.pointsConcern)) patch.points_concern = body.pointsConcern;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("behavior_category")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(toJson(data));
  });

  // "Other" rollup — the school's feedback loop. Teachers who don't find
  // a category type their own; this groups those free-text entries so the
  // admin sees what's missing and can promote recurring ones to the
  // catalog with one click.
  school.get("/orgs/:orgId/behavior-categories/suggestions", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: cats } = await serviceRoleClient
      .from("behavior_category")
      .select("label")
      .eq("org_id", orgId)
      .is("archived_at", null);
    const known = new Set((cats ?? []).map((r: any) => String(r.label).trim().toLowerCase()));
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const { data: notes } = await serviceRoleClient
      .from("behavior_note")
      .select("category, kind, notes, created_at")
      .eq("org_id", orgId)
      .not("category", "is", null)
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);
    const groups = new Map<string, { label: string; count: number; kinds: Set<string>; lastUsed: string; sample: string }>();
    for (const n of (notes ?? []) as any[]) {
      const raw = String(n.category ?? "").trim();
      if (!raw) continue;
      const norm = raw.toLowerCase();
      if (known.has(norm)) continue;
      const g = groups.get(norm) ?? { label: raw, count: 0, kinds: new Set<string>(), lastUsed: n.created_at, sample: String(n.notes ?? "").slice(0, 120) };
      g.count += 1;
      g.kinds.add(n.kind);
      groups.set(norm, g);
    }
    const suggestions = Array.from(groups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)
      .map((g) => ({
        label: g.label,
        count: g.count,
        kinds: Array.from(g.kinds),
        lastUsed: g.lastUsed,
        sampleNote: g.sample,
      }));
    return c.json({ suggestions });
  });

  school.delete("/orgs/:orgId/behavior-categories/:id", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("id");
    if (!(await isAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    // Soft archive — historical behavior_note.category strings still resolve.
    const { error } = await serviceRoleClient
      .from("behavior_category")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}
