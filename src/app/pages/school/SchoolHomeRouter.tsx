// SchoolHomeRouter — picks the right /school/orgs/:orgId index page
// based on the caller's role. Principals/admins/org-scoped teachers get
// the org-wide PerformanceDashboard; class- and visiting-teachers get
// the section-scoped TeacherHome.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  getSchoolMe,
  isSectionTeacherOnly,
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

  if (me && isSectionTeacherOnly(me, orgId)) {
    return <TeacherHome orgId={orgId} me={me} />;
  }

  return <PerformanceDashboard />;
}

export default SchoolHomeRouter;
