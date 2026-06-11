// School-level Settings page. Principal-only.
//
// Routed at /school/orgs/:orgId/admin/settings. Lets the principal edit
// org meta (name, contact info, address) and the current academic year,
// plus a placeholder danger-zone for future archive support.

import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
} from "../../components/school-ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import {
  deleteSchool,
  getOrganization,
  getSchoolMe,
  isOrgPrincipal,
  listAdmins,
  listAdminTeachers,
  transferOwnership,
  updateOrganization,
  type OrgAdmin,
  type AdminTeacher,
  type OrgWithCounts,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { pickTourForUser, resetTour } from "../../../utils/tours";

interface OrgFormState {
  name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  // PR C #5: branding + timezone editors. Stored in
  // organizations.settings jsonb on the backend.
  timezone: string;
  logo_url: string;
  theme_color: string;
  school_motto: string;
  // School hours: visible to students/parents. Office hours: staff
  // attendance window. Calendar uses office_hours to set the time axis;
  // school_hours is a soft annotation rendered on top.
  school_day_start: string; // HH:MM
  school_day_end: string;
  office_day_start: string;
  office_day_end: string;
}

export function OrgSettings() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [org, setOrg] = useState<OrgWithCounts | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  const [orgForm, setOrgForm] = useState<OrgFormState>({
    name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    timezone: "",
    logo_url: "",
    theme_color: "",
    school_motto: "",
    school_day_start: "",
    school_day_end: "",
    office_day_start: "",
    office_day_end: "",
  });
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSavedAt, setOrgSavedAt] = useState<number | null>(null);

  const [academicYear, setAcademicYear] = useState("");
  const [yearSaving, setYearSaving] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [yearSavedAt, setYearSavedAt] = useState<number | null>(null);

  // School year + holidays. Lives under settings.school_year as a
  // single JSON blob. Drives working-day calc + future attendance pre-
  // fill (no system today reads it, so saving is non-destructive).
  const [yearStartDate, setYearStartDate] = useState("");
  const [yearEndDate, setYearEndDate] = useState("");
  const [yearSchoolDays, setYearSchoolDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [yearHolidays, setYearHolidays] = useState<Array<{ name: string; startDate: string; endDate: string }>>([]);
  const [syearSaving, setSyearSaving] = useState(false);
  const [syearError, setSyearError] = useState<string | null>(null);
  const [syearSavedAt, setSyearSavedAt] = useState<number | null>(null);

  // Custom URL slug — drives iqraifs.com/:slug as the school's unified
  // login URL. We keep it in its own form section (separate Save) so a
  // typo in the org name can't accidentally orphan an active slug.
  const [slugInput, setSlugInput] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSavedAt, setSlugSavedAt] = useState<number | null>(null);

  // Delete-school state — typed-name confirmation. We compare against the
  // CURRENT loaded org name (not the unsaved form value) so that an
  // accidental rename-then-delete doesn't bypass the guard.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Transfer-ownership state. Candidates = all current admins + teachers
  // of this org; we exclude the caller (self-transfer is blocked server-
  // side too). Showing only existing staff keeps the principal from
  // typing arbitrary emails and accidentally creating an account.
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [transferTyped, setTransferTyped] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<
    Array<{ user_id: string; full_name: string; email: string; role: string }>
  >([]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setOrgLoading(true);
    getOrganization(orgId)
      .then((o) => {
        setOrg(o);
        setOrgForm({
          name: o.organization.name ?? "",
          contact_email:
            (o.organization.settings?.contact_email as string | undefined) ?? "",
          contact_phone:
            (o.organization.settings?.contact_phone as string | undefined) ?? "",
          address: (o.organization.settings?.address as string | undefined) ?? "",
          timezone: (o.organization.settings?.timezone as string | undefined) ?? "",
          logo_url: (o.organization.settings?.logo_url as string | undefined) ?? "",
          theme_color: (o.organization.settings?.theme_color as string | undefined) ?? "",
          school_motto: (o.organization.settings?.school_motto as string | undefined) ?? "",
          school_day_start: (o.organization.settings?.school_day_start as string | undefined) ?? "",
          school_day_end: (o.organization.settings?.school_day_end as string | undefined) ?? "",
          office_day_start: (o.organization.settings?.office_day_start as string | undefined) ?? "",
          office_day_end: (o.organization.settings?.office_day_end as string | undefined) ?? "",
        });
        setAcademicYear(
          (o.organization.settings?.academic_year as string | undefined) ?? "",
        );
        const sy: any = (o.organization.settings as any)?.school_year ?? {};
        setYearStartDate(typeof sy.startDate === "string" ? sy.startDate : "");
        setYearEndDate(typeof sy.endDate === "string" ? sy.endDate : "");
        setYearSchoolDays(Array.isArray(sy.schoolDays) && sy.schoolDays.length > 0 ? sy.schoolDays : [1, 2, 3, 4, 5]);
        setYearHolidays(Array.isArray(sy.holidays) ? sy.holidays : []);
        setSlugInput((o.organization as any).slug ?? "");
      })
      .catch((e) => setOrgError(e instanceof Error ? e.message : String(e)))
      .finally(() => setOrgLoading(false));
  }, [orgId]);

  if (meLoading) return null;
  if (!isOrgPrincipal(me, orgId)) {
    return <Navigate to={`/school/orgs/${orgId}`} replace />;
  }

  const handleOrgSave = async () => {
    setOrgSaving(true);
    setOrgError(null);
    try {
      await updateOrganization(orgId, {
        name: orgForm.name,
        contact_email: orgForm.contact_email,
        contact_phone: orgForm.contact_phone,
        address: orgForm.address,
        timezone: orgForm.timezone,
        logo_url: orgForm.logo_url,
        theme_color: orgForm.theme_color,
        school_motto: orgForm.school_motto,
        school_day_start: orgForm.school_day_start,
        school_day_end: orgForm.school_day_end,
        office_day_start: orgForm.office_day_start,
        office_day_end: orgForm.office_day_end,
      });
      setOrgSavedAt(Date.now());
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrgSaving(false);
    }
  };

  const handleSlugSave = async () => {
    setSlugSaving(true);
    setSlugError(null);
    try {
      await updateOrganization(orgId, { slug: slugInput.trim().toLowerCase() });
      setSlugSavedAt(Date.now());
      // Refresh so the read-back reflects what the server stored (server
      // lowercases + trims). Avoids confusion if the user typed "IQRA-Demo".
      const refreshed = await getOrganization(orgId);
      setSlugInput((refreshed.organization as any).slug ?? "");
    } catch (e) {
      setSlugError(e instanceof Error ? e.message : String(e));
    } finally {
      setSlugSaving(false);
    }
  };

  const handleYearSave = async () => {
    setYearSaving(true);
    setYearError(null);
    try {
      await updateOrganization(orgId, { academic_year: academicYear });
      setYearSavedAt(Date.now());
    } catch (e) {
      setYearError(e instanceof Error ? e.message : String(e));
    } finally {
      setYearSaving(false);
    }
  };

  const handleSchoolYearSave = async () => {
    setSyearSaving(true);
    setSyearError(null);
    try {
      const holidays = yearHolidays
        .map((h) => ({
          name: (h.name ?? "").trim().slice(0, 80),
          startDate: h.startDate,
          endDate: h.endDate || h.startDate,
        }))
        .filter((h) => h.name && /^\d{4}-\d{2}-\d{2}$/.test(h.startDate));
      await updateOrganization(orgId, {
        school_year: {
          startDate: yearStartDate || undefined,
          endDate: yearEndDate || undefined,
          schoolDays: yearSchoolDays,
          holidays,
        },
      });
      setSyearSavedAt(Date.now());
    } catch (e) {
      setSyearError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyearSaving(false);
    }
  };

  function toggleSchoolDay(d: number) {
    setYearSchoolDays((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b));
  }

  return (
    <div className="space-y-5">
      <HeroCard
        title="School Settings"
        subtitle={org?.organization.name ?? (orgLoading ? "Loading…" : "School")}
        ignoreBranding
      />

      {/* Section 1: Organization */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>Organization</h3>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              type="text"
              value={orgForm.name}
              onChange={(e) => setOrgForm((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-email">Contact email</Label>
            <Input
              id="org-email"
              type="email"
              value={orgForm.contact_email}
              onChange={(e) =>
                setOrgForm((s) => ({ ...s, contact_email: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-phone">Contact phone</Label>
            <Input
              id="org-phone"
              type="text"
              value={orgForm.contact_phone}
              onChange={(e) =>
                setOrgForm((s) => ({ ...s, contact_phone: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-address">Address</Label>
            <Textarea
              id="org-address"
              rows={3}
              value={orgForm.address}
              onChange={(e) =>
                setOrgForm((s) => ({ ...s, address: e.target.value }))
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleOrgSave} disabled={orgSaving || orgLoading}>
              {orgSaving ? "Saving…" : "Save"}
            </Button>
            {orgSavedAt && !orgSaving && (
              <span className="text-xs text-emerald-700">Saved.</span>
            )}
            {orgError && (
              <span className="text-xs text-rose-700">{orgError}</span>
            )}
          </div>
        </div>
      </section>

      {/* Custom URL — per-school login slug. iqraifs.com/<slug> serves as
          a single branded entry point for principal, admin, office staff,
          parents, and students of this school. The form mirrors the
          server-side validator (RESERVED + shape regex) so most bad
          inputs are caught client-side without a round-trip. */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>Custom URL</h3>
        <p className="mt-1 text-sm text-slate-600">
          Set a short slug for your school. Everyone signs in at this URL.
        </p>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-slug">URL slug</Label>
            <div className="flex items-stretch rounded-md border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
              <span className="px-3 py-2 bg-slate-100 text-sm text-slate-500 border-r border-slate-300">
                iqraifs.com/
              </span>
              <input
                id="org-slug"
                type="text"
                value={slugInput}
                onChange={(e) =>
                  setSlugInput(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
                placeholder="iqra-demo"
                maxLength={40}
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-500">
              3–40 chars. Lowercase letters, digits, single dashes. Cannot
              be a reserved word (login, settings, admin, etc.).
            </p>
            {slugInput && (
              <p className="text-xs text-slate-600">
                Preview:{" "}
                <span className="font-mono text-indigo-700">
                  iqraifs.com/{slugInput}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSlugSave} disabled={slugSaving || orgLoading || !slugInput}>
              {slugSaving ? "Saving…" : "Save URL"}
            </Button>
            {slugSavedAt && !slugSaving && (
              <span className="text-xs text-emerald-700">Saved.</span>
            )}
            {slugError && (
              <span className="text-xs text-rose-700">{slugError}</span>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Academic year */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>Academic year</h3>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-year">Current academic year</Label>
            <Input
              id="org-year"
              type="text"
              placeholder="2026-2027"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
            <p className="text-xs text-slate-500">Format: 2026-2027</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleYearSave} disabled={yearSaving || orgLoading}>
              {yearSaving ? "Saving…" : "Save"}
            </Button>
            {yearSavedAt && !yearSaving && (
              <span className="text-xs text-emerald-700">Saved.</span>
            )}
            {yearError && (
              <span className="text-xs text-rose-700">{yearError}</span>
            )}
          </div>
        </div>
      </section>

      {/* Section: School calendar — week + year + holidays. */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>School calendar</h3>
        <p className="mt-1 text-sm text-slate-600">
          Which days are school days, when the academic year runs, and any holidays (Eid, Dec 25,
          Ramadan break, etc).
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-slate-500">School days</Label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { num: 1, short: "Mon" }, { num: 2, short: "Tue" }, { num: 3, short: "Wed" },
                { num: 4, short: "Thu" }, { num: 5, short: "Fri" }, { num: 6, short: "Sat" },
                { num: 7, short: "Sun" },
              ].map((d) => {
                const on = yearSchoolDays.includes(d.num);
                return (
                  <button
                    key={d.num} type="button" onClick={() => toggleSchoolDay(d.num)}
                    className={
                      "rounded-full px-3 py-1 text-xs font-medium border " +
                      (on
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                    }
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="syear-start" className="text-xs">Year starts</Label>
              <Input id="syear-start" type="date" value={yearStartDate}
                     onChange={(e) => setYearStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="syear-end" className="text-xs">Year ends</Label>
              <Input id="syear-end" type="date" value={yearEndDate}
                     onChange={(e) => setYearEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Holidays</Label>
              <Button variant="outline" size="sm"
                      onClick={() => setYearHolidays([...yearHolidays, { name: "", startDate: "", endDate: "" }])}>
                + Add holiday
              </Button>
            </div>
            {yearHolidays.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
                No holidays added. Examples: Eid al-Fitr (3 days), Eid al-Adha, Independence Day (Aug 14), Ramadan break.
              </div>
            ) : (
              <ul className="space-y-2">
                {yearHolidays.map((h, i) => (
                  <li key={i} className="grid grid-cols-[1fr_140px_140px_auto] gap-2 items-center">
                    <Input value={h.name} placeholder="Name (e.g. Eid al-Fitr)"
                           onChange={(e) => setYearHolidays(yearHolidays.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <Input type="date" value={h.startDate}
                           onChange={(e) => setYearHolidays(yearHolidays.map((x, j) => j === i ? { ...x, startDate: e.target.value } : x))} />
                    <Input type="date" value={h.endDate}
                           onChange={(e) => setYearHolidays(yearHolidays.map((x, j) => j === i ? { ...x, endDate: e.target.value } : x))} />
                    <Button variant="outline" size="sm"
                            onClick={() => setYearHolidays(yearHolidays.filter((_, j) => j !== i))}>×</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSchoolYearSave} disabled={syearSaving || orgLoading}>
              {syearSaving ? "Saving…" : "Save calendar"}
            </Button>
            {syearSavedAt && !syearSaving && <span className="text-xs text-emerald-700">Saved.</span>}
            {syearError && <span className="text-xs text-rose-700">{syearError}</span>}
          </div>
        </div>
      </section>

      {/* Section: Branding & locale (PR C #5).
          Timezone defaults to Asia/Karachi for Iqra pilot but is editable.
          Logo URL is just a string field — file upload comes later; for now
          the principal pastes a hosted image URL. Theme color is HTML
          color picker; applied to HeroCards (TODO: actually wire to UI). */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>Branding &amp; locale</h3>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-timezone">Timezone</Label>
            <Input
              id="org-timezone"
              type="text"
              placeholder="Asia/Karachi"
              value={orgForm.timezone}
              onChange={(e) => setOrgForm((s) => ({ ...s, timezone: e.target.value }))}
            />
            <p className="text-xs text-slate-500">
              IANA timezone name (e.g. Asia/Karachi, Asia/Dubai). Used for attendance dates
              and announcement scheduling.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-logo">Logo URL</Label>
            <Input
              id="org-logo"
              type="url"
              placeholder="https://…/logo.png"
              value={orgForm.logo_url}
              onChange={(e) => setOrgForm((s) => ({ ...s, logo_url: e.target.value }))}
            />
            <p className="text-xs text-slate-500">
              Public URL to your school's logo. Shown on the dashboard hero card and parent portal.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-color">Theme color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="org-color"
                type="color"
                value={orgForm.theme_color || "#0f766e"}
                onChange={(e) => setOrgForm((s) => ({ ...s, theme_color: e.target.value }))}
                className="h-10 w-20 cursor-pointer p-1"
              />
              <Input
                type="text"
                placeholder="#0f766e"
                value={orgForm.theme_color}
                onChange={(e) => setOrgForm((s) => ({ ...s, theme_color: e.target.value }))}
                className="flex-1 font-mono text-sm"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="org-motto">School motto (optional)</Label>
            <Input
              id="org-motto"
              type="text"
              placeholder="Knowledge, character, faith"
              value={orgForm.school_motto}
              onChange={(e) => setOrgForm((s) => ({ ...s, school_motto: e.target.value }))}
            />
          </div>

          {/* School + office hours. School hours = when students are
              on campus. Office hours = staff working window (usually
              wider on both ends). Calendar uses office hours for the
              time axis; falls back to derived min/max if blank. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700">School & office hours</div>
            <p className="text-xs text-slate-500 -mt-1">
              School hours = when students are on campus. Office hours = when staff are expected to be there
              (usually starts earlier, ends later). The teacher calendar uses office hours for its time axis.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">School starts</Label>
                <Input type="time" value={orgForm.school_day_start}
                       onChange={(e) => setOrgForm((s) => ({ ...s, school_day_start: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">School ends</Label>
                <Input type="time" value={orgForm.school_day_end}
                       onChange={(e) => setOrgForm((s) => ({ ...s, school_day_end: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Office opens</Label>
                <Input type="time" value={orgForm.office_day_start}
                       onChange={(e) => setOrgForm((s) => ({ ...s, office_day_start: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Office closes</Label>
                <Input type="time" value={orgForm.office_day_end}
                       onChange={(e) => setOrgForm((s) => ({ ...s, office_day_end: e.target.value }))} />
              </div>
            </div>
          </div>
          {/* Live preview of the hero block as it will appear on dashboards. */}
          <div>
            <Label className="text-xs uppercase tracking-widest text-slate-500">Preview</Label>
            <div
              className="mt-2 rounded-2xl border border-indigo-900/40 text-white shadow-lg p-5"
              style={{
                backgroundImage: orgForm.theme_color
                  ? `linear-gradient(to bottom right, rgb(15 23 42), rgb(15 23 42), ${orgForm.theme_color})`
                  : "linear-gradient(to bottom right, rgb(15 23 42), rgb(15 23 42), rgb(30 27 75))",
              }}
            >
              <div className="flex items-start gap-3">
                {orgForm.logo_url && (
                  <img
                    src={orgForm.logo_url}
                    alt=""
                    className="h-12 w-12 rounded-lg bg-white/10 object-contain p-1"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div>
                  <h2 className="text-xl font-semibold">
                    {orgForm.name || "School name"}
                  </h2>
                  {orgForm.school_motto && (
                    <p className="mt-0.5 text-xs italic text-indigo-200/90">
                      {orgForm.school_motto}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Save below to apply across every school page. Branding propagates instantly to new dashboard views; existing tabs may need a refresh.
            </p>
          </div>
        </div>
      </section>

      {/* Section: Replay onboarding tour */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>Help &amp; onboarding</h3>
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (!me) return;
              const role = pickTourForUser(me, isOrgPrincipal(me, orgId));
              if (role) resetTour(role, me.userId);
              navigate(`/school/orgs/${orgId}`);
            }}
          >
            Replay setup tour
          </Button>
          <span className="text-xs text-slate-500">
            Walks you through the dashboard again.
          </span>
        </div>
      </section>

      {/* Section: Transfer ownership (principal only, but this whole page
          already gates on isOrgPrincipal so no extra check needed). */}
      <section
        className={`bg-white border border-amber-200 rounded-xl shadow-sm p-5`}
      >
        <h3 className={`${sectionTitleClasses} text-amber-700 flex items-center gap-2`}>
          <AlertTriangle className="h-4 w-4" /> Transfer ownership
        </h3>
        <div className="mt-4 space-y-2">
          <p className="text-sm text-slate-700">
            Hand the principal role over to another staff member.
            You'll keep access as an admin afterwards.
          </p>
          <ul className="text-xs text-slate-600 list-disc pl-5 space-y-0.5">
            <li>Only existing admins or teachers can be selected as the new principal.</li>
            <li>You'll need to type the school name to confirm.</li>
            <li>After transfer, the new principal can remove you or you can leave the school.</li>
          </ul>
          <div className="pt-2">
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={async () => {
                setTransferOpen(true);
                setTransferTargetId("");
                setTransferTyped("");
                setTransferError(null);
                try {
                  const [admins, teachers] = await Promise.all([
                    listAdmins(orgId),
                    listAdminTeachers(orgId),
                  ]);
                  const out: Array<{ user_id: string; full_name: string; email: string; role: string }> = [];
                  for (const a of admins as OrgAdmin[]) {
                    if (a.user_id === me?.userId) continue;
                    out.push({ user_id: a.user_id, full_name: a.full_name, email: a.email, role: "admin" });
                  }
                  for (const t of teachers as AdminTeacher[]) {
                    if (t.user_id === me?.userId) continue;
                    if (out.some((x) => x.user_id === t.user_id)) continue;
                    out.push({
                      user_id: t.user_id,
                      full_name: t.full_name,
                      email: t.email,
                      role: ((t as any).role_template ?? (t as any).role_type ?? "teacher") as string,
                    });
                  }
                  setCandidates(out);
                } catch (e) {
                  setTransferError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Transfer ownership…
            </Button>
          </div>
        </div>
      </section>

      {/* Section: Danger zone */}
      <section
        className={`bg-white border border-rose-200 rounded-xl shadow-sm p-5`}
      >
        <h3 className={`${sectionTitleClasses} text-rose-700 flex items-center gap-2`}>
          <AlertTriangle className="h-4 w-4" /> Danger zone
        </h3>
        <div className="mt-4 space-y-2">
          <p className="text-sm text-slate-700">
            Permanently delete this school. All classes, students, attendance,
            hifz, fees, and announcements will be removed.
          </p>
          <ul className="text-xs text-slate-600 list-disc pl-5 space-y-0.5">
            <li>The school disappears from everyone's workspace switcher immediately.</li>
            <li>30-day grace window — contact support during that time to restore.</li>
            <li>After the grace window ends, the data is permanently removed.</li>
            <li>You'll need to type the school name exactly to confirm.</li>
          </ul>
          <div className="pt-2">
            <Button
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteTyped("");
                setDeleteError(null);
              }}
            >
              Delete school…
            </Button>
          </div>
        </div>
      </section>

      {/* Delete-school confirmation dialog. Confirm button stays disabled
          until the typed text matches org.organization.name exactly. */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete {org?.organization.name ?? "school"}?
            </DialogTitle>
            <DialogDescription className="text-slate-700">
              This action will schedule the school for permanent deletion in 30
              days. To confirm, type the school name exactly as shown:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-mono bg-slate-100 px-3 py-2 rounded">
              {org?.organization.name}
            </p>
            <Input
              type="text"
              autoFocus
              placeholder="Type the school name to confirm"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              className="border-rose-300"
            />
            {deleteError && (
              <p className="text-xs text-rose-700">{deleteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={
                deleteSubmitting ||
                !org ||
                deleteTyped.trim() !== org.organization.name
              }
              onClick={async () => {
                if (!org) return;
                setDeleteSubmitting(true);
                setDeleteError(null);
                try {
                  const res = await deleteSchool(orgId, deleteTyped.trim());
                  setDeleteOpen(false);
                  // Bounce the user out — the org no longer exists in their
                  // workspace switcher. Show the message as a top-level alert
                  // first so they understand what happened and can read the
                  // grace-window date.
                  alert(res.message);
                  navigate("/");
                } catch (e) {
                  setDeleteError(e instanceof Error ? e.message : String(e));
                } finally {
                  setDeleteSubmitting(false);
                }
              }}
            >
              {deleteSubmitting ? "Deleting…" : "Delete school"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer-ownership dialog. Confirm button stays disabled until
          a target is picked AND typed text matches the school name. */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Transfer ownership of {org?.organization.name ?? "school"}
            </DialogTitle>
            <DialogDescription className="text-slate-700">
              Pick the new principal. They must already have a role in this
              school. After transfer you'll be demoted to admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>New principal</Label>
              <select
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
              >
                <option value="">— Select —</option>
                {candidates.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.full_name} ({c.email}) — {c.role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              {candidates.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  No eligible staff. Add an admin or teacher first.
                </p>
              )}
            </div>

            <div>
              <Label>Type the school name to confirm</Label>
              <p className="my-1 text-sm font-mono bg-slate-100 px-3 py-2 rounded">
                {org?.organization.name}
              </p>
              <Input
                type="text"
                value={transferTyped}
                onChange={(e) => setTransferTyped(e.target.value)}
                className="border-amber-300"
                placeholder="Type the school name"
              />
            </div>

            {transferError && (
              <p className="text-xs text-rose-700">{transferError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(false)}
              disabled={transferSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={
                transferSubmitting ||
                !transferTargetId ||
                !org ||
                transferTyped.trim() !== org.organization.name
              }
              onClick={async () => {
                if (!org || !transferTargetId) return;
                setTransferSubmitting(true);
                setTransferError(null);
                try {
                  const res = await transferOwnership(orgId, {
                    targetUserId: transferTargetId,
                    confirmName: transferTyped.trim(),
                  });
                  setTransferOpen(false);
                  alert(res.message);
                  // Caller's role changed (principal → admin). Reload so
                  // the rest of the UI re-evaluates permissions.
                  window.location.reload();
                } catch (e) {
                  setTransferError(e instanceof Error ? e.message : String(e));
                } finally {
                  setTransferSubmitting(false);
                }
              }}
            >
              {transferSubmitting ? "Transferring…" : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
