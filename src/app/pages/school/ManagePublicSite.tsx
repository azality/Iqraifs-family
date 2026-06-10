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
  const [about, setAbout] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");

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
        setAbout(s.about ?? "");
        setContactEmail(s.contactEmail ?? "");
        setContactPhone(s.contactPhone ?? "");
        setContactAddress(s.contactAddress ?? "");
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
        heroTitle, heroTagline, heroImageUrl,
        about,
        contactEmail, contactPhone, contactAddress,
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
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                         placeholder="+92 21 1234 5678" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                         placeholder="hello@school.edu" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Textarea value={contactAddress} onChange={(e) => setContactAddress(e.target.value)}
                          rows={2} placeholder="Block 4, Clifton, Karachi, Pakistan" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ManagePublicSite;
