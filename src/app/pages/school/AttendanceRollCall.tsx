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
import { ChevronLeft, CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
import { HeroCard, KpiTile } from "../../components/school-ui";
import {
  getSectionAttendance,
  listStudents,
  postSectionAttendance,
  type AdminStudent,
  type RollCallStatus,
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

  const max = todayIso();
  const min = minDateIso();

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
        for (const s of students) {
          const existing = byId.get(s.id);
          init[s.id] = {
            status: existing?.status ?? null,
            notes: existing?.notes ?? "",
          };
        }
        setRows(init);
      })
      .catch((e) => setError(e?.message || "Failed to load attendance"))
      .finally(() => setLoading(false));
  }, [orgId, sectionId, date, students]);

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
      const r = await postSectionAttendance(orgId, sectionId, { date, entries });
      toast.success(
        `Saved — ${r.inserted} new, ${r.updated} updated` +
          (r.failed > 0 ? `, ${r.failed} failed` : ""),
      );
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
