// StudentTimetable — parent/student portal weekly schedule.
//
// Renders the org's slot skeleton joined with the student's section
// entries (and Hifz group entries, if any). Empty slots show as
// "Free" so the parent sees the whole school day, not just classes.
//
// Days are grouped one-per-card; today's card is highlighted so the
// parent reads what's happening NOW first.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Calendar, BookOpen, MapPin, User } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import {
  getMyStudentTimetable,
  type MyStudentTimetableCell,
} from "../../../utils/schoolPortalApi";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const KIND_TONE: Record<string, string> = {
  academic: "bg-indigo-50 text-indigo-900 border-indigo-200",
  break:    "bg-slate-100 text-slate-700 border-slate-200",
  prayer:   "bg-emerald-50 text-emerald-900 border-emerald-200",
  hifz:     "bg-amber-50 text-amber-900 border-amber-200",
  assembly: "bg-sky-50 text-sky-900 border-sky-200",
  other:    "bg-white text-slate-700 border-slate-200",
};
const KIND_LABEL: Record<string, string> = {
  academic: "Class",
  break: "Break",
  prayer: "Prayer",
  hifz: "Hifz",
  assembly: "Assembly",
  other: "Other",
};

function todayDow(): number {
  // ISO day: Monday = 1 ... Sunday = 7. JS getDay(): Sunday = 0.
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

export function StudentTimetable() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [cells, setCells] = useState<MyStudentTimetableCell[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyStudentTimetable(studentId)
      .then((r) => { if (!cancelled) { setCells(r.cells); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  // Group cells by day-of-week for a one-card-per-day layout.
  const byDay = useMemo(() => {
    const m = new Map<number, MyStudentTimetableCell[]>();
    for (const c of cells) {
      const arr = m.get(c.slot.dayOfWeek) ?? [];
      arr.push(c);
      m.set(c.slot.dayOfWeek, arr);
    }
    return m;
  }, [cells]);

  const today = todayDow();

  if (loading) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (cells.length === 0) {
    return (
      <div className="space-y-5">
        <HeroCard title="Timetable" subtitle="Weekly schedule" />
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500 italic">
          <Calendar className="h-6 w-6 mx-auto text-slate-300 mb-2" />
          No timetable has been published yet. The school will set this up shortly.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeroCard title="Timetable" subtitle="Weekly schedule" />

      {DAYS.map((_, i) => {
        const dow = i + 1;
        const dayCells = byDay.get(dow) ?? [];
        if (dayCells.length === 0) return null;
        const isToday = dow === today;
        return (
          <div
            key={dow}
            className={
              "bg-white border rounded-2xl shadow-sm overflow-hidden " +
              (isToday ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200")
            }
          >
            <div className={
              "px-4 py-2 flex items-center justify-between " +
              (isToday ? "bg-indigo-50" : "bg-slate-50/60") + " border-b border-slate-100"
            }>
              <div className="text-sm font-semibold text-slate-900">
                {DAY_FULL[i]}
                {isToday && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-indigo-600 text-white text-[10px] font-medium px-2 py-0.5">
                    Today
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                {dayCells.length} slot{dayCells.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="p-3 space-y-1.5">
              {dayCells.map((c) => (
                <div
                  key={c.slot.id}
                  className={"rounded-lg border px-3 py-2 text-sm flex items-center gap-3 flex-wrap " + (KIND_TONE[c.slot.kind] ?? KIND_TONE.other)}
                >
                  <div className="shrink-0 w-28">
                    <div className="text-xs font-semibold">{c.slot.name}</div>
                    <div className="text-[10px] opacity-80">
                      {c.slot.startTime}–{c.slot.endTime}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    {c.entry ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <BookOpen className="h-3.5 w-3.5" />
                          {c.entry.subjectName ?? KIND_LABEL[c.slot.kind] ?? "—"}
                        </span>
                        {c.entry.teacherName && (
                          <span className="text-xs inline-flex items-center gap-1 opacity-80">
                            <User className="h-3 w-3" /> {c.entry.teacherName}
                          </span>
                        )}
                        {c.entry.room && (
                          <span className="text-xs inline-flex items-center gap-1 opacity-80">
                            <MapPin className="h-3 w-3" /> Room {c.entry.room}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs italic opacity-60">
                        {KIND_LABEL[c.slot.kind] ?? "Free"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default StudentTimetable;
