// TeacherWeekView — full weekly timetable for the signed-in teacher.
//
// The "Today" card on TeacherHome covers the next-action case
// (what am I teaching in the next hour). This page covers planning:
// "where am I on Thursday afternoon, do I have a gap before lunch."
//
// Reuses the same /me/timetable endpoint, just with no `day` filter.
// Substitution badges from the endpoint are shown only on today's
// column so the rest of the week reads as the canonical schedule
// (subs are per-date and don't apply to future-day cells).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, BookOpen, MapPin, Calendar } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  getMyTeacherTimetable,
  type MyTimetableCell,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function todayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TeacherWeekView() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [cells, setCells] = useState<MyTimetableCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    getMyTeacherTimetable(orgId, { date: todayIso() })
      .then((r) => { if (!cancelled) { setCells(r.cells); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  const byDay = useMemo(() => {
    const m = new Map<number, MyTimetableCell[]>();
    for (const c of cells) {
      const arr = m.get(c.slot.dayOfWeek) ?? [];
      arr.push(c);
      m.set(c.slot.dayOfWeek, arr);
    }
    // Sort each day's cells by start time so the grid reads top-down.
    for (const arr of m.values()) {
      arr.sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
    }
    return m;
  }, [cells]);

  const today = todayDow();

  // Total class hours this week — quick at-a-glance load indicator.
  const totalSlots = cells.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Dashboard
          </Button>
        </Link>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>My week</h1>
        <p className="mt-1 text-sm text-slate-600">
          {totalSlots} period{totalSlots === 1 ? "" : "s"} scheduled across the week.
          Substitutions only show for today.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : totalSlots === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Calendar className="mx-auto h-6 w-6 text-slate-300 mb-2" />
          You don't have any timetable entries yet. Your school admin assigns them.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {DAYS.map((_, i) => {
            const dow = i + 1;
            const dayCells = byDay.get(dow) ?? [];
            const isToday = dow === today;
            return (
              <div
                key={dow}
                className={
                  "rounded-2xl border bg-white shadow-sm overflow-hidden " +
                  (isToday ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200")
                }
              >
                <div className={
                  "px-3 py-2 border-b border-slate-100 flex items-center justify-between " +
                  (isToday ? "bg-indigo-50" : "bg-slate-50/60")
                }>
                  <div className="text-sm font-semibold text-slate-900">
                    {DAY_FULL[i]}
                    {isToday && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-indigo-600 text-white text-[10px] font-medium px-2 py-0.5">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {dayCells.length} slot{dayCells.length === 1 ? "" : "s"}
                  </span>
                </div>
                {dayCells.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400 italic">No classes.</div>
                ) : (
                  <div className="p-2 space-y-1.5">
                    {dayCells.map((c) => {
                      // substitution badges only on today's column — for
                      // other days they're stale and confusing.
                      const sub = isToday ? c.substitution : null;
                      const covering = sub?.role === "covering";
                      const covered = sub?.role === "covered";
                      return (
                        <div
                          key={c.entry.id + (covering ? ":cov" : "")}
                          className={
                            "rounded-lg border px-2.5 py-1.5 text-xs " +
                            (covering
                              ? "border-amber-200 bg-amber-50"
                              : covered
                              ? "border-slate-200 bg-slate-50 opacity-70"
                              : "border-slate-200 bg-slate-50/40")
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-semibold text-slate-600">
                              {c.slot.startTime}–{c.slot.endTime}
                            </div>
                            <div className="text-[10px] text-slate-400">{c.slot.name}</div>
                          </div>
                          <div className="mt-0.5 inline-flex items-center gap-1 font-medium text-slate-800">
                            <BookOpen className="h-3 w-3 text-indigo-500" />
                            {c.entry.subjectName ?? "Class"}
                          </div>
                          <div className="text-[11px] text-slate-600">{c.scopeLabel}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1.5 items-center">
                            {c.entry.room && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                                <MapPin className="h-2.5 w-2.5" /> {c.entry.room}
                              </span>
                            )}
                            {covering && (
                              <span className="text-[10px] font-medium text-amber-800 bg-amber-100 px-1 py-0.5 rounded">
                                Covering{sub?.originalTeacherName ? ` for ${sub.originalTeacherName}` : ""}
                              </span>
                            )}
                            {covered && (
                              <span className="text-[10px] font-medium text-slate-600 bg-slate-200 px-1 py-0.5 rounded">
                                Covered{sub?.substituteTeacherName ? ` by ${sub.substituteTeacherName}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TeacherWeekView;
