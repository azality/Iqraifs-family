// AttendanceRollCall — daily roll-call for one section.
//
// Routed at /school/orgs/:orgId/sections/:sectionId/attendance.
// Loads students for the section + any existing attendance rows for the
// chosen date so teachers can edit in place. Default date is today; users
// may pick up to 14 days back, no future dates.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ChevronLeft, CheckCircle, Clock, XCircle, AlertCircle, LogOut, Flag } from "lucide-react";
import { HeroCard, KpiTile } from "../../components/school-ui";
import {
  getSectionAttendance,
  getSectionTimetable,
  listStudents,
  postSectionAttendance,
  postEarlyRelease,
  listAttendanceFlags,
  resolveAttendanceFlag,
  type AdminStudent,
  type RollCallStatus,
  type AttendanceFlag,
} from "../../../utils/schoolApi";

const STATUSES: ReadonlyArray<{ value: RollCallStatus; label: string; cls: string }> = [
  { value: "present", label: "P", cls: "bg-emerald-600 text-white" },
  { value: "late", label: "L", cls: "bg-amber-500 text-white" },
  { value: "absent", label: "A", cls: "bg-rose-600 text-white" },
  { value: "excused", label: "E", cls: "bg-slate-500 text-white" },
];

interface RowState {
  status: RollCallStatus | null;
  notes: string;
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function minDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AttendanceRollCall() {
  const { orgId = "", sectionId = "" } = useParams();
  const [date, setDate] = useState<string>(todayIso());
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Early release (custody record) + discrepancy flags.
  const [leftEarly, setLeftEarly] = useState<Record<string, { at: string; reason: string }>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<AttendanceFlag[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const max = todayIso();
  const min = minDateIso();

  // Timetable-aware off-day hint (pilot, Younus): a Saturday roll call
  // rendered as "everything unmarked" with no clue the class simply has
  // no periods that day. Best-effort — if the viewer can't read the
  // timetable, the hint just doesn't show.
  const [scheduledDays, setScheduledDays] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (!orgId || !sectionId) return;
    getSectionTimetable(orgId, sectionId)
      .then((r) => {
        const days = new Set<number>();
        for (const c of r.cells) {
          if (c.slot.kind === "break" || c.slot.kind === "prayer" || c.slot.kind === "assembly") continue;
          days.add(c.slot.dayOfWeek);
        }
        setScheduledDays(days.size > 0 ? days : null);
      })
      .catch(() => setScheduledDays(null));
  }, [orgId, sectionId]);
  const selectedDow = useMemo(() => {
    const js = new Date(`${date}T00:00:00`).getDay();
    return js === 0 ? 7 : js; // Mon=1 … Sun=7, matching timetable slots
  }, [date]);
  const isOffDay = scheduledDays !== null && !scheduledDays.has(selectedDow);

  // Load students for the section once.
  useEffect(() => {
    if (!orgId || !sectionId) return;
    listStudents(orgId, { classSectionId: sectionId })
      .then(setStudents)
      .catch((e) => setError(e?.message || "Failed to load students"));
  }, [orgId, sectionId]);

  // Prefill rows whenever date changes (or first load completes).
  useEffect(() => {
    if (!orgId || !sectionId || students.length === 0) return;
    setLoading(true);
    getSectionAttendance(orgId, sectionId, { date })
      .then((r) => {
        const byId = new Map(r.entries.map((e) => [e.studentId, e]));
        const init: Record<string, RowState> = {};
        const le: Record<string, { at: string; reason: string }> = {};
        const saved = new Set<string>();
        for (const s of students) {
          const existing = byId.get(s.id);
          init[s.id] = {
            status: existing?.status ?? null,
            notes: existing?.notes ?? "",
          };
          if (existing) saved.add(s.id);
          if (existing?.leftEarlyAt) {
            le[s.id] = { at: existing.leftEarlyAt, reason: existing.leftEarlyReason ?? "" };
          }
        }
        setRows(init);
        setLeftEarly(le);
        setSavedIds(saved);
      })
      .catch((e) => setError(e?.message || "Failed to load attendance"))
      .finally(() => setLoading(false));
  }, [orgId, sectionId, date, students, reloadKey]);

  // Open discrepancy flags for this section (raised by subject teachers).
  useEffect(() => {
    if (!orgId || !sectionId) return;
    listAttendanceFlags(orgId, sectionId, { status: "open" })
      .then((r) => setFlags(r.flags))
      .catch(() => {});
  }, [orgId, sectionId, reloadKey]);

  const markEarlyRelease = async (s: AdminStudent) => {
    const reason = window.prompt(
      `Early release for ${s.full_name} — reason (required, e.g. "unwell, guardian informed"):`,
    );
    if (!reason || !reason.trim()) return;
    try {
      await postEarlyRelease(orgId, sectionId, { studentId: s.id, date, reason: reason.trim() });
      toast.success(`${s.full_name}: early release recorded`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record early release");
    }
  };
  const clearEarlyRelease = async (s: AdminStudent) => {
    if (!window.confirm(`Clear the early-release record for ${s.full_name}?`)) return;
    try {
      await postEarlyRelease(orgId, sectionId, { studentId: s.id, date, clear: true });
      toast.success("Early release cleared");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear");
    }
  };
  const actOnFlag = async (f: AttendanceFlag, status: "resolved" | "dismissed") => {
    const resolution =
      status === "resolved"
        ? window.prompt("What was the outcome? (optional, e.g. 'left early — recorded')") ?? undefined
        : undefined;
    try {
      await resolveAttendanceFlag(orgId, f.id, { status, resolution: resolution || undefined });
      toast.success(status === "resolved" ? "Flag resolved" : "Flag dismissed");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update flag");
    }
  };

  const markAll = (status: RollCallStatus) => {
    setRows((s) => {
      const next: Record<string, RowState> = {};
      for (const sid of Object.keys(s)) next[sid] = { ...s[sid], status };
      return next;
    });
  };

  const setStatus = (sid: string, status: RollCallStatus) =>
    setRows((s) => ({ ...s, [sid]: { ...(s[sid] ?? { status: null, notes: "" }), status } }));
  const setNote = (sid: string, notes: string) =>
    setRows((s) => ({ ...s, [sid]: { ...(s[sid] ?? { status: null, notes: "" }), notes } }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const entries = students
        .filter((s) => rows[s.id]?.status)
        .map((s) => ({
          studentId: s.id,
          status: rows[s.id].status as RollCallStatus,
          notes: rows[s.id].notes || undefined,
        }));
      if (entries.length === 0) {
        setError("Mark at least one student before saving.");
        setSaving(false);
        return;
      }
      // Unmarked students are silently EXCLUDED from the save — that's
      // how Ayesha (I-A) went weeks without a single attendance row while
      // classmates were marked daily. Make the skip explicit.
      const unmarked = students.filter((s) => !rows[s.id]?.status);
      if (unmarked.length > 0) {
        const names = unmarked.slice(0, 5).map((s) => s.full_name).join(", ");
        const more = unmarked.length > 5 ? ` and ${unmarked.length - 5} more` : "";
        const ok = window.confirm(
          `${unmarked.length} student${unmarked.length === 1 ? " is" : "s are"} left unmarked and will NOT be recorded for ${date}:\n${names}${more}.\n\nSave anyway?`,
        );
        if (!ok) {
          setSaving(false);
          return;
        }
      }
      const r = await postSectionAttendance(orgId, sectionId, { date, entries });
      toast.success(
        `Saved — ${r.inserted} new, ${r.updated} updated` +
          (r.failed > 0 ? `, ${r.failed} failed` : ""),
      );
      // Refresh saved-row tracking so "Left early…" becomes available.
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    for (const s of students) {
      const st = rows[s.id]?.status;
      if (!st) c.unmarked += 1;
      else c[st] += 1;
    }
    return c;
  }, [students, rows]);

  const prettyDate = (() => {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return date;
    }
  })();

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-end">
        <Link to={`/school/orgs/${orgId}/admin/classes`}>
          <Button variant="outline" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" /> Classes
          </Button>
        </Link>
      </div>

      <HeroCard
        variant="slim"
        eyebrow="Roll-call"
        title="Attendance"
        subtitle={`${students.length} students`}
        asOf={prettyDate}
        rightSlot={
          <Input
            id="ar-date"
            type="date"
            value={date}
            min={min}
            max={max}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-44 border-white/20 bg-white/10 text-white [color-scheme:dark]"
          />
        }
      />

      {isOffDay && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          No periods are scheduled for this class on{" "}
          {["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][selectedDow]}{" "}
          — this looks like an off day. If the class did meet, you can still record attendance below.
        </div>
      )}

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <KpiTile
          variant="light"
          label="Present"
          icon={CheckCircle}
          value={counts.present}
          hint="Mark all present"
          onClick={() => markAll("present")}
        />
        <KpiTile
          variant="light"
          label="Late"
          icon={Clock}
          value={counts.late}
          hint="Mark all late"
          onClick={() => markAll("late")}
        />
        <KpiTile
          variant="light"
          label="Absent"
          icon={XCircle}
          value={counts.absent}
          hint="Mark all absent"
          onClick={() => markAll("absent")}
        />
        <KpiTile
          variant="light"
          label="Excused"
          icon={AlertCircle}
          value={counts.excused}
          hint="Mark all excused"
          onClick={() => markAll("excused")}
        />
      </div>

      {counts.unmarked > 0 && (
        <p className="text-xs text-slate-500">
          <span className="tabular-nums text-slate-700">{counts.unmarked}</span> unmarked
        </p>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* Discrepancy flags raised by subject teachers — the class teacher
          decides: fix the register / record an early release / dismiss. */}
      {flags.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Flag className="h-4 w-4" />
            {flags.length} attendance {flags.length === 1 ? "flag" : "flags"} to review
          </div>
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={f.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                <div className="text-slate-800">
                  <span className="font-medium">{f.studentName ?? "General"}</span>
                  {f.grNumber && <span className="text-xs text-slate-500"> · GR# {f.grNumber}</span>}
                  <span className="text-xs text-slate-500"> · {f.date}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  “{f.note}” — {f.raisedByName ?? "a teacher"}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={() => actOnFlag(f, "resolved")}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => actOnFlag(f, "dismissed")}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : students.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No students enrolled in this section yet.
            </p>
          ) : (
            <ul className="divide-y">
              {students.map((s) => {
                const row = rows[s.id] ?? { status: null, notes: "" };
                return (
                  <li key={s.id} className="p-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-[180px] flex-1">
                      <div className="font-medium text-sm">{s.full_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        GR# {s.gr_number}
                      </div>
                    </div>
                    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      {STATUSES.map((opt) => {
                        const active = row.status === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setStatus(s.id, opt.value)}
                            className={
                              "h-8 w-9 rounded text-xs font-semibold transition-colors " +
                              (active ? opt.cls : "text-slate-600 hover:bg-white")
                            }
                            title={opt.value}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      className="w-full sm:w-64 h-8 text-sm"
                      placeholder="Notes (optional)"
                      value={row.notes}
                      onChange={(e) => setNote(s.id, e.target.value)}
                    />
                    {leftEarly[s.id] ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-medium text-sky-800">
                        <LogOut className="h-3 w-3" />
                        Left {new Date(leftEarly[s.id].at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {leftEarly[s.id].reason ? ` · ${leftEarly[s.id].reason}` : ""}
                        <button
                          type="button"
                          className="ml-1 text-sky-600 hover:text-sky-900"
                          title="Clear early release"
                          onClick={() => clearEarlyRelease(s)}
                        >
                          ✕
                        </button>
                      </span>
                    ) : savedIds.has(s.id) && (row.status === "present" || row.status === "late") ? (
                      <button
                        type="button"
                        onClick={() => markEarlyRelease(s)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                        title="Student attended but is leaving before close"
                      >
                        <LogOut className="h-3 w-3" /> Left early…
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sticky save footer */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            <span className="tabular-nums text-slate-700">{students.length - counts.unmarked}</span> of {students.length} marked · {date}
          </p>
          <Button
            onClick={submit}
            disabled={saving || students.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </div>
    </div>
  );
}
