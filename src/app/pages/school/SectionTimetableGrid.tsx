// Outlook-style read-only weekly grid for one section / Hifz group.
//
// Drops in above the per-day editing cards so the admin gets the
// "at a glance" picture they came looking for — same data, but
// rendered as a calendar instead of a stack of dropdown rows.
// Clicking a block scrolls the matching row in the cards list into
// view and pulses it briefly, so editing is still one click away.
//
// Coloring follows the same subject-name → hue hash the teacher
// calendar uses, so Math is always the same blue everywhere.

import { useMemo } from "react";
import type { TimetableWeekCell } from "../../../utils/schoolApi";

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

interface SectionTimetableGridProps {
  cells: TimetableWeekCell[];
  /** Called with the slot id when the admin clicks a block. The
   *  parent uses this to scroll the matching cards row into view. */
  onSlotClick?: (slotId: string) => void;
}

export function SectionTimetableGrid({ cells, onSlotClick }: SectionTimetableGridProps) {
  const { byDay, minMin, maxMin } = useMemo(() => {
    const out: { [day: number]: TimetableWeekCell[] } = {};
    let lo = 24 * 60, hi = 0;
    for (const c of cells) {
      const d = c.slot.dayOfWeek;
      if (!out[d]) out[d] = [];
      out[d].push(c);
      lo = Math.min(lo, toMin(c.slot.startTime));
      hi = Math.max(hi, toMin(c.slot.endTime));
    }
    if (lo === 24 * 60) lo = 8 * 60;
    if (hi === 0) hi = 14 * 60;
    return { byDay: out, minMin: lo, maxMin: hi };
  }, [cells]);

  // Stats — show what's filled vs empty so the admin sees progress
  // here too without scrolling to the cards.
  const academicCells = cells.filter((c) => c.slot.kind === "academic");
  const filledCount = academicCells.filter((c) => c.entry && c.entry.subjectName).length;
  const emptyCount = academicCells.length - filledCount;

  const startHour = Math.floor(minMin / 60);
  const endHour = Math.ceil(maxMin / 60);
  const totalH = Math.max(1, endHour - startHour);
  const today = todayDow();
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  if (cells.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No periods defined. Set up the school day in <strong>Settings → School schedule</strong> first.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          Calendar view
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-indigo-500" />
            <strong className="text-slate-900 tabular-nums">{filledCount}</strong>
            <span className="text-slate-500">filled</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm border border-slate-300 bg-white" />
            <strong className="text-slate-900 tabular-nums">{emptyCount}</strong>
            <span className="text-slate-500">empty</span>
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">Click any block to jump to its row below</span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden overflow-x-auto">
        {/* Header row */}
        <div className="grid grid-cols-[60px_repeat(6,minmax(110px,1fr))] bg-slate-50 border-b border-slate-200">
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
          className="grid grid-cols-[60px_repeat(6,minmax(110px,1fr))] relative"
          style={{ height: `${totalH * 56}px` }}
        >
          {/* Hour labels */}
          <div className="border-r border-slate-200">
            {hours.map((h, i) => (
              <div key={h}
                   className="text-[10px] text-slate-400 px-2 border-b border-slate-100"
                   style={{ height: i === hours.length - 1 ? "0" : "56px" }}>
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
                       style={{ top: `${(h - startHour) * 56}px`, height: 0 }} />
                ))}
                {/* Today highlight */}
                {d.num === today && (
                  <div className="absolute inset-0 bg-indigo-50/40 pointer-events-none" />
                )}

                {dayCells.map((c) => {
                  const startM = toMin(c.slot.startTime);
                  const endM = toMin(c.slot.endTime);
                  const top = ((startM - minMin) / Math.max(1, maxMin - minMin)) * totalH * 56;
                  const height = Math.max(28, ((endM - startM) / Math.max(1, maxMin - minMin)) * totalH * 56);
                  const subj = c.entry?.subjectName ?? null;
                  const teacher = c.entry?.teacherName ?? null;
                  const kind = c.slot.kind;
                  const room = c.entry?.room ?? null;
                  const hue = hueFor(subj);

                  // Visual style: filled academic = colored block; empty
                  // academic = dashed placeholder; break/prayer = soft tint
                  let style: React.CSSProperties = {
                    position: "absolute", left: 4, right: 4,
                    top: `${top}px`, height: `${height}px`,
                    borderRadius: 8, padding: "6px 8px",
                    fontSize: 11, lineHeight: 1.25, overflow: "hidden",
                    cursor: "pointer", transition: "transform 0.15s",
                  };
                  let inner: React.ReactNode;
                  if (kind === "break") {
                    style = { ...style, background: "#F1F3F7", color: "#5B6472", border: "1px solid #E2E5EC", cursor: "default" };
                    inner = <div className="font-medium">{c.slot.name}</div>;
                  } else if (kind === "prayer") {
                    style = { ...style, background: "#E7F8F0", color: "#047857", border: "1px solid #C7EBD9", cursor: "default" };
                    inner = <div className="font-medium">{c.slot.name}</div>;
                  } else if (!subj) {
                    style = { ...style, background: "rgba(255,255,255,0.5)", border: "1.5px dashed #CBD5E1", color: "#94A3B8" };
                    inner = (
                      <div className="flex flex-col h-full justify-center items-center text-center">
                        <span className="font-medium">+ Assign</span>
                        <span className="opacity-70 text-[10px]">{c.slot.name}</span>
                      </div>
                    );
                  } else {
                    style = {
                      ...style,
                      background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${hue} 60% 35%))`,
                      color: "#FFFFFF",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    };
                    inner = (
                      <>
                        <div className="font-semibold truncate">{subj}</div>
                        {teacher && <div className="opacity-90 truncate">{teacher}</div>}
                        {(room || c.slot.name) && (
                          <div className="opacity-80 text-[10px] mt-0.5 truncate">
                            {c.slot.name}{room ? ` · ${room}` : ""}
                          </div>
                        )}
                      </>
                    );
                  }

                  return (
                    <div
                      key={c.slot.id}
                      style={style}
                      onClick={() => kind === "academic" && onSlotClick?.(c.slot.id)}
                      title={subj ? `${subj}${teacher ? ` · ${teacher}` : ""}` : c.slot.name}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SectionTimetableGrid;
