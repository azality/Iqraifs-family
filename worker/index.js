// Cloudflare Worker — per-school link previews.
//
// WhatsApp / Facebook / Google read the STATIC meta tags; they never run
// the app. After the ILM Network rebrand every shared link previewed as
// "ILM Network", and the school said parents hesitate to tap a name
// they don't know (15 Sep: "it should say Iqra Islamic Foundation
// School"). This worker serves the SPA shell for navigations and, when
// the URL names a school — ?org=<slug> (the login links the office
// shares) or a /<slug> path (the public site, /<slug>/login) — rewrites
// the title/OG tags to that school's own name and logo, fetched from
// the no-auth public-site endpoint and cached at the edge.
//
// Static assets (js/css/brand images) are served by the platform before
// this worker runs, so only non-asset navigations land here — which is
// also what makes this the SPA fallback.

const PROJECT_ID = "ybrkbrrkcqpzpjnjdyib";
// The public anon key — the same one shipped inside the app bundle.
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmticnJrY3FwenBqbmpkeWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjUzMTcsImV4cCI6MjA4Njk0MTMxN30.RmagHyYi_-Q2wBG8ik1kxNTIYVfCuUcCyJqcDbz2mc8";

// First path segments that are app routes, never school slugs.
const RESERVED = new Set([
  "school", "school-login", "school-portal", "login", "signup", "welcome",
  "kid", "kid-login", "kid-login-new", "parent-login", "audit", "settings",
  "challenges", "knowledge-quest", "log-behavior", "assets", "brand", "src",
]);

function slugFrom(url) {
  const fromParam = url.searchParams.get("org");
  if (fromParam && /^[a-z0-9-]{2,60}$/.test(fromParam)) return fromParam;
  const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!seg || seg.includes(".") || RESERVED.has(seg)) return null;
  return /^[a-z0-9-]{2,60}$/.test(seg) ? seg : null;
}

/** School name + logo from the public-site endpoint, edge-cached 5 min. */
async function lookupSchool(slug, ctx) {
  const api = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-f116e23f/school/public-site/${encodeURIComponent(slug)}`;
  const cache = caches.default;
  const cacheKey = new Request(api);
  let res = await cache.match(cacheKey);
  if (!res) {
    const upstream = await fetch(api, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!upstream.ok) return null;
    res = new Response(await upstream.text(), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  try {
    const j = await res.json();
    const name = j?.org?.name;
    if (typeof name !== "string" || !name.trim()) return null;
    return { name: name.trim(), logoUrl: typeof j?.org?.logoUrl === "string" ? j.org.logoUrl : null };
  } catch {
    return null;
  }
}

// NB: handler objects must not carry keys named `text`/`comments` —
// HTMLRewriter treats those as chunk handlers (found the hard way:
// a `text` data property threw "not of type 'function'").
class SetText {
  constructor(value) { this._v = value; }
  element(el) { el.setInnerContent(this._v); }
}
class SetContent {
  constructor(value) { this._v = value; }
  element(el) { el.setAttribute("content", this._v); }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") return env.ASSETS.fetch(request);
    const url = new URL(request.url);
    const shell = await env.ASSETS.fetch(new URL("/index.html", url.origin));

    const slug = slugFrom(url);
    if (!slug) return shell;
    const school = await lookupSchool(slug, ctx);
    if (!school) return shell;

    const description =
      `Homework, grades, attendance and Hifz progress — ${school.name} on ILM Network.`;
    let rw = new HTMLRewriter()
      .on("title", new SetText(school.name))
      .on('meta[property="og:title"]', new SetContent(school.name))
      .on('meta[property="og:site_name"]', new SetContent(school.name))
      .on('meta[property="og:description"]', new SetContent(description))
      .on('meta[name="description"]', new SetContent(description));
    if (school.logoUrl) {
      rw = rw.on('meta[property="og:image"]', new SetContent(school.logoUrl));
    }
    return rw.transform(shell);
  },
};
