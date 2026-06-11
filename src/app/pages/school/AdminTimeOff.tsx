// Admin/principal review queue for time-off + absence requests.
//
// Lists pending requests at the top with approve/reject controls; older
// requests show in a "Reviewed" section grouped by status. Subject names
// resolve on the server (student lookup for students, auth metadata for
// teachers) so the queue is scannable without follow-up clicks.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { CalendarOff, Check, X } from "lucide-react";
import { HeroCard, StatusPill } from "../../components/school-ui";
import type { Status } from "../../components/school-ui";
import {
  listOrgTimeOff, decideTimeOff,
  type TimeOffRequest, type TimeOffStatus,
} from "../../../utils/schoolApi";

const KIND_LABEL: Record<string, string> = {
  vacation: "Vacation", sick: "Sick", personal: "Personal",
  short_break: "Short break", family_emergency: "Family emergency",
  medical: "Medical", other: "Other",
};

function statusKind(s: TimeOffStatus): Status {
  if (s === "approved") return "compliant";
  if (s === "rejected" || s === "cancelled") return "flagged";
  return "watch";
}

function formatDay(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch { return iso; }
}

function dateRange(r: TimeOffRequest): string {
  if (r.startDate === r.endDate) {
    if (r.startTime && r.endTime) return `${r.startDate} · ${r.startTime}–${r.endTime}`;
    return r.startDate;
  }
  return `${r.startDate} → ${r.endDate}`;
}

export function AdminTimeOff() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [rows, setRows] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listOrgTimeOff(orgId);
      setRows(r.requests);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId]);

  async function decide(id: string, decision: "approved" | "rejected") {
    const notes = decision === "rejected"
      ? window.prompt("Optional note for the requester (leave blank to skip):") ?? undefined
      : undefined;
    setBusyId(id);
    try {
      await decideTimeOff(orgId, id, decision, notes || undefined);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const reviewed = useMemo(() => rows.filter((r) => r.status !== "pending"), [rows]);

  function Row({ r, showActions }: { r: TimeOffRequest; showActions: boolean }) {
    return (
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-900">{r.subjectName ?? "—"}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {r.subjectType}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
              {KIND_LABEL[r.kind] ?? r.kind}
            </span>
            <StatusPill status={statusKind(r.status)} label={r.status} />
          </div>
          <div className="mt-0.5 text-xs text-slate-600">{dateRange(r)}</div>
          {r.reason && <div className="mt-1 text-xs text-slate-700">"{r.reason}"</div>}
          {r.reviewerNotes && (
            <div className="mt-1 text-xs italic text-slate-500">Reviewer: {r.reviewerNotes}</div>
          )}
          {/* Coverage info — teacher requests only. Helps the admin
              see at a glance which classes/subjects need a substitute
              on each affected day. */}
          {r.subjectType === "teacher" && r.coverage && r.coverage.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                Coverage needed
              </div>
              <div className="mt-1 space-y-1.5">
                {r.coverage.map((day) => (
                  <div key={day.date} className="text-xs">
                    <div className="font-medium text-slate-800">
                      {formatDay(day.date)} — {day.entries.length} period{day.entries.length === 1 ? "" : "s"}
                    </div>
                    <ul className="ml-3 mt-0.5 list-disc text-[11px] text-slate-700">
                      {day.entries.map((e, i) => (
                        <li key={i}>
                          <span className="text-slate-500">{e.startTime?.slice(0, 5)}–{e.endTime?.slice(0, 5)}</span>
                          {" · "}
                          <span className="font-medium">{e.subjectName ?? "—"}</span>
                          {e.sectionLabel && <span className="text-slate-500"> · {e.sectionLabel}</span>}
                          {e.room && <span className="text-slate-500"> · Room {e.room}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.subjectType === "teacher" && r.coverage && r.coverage.length === 0 && (
            <div className="mt-1 text-[11px] text-emerald-700">No teaching periods affected — no substitute needed.</div>
          )}
        </div>
        {showActions && (
          <div className="flex shrink-0 gap-1">
            <button onClick={() => decide(r.id, "approved")} disabled={busyId === r.id}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              <Check className="inline h-3 w-3" /> Approve
            </button>
            <button onClick={() => decide(r.id, "rejected")} disabled={busyId === r.id}
              className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50">
              <X className="inline h-3 w-3" /> Reject
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeroCard
        title="Time off & absences"
        subtitle="Teacher leave requests and student absence notices in one queue."
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Pending review · {pending.length}
          </h2>
        </div>
        {loading ? (
          <div className="px-3 py-6 text-sm text-slate-500">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-500">
            <CalendarOff className="mx-auto mb-2 h-5 w-5 text-slate-300" />
            No requests waiting on you. Nice.
          </div>
        ) : (
          pending.map((r) => <Row key={r.id} r={r} showActions />)
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-900">Recently reviewed</h2>
          </div>
          {reviewed.slice(0, 30).map((r) => <Row key={r.id} r={r} showActions={false} />)}
        </section>
      )}
    </div>
  );
}

export default AdminTimeOff;
