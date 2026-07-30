// SchoolHomeRouter — picks the right /school/orgs/:orgId index page
// based on the caller's role.
//
//   principal / admin / org-scoped teacher
//     → PerformanceDashboard (org-wide KPIs, leaderboard, insights)
//   class_teacher / visiting_teacher / hifz_teacher
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
import { useParams } from "react-router";
import {
  getSchoolMe,
  viewerRoleForOrg,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { TeacherHome } from "./TeacherHome";
import { OfficeStaffHome } from "./OfficeStaffHome";
import { FinanceHome } from "./FinanceHome";

export function SchoolHomeRouter() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [resolved, setResolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    setFailed(false);
    getSchoolMe()
      .then((r) => {
        if (!cancelled) setMe(r);
      })
      .catch(() => {
        // Do NOT fall through to a role-less render: viewerRoleForOrg(null)
        // resolves undefined and the user would land on the principal
        // dashboard where every fetch 403s. Show a retry card instead.
        if (!cancelled) {
          setMe(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!resolved) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-medium text-amber-900">
          We couldn't verify your role at this school.
        </p>
        <p className="mt-1 text-xs text-amber-700">
          This is usually a connection hiccup — your access hasn't changed.
        </p>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100"
        >
          Try again
        </button>
      </div>
    );
  }

  const role = viewerRoleForOrg(me, orgId);

  if (
    role === "class_teacher" ||
    role === "visiting_teacher" ||
    // PR feat/hifz-teacher-section-listing — Hifz-only teachers also
    // land on TeacherHome. Their "my sections" list is populated via
    // the same backend gates which now include hifz_teacher_user_id.
    role === "hifz_teacher"
  ) {
    return <TeacherHome orgId={orgId} me={me!} />;
  }

  if (role === "office_staff") {
    return <OfficeStaffHome />;
  }

  if (role === "financial_staff") {
    return <FinanceHome />;
  }

  return <PerformanceDashboard />;
}

export default SchoolHomeRouter;
