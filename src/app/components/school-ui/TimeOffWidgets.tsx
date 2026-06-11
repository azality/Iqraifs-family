// Time-off dashboard widgets.
//
// - TeacherTimeOffWidget: the signed-in teacher's pending + approved
//   requests. Surfaces on TeacherHome so a teacher knows the status
//   of their last request without having to remember the page.
// - PendingTimeOffWidget: principal / admin view. Shows the count of
//   pending requests plus the top three with names + dates + a link
//   to the full review queue.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarOff, ChevronRight } from "lucide-react";
import {
  listMyTimeOff,
  listOrgTimeOff,
  type TimeOffRequest,
} from "../../../utils/schoolApi";

const KIND_LABEL: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  short_break: "Short break",
  family_emergency: "Family emergency",
  medical: "Medical",
  other: "Other",
};

function fmt(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function rangeLabel(r: TimeOffRequest): string {
  if (r.startDate === r.endDate) return fmt(r.startDate);
  return `${fmt(r.startDate)} → ${fmt(r.endDate)}`;
}

// ── Teacher view ────────────────────────────────────────────────────
export function TeacherTimeOffWidget({ orgId }: { orgId: string }) {
  const [requests, setRequests] = useState<TimeOffRequest[] | null>(null);

  useEffect(() => {
    if (!orgId) return;
    listMyTimeOff(orgId)
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]));
  }, [orgId]);

  if (!requests) return null;
  // Show only pending + approved future-dated. Cancelled / rejected
  // / fully past = clutter for the dashboard view.
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = requests.filter(
    (r) =>
      (r.status === "pending" || r.status === "approved") &&
      r.endDate >= todayIso,
  );
  if (upcoming.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <CalendarOff className="h-4 w-4 text-indigo-500" />
          My upcoming time off
        </h2>
      </div>
      <ul className="divide-y divide-slate-100">
        {upcoming.slice(0, 3).map((r) => {
          const isApproved = r.status === "approved";
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{KIND_LABEL[r.kind] ?? r.kind}</div>
                <div className="text-xs text-slate-600">{rangeLabel(r)}</div>
                {r.reason && <div className="mt-0.5 text-[11px] italic text-slate-500 truncate">{r.reason}</div>}
              </div>
              <span className={
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                (isApproved
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200")
              }>{r.status}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Principal / admin view ─────────────────────────────────────────
export function PendingTimeOffWidget({ orgId }: { orgId: string }) {
  const [requests, setRequests] = useState<TimeOffRequest[] | null>(null);

  useEffect(() => {
    if (!orgId) return;
    listOrgTimeOff(orgId, "pending")
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]));
  }, [orgId]);

  if (!requests || requests.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60">
      <Link
        to={`/school/orgs/${orgId}/admin/time-off`}
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-amber-200 hover:bg-amber-50"
      >
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <CalendarOff className="h-4 w-4" />
          Time-off requests pending review · {requests.length}
        </h2>
        <ChevronRight className="h-4 w-4 text-amber-700" />
      </Link>
      <ul className="divide-y divide-amber-100">
        {requests.slice(0, 3).map((r) => {
          const affectedPeriods = r.coverage?.reduce((sum, d) => sum + d.entries.length, 0) ?? 0;
          return (
            <li key={r.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{r.subjectName ?? "—"}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">{r.subjectType}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{KIND_LABEL[r.kind] ?? r.kind}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-700">{rangeLabel(r)}</div>
              {r.subjectType === "teacher" && affectedPeriods > 0 && (
                <div className="mt-0.5 text-[11px] text-amber-900">
                  Substitute needed for {affectedPeriods} period{affectedPeriods === 1 ? "" : "s"}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
