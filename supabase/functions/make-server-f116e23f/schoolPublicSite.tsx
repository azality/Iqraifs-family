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
  hero_kicker?: string;
  about?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_address?: string;
  // Phase 3
  highlights?: Array<{ label: string; value: string }>;
  gallery?: Array<{ url: string; caption?: string }>;
  faculty?: Array<{ name: string; role?: string; bio?: string; photoUrl?: string; department?: string }>;
  // Phase 4 (design handoff)
  whatsapp_phone?: string;
  visit_hours?: string;
  ayah_arabic?: string;
  ayah_translation?: string;
  ayah_reference?: string;
  programs?: Array<{ name: string; summary: string; kind?: "primary" | "secondary" }>;
};

function siteToJson(orgRow: any) {
  const ps: PublicSiteSettings = orgRow?.settings?.public_site ?? {};
  // Org-level settings act as the source of truth for contact info.
  // Public-site overrides win if set, but if a principal leaves those
  // fields blank we fall back to the org's contact_email / contact_phone
  // / address from Admin → Settings so they don't have to type the same
  // address twice.
  const orgSettings = orgRow?.settings ?? {};
  return {
    enabled: !!ps.enabled,
    heroTitle: ps.hero_title ?? null,
    heroTagline: ps.hero_tagline ?? null,
    heroImageUrl: ps.hero_image_url ?? null,
    heroKicker: ps.hero_kicker ?? null,
    about: ps.about ?? null,
    contactEmail: ps.contact_email || orgSettings.contact_email || null,
    contactPhone: ps.contact_phone || orgSettings.contact_phone || null,
    contactAddress: ps.contact_address || orgSettings.address || null,
    whatsappPhone: ps.whatsapp_phone ?? null,
    visitHours: ps.visit_hours ?? null,
    ayah: (ps.ayah_arabic || ps.ayah_translation)
      ? {
          arabic: ps.ayah_arabic ?? null,
          translation: ps.ayah_translation ?? null,
          reference: ps.ayah_reference ?? null,
        }
      : null,
    programs: Array.isArray(ps.programs) ? ps.programs : [],
    highlights: Array.isArray(ps.highlights) ? ps.highlights : [],
    gallery: Array.isArray(ps.gallery) ? ps.gallery : [],
    faculty: Array.isArray(ps.faculty) ? ps.faculty : [],
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
    const orgId = (org as any).id as string;

    // ── Phase 2 live data ───────────────────────────────────────────
    // 1. School timings — derive from active timetable_slot rows.
    //    First academic-kind slot's start, last slot's end, day mask.
    const { data: slots } = await serviceRoleClient
      .from("timetable_slot")
      .select("start_time, end_time, day_of_week, kind")
      .eq("org_id", orgId)
      .is("archived_at", null);
    let timings: { firstStart: string | null; lastEnd: string | null; daysOfWeek: number[] } = {
      firstStart: null, lastEnd: null, daysOfWeek: [],
    };
    if (slots && slots.length > 0) {
      const days = new Set<number>();
      let minStart = "99:99";
      let maxEnd = "00:00";
      for (const s of slots as any[]) {
        days.add(s.day_of_week);
        if (s.start_time && s.start_time < minStart) minStart = s.start_time;
        if (s.end_time && s.end_time > maxEnd) maxEnd = s.end_time;
      }
      timings = {
        firstStart: minStart === "99:99" ? null : minStart,
        lastEnd: maxEnd === "00:00" ? null : maxEnd,
        daysOfWeek: Array.from(days).sort((a, b) => a - b),
      };
    }

    // 2. Key announcements flagged publish_publicly.
    const { data: anns } = await serviceRoleClient
      .from("announcement")
      .select("id, title, body, created_at")
      .eq("org_id", orgId)
      .eq("publish_publicly", true)
      .order("created_at", { ascending: false })
      .limit(5);

    // 3. Current academic term banner.
    const { data: term } = await serviceRoleClient
      .from("academic_term")
      .select("name, start_date, end_date, is_current")
      .eq("org_id", orgId)
      .eq("is_current", true)
      .maybeSingle();

    return c.json({
      ...siteToJson(org),
      timings,
      announcements: (anns ?? []).map((a: any) => ({
        id: a.id, title: a.title, body: a.body, createdAt: a.created_at,
      })),
      term: term ? {
        name: (term as any).name,
        startDate: (term as any).start_date,
        endDate: (term as any).end_date,
      } : null,
    });
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
    if (typeof body?.heroKicker === "string") next.hero_kicker = body.heroKicker.trim().slice(0, 120);
    if (typeof body?.about === "string") next.about = body.about.trim().slice(0, 4000);
    if (typeof body?.contactEmail === "string") next.contact_email = body.contactEmail.trim().slice(0, 200);
    if (typeof body?.contactPhone === "string") next.contact_phone = body.contactPhone.trim().slice(0, 50);
    if (typeof body?.contactAddress === "string") next.contact_address = body.contactAddress.trim().slice(0, 500);
    if (typeof body?.whatsappPhone === "string") next.whatsapp_phone = body.whatsappPhone.trim().slice(0, 50);
    if (typeof body?.visitHours === "string") next.visit_hours = body.visitHours.trim().slice(0, 500);
    if (body?.ayah && typeof body.ayah === "object") {
      const a: any = body.ayah;
      if (typeof a.arabic === "string") next.ayah_arabic = a.arabic.trim().slice(0, 500);
      if (typeof a.translation === "string") next.ayah_translation = a.translation.trim().slice(0, 500);
      if (typeof a.reference === "string") next.ayah_reference = a.reference.trim().slice(0, 120);
    }
    if (Array.isArray(body?.programs)) {
      next.programs = (body.programs as any[])
        .slice(0, 4)
        .map((p) => ({
          name: String(p?.name ?? "").trim().slice(0, 80),
          summary: String(p?.summary ?? "").trim().slice(0, 300),
          kind: p?.kind === "primary" ? "primary" : "secondary",
        }))
        .filter((p) => p.name && p.summary);
    }
    // Phase 3 collections — bounded array sizes to keep the JSONB sane.
    if (Array.isArray(body?.highlights)) {
      next.highlights = (body.highlights as any[])
        .slice(0, 6)
        .map((h) => ({
          label: String(h?.label ?? "").trim().slice(0, 60),
          value: String(h?.value ?? "").trim().slice(0, 30),
        }))
        .filter((h) => h.label && h.value);
    }
    if (Array.isArray(body?.gallery)) {
      next.gallery = (body.gallery as any[])
        .slice(0, 24)
        .map((g) => ({
          url: String(g?.url ?? "").trim().slice(0, 500),
          caption: g?.caption ? String(g.caption).trim().slice(0, 140) : undefined,
        }))
        .filter((g) => g.url);
    }
    if (Array.isArray(body?.faculty)) {
      next.faculty = (body.faculty as any[])
        .slice(0, 24)
        .map((f) => ({
          name: String(f?.name ?? "").trim().slice(0, 100),
          role: f?.role ? String(f.role).trim().slice(0, 100) : undefined,
          bio: f?.bio ? String(f.bio).trim().slice(0, 600) : undefined,
          photoUrl: f?.photoUrl ? String(f.photoUrl).trim().slice(0, 500) : undefined,
          department: f?.department ? String(f.department).trim().slice(0, 60) : undefined,
        }))
        .filter((f) => f.name);
    }

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
