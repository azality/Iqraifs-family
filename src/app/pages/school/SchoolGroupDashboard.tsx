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
import { Building2, Users, ArrowRight, CheckCircle2, DollarSign, TrendingUp, AlertTriangle, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  getSchoolGroup, getSchoolGroupSnapshot,
  listGroupStaff, grantGroupStaff, revokeGroupStaff,
  type SchoolGroupResponse, type SchoolGroupSnapshot, type GroupStaffRow,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

export function SchoolGroupDashboard() {
  const { groupId = "" } = useParams<{ groupId: string }>();
  const [group, setGroup] = useState<SchoolGroupResponse | null>(null);
  const [snap, setSnap] = useState<SchoolGroupSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Head-office staff (settings/admin pass). List 403s for anyone
  // without a group role — we just hide the panel then. Grant/revoke
  // are group-principal-only server-side; the buttons surface the
  // backend's message on failure.
  const [staff, setStaff] = useState<GroupStaffRow[] | null>(null);
  const [staffForm, setStaffForm] = useState({ email: "", fullName: "", roleType: "admin" as "admin" | "principal" });
  const [staffBusy, setStaffBusy] = useState(false);

  const reloadStaff = () => {
    if (!groupId) return;
    listGroupStaff(groupId)
      .then((r) => setStaff(r.staff))
      .catch(() => setStaff(null));
  };
  useEffect(reloadStaff, [groupId]);

  const handleGrant = async () => {
    const email = staffForm.email.trim();
    if (!email) { toast.error("Email required"); return; }
    setStaffBusy(true);
    try {
      const res = await grantGroupStaff(groupId, {
        email,
        fullName: staffForm.fullName.trim() || undefined,
        roleType: staffForm.roleType,
      });
      toast.success(
        res.wasCreated
          ? `Account created and head-office ${staffForm.roleType} granted to ${email}. They set a password via "Forgot password".`
          : `Head-office ${staffForm.roleType} granted to ${email}`,
      );
      setStaffForm({ email: "", fullName: "", roleType: "admin" });
      reloadStaff();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not grant the role.");
    } finally {
      setStaffBusy(false);
    }
  };

  const handleRevoke = async (row: GroupStaffRow) => {
    const who = row.fullName || row.email || "this user";
    if (!confirm(`Revoke ${who}'s head-office ${row.roleType} role? They lose chain-wide access to every campus (campus-level roles are unaffected).`)) return;
    try {
      await revokeGroupStaff(groupId, row.userId);
      toast.success(`Revoked ${who}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke.");
    }
    reloadStaff();
  };

  useEffect(() => {
    if (!groupId) return;
    Promise.all([getSchoolGroup(groupId), getSchoolGroupSnapshot(groupId)])
      .then(([g, s]) => { setGroup(g); setSnap(s); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [groupId]);

  const metricsByOrg = new Map<string, typeof snap extends null ? never : (NonNullable<typeof snap>)["perCampus"][number]>();
  for (const c of snap?.perCampus ?? []) metricsByOrg.set(c.orgId, c);
  const fmtPct = (n: number | null) => n === null ? "—" : `${n.toFixed(0)}%`;
  const fmtMoney = (n: number) => n === 0 ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  const collectionRate = snap && snap.totals.feesInvoiced > 0
    ? (snap.totals.feesCollected / snap.totals.feesInvoiced) * 100
    : null;

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
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
          <p className="mt-1 text-xs text-rose-600">
            The chain dashboard needs a head-office (school-group) role.
            Campus-level staff manage their own school from its dashboard.
          </p>
        </div>
      )}

      {snap && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                <Users className="h-3.5 w-3.5 text-emerald-500" /> Students
              </div>
              <div className="text-2xl font-semibold mt-1">{snap.totals.activeStudents}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Active across chain</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Attendance today
              </div>
              <div className="text-2xl font-semibold mt-1">{fmtPct(snap.totals.attendancePct)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{snap.attendanceDate}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-amber-500" /> Fees this period
              </div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(snap.totals.feesCollected)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {collectionRate === null ? "of —" : `${collectionRate.toFixed(0)}% of ${fmtMoney(snap.totals.feesInvoiced)}`}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-500" /> Behavior this month
              </div>
              <div className="text-sm font-semibold mt-1 flex items-baseline gap-2">
                <span className="text-emerald-700">+{snap.totals.behavior.positive}</span>
                <span className="text-amber-700">−{snap.totals.behavior.concern}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">positive · concern</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* On error, don't ALSO show a perpetual spinner (smoke-test bug:
          denied users saw the error banner + "Loading campuses…" forever). */}
      {error ? null : !group ? (
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
                  {(() => {
                    const m = metricsByOrg.get(c.orgId);
                    if (!m) return (
                      <div className="text-xs text-slate-400 mt-2">No data yet</div>
                    );
                    const collected = m.feesInvoiced > 0
                      ? (m.feesCollected / m.feesInvoiced) * 100 : null;
                    return (
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>Students</span>
                          <span className="font-medium">{m.activeStudents}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Attendance</span>
                          <span className="font-medium">{fmtPct(m.attendancePct)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Fees</span>
                          <span className="font-medium">
                            {collected === null ? "—" : `${collected.toFixed(0)}%`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Behavior</span>
                          <span className="font-medium">
                            <span className="text-emerald-700">+{m.behavior.positive}</span>
                            {" / "}
                            <span className="text-amber-700">−{m.behavior.concern}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Head-office staff — chain-wide principal/admin roles. Panel is
          hidden for anyone whose staff-list fetch was denied. */}
      {staff !== null && (
        <div className="space-y-3">
          <h2 className={sectionTitleClasses}>Head-office staff</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {staff.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-500 italic">
                    No head-office roles yet.
                  </li>
                )}
                {staff.map((s) => (
                  <li key={s.roleId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        {s.fullName ?? s.email ?? s.userId.slice(0, 8)}
                      </div>
                      {s.email && s.fullName && (
                        <div className="text-xs text-slate-500">{s.email}</div>
                      )}
                    </div>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 " +
                        (s.roleType === "principal"
                          ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                          : "bg-slate-100 text-slate-700 ring-slate-200")
                      }
                    >
                      {s.roleType}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(s)}
                      title="Revoke head-office role"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Grant head-office role
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <Input
                    placeholder="email@school.com"
                    value={staffForm.email}
                    onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <Input
                    placeholder="Full name (new accounts)"
                    value={staffForm.fullName}
                    onChange={(e) => setStaffForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </div>
                <select
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={staffForm.roleType}
                  onChange={(e) => setStaffForm((f) => ({ ...f, roleType: e.target.value as "admin" | "principal" }))}
                >
                  <option value="admin">Head-office admin</option>
                  <option value="principal">Head-office principal</option>
                </select>
                <Button onClick={handleGrant} disabled={staffBusy}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {staffBusy ? "Granting…" : "Grant"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Head-office roles apply across every campus in the chain.
                Only a head-office principal can grant or revoke them.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default SchoolGroupDashboard;
