// Landing page for the school surfaces. Lives at /school.
//
// Routes the user to the right surface based on /school/me. ANY staff
// role (principal / admin / class_teacher / visiting_teacher /
// office_staff / financial_staff) counts as having school access; the
// per-role dashboard is picked downstream by SchoolHomeRouter once we
// land on /school/orgs/:orgId.
//
// Bug history: this page used to gate on "isPrincipal || isTeacher"
// only, so office_staff and financial_staff hit a generic
// "you don't have a principal or teacher role" card instead of being
// routed to their dashboard. Now anyone with viewerRoleForOrg !==
// "other" for any of their organizations is auto-routed (single org)
// or shown a picker (multiple).

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { School, Lock, GraduationCap } from "lucide-react";
import {
  getSchoolMe,
  viewerRoleForOrg,
  type SchoolMeResponse,
  type SchoolViewerRole,
} from "../../../utils/schoolApi";

const ROLE_LABEL: Record<SchoolViewerRole, string> = {
  principal: "Principal",
  admin: "Admin",
  class_teacher: "Class Teacher",
  visiting_teacher: "Visiting Teacher",
  office_staff: "Office Staff",
  financial_staff: "Finance Staff",
  other: "Member",
};

export function SchoolHome() {
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe()
      .then(setMe)
      .catch((e) => setError(e?.message || "Could not load school role"))
      .finally(() => setLoading(false));
  }, []);

  // Orgs the user can actually open — any role other than "other"
  // counts. me.organizations is server-filtered to undeleted orgs only,
  // so a soft-deleted org doesn't leak into the picker.
  const accessibleOrgs = useMemo(() => {
    if (!me) return [];
    return me.organizations
      .map((o) => ({ ...o, role: viewerRoleForOrg(me, o.id) }))
      .filter((o) => o.role !== "other");
  }, [me]);

  useEffect(() => {
    if (!me) return;
    // Auto-route anyone with exactly one accessible org. Per-role
    // dashboard selection happens inside SchoolHomeRouter — this page
    // just gets them to the right org.
    if (accessibleOrgs.length === 1) {
      navigate(`/school/orgs/${accessibleOrgs[0].id}`, { replace: true });
    }
  }, [me, accessibleOrgs, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading school…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" />
            School unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  // No access — truly no staff role in any org. This is the only branch
  // that should show the access-denied card. Pre-fix, this branch was
  // overly aggressive and caught office_staff / financial_staff who DID
  // have access just not the principal/teacher flavour.
  if (accessibleOrgs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="h-6 w-6 text-blue-600" />
              School surfaces
            </CardTitle>
            <CardDescription>
              You don't currently have a staff role at any school.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The school side of the app is for principals, admins, teachers,
              office staff, and finance staff at schools that have onboarded.
              Your family experience is unchanged.
            </p>
            <p>
              If you're expecting access, ask your school's principal to invite
              you, or contact{" "}
              <a href="mailto:muneeb@azality.com" className="text-blue-600 underline">
                muneeb@azality.com
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multiple accessible orgs — show a picker labelled with the user's
  // role in each so they understand what they'll land in.
  if (accessibleOrgs.length > 1) {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-4">
        <h1 className="text-2xl font-semibold">Choose a school</h1>
        <div className="grid gap-3">
          {accessibleOrgs.map((org) => (
            <Card
              key={org.id}
              className="cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => navigate(`/school/orgs/${org.id}`)}
            >
              <CardContent className="py-4 flex items-center gap-3">
                <GraduationCap className="h-6 w-6 text-blue-600" />
                <div className="flex-1">
                  <p className="font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[org.role]} · {org.slug}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Single-org users get the auto-redirect above; this is the
  // intermediate render before the redirect lands. Non-blank by design.
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center space-y-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
        <Button
          variant="link"
          size="sm"
          onClick={() => navigate(`/school/orgs/${accessibleOrgs[0].id}`, { replace: true })}
        >
          Click here if this doesn't auto-load
        </Button>
      </div>
    </div>
  );
}
