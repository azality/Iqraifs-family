
  import { createRoot } from "react-dom/client";
  import { projectId, publicAnonKey } from "/utils/supabase/info.tsx";
  import "./i18n";
  import App from "./app/App.tsx";
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
  // "iqraifs.com" must land on their school's front door, not on the
  // platform app. The Cloudflare worker redirects this too, but only when
  // it actually runs — Cloudflare serves "/" straight from static assets
  // when index.html matches, which would skip the worker entirely. This
  // is the belt to that braces, and it costs one lookup on the bare root
  // ONLY: every other URL renders immediately, untouched.
  async function resolveSchoolDomain(): Promise<void> {
    if (window.location.pathname !== "/") return;
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
        // A real navigation, NOT history.replaceState: the router is
        // built when routes.tsx is imported — before this runs — so it
        // has already captured "/" and would render the app root, where
        // ProtectedRoute bounces a logged-out parent to /welcome. Found
        // the hard way. In production the Cloudflare worker's 302
        // usually fires first, so this second load is the rare path.
        window.location.replace(`/${org.slug}${window.location.search}`);
        // Stop here: the page is being replaced, rendering now would
        // flash the platform landing page at the parent.
        await new Promise(() => {});
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
  
