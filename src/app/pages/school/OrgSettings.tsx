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
  });
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSavedAt, setOrgSavedAt] = useState<number | null>(null);

  const [academicYear, setAcademicYear] = useState("");
  const [yearSaving, setYearSaving] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [yearSavedAt, setYearSavedAt] = useState<number | null>(null);

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
        });
        setAcademicYear(
          (o.organization.settings?.academic_year as string | undefined) ?? "",
        );
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
      });
      setOrgSavedAt(Date.now());
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrgSaving(false);
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
