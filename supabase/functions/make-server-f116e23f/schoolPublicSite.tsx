// =============================================================================
// School module — Public school site (Phase 1).
//
// Turns /:orgSlug into a real school website (rather than just a login page).
// Anyone (no auth) can hit GET /school/public-site/:slug. Writes are gated
// by the manage_public_site permission so the principal can delegate
// content management to specific staff via role_template_override.
//
// Storage: organizations.settings.public_site (JSONB sub-object). No new
// table — the schema is intentionally flexible so future phases can add
// fields without migrations.
//
// Endpoints:
//   GET    /school/public-site/:slug          (PUBLIC — no auth required)
//   PUT    /school/orgs/:orgId/public-site    (manage_public_site)
//
// Phase 1 schema:
//   enabled        boolean — when false, /:orgSlug stays as login page
//   hero_title     string
//   hero_tagline   string
//   hero_image_url string  (Supabase Storage URL or external)
//   about          string  (multi-line)
//   contact_email  string
//   contact_phone  string
//   contact_address string
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { userCanInOrg } from "./schoolAuth.ts";

type PublicSiteSettings = {
  enabled?: boolean;
  hero_title?: string;
  hero_tagline?: string;
  hero_image_url?: string;
  about?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_address?: string;
};

function siteToJson(orgRow: any) {
  const ps: PublicSiteSettings = orgRow?.settings?.public_site ?? {};
  return {
    enabled: !!ps.enabled,
    heroTitle: ps.hero_title ?? null,
    heroTagline: ps.hero_tagline ?? null,
    heroImageUrl: ps.hero_image_url ?? null,
    about: ps.about ?? null,
    contactEmail: ps.contact_email ?? null,
    contactPhone: ps.contact_phone ?? null,
    contactAddress: ps.contact_address ?? null,
    org: {
      id: orgRow.id,
      name: orgRow.name,
      slug: orgRow.slug,
      logoUrl: orgRow.settings?.logo_url ?? null,
      themeColor: orgRow.settings?.theme_color ?? null,
      motto: orgRow.settings?.school_motto ?? null,
    },
  };
}

export function installPublicSite(school: Hono): void {
  // ─── PUBLIC GET ─────────────────────────────────────────────────────
  // No auth required. Returns the site or { enabled: false } if the
  // school hasn't switched it on yet.
  school.get("/public-site/:slug", async (c) => {
    const slug = c.req.param("slug");
    const { data: org } = await serviceRoleClient
      .from("organizations")
      .select("id, name, slug, settings")
      .eq("slug", slug)
      .maybeSingle();
    if (!org) return c.json({ error: "school not found" }, 404);
    return c.json(siteToJson(org));
  });

  // ─── PUT (manage_public_site) ──────────────────────────────────────
  school.put("/orgs/:orgId/public-site", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await userCanInOrg(userId, orgId, "manage_public_site"))) {
      return c.json({ error: "forbidden — needs manage_public_site permission" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }

    // Allow-list of writable fields. Everything else ignored.
    const next: PublicSiteSettings = {};
    if (typeof body?.enabled === "boolean") next.enabled = body.enabled;
    if (typeof body?.heroTitle === "string") next.hero_title = body.heroTitle.trim().slice(0, 120);
    if (typeof body?.heroTagline === "string") next.hero_tagline = body.heroTagline.trim().slice(0, 240);
    if (typeof body?.heroImageUrl === "string") next.hero_image_url = body.heroImageUrl.trim().slice(0, 500);
    if (typeof body?.about === "string") next.about = body.about.trim().slice(0, 4000);
    if (typeof body?.contactEmail === "string") next.contact_email = body.contactEmail.trim().slice(0, 200);
    if (typeof body?.contactPhone === "string") next.contact_phone = body.contactPhone.trim().slice(0, 50);
    if (typeof body?.contactAddress === "string") next.contact_address = body.contactAddress.trim().slice(0, 500);

    // Merge into existing settings.public_site, leaving unrelated
    // settings (logo_url, theme_color, etc.) untouched.
    const { data: cur } = await serviceRoleClient
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    const settings = (cur as any)?.settings ?? {};
    settings.public_site = { ...(settings.public_site ?? {}), ...next };
    const { error } = await serviceRoleClient
      .from("organizations")
      .update({ settings })
      .eq("id", orgId);
    if (error) return c.json({ error: error.message }, 500);

    const { data: updated } = await serviceRoleClient
      .from("organizations")
      .select("id, name, slug, settings")
      .eq("id", orgId)
      .maybeSingle();
    return c.json(siteToJson(updated));
  });
}
