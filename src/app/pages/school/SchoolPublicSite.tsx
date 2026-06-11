// SchoolPublicSite — public marketing page for one school.
//
// Phase 4 (design handoff from claude.ai/design): pixel-faithful
// implementation of the bundled "Iqra Academy Public Site" prototype,
// reworked as a data-driven template that any school on the platform
// can populate via ManagePublicSite. Every section either reads from
// the school's CMS settings or from a [LIVE FROM APP] source (timings,
// term, announcements). Live sections show a pulsing green dot so the
// admin reading the page can tell which content refreshes itself.
//
// The design uses inline styles instead of Tailwind classes — these
// match the prototype 1:1, so future redesign passes against the
// design tool's HTML stay easy to diff. Tailwind utility classes are
// reserved for the responsive breakpoints handled by the @media block
// at the bottom of this file.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getPublicSite,
  type PublicSiteResponse,
} from "../../../utils/schoolApi";

const PALETTE = {
  emerald: "#0F5132",
  emeraldDark: "#082A1F",
  emeraldMid: "#0B3D2E",
  cream: "#FAF6EE",
  creamHi: "#FFFDF8",
  gold: "#C9A24A",
  goldHi: "#D9B563",
  goldDark: "#8A6A22",
  ink: "#14241C",
  mutedInk: "#3D4A42",
  muted: "#5B6A60",
  mutedLight: "#7A8780",
};

// Default copy for sections the principal hasn't edited yet. Designed
// to read sensibly for any school, not Iqra-specific.
const DEFAULTS = {
  programs: [
    { name: "Hifz Program", summary: "Full-time Quran memorization with daily revision circles.", kind: "primary" as const },
    { name: "Mainstream", summary: "National curriculum, English-medium, with Islamic studies woven in.", kind: "secondary" as const },
    { name: "Hybrid", summary: "Half-day Hifz, half-day academics — for students who want both.", kind: "primary" as const },
  ],
};

export function SchoolPublicSite() {
  const { orgSlug = "" } = useParams<{ orgSlug: string }>();
  const [site, setSite] = useState<PublicSiteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statProgress, setStatProgress] = useState(0);

  useEffect(() => {
    if (!orgSlug) return;
    getPublicSite(orgSlug)
      .then(setSite)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [orgSlug]);

  // Animate stat counters once data has loaded.
  useEffect(() => {
    if (!site) return;
    let raf = 0;
    const t0 = performance.now();
    const dur = 1300;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setStatProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [site]);

  // Animate the highlight numbers from 0 up. Non-numeric values
  // ("Grades 1–7", "1 : 18") pass through unchanged.
  const highlightDisplay = useMemo(() => {
    const items = site?.highlights ?? [];
    return items.map((h) => {
      const m = h.value.match(/^([\d,]+)(\+?)$/);
      if (!m) return { ...h, display: h.value };
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      const cur = Math.round(n * statProgress);
      return { ...h, display: cur.toLocaleString("en-US") + m[2] };
    });
  }, [site?.highlights, statProgress]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.cream, color: PALETTE.muted, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        School not found.
      </div>
    );
  }
  if (!site) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.cream, color: PALETTE.mutedLight, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Loading…
      </div>
    );
  }

  const heroTitle = site.heroTitle || site.org.name;
  const heroTagline = site.heroTagline || site.org.motto || "";
  const heroKicker = site.heroKicker || `iqraifs.com/${site.org.slug} · name & logo live from app`;
  const phone = site.contactPhone;
  const whatsapp = site.whatsappPhone || phone;
  const whatsappDigits = (whatsapp || "").replace(/[^\d]/g, "");
  const whatsappHref = whatsappDigits ? `https://wa.me/${whatsappDigits}` : undefined;
  const programs = (site.programs && site.programs.length > 0) ? site.programs : DEFAULTS.programs;
  const ayah = site.ayah && (site.ayah.arabic || site.ayah.translation) ? site.ayah : null;

  // Group faculty by department for the wall.
  const facultyGroups = useMemo(() => {
    const groups = new Map<string, typeof site.faculty>();
    for (const f of (site.faculty ?? [])) {
      const key = f.department?.trim() || "Faculty";
      if (!groups.has(key)) groups.set(key, [] as any);
      (groups.get(key) as any).push(f);
    }
    return Array.from(groups.entries()).map(([name, members]) => ({ name, members: members ?? [] }));
  }, [site.faculty]);

  const days = useMemo(() => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const set = new Set(site.timings?.daysOfWeek ?? []);
    return order.map((i) => ({ label: dayNames[i], active: set.has(i) }));
  }, [site.timings?.daysOfWeek]);

  const termDates = site.term ? formatTermDates(site.term.startDate, site.term.endDate) : null;

  // Style helpers (inline so they survive without Tailwind).
  const fontSerif = "'Frank Ruhl Libre', serif";
  const fontSans = "'Plus Jakarta Sans', sans-serif";
  const fontAr = "'Amiri', serif";
  const containerMax = { maxWidth: 1200, marginInline: "auto", paddingInline: 24 } as const;
  const kicker = { font: `700 12px/1 ${fontSans}`, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: PALETTE.goldDark };
  const h2 = { font: `600 clamp(30px, 3.4vw, 42px)/1.15 ${fontSerif}`, color: PALETTE.ink, margin: 0, textWrap: "balance" as any };
  const livePill = (light: boolean) => ({
    display: "inline-flex", alignItems: "center", gap: 7,
    font: `600 11px/1 ${fontSans}`, letterSpacing: "0.08em", textTransform: "uppercase" as const,
    color: light ? "rgba(250,246,238,0.9)" : PALETTE.emerald,
    background: light ? "rgba(250,246,238,0.08)" : "rgba(15,81,50,0.07)",
    border: light ? "1px solid rgba(201,162,74,0.4)" : "1px solid rgba(15,81,50,0.2)",
    padding: "7px 12px", borderRadius: 999, whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{ background: PALETTE.cream, color: PALETTE.ink, fontFamily: fontSans, WebkitFontSmoothing: "antialiased" }}>
      {/* Fonts + keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap');
        @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }
        a:focus-visible { outline: 3px solid ${PALETTE.gold}; outline-offset: 2px; border-radius: 8px; }
        button:focus-visible { outline: 3px solid ${PALETTE.gold}; outline-offset: 2px; }
        .sps-nav a:hover { color: ${PALETTE.cream}; background: rgba(250,246,238,0.08); }
        .sps-card-hover:hover { border-color: ${PALETTE.gold}; box-shadow: 0 12px 32px -16px rgba(8,42,31,0.25); }
        .sps-prog:hover { transform: translateY(-4px); box-shadow: 0 20px 44px -20px rgba(8,42,31,0.3); border-color: ${PALETTE.gold}; }
        .sps-fac:hover .sps-fac-bio, .sps-fac:focus-within .sps-fac-bio { opacity: 1; }
        @media (max-width: 720px) {
          .sps-hide-mob { display: none !important; }
          .sps-nav { display: none !important; }
        }
      `}</style>

      <a href="#main" style={{ position: "absolute", insetInlineStart: -9999, background: PALETTE.gold, color: PALETTE.emeraldDark, padding: "12px 20px", borderRadius: 8, fontWeight: 700, zIndex: 100 }}>Skip to content</a>

      {/* ============ NAV ============ */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(8,42,31,0.94)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(250,246,238,0.12)" }}>
        <div style={{ ...containerMax, display: "flex", alignItems: "center", gap: 24, height: 72 }}>
          <Link to={`/${orgSlug}`} style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            {site.org.logoUrl ? (
              <img src={site.org.logoUrl} alt={`${site.org.name} logo`} width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(201,162,74,0.5)" }} />
            ) : (
              <div aria-hidden style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(201,162,74,0.5)", background: PALETTE.emerald, color: PALETTE.cream, display: "flex", alignItems: "center", justifyContent: "center", font: `700 14px/1 ${fontSerif}` }}>
                {site.org.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ font: `600 18px/1.1 ${fontSerif}`, color: PALETTE.cream }}>{site.org.name}</span>
              {site.org.motto && <span style={{ font: `500 10px/1 ${fontSans}`, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(201,162,74,0.9)" }}>{site.org.motto}</span>}
            </span>
          </Link>
          <nav aria-label="Main" className="sps-nav" style={{ display: "flex", alignItems: "center", gap: 4, marginInlineStart: "auto", flexWrap: "wrap" }}>
            {[
              ["#about", "About"], ["#programs", "Programs"], ["#faculty", "Faculty"],
              ["#campuses", "Campuses"], ["#contact", "Contact"],
            ].map(([href, label]) => (
              <a key={href} href={href} style={{ color: "rgba(250,246,238,0.85)", textDecoration: "none", font: `500 14px/1 ${fontSans}`, padding: "10px 12px", borderRadius: 8 }}>{label}</a>
            ))}
          </nav>
          <Link to={`/${orgSlug}/login`} style={{ background: PALETTE.gold, color: PALETTE.emeraldDark, textDecoration: "none", font: `700 14px/1 ${fontSans}`, padding: "12px 20px", borderRadius: 999, whiteSpace: "nowrap", marginInlineStart: "auto" }}>
            Sign in
          </Link>
        </div>
      </header>

      <main id="main">
        {/* ============ HERO ============ */}
        <section style={{
          background: PALETTE.emeraldDark,
          backgroundImage: "repeating-linear-gradient(45deg, rgba(201,162,74,0.05) 0 1px, transparent 1px 28px), repeating-linear-gradient(-45deg, rgba(201,162,74,0.05) 0 1px, transparent 1px 28px)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ ...containerMax, paddingBlock: "80px 140px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 64, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 580 }}>
              <span style={{ ...livePill(true), alignSelf: "flex-start" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", animation: "livePulse 2.2s infinite" }} />
                {heroKicker}
              </span>
              <h1 style={{ font: `600 clamp(42px, 5.2vw, 68px)/1.08 ${fontSerif}`, color: PALETTE.cream, margin: 0, textWrap: "balance" as any }}>
                {renderHeroTitle(heroTitle)}
              </h1>
              {heroTagline && (
                <p style={{ font: `400 18px/1.65 ${fontSans}`, color: "rgba(250,246,238,0.82)", margin: 0, maxWidth: "52ch" }}>{heroTagline}</p>
              )}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBlockStart: 8 }}>
                <a href="#admissions" style={{ background: PALETTE.gold, color: PALETTE.emeraldDark, textDecoration: "none", font: `700 16px/1 ${fontSans}`, padding: "16px 28px", borderRadius: 999 }}>Apply for admission</a>
                <a href="#contact" style={{ background: "transparent", color: PALETTE.cream, textDecoration: "none", font: `600 16px/1 ${fontSans}`, padding: "16px 28px", borderRadius: 999, border: "1.5px solid rgba(250,246,238,0.4)" }}>Visit a campus</a>
              </div>
              {/* Trust signals */}
              {(phone || site.contactAddress || (site.faculty && site.faculty[0])) && (
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", borderBlockStart: "1px solid rgba(250,246,238,0.15)", paddingBlockStart: 22, marginBlockStart: 12 }}>
                  {site.faculty?.[0] && site.faculty[0].photoUrl && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src={site.faculty[0].photoUrl} alt={site.faculty[0].name} width={44} height={44} style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${PALETTE.gold}` }} loading="lazy" />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ font: `600 13px/1.2 ${fontSans}`, color: PALETTE.cream }}>{site.faculty[0].name}</span>
                        {site.faculty[0].role && <span style={{ font: `400 12px/1.2 ${fontSans}`, color: "rgba(250,246,238,0.65)" }}>{site.faculty[0].role}</span>}
                      </span>
                    </div>
                  )}
                  {phone && (
                    <a href={`tel:${phone.replace(/\s/g, "")}`} style={{ font: `600 13px/1.4 ${fontSans}`, color: "rgba(250,246,238,0.85)", textDecoration: "none" }}>📞 {phone}</a>
                  )}
                  {site.contactAddress && (
                    <span style={{ font: `400 13px/1.4 ${fontSans}`, color: "rgba(250,246,238,0.65)", maxWidth: 380 }}>{shortAddress(site.contactAddress)}</span>
                  )}
                </div>
              )}
            </div>
            {site.heroImageUrl && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
                <div style={{ border: "1px solid rgba(201,162,74,0.45)", borderRadius: "999px 999px 28px 28px", padding: 14, width: "min(420px, 100%)", boxSizing: "border-box" }}>
                  <img src={site.heroImageUrl} alt={`${site.org.name} campus`} style={{ display: "block", width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: "999px 999px 18px 18px" }} loading="eager" />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ============ HIGHLIGHTS STRIP ============ */}
        {highlightDisplay.length > 0 && (
          <section style={{ paddingInline: 24 }}>
            <div style={{
              maxWidth: 1200, marginInline: "auto", marginBlockStart: -72, position: "relative", zIndex: 2,
              background: PALETTE.creamHi, border: "1px solid rgba(201,162,74,0.35)", borderRadius: 24,
              boxShadow: "0 24px 60px -24px rgba(8,42,31,0.35)",
              padding: "36px 40px",
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "28px 24px",
            }}>
              {highlightDisplay.slice(0, 6).map((h, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, borderInlineStart: "2px solid rgba(201,162,74,0.4)", paddingInlineStart: 16 }}>
                  <span style={{ font: `600 36px/1 ${fontSerif}`, color: PALETTE.emerald, fontVariantNumeric: "tabular-nums" }}>{h.display}</span>
                  <span style={{ font: `500 13px/1.35 ${fontSans}`, color: PALETTE.muted }}>{h.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============ ABOUT + AYAH ============ */}
        {(site.about || ayah) && (
          <section id="about" style={{ paddingBlock: "96px 88px", paddingInline: 24 }}>
            <div style={{ ...containerMax, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 64, alignItems: "start" }}>
              {site.about && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <span style={kicker}>Our story</span>
                  <h2 style={h2}>A school where your child doesn't have to choose</h2>
                  {site.about.split(/\n\n+/).map((para, i) => (
                    <p key={i} style={{ font: `400 16px/1.75 ${fontSans}`, color: PALETTE.mutedInk, margin: 0 }}>{para}</p>
                  ))}
                </div>
              )}
              {ayah && (
                <div style={{
                  background: PALETTE.emeraldMid,
                  backgroundImage: "repeating-linear-gradient(45deg, rgba(201,162,74,0.06) 0 1px, transparent 1px 26px), repeating-linear-gradient(-45deg, rgba(201,162,74,0.06) 0 1px, transparent 1px 26px)",
                  borderRadius: 28, padding: "56px 48px", display: "flex", flexDirection: "column", gap: 22, alignItems: "center", textAlign: "center", position: "sticky", top: 96,
                }}>
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
                    <path d="M22 2 L26.5 13 L38 9 L31 19 L42 22 L31 25 L38 35 L26.5 31 L22 42 L17.5 31 L6 35 L13 25 L2 22 L13 19 L6 9 L17.5 13 Z" stroke={PALETTE.gold} strokeWidth="1.2" opacity="0.8" />
                  </svg>
                  {ayah.arabic && (
                    <p lang="ar" dir="rtl" style={{ font: `700 clamp(28px, 3vw, 38px)/1.8 ${fontAr}`, color: PALETTE.cream, margin: 0 }}>{ayah.arabic}</p>
                  )}
                  {ayah.translation && (
                    <p style={{ font: `italic 400 17px/1.6 ${fontSerif}`, color: "rgba(250,246,238,0.85)", margin: 0 }}>"{ayah.translation}"</p>
                  )}
                  {ayah.reference && (
                    <span style={{ font: `600 12px/1 ${fontSans}`, letterSpacing: "0.12em", textTransform: "uppercase", color: PALETTE.gold }}>{ayah.reference}</span>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============ SCHOOL DAY + TERM (LIVE) ============ */}
        {((site.timings && (site.timings.firstStart || site.timings.lastEnd)) || site.term) && (
          <section style={{ background: PALETTE.creamHi, borderBlock: "1px solid rgba(201,162,74,0.25)", paddingBlock: 88, paddingInline: 24 }}>
            <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 40 }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <span style={kicker}>The rhythm of a day</span>
                  <h2 style={h2}>School day at a glance</h2>
                </div>
                <span style={livePill(false)}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1B8A5A", animation: "livePulse 2.2s infinite" }} />
                  Live from published timetable
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 32, alignItems: "stretch" }}>
                {site.timings && (site.timings.firstStart || site.timings.lastEnd) && (
                  <div style={{ background: PALETTE.cream, border: "1px solid rgba(201,162,74,0.3)", borderRadius: 20, padding: 32, display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ font: `600 34px/1 ${fontSerif}`, color: PALETTE.emerald, fontVariantNumeric: "tabular-nums" }}>{site.timings.firstStart?.slice(0, 5) ?? "—"}</span>
                        <span style={{ font: `500 12px/1.3 ${fontSans}`, color: PALETTE.muted }}>First bell · assembly</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", textAlign: "end" }}>
                        <span style={{ font: `600 34px/1 ${fontSerif}`, color: PALETTE.emerald, fontVariantNumeric: "tabular-nums" }}>{site.timings.lastEnd?.slice(0, 5) ?? "—"}</span>
                        <span style={{ font: `500 12px/1.3 ${fontSans}`, color: PALETTE.muted }}>Dismissal</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <div style={{ flex: 6, height: 14, background: "#9AB5A4", borderRadius: 7 }} title="Assembly & du'a" />
                        <div style={{ flex: 30, height: 14, background: PALETTE.gold, borderRadius: 7 }} title="Quran & Hifz" />
                        <div style={{ flex: 7, height: 14, background: "#E4D9BE", borderRadius: 7 }} title="Break" />
                        <div style={{ flex: 42, height: 14, background: PALETTE.emerald, borderRadius: 7 }} title="Academics" />
                        <div style={{ flex: 9, height: 14, background: "#9AB5A4", borderRadius: 7 }} title="Zuhr & home" />
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
                        {[
                          ["#9AB5A4", "Assembly & du'a"],
                          [PALETTE.gold, "Quran & Hifz"],
                          ["#E4D9BE", "Break"],
                          [PALETTE.emerald, "Academics"],
                          ["#9AB5A4", "Zuhr & home"],
                        ].map(([color, label]) => (
                          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7, font: `500 12px/1.3 ${fontSans}`, color: PALETTE.muted, whiteSpace: "nowrap" }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />{label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {days.map((d) => (
                        <span key={d.label} style={{
                          font: `600 12px/1 ${fontSans}`, padding: "8px 14px", borderRadius: 999,
                          background: d.active ? PALETTE.emerald : "transparent",
                          color: d.active ? PALETTE.cream : "#9AA8A0",
                          border: `1px solid ${d.active ? PALETTE.emerald : "rgba(201,162,74,0.35)"}`,
                        }}>{d.label}</span>
                      ))}
                    </div>
                    <p style={{ font: `400 12px/1.5 ${fontSans}`, color: PALETTE.mutedLight, margin: 0 }}>
                      Start and end times come from the school's published timetable — they update automatically when a new timetable goes live.
                    </p>
                  </div>
                )}

                {site.term && (
                  <div style={{
                    background: PALETTE.emeraldMid, borderRadius: 20, padding: 32,
                    display: "flex", flexDirection: "column", gap: 18, justifyContent: "center",
                    backgroundImage: "repeating-linear-gradient(45deg, rgba(201,162,74,0.06) 0 1px, transparent 1px 26px), repeating-linear-gradient(-45deg, rgba(201,162,74,0.06) 0 1px, transparent 1px 26px)",
                  }}>
                    <span style={{ ...livePill(true), alignSelf: "flex-start" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", animation: "livePulse 2.2s infinite" }} />
                      Current academic term
                    </span>
                    <span style={{ font: `600 clamp(28px, 2.6vw, 36px)/1.15 ${fontSerif}`, color: PALETTE.cream }}>{site.term.name}</span>
                    {termDates && <span style={{ font: `500 17px/1.4 ${fontSans}`, color: PALETTE.gold }}>{termDates}</span>}
                    <p style={{ font: `400 13px/1.6 ${fontSans}`, color: "rgba(250,246,238,0.6)", margin: 0 }}>
                      When the office publishes the next term in the school app, this card updates itself.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============ ANNOUNCEMENTS (LIVE) ============ */}
        {(site.announcements?.length ?? 0) > 0 && (
          <section style={{ paddingBlock: 88, paddingInline: 24 }}>
            <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 36 }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <span style={kicker}>From the noticeboard</span>
                  <h2 style={h2}>What's happening</h2>
                </div>
                <span style={livePill(false)}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1B8A5A", animation: "livePulse 2.2s infinite" }} />
                  Public announcements, live from the app
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
                {site.announcements!.map((a) => (
                  <article key={a.id} className="sps-card-hover" style={{ background: PALETTE.creamHi, border: "1px solid rgba(201,162,74,0.3)", borderRadius: 18, padding: 28, display: "flex", flexDirection: "column", gap: 12, transition: "all 0.2s" }}>
                    <time style={{ font: `600 12px/1 ${fontSans}`, letterSpacing: "0.08em", textTransform: "uppercase", color: PALETTE.goldDark }}>{formatDate(a.createdAt)}</time>
                    <h3 style={{ font: `600 20px/1.3 ${fontSerif}`, color: PALETTE.ink, margin: 0, textWrap: "balance" as any }}>{a.title}</h3>
                    <p style={{ font: `400 14px/1.65 ${fontSans}`, color: PALETTE.muted, margin: 0 }}>{a.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============ PROGRAMS ============ */}
        <section id="programs" style={{ background: PALETTE.creamHi, borderBlock: "1px solid rgba(201,162,74,0.25)", paddingBlock: 88, paddingInline: 24 }}>
          <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
              <span style={kicker}>Three paths, one school</span>
              <h2 style={h2}>Programs</h2>
              <p style={{ font: `400 16px/1.7 ${fontSans}`, color: PALETTE.mutedInk, margin: 0 }}>
                Every child is different. Choose the balance that fits yours — and switch tracks as they grow.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
              {programs.map((p, i) => {
                const primary = p.kind !== "secondary";
                return (
                  <article key={i} className="sps-prog" style={{ background: PALETTE.cream, border: "1px solid rgba(201,162,74,0.35)", borderRadius: 22, padding: "36px 32px", display: "flex", flexDirection: "column", gap: 16, transition: "all 0.2s" }}>
                    <span style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: primary ? "rgba(201,162,74,0.16)" : "rgba(15,81,50,0.1)",
                      border: primary ? "1px solid rgba(201,162,74,0.4)" : "1px solid rgba(15,81,50,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <ProgramIcon kind={primary ? "primary" : "secondary"} />
                    </span>
                    <h3 style={{ font: `600 24px/1.2 ${fontSerif}`, color: PALETTE.ink, margin: 0 }}>{p.name}</h3>
                    <p style={{ font: `400 15px/1.65 ${fontSans}`, color: PALETTE.muted, margin: 0, flex: 1 }}>{p.summary}</p>
                    <a href="#admissions" style={{ font: `700 14px/1 ${fontSans}`, color: PALETTE.emerald, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Learn more <span aria-hidden>→</span>
                    </a>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ FACULTY ============ */}
        {facultyGroups.length > 0 && (
          <section id="faculty" style={{ paddingBlock: 88, paddingInline: 24 }}>
            <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 44 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
                <span style={kicker}>The people your child will know by name</span>
                <h2 style={h2}>Faculty</h2>
                <p style={{ font: `400 16px/1.7 ${fontSans}`, color: PALETTE.mutedInk, margin: 0 }}>Hover or tap a card to read each teacher's background.</p>
              </div>
              {facultyGroups.map((g) => (
                <div key={g.name} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <h3 style={{ font: `600 14px/1 ${fontSans}`, letterSpacing: "0.12em", textTransform: "uppercase", color: PALETTE.emerald, margin: 0, display: "flex", alignItems: "center", gap: 14 }}>
                    {g.name}<span style={{ flex: 1, height: 1, background: "rgba(201,162,74,0.4)" }} />
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
                    {(g.members ?? []).map((m, i) => (
                      <article key={i} className="sps-fac" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", aspectRatio: 1, background: "#E8E2D2" }}>
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt={m.name} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                          ) : (
                            <div aria-hidden style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.emerald, color: PALETTE.cream, font: `700 32px/1 ${fontSerif}` }}>
                              {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                          )}
                          {m.bio && (
                            <div tabIndex={0} role="note" aria-label={`About ${m.name}: ${m.bio}`} className="sps-fac-bio" style={{ position: "absolute", inset: 0, background: "rgba(8,42,31,0.93)", padding: 24, display: "flex", alignItems: "flex-end", opacity: 0, transition: "opacity 0.25s ease" }}>
                              <p style={{ font: `400 13.5px/1.6 ${fontSans}`, color: PALETTE.cream, margin: 0 }}>{m.bio}</p>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ font: `600 18px/1.25 ${fontSerif}`, color: PALETTE.ink }}>{m.name}</span>
                          {m.role && <span style={{ font: `500 13px/1.35 ${fontSans}`, color: PALETTE.goldDark }}>{m.role}</span>}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============ GALLERY ============ */}
        {(site.gallery?.length ?? 0) > 0 && (
          <section id="campuses" style={{ background: PALETTE.creamHi, borderBlock: "1px solid rgba(201,162,74,0.25)", paddingBlock: 88, paddingInline: 24 }}>
            <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 36 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
                <span style={kicker}>Come see for yourself</span>
                <h2 style={h2}>Around our campuses</h2>
              </div>
              <div style={{ columns: "3 280px", columnGap: 18 }}>
                {site.gallery!.map((ph, i) => (
                  <figure key={i} style={{ breakInside: "avoid", margin: "0 0 18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                    <img src={ph.url} alt={ph.caption ?? ""} style={{ display: "block", width: "100%", borderRadius: 14, border: "1px solid rgba(201,162,74,0.3)" }} loading="lazy" />
                    {ph.caption && <figcaption style={{ font: `500 12.5px/1.4 ${fontSans}`, color: PALETTE.mutedLight }}>{ph.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============ ADMISSIONS ============ */}
        <section id="admissions" style={{
          background: PALETTE.emeraldDark,
          backgroundImage: "repeating-linear-gradient(45deg, rgba(201,162,74,0.05) 0 1px, transparent 1px 28px), repeating-linear-gradient(-45deg, rgba(201,162,74,0.05) 0 1px, transparent 1px 28px)",
          paddingBlock: 96, paddingInline: 24,
        }}>
          <div style={{ ...containerMax, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 64, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ ...kicker, color: PALETTE.gold }}>Admissions · Open intake</span>
                <h2 style={{ ...h2, color: PALETTE.cream }}>Three steps to a seat</h2>
              </div>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 28 }}>
                {[
                  { title: "Submit an application", body: "Online, or at any campus office. Bring the child's B-form and last report card." },
                  { title: "Assessment & family meeting", body: "A gentle age-appropriate assessment, and a sit-down with the principal — both parents welcome." },
                  { title: "Offer & enrollment", body: "Offers go out within one week. Fee details and uniform fitting at enrollment." },
                ].map((step, i) => (
                  <li key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: "50%", background: PALETTE.gold, color: PALETTE.emeraldDark, display: "flex", alignItems: "center", justifyContent: "center", font: `700 18px/1 ${fontSerif}` }}>{i + 1}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ font: `600 19px/1.3 ${fontSerif}`, color: PALETTE.cream }}>{step.title}</span>
                      <p style={{ font: `400 14px/1.65 ${fontSans}`, color: "rgba(250,246,238,0.7)", margin: 0 }}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <VisitForm contactEmail={site.contactEmail} schoolName={site.org.name} />
          </div>
        </section>

        {/* ============ CONTACT ============ */}
        {(phone || site.contactEmail || site.contactAddress || whatsappHref) && (
          <section id="contact" style={{ paddingBlock: 88, paddingInline: 24 }}>
            <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 36 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
                <span style={kicker}>We answer the phone</span>
                <h2 style={h2}>Contact & visit</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "stretch" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {whatsappHref && (
                    <a href={whatsappHref} style={{ display: "flex", alignItems: "center", gap: 14, background: PALETTE.emerald, color: PALETTE.cream, textDecoration: "none", borderRadius: 16, padding: "20px 24px" }}>
                      <WhatsAppIcon size={26} fill={PALETTE.cream} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ font: `700 16px/1.2 ${fontSans}` }}>WhatsApp us</span>
                        <span style={{ font: `400 13px/1.3 ${fontSans}`, opacity: 0.75 }}>{whatsapp} · fastest reply</span>
                      </span>
                    </a>
                  )}
                  <div style={{ background: PALETTE.creamHi, border: "1px solid rgba(201,162,74,0.3)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                    {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} style={{ font: `600 15px/1.4 ${fontSans}`, color: PALETTE.emerald, textDecoration: "none" }}>📞 {phone}</a>}
                    {site.contactEmail && <a href={`mailto:${site.contactEmail}`} style={{ font: `600 15px/1.4 ${fontSans}`, color: PALETTE.emerald, textDecoration: "none" }}>✉️ {site.contactEmail}</a>}
                    {site.contactAddress && <p style={{ font: `400 14px/1.65 ${fontSans}`, color: PALETTE.mutedInk, margin: 0 }}>{site.contactAddress}</p>}
                  </div>
                  {site.visitHours && (
                    <div style={{ background: "rgba(201,162,74,0.12)", border: "1px solid rgba(201,162,74,0.4)", borderRadius: 16, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ font: `700 13px/1 ${fontSans}`, letterSpacing: "0.08em", textTransform: "uppercase", color: PALETTE.goldDark }}>Visit hours</span>
                      <p style={{ font: `400 14px/1.65 ${fontSans}`, color: PALETTE.mutedInk, margin: 0 }}>{site.visitHours}</p>
                    </div>
                  )}
                </div>
                {site.contactAddress && (
                  <div style={{ background: "#E8E2D2", border: "1px solid rgba(201,162,74,0.35)", borderRadius: 20, minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={PALETTE.goldDark} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span style={{ font: `600 15px/1.3 ${fontSans}`, color: PALETTE.muted }}>Embedded map</span>
                    <span style={{ font: `400 12px/1.3 ${fontSans}`, color: PALETTE.mutedLight }}>Google Maps embed goes here</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ============ FOOTER ============ */}
      <footer style={{ background: PALETTE.emeraldDark, paddingBlock: "64px 32px", paddingInline: 24 }}>
        <div style={{ ...containerMax, display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 300 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {site.org.logoUrl && <img src={site.org.logoUrl} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid rgba(201,162,74,0.5)" }} loading="lazy" />}
                <span style={{ font: `600 18px/1.1 ${fontSerif}`, color: PALETTE.cream }}>{site.org.name}</span>
              </div>
              {site.org.motto && <p style={{ font: `400 13px/1.65 ${fontSans}`, color: "rgba(250,246,238,0.55)", margin: 0 }}>{site.org.motto}</p>}
            </div>
            <nav aria-label="Footer" style={{ display: "flex", gap: 56, flexWrap: "wrap" }}>
              <FooterGroup title="School" links={[["About", "#about"], ["Programs", "#programs"], ["Faculty", "#faculty"], ["Campuses", "#campuses"]]} />
              <FooterGroup title="Parents" links={[["Admissions", "#admissions"], ["Contact", "#contact"], ...(whatsappHref ? [["WhatsApp", whatsappHref] as [string, string]] : [])]} />
            </nav>
          </div>
          <div style={{ borderBlockStart: "1px solid rgba(250,246,238,0.12)", paddingBlockStart: 24, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ font: `400 13px/1.4 ${fontSans}`, color: "rgba(250,246,238,0.5)" }}>© {site.org.name} {new Date().getFullYear()} · All rights reserved</span>
            <span style={{ font: `500 12px/1.4 ${fontSans}`, color: "rgba(250,246,238,0.4)", fontVariantNumeric: "tabular-nums" }}>iqraifs.com/{site.org.slug}</span>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp button */}
      {whatsappHref && (
        <a href={whatsappHref} aria-label="WhatsApp us" style={{
          position: "fixed", bottom: 24, insetInlineEnd: 24, zIndex: 60,
          width: 58, height: 58, borderRadius: "50%", background: "#25D366",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 12px 32px -8px rgba(0,0,0,0.4)",
        }}>
          <WhatsAppIcon size={30} fill="#fff" />
        </a>
      )}
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────

function ProgramIcon({ kind }: { kind: "primary" | "secondary" }) {
  if (kind === "secondary") {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PALETTE.emerald} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19.5V6a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2z" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-4" />
        <path d="M9 8h7M9 12h5" />
      </svg>
    );
  }
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PALETTE.goldDark} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5c-1.8-1.4-4.2-2-7-2v15c2.8 0 5.2.6 7 2 1.8-1.4 4.2-2 7-2V3c-2.8 0-5.2.6-7 2z" />
      <path d="M12 5v15" />
    </svg>
  );
}

function WhatsAppIcon({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.4 3.9 2.6 1.1 2.6.7 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}

function FooterGroup({ title, links }: { title: string; links: Array<[string, string]> }) {
  const fontSans = "'Plus Jakarta Sans', sans-serif";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ font: `700 12px/1 ${fontSans}`, letterSpacing: "0.12em", textTransform: "uppercase", color: PALETTE.gold }}>{title}</span>
      {links.map(([label, href]) => (
        <a key={label} href={href} style={{ font: `400 14px/1.4 ${fontSans}`, color: "rgba(250,246,238,0.75)", textDecoration: "none" }}>{label}</a>
      ))}
    </div>
  );
}

function VisitForm({ contactEmail, schoolName }: { contactEmail: string | null; schoolName: string }) {
  const fontSans = "'Plus Jakarta Sans', sans-serif";
  const fontSerif = "'Frank Ruhl Libre', serif";
  const inputStyle = {
    font: `400 15px/1.4 ${fontSans}`, color: PALETTE.ink, background: PALETTE.cream,
    border: "1px solid rgba(201,162,74,0.45)", borderRadius: 10, padding: "13px 16px",
  } as const;
  const labelStyle = { display: "flex", flexDirection: "column" as const, gap: 6, font: `600 13px/1 ${fontSans}`, color: PALETTE.mutedInk };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactEmail) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const grade = String(fd.get("grade") ?? "");
    const phone = String(fd.get("phone") ?? "");
    const campus = String(fd.get("campus") ?? "");
    const subject = encodeURIComponent(`Campus visit request — ${name}`);
    const body = encodeURIComponent(
      `Assalamu alaikum,\n\nI would like to visit a campus.\n\nName: ${name}\nChild's grade: ${grade}\nPhone: ${phone}\nPreferred campus: ${campus}\n\nJazakAllah khair.`
    );
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={submit} style={{ background: PALETTE.creamHi, borderRadius: 24, padding: 40, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 32px 80px -32px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h3 style={{ font: `600 26px/1.2 ${fontSerif}`, color: PALETTE.ink, margin: 0 }}>Request a visit</h3>
        <p style={{ font: `400 14px/1.5 ${fontSans}`, color: PALETTE.muted, margin: 0 }}>
          We'll call you back the same day, insha'Allah.
        </p>
      </div>
      <label style={labelStyle}>Your name
        <input type="text" name="name" required placeholder="e.g. Ahmed Khan" style={inputStyle} />
      </label>
      <label style={labelStyle}>Child's grade
        <select name="grade" style={inputStyle as any}>
          {["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Hifz program","Hybrid"].map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>Phone (WhatsApp preferred)
        <input type="tel" name="phone" required placeholder="03xx xxxxxxx" style={inputStyle} />
      </label>
      <label style={labelStyle}>Preferred campus
        <input type="text" name="campus" placeholder="Main campus" style={inputStyle} />
      </label>
      <button type="submit" disabled={!contactEmail} style={{
        background: PALETTE.emerald, color: PALETTE.cream, border: "none", cursor: contactEmail ? "pointer" : "not-allowed",
        font: `700 16px/1 'Plus Jakarta Sans', sans-serif`, padding: "16px 24px", borderRadius: 999, marginBlockStart: 6,
        opacity: contactEmail ? 1 : 0.5,
      }}>Request a visit</button>
      <p style={{ font: `400 12px/1.5 'Plus Jakarta Sans', sans-serif`, color: PALETTE.mutedLight, margin: 0, textAlign: "center" }}>
        Opens your email app addressed to {contactEmail ?? "the school office"}.
      </p>
    </form>
  );
}

// ─── Utils ───────────────────────────────────────────────────────────

// Highlight the last word of the hero title in italic gold, matching
// the design's "Where Quran meets *character*" treatment. If the title
// is one word, leave it plain.
function renderHeroTitle(title: string): React.ReactNode {
  const parts = title.split(/\s+/);
  if (parts.length < 2) return title;
  const last = parts.pop()!;
  return (
    <>
      {parts.join(" ")}{" "}
      <em style={{ fontStyle: "italic", color: PALETTE.gold }}>{last}</em>
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatTermDates(startIso: string, endIso: string): string {
  try {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const s = new Date(`${startIso}T00:00:00`).toLocaleDateString("en-US", opts);
    const e = new Date(`${endIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${s} – ${e}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

function shortAddress(addr: string): string {
  // Show the first comma-separated chunk + "& more" if the field has
  // multiple locations, keeping the hero strip terse.
  const parts = addr.split(/[\n;]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return addr;
  return parts.slice(0, 1).join("") + " · " + (parts.length - 1) + " more locations";
}

export default SchoolPublicSite;
