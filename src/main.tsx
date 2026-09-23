
  import { createRoot } from "react-dom/client";
  import { projectId, publicAnonKey } from "/utils/supabase/info.tsx";
  import "./i18n";
  import App from "./app/App.tsx";
  import { isFamilySetupPath } from "./utils/productHost";
  import "./styles/index.css";

  // Every deploy renames the hashed JS chunks; a tab opened before the
  // deploy then fails to lazy-load pages and crashes to "Something went
  // wrong" (pilot: staff hit this after each of our same-day releases).
  // Vite fires this event on a failed chunk fetch — reload once to pick
  // up the new build instead of stranding the user.
  window.addEventListener("vite:preloadError", (event) => {
    const KEY = "iqra_chunk_reload_at";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      event.preventDefault(); // suppress the crash; we're reloading anyway
      window.location.reload();
    }
  });

  // A school's own domain IS the school (18 Sep): someone handed the bare
  // "iqraifs.com" must see their school's front door. We resolve the host
  // to a slug and hand it to the router, which renders that school's site
  // AT "/" — so the address bar keeps saying iqraifs.com instead of
  // bouncing to /iqra-ifs. Costs one lookup on the bare root ONLY; every
  // other URL renders immediately, untouched.
  async function resolveSchoolDomain(): Promise<void> {
    // The bare root — and the family-SETUP paths: "Set Up Your Family"
    // rendered at iqraifs.com/onboarding because a deep load never
    // resolved the host, so the router's school-host guard had no slug
    // to read (23 Sep). Still nothing else: every other URL renders
    // immediately, untouched.
    const path = window.location.pathname;
    if (path !== "/" && !isFamilySetupPath(path)) return;
    // Dev affordance: localhost owns no school, so ?org= lets the root
    // be exercised locally. Stripped from production builds.
    if (import.meta.env.DEV) {
      const forced = new URLSearchParams(window.location.search).get("org");
      if (forced && /^[a-z0-9-]{2,60}$/.test(forced)) {
        (window as unknown as { __SCHOOL_SLUG__?: string }).__SCHOOL_SLUG__ = forced;
        return;
      }
    }
    const controller = new AbortController();
    // Never let a slow or unreachable lookup hold the app hostage.
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const host = window.location.hostname;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f` +
          `/school/auth/org-by-host?host=${encodeURIComponent(host)}`,
        {
          signal: controller.signal,
          headers: { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` },
        },
      );
      if (!res.ok) return; // 404 = a platform domain; render the app.
      const org = await res.json();
      if (org && typeof org.slug === "string" && /^[a-z0-9-]{2,60}$/.test(org.slug)) {
        // Stash it for the router rather than navigating: the address
        // bar stays on the school's own domain, with no second page
        // load. Set BEFORE createRoot so the first render already knows.
        (window as unknown as { __SCHOOL_SLUG__?: string }).__SCHOOL_SLUG__ = org.slug;
      }
    } catch {
      // Offline, aborted, or no such domain — fall through to the app.
    } finally {
      clearTimeout(timer);
    }
  }

  void resolveSchoolDomain().then(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
  
