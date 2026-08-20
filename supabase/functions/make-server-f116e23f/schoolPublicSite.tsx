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
  instagram_url?: string;
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
    instagramUrl: ps.instagram_url ?? null,
    // Connection status for the editor (username only - never the token).
    instagramConnectedUsername: orgSettings.instagram?.username ?? null,
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
    if (typeof body?.instagramUrl === "string") next.instagram_url = body.instagramUrl.trim().slice(0, 300);
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

  // ─── PUBLIC Instagram feed ──────────────────────────────────────────
  // GET /school/public-site/:slug/instagram → { posts: [...] }
  //
  // Self-hosted IG feed (like the grid design): the school authorizes
  // once via the Instagram API with Instagram Login, and the resulting
  // long-lived token is stored in settings.instagram.access_token
  // (set by an admin; never returned by any endpoint). We proxy +
  // cache the media list server-side so:
  //   - the token never reaches the browser
  //   - Instagram sees one fetch/hour, not one per visitor
  // Token refresh: long-lived tokens last 60 days; we refresh whenever
  // the cached token is older than 30 days (refresh endpoint returns a
  // new 60-day token, so monthly refresh keeps it alive forever).
  school.get("/public-site/:slug/instagram", async (c) => {
    const slug = c.req.param("slug");
    const { data: org } = await serviceRoleClient
      .from("organizations")
      .select("id, settings")
      .eq("slug", slug)
      .maybeSingle();
    if (!org) return c.json({ error: "school not found" }, 404);
    const settings = (org as any).settings ?? {};
    const ig = settings.instagram ?? {};
    const token: string | undefined = ig.access_token;
    if (!token) return c.json({ posts: [] });

    // 1h cache in settings.instagram.cache.
    const CACHE_MS = 60 * 60 * 1000;
    const cache = ig.cache;
    if (cache?.fetchedAt && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_MS) {
      return c.json({ posts: cache.posts ?? [] });
    }

    try {
      const res = await fetch(
        "https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=" +
          encodeURIComponent(token),
      );
      if (!res.ok) {
        // Token dead/expired — serve stale cache if any, else empty.
        return c.json({ posts: cache?.posts ?? [] });
      }
      const json = await res.json();
      const posts = ((json?.data ?? []) as any[])
        .filter((m) => m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" || m.media_type === "VIDEO")
        .slice(0, 9)
        .map((m) => ({
          id: m.id,
          // Videos: show the thumbnail; the permalink opens the reel.
          imageUrl: m.media_type === "VIDEO" ? (m.thumbnail_url ?? m.media_url) : m.media_url,
          permalink: m.permalink,
          caption: typeof m.caption === "string" ? m.caption.slice(0, 200) : null,
          isVideo: m.media_type === "VIDEO",
        }));

      // Refresh the long-lived token monthly so it never expires.
      let accessToken = token;
      const tokenAge = ig.token_refreshed_at ? Date.now() - new Date(ig.token_refreshed_at).getTime() : Infinity;
      if (tokenAge > 30 * 24 * 3600 * 1000) {
        try {
          const rr = await fetch(
            "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" +
              encodeURIComponent(token),
          );
          if (rr.ok) {
            const rj = await rr.json();
            if (rj?.access_token) accessToken = rj.access_token;
          }
        } catch (_) { /* keep old token */ }
      }

      settings.instagram = {
        ...ig,
        access_token: accessToken,
        token_refreshed_at: accessToken !== token ? new Date().toISOString() : (ig.token_refreshed_at ?? new Date().toISOString()),
        cache: { fetchedAt: new Date().toISOString(), posts },
      };
      await serviceRoleClient.from("organizations").update({ settings }).eq("id", (org as any).id);
      return c.json({ posts });
    } catch (_) {
      return c.json({ posts: cache?.posts ?? [] });
    }
  });

  // ─── Set the Instagram token (admin) ────────────────────────────────
  // PUT /school/orgs/:orgId/instagram-token  { accessToken }
  // Separate from the public-site PUT so the token never round-trips
  // through the editor form. Empty string disconnects.
  school.put("/orgs/:orgId/instagram-token", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await userCanInOrg(userId, orgId, "manage_public_site"))) {
      return c.json({ error: "forbidden — needs manage_public_site permission" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const tokenRaw = typeof body?.accessToken === "string" ? body.accessToken.trim() : null;
    if (tokenRaw === null) return c.json({ error: "accessToken (string) required" }, 400);

    const { data: cur } = await serviceRoleClient
      .from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const settings = (cur as any)?.settings ?? {};
    if (tokenRaw === "") {
      delete settings.instagram;
    } else {
      // Validate before saving — a broken paste should fail loudly here,
      // not silently render an empty feed.
      const test = await fetch(
        "https://graph.instagram.com/me?fields=id,username&access_token=" + encodeURIComponent(tokenRaw),
      );
      if (!test.ok) return c.json({ error: "Instagram rejected this token — check it and try again" }, 400);
      const who = await test.json();
      settings.instagram = {
        access_token: tokenRaw,
        username: who?.username ?? null,
        token_refreshed_at: new Date().toISOString(),
        cache: null,
      };
    }
    const { error } = await serviceRoleClient
      .from("organizations").update({ settings }).eq("id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, connected: tokenRaw !== "", username: tokenRaw ? settings.instagram?.username ?? null : null });
  });
}
