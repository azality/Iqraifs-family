// ManagePublicSite — content editor for the public school marketing site.
//
// Route: /school/orgs/:orgId/admin/public-site
//
// Visible to anyone with the manage_public_site permission. Principal +
// admin get it by default; principal can delegate via the existing
// permissions matrix (role_template_override) — e.g. give office_staff
// the manage_public_site key without granting them anything else.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Eye, Save, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Card, CardContent } from "../../components/ui/card";
import {
  getSchoolMe,
  getOrganization,
  getPublicSite, savePublicSite,
  type PublicSiteResponse, type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

export function ManagePublicSite() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [site, setSite] = useState<PublicSiteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Form fields.
  const [enabled, setEnabled] = useState(false);
  const [heroTitle, setHeroTitle] = useState("");
  const [heroTagline, setHeroTagline] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroKicker, setHeroKicker] = useState("");
  const [about, setAbout] = useState("");
  const [highlights, setHighlights] = useState<Array<{ label: string; value: string }>>([]);
  const [gallery, setGallery] = useState<Array<{ url: string; caption?: string }>>([]);
  const [faculty, setFaculty] = useState<Array<{ name: string; role?: string; bio?: string; photoUrl?: string; department?: string }>>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [visitHours, setVisitHours] = useState("");
  const [ayahArabic, setAyahArabic] = useState("");
  const [ayahTranslation, setAyahTranslation] = useState("");
  const [ayahReference, setAyahReference] = useState("");
  const [programs, setPrograms] = useState<Array<{ name: string; summary: string; kind?: "primary" | "secondary" }>>([]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    // Look up the slug from the org directly — me.organizations may not
    // be populated, and even chain principals (school_group scope) can
    // be missing the org from the list while still having authority.
    getOrganization(orgId)
      .then((r) => getPublicSite(r.organization.slug))
      .then((s) => {
        setSite(s);
        setEnabled(s.enabled);
        setHeroTitle(s.heroTitle ?? "");
        setHeroTagline(s.heroTagline ?? "");
        setHeroImageUrl(s.heroImageUrl ?? "");
        setHeroKicker(s.heroKicker ?? "");
        setAbout(s.about ?? "");
        setContactEmail(s.contactEmail ?? "");
        setContactPhone(s.contactPhone ?? "");
        setContactAddress(s.contactAddress ?? "");
        setWhatsappPhone(s.whatsappPhone ?? "");
        setVisitHours(s.visitHours ?? "");
        setAyahArabic(s.ayah?.arabic ?? "");
        setAyahTranslation(s.ayah?.translation ?? "");
        setAyahReference(s.ayah?.reference ?? "");
        setPrograms(s.programs ?? []);
        setHighlights(s.highlights ?? []);
        setGallery(s.gallery ?? []);
        setFaculty(s.faculty ?? []);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (meLoading) return null;
  // No client-side role gate — the backend PUT re-enforces the
  // manage_public_site permission. RequireParentRole on the parent
  // route already keeps unauthenticated users out.

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await savePublicSite(orgId, {
        enabled,
        heroTitle, heroTagline, heroImageUrl, heroKicker,
        about,
        contactEmail, contactPhone, contactAddress,
        whatsappPhone, visitHours,
        ayah: {
          arabic: ayahArabic.trim() || undefined,
          translation: ayahTranslation.trim() || undefined,
          reference: ayahReference.trim() || undefined,
        },
        programs: programs.filter((p) => p.name && p.summary),
        highlights: highlights.filter((h) => h.label && h.value),
        gallery: gallery.filter((g) => g.url),
        faculty: faculty.filter((f) => f.name),
      });
      setSite(r);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const slug = site?.org.slug;
  const previewUrl = slug ? `/${slug}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/settings`}>
          <Button variant="outline" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Settings</Button>
        </Link>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved at {savedAt}
            </span>
          )}
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Eye className="h-3.5 w-3.5 mr-1" /> Preview
              </Button>
            </a>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Public school site</h1>
        <p className="mt-1 text-sm text-slate-600">
          Edit the marketing page parents see at <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{previewUrl ?? "/your-school-slug"}</code>.
          The Sign-in pill in the top-right always lands at the login page.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="text-sm font-medium text-slate-900">
                  Show public site at <code className="bg-slate-100 px-1 py-0.5 rounded">{previewUrl}</code>
                </span>
              </label>
              <p className="text-xs text-slate-500 -mt-1 pl-6">
                When off, /your-slug goes straight to the login page (current behaviour).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Hero</div>
              <div className="space-y-1">
                <Label className="text-xs">Hero title</Label>
                <Input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)}
                       placeholder="e.g. Welcome to Iqra Academy" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tagline</Label>
                <Input value={heroTagline} onChange={(e) => setHeroTagline(e.target.value)}
                       placeholder="e.g. Where Quran meets character" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hero background image URL (optional)</Label>
                <Input value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)}
                       placeholder="https://…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kicker line above the hero title (optional)</Label>
                <Input value={heroKicker} onChange={(e) => setHeroKicker(e.target.value)}
                       placeholder="e.g. iqraifs.com/your-slug · live from app" />
                <p className="text-[11px] text-slate-500">Small pill text above the headline. Leave blank for the default.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">About</div>
              <Textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={6}
                placeholder="A few short paragraphs about the school — mission, what makes it different, age range, etc."
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Quran callout (ayah / quote)</div>
              <p className="text-[11px] text-slate-500 -mt-1">Optional. Renders alongside the About section as a dark quote block. Leave blank to hide.</p>
              <div className="space-y-1">
                <Label className="text-xs">Arabic text</Label>
                <Input dir="rtl" lang="ar" value={ayahArabic} onChange={(e) => setAyahArabic(e.target.value)}
                       placeholder="اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Translation</Label>
                <Input value={ayahTranslation} onChange={(e) => setAyahTranslation(e.target.value)}
                       placeholder='e.g. "Read, in the name of your Lord who created."' />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference</Label>
                <Input value={ayahReference} onChange={(e) => setAyahReference(e.target.value)}
                       placeholder="Surah Al-'Alaq · 96:1" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Programs</div>
                <Button variant="outline" size="sm" onClick={() => setPrograms([...programs, { name: "", summary: "", kind: "primary" }])}
                        disabled={programs.length >= 4}>+ Add</Button>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">Up to 4 program cards. Leave blank to use platform defaults (Hifz / Mainstream / Hybrid).</p>
              <div className="space-y-2">
                {programs.map((p, i) => (
                  <div key={i} className="rounded-md border border-slate-200 p-3 space-y-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input value={p.name} placeholder="Program name (e.g. Hifz Program)"
                             onChange={(e) => setPrograms(programs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <select value={p.kind ?? "primary"}
                              onChange={(e) => setPrograms(programs.map((x, j) => j === i ? { ...x, kind: e.target.value as any } : x))}
                              className="border border-slate-300 rounded px-2 text-xs">
                        <option value="primary">Gold icon</option>
                        <option value="secondary">Green icon</option>
                      </select>
                    </div>
                    <Textarea value={p.summary} rows={2} placeholder="One-sentence summary"
                              onChange={(e) => setPrograms(programs.map((x, j) => j === i ? { ...x, summary: e.target.value } : x))} />
                    <div className="text-right">
                      <Button variant="outline" size="sm"
                              onClick={() => setPrograms(programs.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                         placeholder="+92 21 1234 5678" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp number (optional)</Label>
                  <Input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)}
                         placeholder="+92 300 1234 567" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                         placeholder="hello@school.edu" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Visit hours (optional)</Label>
                  <Input value={visitHours} onChange={(e) => setVisitHours(e.target.value)}
                         placeholder="Mon–Fri 9 AM – 1 PM. Pause for Zuhr." />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Textarea value={contactAddress} onChange={(e) => setContactAddress(e.target.value)}
                          rows={2} placeholder="Block 4, Clifton, Karachi, Pakistan" />
              </div>
            </CardContent>
          </Card>

          {/* Highlights strip (up to 4 stat tiles) */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Highlights strip</div>
                <Button variant="outline" size="sm" onClick={() => setHighlights([...highlights, { label: "", value: "" }])}
                        disabled={highlights.length >= 6}>+ Add</Button>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">Up to 4 short stats shown across the top of the public site (e.g. "350 Students", "Est. 2018").</p>
              <div className="space-y-2">
                {highlights.map((h, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input value={h.label} placeholder="Label (e.g. Students)"
                           onChange={(e) => setHighlights(highlights.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                    <Input value={h.value} placeholder="Value (e.g. 350)"
                           onChange={(e) => setHighlights(highlights.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                    <Button variant="outline" size="sm"
                            onClick={() => setHighlights(highlights.filter((_, j) => j !== i))}>×</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Faculty wall */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Faculty wall</div>
                <Button variant="outline" size="sm" onClick={() => setFaculty([...faculty, { name: "", role: "", bio: "", photoUrl: "" }])}
                        disabled={faculty.length >= 24}>+ Add</Button>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">Curated list of staff to feature. Visitors see name, role, photo, and a short bio.</p>
              <div className="space-y-3">
                {faculty.map((f, i) => (
                  <div key={i} className="rounded-md border border-slate-200 p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input value={f.name} placeholder="Name (e.g. Sheikh Abdullah)"
                             onChange={(e) => setFaculty(faculty.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <Input value={f.role ?? ""} placeholder="Role (e.g. Head of Quran)"
                             onChange={(e) => setFaculty(faculty.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
                    </div>
                    <Input value={f.department ?? ""} placeholder="Department / group label (e.g. Leadership & Quran)"
                           onChange={(e) => setFaculty(faculty.map((x, j) => j === i ? { ...x, department: e.target.value } : x))} />
                    <Input value={f.photoUrl ?? ""} placeholder="Photo URL (optional)"
                           onChange={(e) => setFaculty(faculty.map((x, j) => j === i ? { ...x, photoUrl: e.target.value } : x))} />
                    <Textarea value={f.bio ?? ""} rows={2} placeholder="Short bio (optional)"
                              onChange={(e) => setFaculty(faculty.map((x, j) => j === i ? { ...x, bio: e.target.value } : x))} />
                    <div className="text-right">
                      <Button variant="outline" size="sm"
                              onClick={() => setFaculty(faculty.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Photo gallery */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Photo gallery</div>
                <Button variant="outline" size="sm" onClick={() => setGallery([...gallery, { url: "", caption: "" }])}
                        disabled={gallery.length >= 24}>+ Add</Button>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">Paste image URLs (Cloudinary, Imgur, your own hosting). Direct upload coming in a follow-up.</p>
              <div className="space-y-2">
                {gallery.map((g, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input value={g.url} placeholder="https://image.url/photo.jpg"
                           onChange={(e) => setGallery(gallery.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                    <Input value={g.caption ?? ""} placeholder="Caption (optional)"
                           onChange={(e) => setGallery(gallery.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))} />
                    <Button variant="outline" size="sm"
                            onClick={() => setGallery(gallery.filter((_, j) => j !== i))}>×</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ManagePublicSite;
