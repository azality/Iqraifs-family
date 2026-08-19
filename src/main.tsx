
  import { createRoot } from "react-dom/client";
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

  createRoot(document.getElementById("root")!).render(<App />);
  
