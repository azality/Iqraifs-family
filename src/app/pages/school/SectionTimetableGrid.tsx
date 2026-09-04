// Weekly grid for one section / Hifz group — design 4d: the calendar IS
// the editor. Compact slot-row table (one row per period time, one
// column per day) with pastel subject chips, exactly the mock's visual:
// light subject-hued cells with dark hued text, a "· today" column
// highlight, dashed "+ Assign" empties, and an indigo ring on the cell
// currently open in the side editor panel.
//
// Replaces the old "Outlook-style" hour canvas with saturated gradient
// blocks — that read as unchanged plumbing next to the 4d editor
// (pilot: "I still see the old one").
//
// Coloring follows the same subject-name → hue hash the teacher
// calendar uses, so Math is always the same hue everywhere.

import { useMemo } from "react";
import type { TimetableWeekCell } from "../../../utils/schoolApi";

const DAYS = [
  { num: 1, short: "Mon" },
  { num: 2, short: "Tue" },
  { num: 3, short: "Wed" },
  { num: 4, short: "Thu" },
  { num: 5, short: "Fri" },
  { num: 6, short: "Sat" },
  { num: 7, short: "Sun" },
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
  /** Called with the slot id when the admin clicks a block — opens the
   *  side editor panel (design 4d). */
  onSlotClick?: (slotId: string) => void;
  /** Slot currently open in the editor — rendered with an indigo ring. */
  selectedSlotId?: string | null;
}

export function SectionTimetableGrid({ cells, onSlotClick, selectedSlotId = null }: SectionTimetableGridProps) {
  // Row model: one row per distinct start time, columns = the days that
  // actually have slots (Friday-only schedules stay five columns wide).
  const { rows, days } = useMemo(() => {
    const daySet = new Set<number>();
    const byKey = new Map<string, Map<number, TimetableWeekCell>>();
    for (const c of cells) {
      daySet.add(c.slot.dayOfWeek);
      const key = (c.slot.startTime ?? "").slice(0, 5);
      if (!byKey.has(key)) byKey.set(key, new Map());
      byKey.get(key)!.set(c.slot.dayOfWeek, c);
    }
    const days = DAYS.filter((d) => daySet.has(d.num));
    const rows = [...byKey.entries()]
      .sort((a, b) => toMin(a[0]) - toMin(b[0]))
      .map(([time, m]) => ({ time, cellsByDay: m }));
    return { rows, days };
  }, [cells]);

  // Stats — what's filled vs empty, without scrolling.
  const academicCells = cells.filter((c) => c.slot.kind === "academic");
  const filledCount = academicCells.filter((c) => c.entry && c.entry.subjectName).length;
  const emptyCount = academicCells.length - filledCount;
  const today = todayDow();

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
          Calendar — click a period to edit
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <strong className="text-slate-900 tabular-nums">{filledCount}</strong>
            <span className="text-slate-500">filled</span>
          </span>
          <span className="text-slate-400">·</span>
          <span className="inline-flex items-center gap-1">
            <strong className={"tabular-nums " + (emptyCount > 0 ? "text-amber-700" : "text-slate-900")}>{emptyCount}</strong>
            <span className="text-slate-500">empty</span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[640px]">
          {/* Header row */}
          <div
            className="grid border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500"
            style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}
          >
            <span className="px-2 py-2" />
            {days.map((d) => (
              <span
                key={d.num}
                className={"px-2 py-2 " + (d.num === today ? "bg-indigo-50 text-indigo-800" : "")}
              >
                {d.short}
                {d.num === today && <span className="ml-1 font-medium text-indigo-500">· today</span>}
              </span>
            ))}
          </div>

          {rows.map((r) => (
            <div
              key={r.time}
              className="grid border-b border-slate-50"
              style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))`, minHeight: 44 }}
            >
              <span className="px-2 pt-1.5 text-[10px] tabular-nums text-slate-400">{r.time}</span>
              {days.map((d) => {
                const c = r.cellsByDay.get(d.num) ?? null;
                if (!c) {
                  return <span key={d.num} className={d.num === today ? "bg-indigo-50/30" : ""} />;
                }
                const subj = c.entry?.subjectName ?? null;
                const teacher = c.entry?.teacherName ?? null;
                const room = c.entry?.room ?? null;
                const kind = c.slot.kind;
                const selected = c.slot.id === selectedSlotId;
                const clickable = kind === "academic" && !!onSlotClick;

                let cls = "m-[3px] rounded-md px-2 py-1 text-[10.5px] leading-[1.35] overflow-hidden text-left";
                let style: React.CSSProperties = {};
                let inner: React.ReactNode;
                if (kind === "break") {
                  cls += " bg-slate-100 text-slate-500";
                  inner = <span className="font-semibold">{c.slot.name}</span>;
                } else if (kind === "prayer") {
                  cls += " bg-emerald-50 text-emerald-700";
                  inner = <span className="font-semibold">{c.slot.name}</span>;
                } else if (!subj) {
                  cls += " border-[1.5px] border-dashed border-slate-300 text-slate-400";
                  inner = <span className="font-medium">+ Assign</span>;
                } else {
                  const hue = hueFor(subj);
                  style = {
                    background: `hsl(${hue} 60% 95%)`,
                    color: `hsl(${hue} 45% 30%)`,
                  };
                  inner = (
                    <>
                      <span className="block truncate font-bold">{subj}</span>
                      <span className="block truncate opacity-80">
                        {teacher ?? ""}{room ? ` · ${room}` : ""}
                      </span>
                    </>
                  );
                }
                if (selected) cls += " ring-2 ring-indigo-500";
                if (clickable) cls += " cursor-pointer hover:ring-1 hover:ring-indigo-300";

                return (
                  <button
                    key={d.num}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onSlotClick?.(c.slot.id)}
                    className={cls + (d.num === today && !selected ? " outline outline-1 outline-indigo-100" : "")}
                    style={style}
                    title={
                      (subj ? `${subj}${teacher ? ` · ${teacher}` : ""}` : c.slot.name) +
                      ` · ${(c.slot.startTime ?? "").slice(0, 5)}–${(c.slot.endTime ?? "").slice(0, 5)}`
                    }
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SectionTimetableGrid;
