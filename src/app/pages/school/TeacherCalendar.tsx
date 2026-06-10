// TeacherCalendar — Outlook-style weekly view of the caller's own teaching
// schedule. Route /school/orgs/:orgId/my-schedule.
//
// What it does differently from the small TeacherHome card:
//   - Full week × time-of-day grid (Mon–Sat by default).
//   - Entries render as colored blocks positioned by their slot's
//     start/end time, just like Outlook calendar.
//   - Conflicts are detected client-side and outlined in red — useful
//     because the seeded demo (and any pre-existing data) might have
//     overlaps that bypassed the server's conflict guards.
//   - Today's column is highlighted, "now" line drawn across all days.

import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { Calendar, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  getMyTeacherTimetable,
  type MyTimetableCell,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

const DAYS = [
  { num: 1, short: "Mon", long: "Monday" },
  { num: 2, short: "Tue", long: "Tuesday" },
  { num: 3, short: "Wed", long: "Wednesday" },
  { num: 4, short: "Thu", long: "Thursday" },
  { num: 5, short: "Fri", long: "Friday" },
  { num: 6, short: "Sat", long: "Saturday" },
];

// Time conversion helpers — "HH:MM" → minutes since midnight.
function toMin(t: string | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

// Subject-name → hash → hue. Stable color per subject across the week.
function hueFor(s: string | null | undefined): number {
  if (!s) return 220;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

type ViewMode = "day" | "week";

export function TeacherCalendar() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [cells, setCells] = useState<MyTimetableCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("week");

  useEffect(() => {
    if (!orgId) return;
    // No `day` filter — backend returns the whole week.
    getMyTeacherTimetable(orgId)
      .then((r) => setCells(r.cells))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [orgId]);

  // Group entries by day (1..6). Compute total grid bounds so the time
  // axis only spans the actual school day, not a fixed 8am–5pm window.
  const { byDay, minMin, maxMin, conflicts } = useMemo(() => {
    const out: { [day: number]: MyTimetableCell[] } = {};
    let lo = 24 * 60, hi = 0;
    const conf = new Set<string>(); // entry ids in a conflict
    for (const c of cells ?? []) {
      const d = c.slot.dayOfWeek;
      if (!out[d]) out[d] = [];
      out[d].push(c);
      lo = Math.min(lo, toMin(c.slot.startTime));
      hi = Math.max(hi, toMin(c.slot.endTime));
    }
    // Conflict scan: within each day, overlapping (start < other.end &&
    // other.start < end) flags both entries.
    for (const day of Object.keys(out)) {
      const list = out[Number(day)];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const aS = toMin(a.slot.startTime), aE = toMin(a.slot.endTime);
          const bS = toMin(b.slot.startTime), bE = toMin(b.slot.endTime);
          if (aS < bE && bS < aE) {
            conf.add(a.entry.id);
            conf.add(b.entry.id);
          }
        }
      }
    }
    if (lo === 24 * 60) lo = 8 * 60;
    if (hi === 0) hi = 17 * 60;
    return { byDay: out, minMin: lo, maxMin: hi, conflicts: conf };
  }, [cells]);

  // Today (1..7).
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;

  // ─── Insights ────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!cells || cells.length === 0) {
      return null;
    }
    let weekMinutes = 0;
    let todayMinutes = 0;
    const minutesByDay = new Map<number, number>();
    const subjectMinutes = new Map<string, number>();
    const sectionSet = new Set<string>();
    for (const c of cells) {
      const dur = toMin(c.slot.endTime) - toMin(c.slot.startTime);
      weekMinutes += dur;
      minutesByDay.set(c.slot.dayOfWeek, (minutesByDay.get(c.slot.dayOfWeek) ?? 0) + dur);
      if (c.slot.dayOfWeek === todayDow) todayMinutes += dur;
      const subj = c.entry.subjectName ?? "Unscheduled";
      subjectMinutes.set(subj, (subjectMinutes.get(subj) ?? 0) + dur);
      sectionSet.add(c.scopeLabel);
    }
    // Busiest day
    let busiestDay = 1, busiestMins = 0;
    for (const [d, m] of minutesByDay) {
      if (m > busiestMins) { busiestMins = m; busiestDay = d; }
    }
    // Top 3 subjects
    const topSubjects = Array.from(subjectMinutes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s, m]) => ({ subject: s, minutes: m }));
    // Free time today: between minMin and maxMin, subtract today's used minutes.
    const todaySchoolMinutes = Math.max(0, maxMin - minMin);
    const todayFreeMinutes = Math.max(0, todaySchoolMinutes - todayMinutes);
    // Back-to-back streak (today)
    const todayList = (cells ?? [])
      .filter((c) => c.slot.dayOfWeek === todayDow)
      .sort((a, b) => toMin(a.slot.startTime) - toMin(b.slot.startTime));
    let maxStreak = 0, currentStreak = todayList.length > 0 ? 1 : 0;
    for (let i = 1; i < todayList.length; i++) {
      if (toMin(todayList[i].slot.startTime) === toMin(todayList[i - 1].slot.endTime)) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    maxStreak = Math.max(maxStreak, currentStreak);

    return {
      weekHours: weekMinutes / 60,
      todayHours: todayMinutes / 60,
      todayFreeHours: todayFreeMinutes / 60,
      busiestDay,
      busiestHours: busiestMins / 60,
      topSubjects,
      sectionCount: sectionSet.size,
      backToBackToday: maxStreak,
    };
  }, [cells, todayDow, minMin, maxMin]);
  // "Now" line position as fraction.
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowFrac = (nowMin - minMin) / Math.max(1, maxMin - minMin);
  const showNow = nowFrac >= 0 && nowFrac <= 1;

  // Hour ticks on the y-axis.
  const startHour = Math.floor(minMin / 60);
  const endHour = Math.ceil(maxMin / 60);
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}`}>
          <Button variant="outline" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Home</Button>
        </Link>
        <div className="flex items-center gap-2">
          {/* Today / Week toggle */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {([
              { v: "day" as ViewMode, label: "Today" },
              { v: "week" as ViewMode, label: "Week" },
            ]).map((opt) => (
              <button key={opt.v} type="button" onClick={() => setView(opt.v)}
                      className={"rounded-md px-3 py-1 text-xs font-medium " +
                        (view === opt.v ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-100")}>
                {opt.label}
              </button>
            ))}
          </div>
          {conflicts.size > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              {conflicts.size / 2} conflict{conflicts.size / 2 === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>

      {/* Insights strip */}
      {insights && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <InsightTile label="This week" value={`${insights.weekHours.toFixed(1)}h`}
                       sub={`${insights.sectionCount} section${insights.sectionCount === 1 ? "" : "s"}`} />
          <InsightTile label="Today"
                       value={insights.todayHours > 0 ? `${insights.todayHours.toFixed(1)}h` : "—"}
                       sub={insights.todayHours > 0
                         ? `${insights.todayFreeHours.toFixed(1)}h free`
                         : "No classes today"} />
          <InsightTile label="Busiest day"
                       value={["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][insights.busiestDay - 1]}
                       sub={`${insights.busiestHours.toFixed(1)}h`} />
          <InsightTile label="Top subjects"
                       value={insights.topSubjects.length > 0 ? insights.topSubjects[0].subject : "—"}
                       sub={insights.topSubjects.slice(0, 3)
                         .map((s) => `${s.subject} ${(s.minutes / 60).toFixed(1)}h`)
                         .join(" · ")} />
        </div>
      )}

      {/* Back-to-back nudge */}
      {insights && insights.backToBackToday >= 3 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <span>
            You have <strong>{insights.backToBackToday} back-to-back periods</strong> today —
            plan a quick stretch / water break between them.
          </span>
        </div>
      )}

      <div>
        <h1 className={sectionTitleClasses + " flex items-center gap-2"}>
          <Calendar className="h-6 w-6 text-indigo-500" /> My schedule
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your weekly teaching grid. Overlapping entries are outlined in red — talk to the admin to resolve.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!cells ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : cells.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No timetable entries assigned to you yet.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Header row */}
          <div className={"grid bg-slate-50 border-b border-slate-200 " +
            (view === "day" ? "grid-cols-[60px_minmax(0,1fr)]" : "grid-cols-[60px_repeat(6,minmax(0,1fr))]")}>
            <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-slate-500">Time</div>
            {(view === "day" ? DAYS.filter((d) => d.num === todayDow) : DAYS).map((d) => (
              <div key={d.num}
                   className={"px-2 py-2 text-xs font-semibold border-l border-slate-200 " +
                     (d.num === todayDow ? "bg-indigo-50 text-indigo-800" : "text-slate-700")}>
                {d.short}
                {d.num === todayDow && <span className="ml-1 text-[10px] text-indigo-500">· today</span>}
              </div>
            ))}
          </div>

          {/* Body — relative-positioned grid with absolute entry blocks */}
          <div
            className={"grid relative " +
              (view === "day" ? "grid-cols-[60px_minmax(0,1fr)]" : "grid-cols-[60px_repeat(6,minmax(0,1fr))]")}
            style={{ height: `${(endHour - startHour) * 48}px` }}
          >
            {/* Hour ticks (left col + horizontal lines) */}
            <div className="border-r border-slate-200">
              {hours.map((h, i) => (
                <div key={h}
                     className="text-[10px] text-slate-400 px-2 border-b border-slate-100"
                     style={{ height: i === hours.length - 1 ? "0" : "48px" }}>
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {(view === "day" ? DAYS.filter((d) => d.num === todayDow) : DAYS).map((d) => {
              const dayCells = byDay[d.num] ?? [];
              return (
                <div key={d.num} className="relative border-l border-slate-200">
                  {/* Horizontal hour grid lines */}
                  {hours.map((h, i) => (
                    <div key={h}
                         className="absolute inset-x-0 border-t border-slate-100"
                         style={{ top: `${(h - startHour) * 48}px`, height: "0" }} />
                  ))}
                  {/* Today highlight */}
                  {d.num === todayDow && (
                    <div className="absolute inset-0 bg-indigo-50/40 pointer-events-none" />
                  )}
                  {/* Now line */}
                  {d.num === todayDow && showNow && (
                    <div className="absolute inset-x-0 z-20 pointer-events-none"
                         style={{ top: `${nowFrac * (endHour - startHour) * 48}px` }}>
                      <div className="h-px bg-rose-500" />
                      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
                    </div>
                  )}
                  {/* Entry blocks */}
                  {dayCells.map((c) => {
                    const startM = toMin(c.slot.startTime);
                    const endM = toMin(c.slot.endTime);
                    const top = ((startM - minMin) / Math.max(1, maxMin - minMin)) * (endHour - startHour) * 48;
                    const height = Math.max(20, ((endM - startM) / Math.max(1, maxMin - minMin)) * (endHour - startHour) * 48);
                    const hue = hueFor(c.entry.subjectName);
                    const conflict = conflicts.has(c.entry.id);
                    return (
                      <div
                        key={c.entry.id}
                        className={
                          "absolute left-1 right-1 rounded-md px-2 py-1.5 text-[11px] text-white overflow-hidden " +
                          (conflict ? "ring-2 ring-rose-500 z-10" : "ring-1 ring-black/5")
                        }
                        style={{
                          top: `${top}px`, height: `${height}px`,
                          background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${hue} 60% 35%))`,
                        }}
                        title={`${c.entry.subjectName ?? "Slot"} · ${c.scopeLabel} · ${c.slot.startTime}–${c.slot.endTime}${c.entry.room ? ` · ${c.entry.room}` : ""}${conflict ? " · CONFLICT" : ""}`}
                      >
                        <div className="font-semibold truncate">{c.entry.subjectName ?? "Slot"}</div>
                        <div className="opacity-90 truncate">{c.scopeLabel}</div>
                        <div className="opacity-80 text-[10px]">{c.slot.startTime}–{c.slot.endTime}</div>
                        {conflict && (
                          <div className="absolute right-1 top-1">
                            <AlertTriangle className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5 truncate" title={value}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

export default TeacherCalendar;
