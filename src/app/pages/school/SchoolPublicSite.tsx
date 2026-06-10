// SchoolPublicSite — public marketing page for one school.
//
// Phase 3: faculty wall + photo gallery + stat strip + heavier visual
// chrome (gradient hero, anchor nav, animated highlight cards). Pulls
// live data from the public-site endpoint.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Mail, Phone, MapPin, LogIn, GraduationCap, Clock, Calendar, Megaphone,
  Users, ArrowRight, Sparkles,
} from "lucide-react";
import {
  getPublicSite,
  type PublicSiteResponse,
} from "../../../utils/schoolApi";

export function SchoolPublicSite() {
  const { orgSlug = "" } = useParams<{ orgSlug: string }>();
  const [site, setSite] = useState<PublicSiteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgSlug) return;
    getPublicSite(orgSlug)
      .then(setSite)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [orgSlug]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">School not found.</div>
      </div>
    );
  }
  if (!site) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const theme = site.org.themeColor || "#0f766e";
  const themeDark = darken(theme, 18);
  const heroTitle = site.heroTitle || site.org.name;
  const heroTagline = site.heroTagline || site.org.motto || "";

  const sections: Array<{ id: string; label: string; show: boolean }> = [
    { id: "about", label: "About", show: !!site.about },
    { id: "faculty", label: "Faculty", show: (site.faculty?.length ?? 0) > 0 },
    { id: "gallery", label: "Gallery", show: (site.gallery?.length ?? 0) > 0 },
    { id: "news", label: "News", show: (site.announcements?.length ?? 0) > 0 },
    { id: "contact", label: "Contact", show: !!(site.contactEmail || site.contactPhone || site.contactAddress) },
  ].filter((s) => s.show);

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky top bar with anchor nav + sign-in pill */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to={`/${orgSlug}`} className="flex items-center gap-2 min-w-0">
            {site.org.logoUrl ? (
              <img src={site.org.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
            ) : (
              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold ring-1 ring-slate-200"
                   style={{ background: `linear-gradient(135deg, ${theme}, ${themeDark})` }}>
                {site.org.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-slate-900 truncate">{site.org.name}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`}
                 className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-100">
                {s.label}
              </a>
            ))}
          </nav>
          <Link
            to={`/${orgSlug}/login`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-1.5 rounded-md hover:opacity-90 shadow-sm"
            style={{ background: theme }}
          >
            <LogIn className="h-4 w-4" /> Sign in
          </Link>
        </div>
      </header>

      {/* Hero with gradient + optional image overlay */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: site.heroImageUrl
              ? `linear-gradient(135deg, ${theme}cc 0%, ${themeDark}d9 100%)`
              : `linear-gradient(135deg, ${theme}1a 0%, ${themeDark}33 100%)`,
          }}
        />
        {site.heroImageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center mix-blend-overlay opacity-50"
            style={{ backgroundImage: `url(${site.heroImageUrl})` }}
          />
        )}
        <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28 text-center">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase backdrop-blur-sm ${site.heroImageUrl ? "bg-white/20 text-white" : ""}`}
               style={!site.heroImageUrl ? { background: `${theme}1a`, color: themeDark } : {}}>
            <Sparkles className="h-3.5 w-3.5" /> {site.term?.name ?? "School portal"}
          </div>
          <h1 className={`mt-5 text-4xl sm:text-6xl font-bold tracking-tight ${site.heroImageUrl ? "text-white" : "text-slate-900"}`}>
            {heroTitle}
          </h1>
          {heroTagline && (
            <p className={`mt-4 text-base sm:text-xl max-w-2xl mx-auto ${site.heroImageUrl ? "text-white/90" : "text-slate-600"}`}>
              {heroTagline}
            </p>
          )}
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to={`/${orgSlug}/login`}
              className="inline-flex items-center gap-2 text-sm sm:text-base font-medium text-white px-6 py-3 rounded-md hover:opacity-90 shadow-md"
              style={{ background: site.heroImageUrl ? "white" : theme, color: site.heroImageUrl ? theme : "white" }}
            >
              <LogIn className="h-4 w-4" /> Parent / Student / Staff sign in
            </Link>
            {site.contactPhone && (
              <a href={`tel:${site.contactPhone}`}
                 className={`inline-flex items-center gap-2 text-sm font-medium px-5 py-3 rounded-md border ${site.heroImageUrl ? "border-white/40 text-white hover:bg-white/10" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                <Phone className="h-4 w-4" /> Call us
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Highlights strip (admin-curated stats) */}
      {(site.highlights?.length ?? 0) > 0 && (
        <section className="max-w-5xl mx-auto px-4 -mt-8 relative z-10">
          <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(site.highlights ?? []).slice(0, 4).map((h, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold" style={{ color: theme }}>{h.value}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">{h.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Term banner + School hours strip */}
      {(site.term || (site.timings && (site.timings.firstStart || site.timings.lastEnd))) && (
        <section className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {site.term && (
            <div className="rounded-xl border p-4 flex items-start gap-3"
                 style={{ borderColor: `${theme}33`, background: `${theme}08` }}>
              <Calendar className="h-5 w-5 mt-0.5 shrink-0" style={{ color: theme }} />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: theme }}>Current term</div>
                <div className="text-sm font-semibold text-slate-900">{site.term.name}</div>
                <div className="text-xs text-slate-600">{site.term.startDate} → {site.term.endDate}</div>
              </div>
            </div>
          )}
          {site.timings && (site.timings.firstStart || site.timings.lastEnd) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
              <Clock className="h-5 w-5 mt-0.5 shrink-0 text-slate-600" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600">School hours</div>
                <div className="text-sm font-semibold text-slate-900">
                  {site.timings.firstStart?.slice(0,5)} – {site.timings.lastEnd?.slice(0,5)}
                </div>
                {site.timings.daysOfWeek.length > 0 && (
                  <div className="text-xs text-slate-500">
                    {site.timings.daysOfWeek.map((d) => ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d - 1]).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* About */}
      {site.about && (
        <section id="about" className="max-w-3xl mx-auto px-4 py-10">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: theme }}>About us</h2>
          <p className="text-base text-slate-700 whitespace-pre-wrap leading-relaxed">{site.about}</p>
        </section>
      )}

      {/* Faculty wall */}
      {(site.faculty?.length ?? 0) > 0 && (
        <section id="faculty" className="bg-slate-50 border-y border-slate-200">
          <div className="max-w-5xl mx-auto px-4 py-12">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme }}>Our faculty</h2>
                <p className="text-2xl font-bold text-slate-900">Meet the team</p>
              </div>
              <Users className="h-6 w-6 text-slate-400" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {site.faculty!.map((f, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition">
                  <div className="flex items-center gap-3">
                    {f.photoUrl ? (
                      <img src={f.photoUrl} alt={f.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100" />
                    ) : (
                      <div className="h-14 w-14 rounded-full flex items-center justify-center font-bold text-white"
                           style={{ background: `linear-gradient(135deg, ${theme}, ${themeDark})` }}>
                        {f.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{f.name}</div>
                      {f.role && <div className="text-xs text-slate-500">{f.role}</div>}
                    </div>
                  </div>
                  {f.bio && (
                    <p className="text-xs text-slate-600 mt-3 leading-relaxed whitespace-pre-wrap line-clamp-4">{f.bio}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Gallery */}
      {(site.gallery?.length ?? 0) > 0 && (
        <section id="gallery" className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme }}>Life on campus</h2>
          <p className="text-2xl font-bold text-slate-900 mb-6">Gallery</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {site.gallery!.map((g, i) => (
              <a key={i} href={g.url} target="_blank" rel="noopener noreferrer"
                 className="block group overflow-hidden rounded-xl bg-slate-100 aspect-square relative">
                <img src={g.url} alt={g.caption ?? ""}
                     className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {g.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <div className="text-[11px] text-white font-medium">{g.caption}</div>
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* News */}
      {(site.announcements?.length ?? 0) > 0 && (
        <section id="news" className="bg-slate-50 border-y border-slate-200">
          <div className="max-w-3xl mx-auto px-4 py-12">
            <h2 className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: theme }}>
              <Megaphone className="h-3.5 w-3.5" /> News
            </h2>
            <p className="text-2xl font-bold text-slate-900 mb-6">Latest from {site.org.name}</p>
            <ul className="space-y-3">
              {site.announcements!.map((a) => (
                <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-base font-semibold text-slate-900">{a.title}</div>
                    <div className="text-[11px] text-slate-500 shrink-0">
                      {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Contact */}
      {(site.contactEmail || site.contactPhone || site.contactAddress) && (
        <section id="contact" className="max-w-5xl mx-auto px-4 py-12">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme }}>Get in touch</h2>
          <p className="text-2xl font-bold text-slate-900 mb-6">Contact us</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {site.contactPhone && (
              <a href={`tel:${site.contactPhone}`}
                 className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition">
                <Phone className="h-5 w-5 mb-2" style={{ color: theme }} />
                <div className="text-xs text-slate-500 uppercase tracking-wider">Phone</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{site.contactPhone}</div>
              </a>
            )}
            {site.contactEmail && (
              <a href={`mailto:${site.contactEmail}`}
                 className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition">
                <Mail className="h-5 w-5 mb-2" style={{ color: theme }} />
                <div className="text-xs text-slate-500 uppercase tracking-wider">Email</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{site.contactEmail}</div>
              </a>
            )}
            {site.contactAddress && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <MapPin className="h-5 w-5 mb-2" style={{ color: theme }} />
                <div className="text-xs text-slate-500 uppercase tracking-wider">Address</div>
                <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{site.contactAddress}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Big CTA strip */}
      <section className="border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-12 text-center"
             style={{ background: `linear-gradient(135deg, ${theme}0a, ${themeDark}14)` }}>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Ready to join the {site.org.name} family?</h2>
          <p className="text-slate-600 max-w-xl mx-auto mb-6">Sign in to the portal or get in touch with us.</p>
          <Link
            to={`/${orgSlug}/login`}
            className="inline-flex items-center gap-2 text-sm font-medium text-white px-6 py-3 rounded-md shadow-md hover:opacity-90"
            style={{ background: theme }}
          >
            Open the portal <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {site.org.name} · Powered by Family Growth System
      </footer>
    </div>
  );
}

// Tiny color util — darken a hex by N percent.
function darken(hex: string, pct: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.max(0, Math.floor(parseInt(c.slice(0, 2), 16) * (1 - pct / 100)));
  const g = Math.max(0, Math.floor(parseInt(c.slice(2, 4), 16) * (1 - pct / 100)));
  const b = Math.max(0, Math.floor(parseInt(c.slice(4, 6), 16) * (1 - pct / 100)));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export default SchoolPublicSite;
