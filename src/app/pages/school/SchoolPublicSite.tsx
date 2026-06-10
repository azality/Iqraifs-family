// SchoolPublicSite — public marketing page for one school.
//
// Route: /:orgSlug — when settings.public_site.enabled is true, this is
// shown instead of the unified login. A small "Sign in" pill in the top-
// right takes the user to /:orgSlug/login (unified login).
//
// Phase 1: hero + about + contact only. No live data feeds yet. Future
// phases plug in school timings (from timetable_slot), key announcements
// (announcement rows flagged publish_publicly), photo gallery, faculty
// wall, and an "Apply now" CTA.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Mail, Phone, MapPin, LogIn, GraduationCap } from "lucide-react";
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
  const heroTitle = site.heroTitle || site.org.name;
  const heroTagline = site.heroTagline || site.org.motto || "";

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar with login pill */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to={`/${orgSlug}`} className="flex items-center gap-2 min-w-0">
            {site.org.logoUrl ? (
              <img src={site.org.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-semibold"
                   style={{ background: theme }}>
                {site.org.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-slate-900 truncate">{site.org.name}</span>
          </Link>
          <Link
            to={`/${orgSlug}/login`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-1.5 rounded-md hover:opacity-90"
            style={{ background: theme }}
          >
            <LogIn className="h-4 w-4" /> Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        {site.heroImageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${site.heroImageUrl})` }}
          />
        )}
        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase"
               style={{ background: `${theme}1a`, color: theme }}>
            <GraduationCap className="h-3.5 w-3.5" /> School portal
          </div>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-slate-900">
            {heroTitle}
          </h1>
          {heroTagline && (
            <p className="mt-3 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
              {heroTagline}
            </p>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to={`/${orgSlug}/login`}
              className="inline-flex items-center gap-2 text-sm sm:text-base font-medium text-white px-5 py-2.5 rounded-md hover:opacity-90"
              style={{ background: theme }}
            >
              <LogIn className="h-4 w-4" /> Parent / Student / Staff sign in
            </Link>
          </div>
        </div>
      </section>

      {/* About */}
      {site.about && (
        <section className="max-w-3xl mx-auto px-4 py-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">About</h2>
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{site.about}</p>
        </section>
      )}

      {/* Contact */}
      {(site.contactEmail || site.contactPhone || site.contactAddress) && (
        <section className="max-w-3xl mx-auto px-4 py-8 border-t border-slate-200">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {site.contactPhone && (
              <a href={`tel:${site.contactPhone}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                <Phone className="h-4 w-4" style={{ color: theme }} /> {site.contactPhone}
              </a>
            )}
            {site.contactEmail && (
              <a href={`mailto:${site.contactEmail}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                <Mail className="h-4 w-4" style={{ color: theme }} /> {site.contactEmail}
              </a>
            )}
            {site.contactAddress && (
              <div className="flex items-start gap-2 text-slate-700">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: theme }} />
                <span className="whitespace-pre-wrap">{site.contactAddress}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="max-w-6xl mx-auto px-4 py-8 border-t border-slate-200 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {site.org.name} · Powered by Family Growth System
      </footer>
    </div>
  );
}

export default SchoolPublicSite;
