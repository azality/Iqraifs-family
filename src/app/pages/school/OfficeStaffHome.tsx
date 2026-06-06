// OfficeStaffHome — Phase 6c dashboard for the office_staff role.
//
// Replaces the previous redirect-to-Students with a focused workload page:
//   - Roster change requests pending (review + approve)
//   - Students missing parent contacts (link before the year starts)
//   - Attendance gaps today (chase teachers / mark on behalf)
//   - Pending invites count (parents who haven't claimed yet)
//
// All data comes from a single GET /school/orgs/:orgId/office-snapshot
// call. The page degrades gracefully when nothing is pending — every
// widget hides if its count is zero, so a healthy day shows a quiet
// dashboard with a friendly empty state.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ClipboardList,
  Heart,
  CalendarCheck,
  KeyRound,
  Users,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  getOfficeSnapshot,
  type OfficeSnapshot,
} from "../../../utils/schoolApi";

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function firstName(): string {
  const stored =
    typeof window !== "undefined"
      ? window.localStorage.getItem("fgs_user_name")
      : null;
  return stored ? stored.split(/\s+/)[0] : "Office";
}

export function OfficeStaffHome() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [snapshot, setSnapshot] = useState<OfficeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOfficeSnapshot(orgId)
      .then((r) => {
        if (!cancelled) setSnapshot(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Could not load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Loading office dashboard…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!snapshot) return null;

  const totalPending =
    snapshot.rosterRequests.pendingCount +
    snapshot.missingParents.count +
    snapshot.attendanceGaps.count;
  const allClear = totalPending === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {firstName()}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{todayLabel()}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          <Users className="h-3.5 w-3.5 text-indigo-500" />
          {snapshot.studentCount} students
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiBlock
          icon={<ClipboardList className="h-4 w-4" />}
          label="Roster requests"
          value={snapshot.rosterRequests.pendingCount}
          tone={snapshot.rosterRequests.pendingCount > 0 ? "amber" : "slate"}
        />
        <KpiBlock
          icon={<Heart className="h-4 w-4" />}
          label="Missing parents"
          value={snapshot.missingParents.count}
          tone={snapshot.missingParents.count > 0 ? "rose" : "slate"}
        />
        <KpiBlock
          icon={<CalendarCheck className="h-4 w-4" />}
          label="Attendance gaps"
          value={snapshot.attendanceGaps.count}
          tone={snapshot.attendanceGaps.count > 0 ? "amber" : "slate"}
        />
        <KpiBlock
          icon={<KeyRound className="h-4 w-4" />}
          label="Pending invites"
          value={snapshot.pendingInvitesCount}
          tone="slate"
        />
      </div>

      {allClear && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">All clear</span> — no roster
            requests, missing contacts, or attendance gaps to handle.
          </div>
        </div>
      )}

      {/* Roster requests */}
      {snapshot.rosterRequests.pendingCount > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Roster requests
            </h2>
            <Link
              to={`/school/orgs/${orgId}/admin/roster-requests`}
              className="text-xs text-indigo-600 hover:underline"
            >
              Review all →
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {snapshot.rosterRequests.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/school/orgs/${orgId}/admin/roster-requests`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {r.kind === "add" ? "Add" : "Remove"}
                        {r.className && r.sectionName
                          ? ` · ${r.className} · ${r.sectionName}`
                          : ""}
                      </div>
                      {r.reason && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {r.reason}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Missing parents */}
      {snapshot.missingParents.count > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Students missing parent contacts
            </h2>
            <Link
              to={`/school/orgs/${orgId}/admin/students`}
              className="text-xs text-indigo-600 hover:underline"
            >
              Manage students →
            </Link>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/40">
            <ul className="divide-y divide-rose-100">
              {snapshot.missingParents.recent.map((s) => (
                <li key={s.studentId}>
                  <Link
                    to={`/school/orgs/${orgId}/admin/students/${s.studentId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-rose-100/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-rose-900">
                        {s.fullName}
                      </div>
                      <div className="text-[10px] text-rose-700">
                        {s.grNumber ?? ""}
                        {s.className ? ` · ${s.className}` : ""}
                        {s.sectionName ? ` · ${s.sectionName}` : ""}
                      </div>
                    </div>
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 flex-shrink-0" />
                  </Link>
                </li>
              ))}
              {snapshot.missingParents.count >
                snapshot.missingParents.recent.length && (
                <li className="px-4 py-2 text-[11px] text-rose-700 text-center">
                  + {snapshot.missingParents.count - snapshot.missingParents.recent.length}{" "}
                  more
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* Attendance gaps today */}
      {snapshot.attendanceGaps.count > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Attendance not marked today
            </h2>
            <span className="text-xs text-slate-500">
              {snapshot.attendanceGaps.count} section
              {snapshot.attendanceGaps.count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {snapshot.attendanceGaps.recent.map((s) => (
              <Link
                key={s.sectionId}
                to={`/school/orgs/${orgId}/sections/${s.sectionId}/attendance`}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50"
              >
                {s.className} · {s.sectionName}
              </Link>
            ))}
            {snapshot.attendanceGaps.count >
              snapshot.attendanceGaps.recent.length && (
              <span className="inline-flex items-center text-xs text-slate-500 px-2 py-1">
                + {snapshot.attendanceGaps.count - snapshot.attendanceGaps.recent.length}{" "}
                more
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

interface KpiBlockProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "amber" | "rose" | "emerald";
}

function KpiBlock({ icon, label, value, tone }: KpiBlockProps) {
  const toneClasses =
    tone === "rose"
      ? "bg-rose-50 ring-rose-200 text-rose-800"
      : tone === "amber"
      ? "bg-amber-50 ring-amber-200 text-amber-800"
      : tone === "emerald"
      ? "bg-emerald-50 ring-emerald-200 text-emerald-800"
      : "bg-white ring-slate-200 text-slate-700";
  return (
    <div
      className={
        "rounded-xl ring-1 px-4 py-3 shadow-sm " + toneClasses
      }
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

export default OfficeStaffHome;
