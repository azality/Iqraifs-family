// SchoolGroupDashboard — cross-campus rollup view.
//
// Route: /school/school-groups/:groupId
//
// Lists every campus in the group with active student counts. Each
// campus card links into that campus's normal admin dashboard. The
// chain principal lands here when their org_id sits inside a
// school_group; single-school orgs never see it.
//
// This is Phase 1 of the multi-campus rollup. Future phases:
//   - Transfer-student flow between sibling campuses
//   - Shared parent identity (one PIN works across campuses)
//   - Group-level role grants
//   - Aggregated metrics (fees collected, attendance%, etc.)

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Building2, Users, ArrowRight } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import {
  getSchoolGroup, getSchoolGroupSnapshot,
  type SchoolGroupResponse, type SchoolGroupSnapshot,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

export function SchoolGroupDashboard() {
  const { groupId = "" } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<SchoolGroupResponse | null>(null);
  const [snap, setSnap] = useState<SchoolGroupSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([getSchoolGroup(groupId), getSchoolGroupSnapshot(groupId)])
      .then(([g, s]) => { setGroup(g); setSnap(s); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [groupId]);

  const studentsByOrg = new Map<string, number>();
  for (const c of snap?.perCampus ?? []) studentsByOrg.set(c.orgId, c.activeStudents);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className={sectionTitleClasses}>
          {group?.group.name ?? "School chain"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cross-campus dashboard. Click a campus to drop into its admin view.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {snap && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-indigo-500" /> Campuses
              </div>
              <div className="text-2xl font-semibold mt-1">{snap.totals.campuses}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-emerald-500" /> Active students (chain)
              </div>
              <div className="text-2xl font-semibold mt-1">{snap.totals.activeStudents}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {!group ? (
        <div className="text-sm text-slate-500">Loading campuses…</div>
      ) : group.campuses.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">
          No campuses linked to this group yet.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {group.campuses.map((c) => (
            <Link
              key={c.orgId}
              to={`/school/orgs/${c.orgId}/admin`}
              className="block group"
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="h-6 w-6 rounded"
                      style={{ background: c.themeColor ?? "#0f766e" }}
                    />
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{c.slug}</div>
                  <div className="text-xs text-slate-600 mt-2">
                    <span className="font-medium">{studentsByOrg.get(c.orgId) ?? 0}</span> active students
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default SchoolGroupDashboard;
