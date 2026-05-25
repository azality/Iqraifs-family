// School-level Settings page. Principal-only.
//
// Routed at /school/orgs/:orgId/admin/settings. Lets the principal edit
// org meta (name, contact info, address) and the current academic year,
// plus a placeholder danger-zone for future archive support.

import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
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
  getOrganization,
  getSchoolMe,
  isOrgPrincipal,
  updateOrganization,
  type OrgWithCounts,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

interface OrgFormState {
  name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
}

export function OrgSettings() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [org, setOrg] = useState<OrgWithCounts | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  const [orgForm, setOrgForm] = useState<OrgFormState>({
    name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
  });
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSavedAt, setOrgSavedAt] = useState<number | null>(null);

  const [academicYear, setAcademicYear] = useState("");
  const [yearSaving, setYearSaving] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [yearSavedAt, setYearSavedAt] = useState<number | null>(null);

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

      {/* Section 3: Danger zone */}
      <section
        className={`bg-white border border-rose-200 rounded-xl shadow-sm p-5`}
      >
        <h3 className={`${sectionTitleClasses} text-rose-700`}>Danger zone</h3>
        <div className="mt-4">
          <Button variant="outline" disabled>
            Archive school — coming soon
          </Button>
        </div>
      </section>
    </div>
  );
}
