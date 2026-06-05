// SchoolHomeRouter — picks the right /school/orgs/:orgId index page
// based on the caller's role.
//
//   principal / admin / org-scoped teacher
//     → PerformanceDashboard (org-wide KPIs, leaderboard, insights)
//   class_teacher / visiting_teacher
//     → TeacherHome (my sections, roll-call nudge, behavior notes)
//   office_staff
//     → redirect to /admin/students (their primary tool)
//   financial_staff
//     → redirect to /admin/fees (their primary tool)
//   anything else (unrecognised) → PerformanceDashboard as a safe default
//
// We DON'T render a separate "OfficeHome" or "FinanceHome" yet — those
// staff roles spend their day inside one specific section, so dropping
// them straight into that section is the cleanest demo experience. If
// we add dedicated dashboards later, branch them in below.

import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import {
  getSchoolMe,
  viewerRoleForOrg,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { TeacherHome } from "./TeacherHome";

export function SchoolHomeRouter() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSchoolMe()
      .then((r) => {
        if (!cancelled) setMe(r);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!resolved) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  const role = viewerRoleForOrg(me, orgId);

  if (role === "class_teacher" || role === "visiting_teacher") {
    return <TeacherHome orgId={orgId} me={me!} />;
  }

  if (role === "office_staff") {
    return <Navigate to={`/school/orgs/${orgId}/admin/students`} replace />;
  }

  if (role === "financial_staff") {
    return <Navigate to={`/school/orgs/${orgId}/admin/fees`} replace />;
  }

  return <PerformanceDashboard />;
}

export default SchoolHomeRouter;
