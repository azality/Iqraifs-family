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

// The family product's own home. ILM Network sells the school platform;
// the family app is a different product for individual families (largely
// North America) with no connection to any school. It therefore lives on
// ONE host, and these routes redirect there from ANY other hostname — so
// school #2 arriving with their own domain needs no extra work.
const FAMILY_HOST = "family.theilmnetwork.com";

// The platform's own host, where a school with no domain of its own is
// served. Anything school-shaped that turns up on the family host is
// sent here — the two products do not share a hostname in either
// direction.
const PLATFORM_HOST = "app.theilmnetwork.com";

// First path segment of every school route. The mirror image of
// FAMILY_SEGMENTS: these must never render on the family host.
const SCHOOL_SEGMENTS = new Set([
  "school", "school-login", "school-portal", "parent-login",
]);

// First path segment of every family-only route (src/app/routes.tsx).
// "welcome" is handled separately: it is the family landing AND where
// ProtectedRoute sends anyone logged out, so it is host-aware.
const FAMILY_SEGMENTS = new Set([
  "log", "log-behavior", "review", "monthly-review", "adjustments",
  "attendance", "rewards", "audit", "settings", "link-to-school",
  "edit-requests", "knowledge-quest", "question-bank", "question-form",
  "wishlist", "wishlist-debug", "redemption-requests", "challenges",
  "titles-badges", "sadqa", "prayer-approvals", "games-review",
  "kid", "kid-login", "kid-login-new",
]);
// NOT here on purpose: /login and /signup. School staff authenticate
// through the same flow as families, so those must work on every host.

// First path segments that are app routes, never school slugs. Built
// from FAMILY_SEGMENTS so a family route can never be mistaken for a
// school's slug — which is what decides whether the family host sends a
// path away as school-shaped.
const RESERVED = new Set([
  ...FAMILY_SEGMENTS,
  "school", "school-login", "school-portal", "parent-login",
  "login", "signup", "welcome", "assets", "brand", "src",
  "kid-login", "kid-login-new",
  // Top-level routes belonging to neither product exclusively.
  "onboarding", "join-pending", "diagnostic", "network-test",
  "reset-password", "change-pin", "contact-school", "setup",
]);

function slugFrom(url) {
  const fromParam = url.searchParams.get("org");
  if (fromParam && /^[a-z0-9-]{2,60}$/.test(fromParam)) return fromParam;
  const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!seg || seg.includes(".") || RESERVED.has(seg)) return null;
  return /^[a-z0-9-]{2,60}$/.test(seg) ? seg : null;
}

/** Which school owns this hostname, or null. Edge-cached 5 min.
 *
 *  A school's own domain IS the school (18 Sep): a parent handed the
 *  bare "iqraifs.com" must land on their school, not on the platform
 *  app, and the WhatsApp preview of that bare link must carry the
 *  school's name. Configured per school in the database, never here —
 *  school #2 brings their domain without touching this file. */
async function hostSchool(host, ctx) {
  const clean = String(host || "").toLowerCase().split(":")[0].replace(/^www\./, "");
  if (!clean || !clean.includes(".")) return null;
  const api = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-f116e23f/school/auth/org-by-host?host=${encodeURIComponent(clean)}`;
  const cache = caches.default;
  const cacheKey = new Request(api);
  try {
    let res = await cache.match(cacheKey);
    if (!res) {
      const upstream = await fetch(api, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      // 404 just means "platform domain" — cache that too, so the lookup
      // does not run on every hit to theilmnetwork.com.
      const body = upstream.ok ? await upstream.text() : "null";
      res = new Response(body, {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const j = await res.json();
    return j && typeof j.slug === "string" ? j : null;
  } catch {
    // The whole lookup must fail SAFE: an unreachable backend here would
    // otherwise throw out of fetch() and 500 every navigation on the
    // school's domain. Falling back to null just serves the app shell.
    return null;
  }
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

/** Where this URL belongs if it is on the wrong product's hostname,
 *  else null. Pure and exported so the rule that keeps the two products
 *  apart is covered by tests — this worker is the only thing enforcing
 *  it, and it has no other guard.
 *
 *  "/welcome" on a non-family host is deliberately not handled here: it
 *  needs a host→school lookup, so the caller owns it. */
export function productRedirect(url) {
  const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (url.hostname === FAMILY_HOST) {
    // School-shaped: an explicit school route, a ?org= login link, or a
    // /<slug> public site. RESERVED keeps family routes out of the last
    // test, so /rewards is never read as a school called "rewards".
    if (SCHOOL_SEGMENTS.has(seg) || slugFrom(url)) {
      return `https://${PLATFORM_HOST}${url.pathname}${url.search}`;
    }
    return null;
  }
  if (FAMILY_SEGMENTS.has(seg)) {
    return `https://${FAMILY_HOST}${url.pathname}${url.search}`;
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") return env.ASSETS.fetch(request);
    const url = new URL(request.url);

    // run_worker_first is `true`, so EVERY request lands here — real
    // files included. Hand those straight back to the asset server:
    // anything with an extension, plus the two static trees, which are
    // matched by prefix so an extensionless file there is still safe.
    // Without this the worker would answer every bundle request with
    // index.html and take the whole app down.
    // ONE origin per school. www.iqraifs.com and iqraifs.com are
    // different origins to the browser, so the PIN token in
    // localStorage does not carry between them: a parent who signed in
    // on www would look signed out on the bare domain and be asked for
    // a PIN they had already set. Send www to the apex before anything
    // else. 302, not 301 — the canonical choice stays reversible
    // instead of sitting in every parent's browser cache.
    if (url.hostname.startsWith("www.")) {
      const apex = new URL(url);
      apex.hostname = url.hostname.slice(4);
      return Response.redirect(apex.toString(), 302);
    }

    const last = url.pathname.split("/").pop() || "";
    if (
      last.includes(".") ||
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/brand/")
    ) {
      return env.ASSETS.fetch(request);
    }
    // ── Two products, two hostnames ─────────────────────────────────
    const seg = url.pathname.split("/").filter(Boolean)[0] ?? "";
    const away = productRedirect(url);
    if (away) return Response.redirect(away, 302);

    if (url.hostname !== FAMILY_HOST && seg === "welcome") {
      // The family landing has no business on a school's domain — but
      // this is also where ProtectedRoute lands a logged-out visitor,
      // so it must not throw a teacher off their own school's site.
      // Left out of productRedirect because it needs a host lookup.
      const owner = await hostSchool(url.hostname, ctx);
      const to = new URL(url);
      // "/" on a school's domain already IS their site, and keeps the
      // address clean; the platform host has no site, so sign-in.
      to.pathname = owner ? "/" : "/login";
      to.search = "";
      return Response.redirect(to.toString(), 302);
    }

    const shell = await env.ASSETS.fetch(new URL("/index.html", url.origin));

    let slug = slugFrom(url);

    // No slug in the URL but the domain names a school — resolve it from
    // the host so the PREVIEW carries that school's name rather than
    // "ILM Network". The root is no longer redirected: the app renders
    // the school's site in place at "/", so the address bar keeps saying
    // iqraifs.com. Crawlers still get the right tags from here, which is
    // what the redirect was really buying us.
    if (!slug) {
      const owner = await hostSchool(url.hostname, ctx);
      if (owner) slug = owner.slug;
    }
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
