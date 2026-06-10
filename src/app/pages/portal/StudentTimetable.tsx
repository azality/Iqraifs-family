// StudentTimetable — parent/student portal weekly schedule.
//
// Outlook-style calendar grid that mirrors the teacher's "My schedule":
// y-axis = hour ticks (with 30-min sub-lines), x-axis = Mon..Sat, each
// timetable entry rendered as a colored block positioned by its slot's
// start/end time. Subject color is hashed from the subject name so Math
// is always the same blue, Quran always the same green, etc.
//
// The time axis spans the school's published school_day_start/end when
// configured by the principal (see OrgSettings) — falls back to the
// derived min/max otherwise. Today's column is highlighted; a "now"
// line shows where in the day we are.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Calendar } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  getMyStudentTimetable,
  getOrgBySlug,
  type MyStudentTimetableCell,
  type PortalOrgBranding,
} from "../../../utils/schoolPortalApi";

const DAYS = [
  { num: 1, short: "Mon" },
  { num: 2, short: "Tue" },
  { num: 3, short: "Wed" },
  { num: 4, short: "Thu" },
  { num: 5, short: "Fri" },
  { num: 6, short: "Sat" },
];

function toMin(t: string | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}
function hueFor(s: string | null | undefined): number {
  if (!s) return 220;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
function todayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StudentTimetable() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { subject } = usePinAuth();
  const [cells, setCells] = useState<MyStudentTimetableCell[]>([]);
  const [branding, setBranding] = useState<PortalOrgBranding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyStudentTimetable(studentId, { date: todayIso() })
      .then((r) => { if (!cancelled) { setCells(r.cells); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  useEffect(() => {
    if (!subject?.orgSlug) return;
    getOrgBySlug(subject.orgSlug).then(setBranding).catch(() => setBranding(null));
  }, [subject?.orgSlug]);

  const { byDay, minMin, maxMin } = useMemo(() => {
    const out: { [day: number]: MyStudentTimetableCell[] } = {};
    let lo = 24 * 60, hi = 0;
    for (const c of cells) {
      // Show only entries that have content; "Free" slots clutter the grid.
      if (!c.entry) continue;
      const d = c.slot.dayOfWeek;
      if (!out[d]) out[d] = [];
      out[d].push(c);
      lo = Math.min(lo, toMin(c.slot.startTime));
      hi = Math.max(hi, toMin(c.slot.endTime));
    }
    if (lo === 24 * 60) lo = 8 * 60;
    if (hi === 0) hi = 17 * 60;
    // Extend axis to cover published school hours so the day reads the
    // same on every student's portal.
    if (branding?.schoolDayStart) lo = Math.min(lo, toMin(branding.schoolDayStart));
    if (branding?.schoolDayEnd) hi = Math.max(hi, toMin(branding.schoolDayEnd));
    return { byDay: out, minMin: lo, maxMin: hi };
  }, [cells, branding?.schoolDayStart, branding?.schoolDayEnd]);

  const today = todayDow();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const startHour = Math.floor(minMin / 60);
  const endHour = Math.ceil(maxMin / 60);
  const totalH = Math.max(1, endHour - startHour);
  const nowFrac = (nowM - minMin) / Math.max(1, maxMin - minMin);
  const showNow = nowFrac >= 0 && nowFrac <= 1;
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  return (
    <div className="space-y-4">
      <HeroCard
        title="Weekly schedule"
        subtitle="Subject colors are consistent across the week — Math is always the same blue, Quran the same green."
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Calendar className="h-6 w-6 mx-auto text-slate-300 mb-2" />
          No timetable published yet for your class.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden overflow-x-auto">
          {/* Header row */}
          <div className="grid grid-cols-[60px_repeat(6,minmax(70px,1fr))] bg-slate-50 border-b border-slate-200">
            <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-slate-500">Time</div>
            {DAYS.map((d) => (
              <div key={d.num}
                   className={"px-2 py-2 text-xs font-semibold border-l border-slate-200 " +
                     (d.num === today ? "bg-indigo-50 text-indigo-800" : "text-slate-700")}>
                {d.short}
                {d.num === today && <span className="ml-1 text-[10px] text-indigo-500">· today</span>}
              </div>
            ))}
          </div>

          {/* Body grid */}
          <div
            className="grid grid-cols-[60px_repeat(6,minmax(70px,1fr))] relative"
            style={{ height: `${totalH * 48}px` }}
          >
            {/* Hour labels */}
            <div className="border-r border-slate-200">
              {hours.map((h, i) => (
                <div key={h}
                     className="text-[10px] text-slate-400 px-2 border-b border-slate-100"
                     style={{ height: i === hours.length - 1 ? "0" : "48px" }}>
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {DAYS.map((d) => {
              const dayCells = byDay[d.num] ?? [];
              return (
                <div key={d.num} className="relative border-l border-slate-200">
                  {/* Hour gridlines */}
                  {hours.map((h) => (
                    <div key={`h-${h}`}
                         className="absolute inset-x-0 border-t border-slate-100"
                         style={{ top: `${(h - startHour) * 48}px`, height: 0 }} />
                  ))}
                  {/* 30-min sub-lines */}
                  {hours.slice(0, -1).map((h) => (
                    <div key={`h30-${h}`}
                         className="absolute inset-x-0 border-t border-slate-50"
                         style={{ top: `${(h - startHour) * 48 + 24}px`, height: 0 }} />
                  ))}
                  {/* Today highlight + now line */}
                  {d.num === today && (
                    <div className="absolute inset-0 bg-indigo-50/40 pointer-events-none" />
                  )}
                  {d.num === today && showNow && (
                    <div className="absolute inset-x-0 z-20 pointer-events-none"
                         style={{ top: `${nowFrac * totalH * 48}px` }}>
                      <div className="h-px bg-rose-500" />
                      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
                    </div>
                  )}
                  {/* Entry blocks */}
                  {dayCells.map((c) => {
                    const startM = toMin(c.slot.startTime);
                    const endM = toMin(c.slot.endTime);
                    const top = ((startM - minMin) / Math.max(1, maxMin - minMin)) * totalH * 48;
                    const height = Math.max(20, ((endM - startM) / Math.max(1, maxMin - minMin)) * totalH * 48);
                    const subj = c.entry?.subjectName ?? c.slot.name;
                    const hue = hueFor(subj);
                    const isSub = !!c.entry?.substitution;
                    return (
                      <div
                        key={c.slot.id + ":" + d.num}
                        className={
                          "absolute left-1 right-1 rounded-md px-2 py-1.5 text-[11px] text-white overflow-hidden ring-1 ring-black/5 " +
                          (isSub ? "ring-2 ring-amber-300" : "")
                        }
                        style={{
                          top: `${top}px`, height: `${height}px`,
                          background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${hue} 60% 35%))`,
                        }}
                        title={`${subj} · ${c.slot.startTime}–${c.slot.endTime}${c.entry?.teacherName ? ` · ${c.entry.teacherName}` : ""}${c.entry?.room ? ` · Room ${c.entry.room}` : ""}${isSub ? " · Substitute today" : ""}`}
                      >
                        <div className="font-semibold truncate">{subj}</div>
                        {c.entry?.teacherName && (
                          <div className="opacity-90 truncate">{c.entry.teacherName}</div>
                        )}
                        <div className="opacity-80 text-[10px]">{c.slot.startTime}–{c.slot.endTime}</div>
                        {c.entry?.room && (
                          <div className="opacity-80 text-[10px]">Room {c.entry.room}</div>
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

export default StudentTimetable;
