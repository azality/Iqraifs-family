// StudentTimetable — parent/student schedule (design 10e/10f).
//
// Phone: one day at a time — Mon–Sat day chips (today preselected) and
// one card per period with the subject's color edge, teacher/room and
// time. A week grid at 390px was clipping block text.
// Desktop: the familiar read-only week grid matching the timetable
// editor's visual — soft subject tints with a solid color edge, today's
// column highlighted, times in the block. Nothing clips.
//
// Subject colors come from the FIXED portal palette (subjectColors.ts):
// English indigo, Maths sky, Islamiyat amber, Quran/Hifz emerald — the
// same hues as My schedule and the timetable editor, so "Math is always
// the same blue" is actually true portal-wide.
//
// Overlapping periods (timetable conflicts) are surfaced as a flagged
// row — a data problem parents WILL notice is better shown than hidden.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { ExamDatesheetCard } from "./ExamDatesheetCard";
import { subjectColor } from "../../../utils/subjectColors";
import {
  getMyStudentTimetable,
  type MyStudentTimetableCell,
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
function hhmm(t: string | undefined): string {
  return (t ?? "").slice(0, 5);
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
  const { t } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [cells, setCells] = useState<MyStudentTimetableCell[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<number>(() => Math.min(todayDow(), 6));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyStudentTimetable(studentId, { date: todayIso() })
      .then((r) => { if (!cancelled) { setCells(r.cells); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const byDay = useMemo(() => {
    const out = new Map<number, MyStudentTimetableCell[]>();
    for (const c of cells) {
      if (!c.entry) continue;
      const list = out.get(c.slot.dayOfWeek) ?? [];
      list.push(c);
      out.set(c.slot.dayOfWeek, list);
    }
    for (const list of out.values()) {
      list.sort((a, b) => toMin(a.slot.startTime) - toMin(b.slot.startTime));
    }
    return out;
  }, [cells]);

  // Overlap scan per day: period N starts before period N-1 ends.
  const overlaps = useMemo(() => {
    const flags = new Map<number, Set<string>>();
    for (const [d, list] of byDay) {
      for (let i = 1; i < list.length; i++) {
        if (toMin(list[i].slot.startTime) < toMin(list[i - 1].slot.endTime)) {
          const set = flags.get(d) ?? new Set<string>();
          set.add(list[i].slot.id);
          set.add(list[i - 1].slot.id);
          flags.set(d, set);
        }
      }
    }
    return flags;
  }, [byDay]);

  const today = todayDow();
  const daysWithData = DAYS.filter((d) => (byDay.get(d.num)?.length ?? 0) > 0);
  const legendSubjects = useMemo(
    () => [...new Set(cells.map((c) => c.entry?.subjectName).filter(Boolean) as string[])].slice(0, 6),
    [cells],
  );

  const periodCard = (c: MyStudentTimetableCell, flagged: boolean) => {
    const subj = c.entry?.subjectName ?? c.slot.name;
    const col = subjectColor(subj);
    const isSub = !!c.entry?.substitution;
    return (
      <div
        key={c.slot.id}
        className={"flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 " + (flagged ? "border-rose-300" : "border-slate-200")}
        style={{ borderLeft: `4px solid ${flagged ? "#dc2626" : col.edge}` }}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-extrabold text-slate-900">
            {subj}
            {isSub && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800">
                {t("portal.tt.substitute")}
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-slate-500">
            {[c.entry?.teacherName, c.entry?.room ? `${t("portal.tt.room")} ${c.entry.room}` : null]
              .filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex-none text-xs font-bold tabular-nums text-slate-700">
          {hhmm(c.slot.startTime)}–{hhmm(c.slot.endTime)}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title={t("portal.nav.timetable")}
        subtitle={t("portal.tt.subtitle")}
      />

      {/* The published assessment datesheet leads while papers are on —
          it's the schedule parents actually need this month. */}
      <ExamDatesheetCard studentId={studentId} />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">{t("common.loading")}</div>
      ) : byDay.size === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Calendar className="h-6 w-6 mx-auto text-slate-300 mb-2" />
          {t("portal.tt.empty")}
        </div>
      ) : (
        <>
          {/* ── Phone: day chips + period cards (10e). ─────────────── */}
          <div className="sm:hidden">
            <div className="flex gap-1.5">
              {DAYS.map((d) => {
                const active = d.num === day;
                const has = (byDay.get(d.num)?.length ?? 0) > 0;
                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => setDay(d.num)}
                    className={
                      "flex-1 rounded-lg border py-1.5 text-[11.5px] font-bold " +
                      (active
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : has
                        ? "border-slate-200 bg-white text-slate-600"
                        : "border-slate-100 bg-slate-50 text-slate-300")
                    }
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {(byDay.get(day) ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">{t("portal.tt.noClasses")}</p>
              ) : (
                (byDay.get(day) ?? []).map((c, i, list) => {
                  const flagged = overlaps.get(day)?.has(c.slot.id) ?? false;
                  const prev = list[i - 1];
                  const showFlagRow =
                    flagged && prev && toMin(c.slot.startTime) < toMin(prev.slot.endTime);
                  return (
                    <div key={c.slot.id} className="flex flex-col gap-2">
                      {showFlagRow && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
                          ⚠ {t("portal.tt.overlap", {
                            a: c.entry?.subjectName ?? c.slot.name,
                            b: prev.entry?.subjectName ?? prev.slot.name,
                          })}
                        </div>
                      )}
                      {periodCard(c, flagged)}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Desktop: read-only week grid (10f). ────────────────── */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
            <div
              className="grid border-b border-slate-200 bg-slate-50 text-[11.5px] font-bold text-slate-600"
              style={{ gridTemplateColumns: `52px repeat(${daysWithData.length}, minmax(0,1fr))` }}
            >
              <span className="px-2 py-2 text-[10px] uppercase text-slate-400">{t("portal.tt.time")}</span>
              {daysWithData.map((d) => (
                <span key={d.num} className={"px-2 py-2 " + (d.num === today ? "bg-indigo-50 font-extrabold text-indigo-700" : "")}>
                  {d.short}
                  {d.num === today && <span className="ml-1 font-medium text-indigo-400">· {t("portal.tt.today")}</span>}
                </span>
              ))}
            </div>
            <div
              className="grid"
              style={{ gridTemplateColumns: `52px repeat(${daysWithData.length}, minmax(0,1fr))` }}
            >
              <div className="border-r border-slate-100 px-2 py-2 text-[10px] leading-7 text-slate-400">
                {[...new Set(cells.filter((c) => c.entry).map((c) => hhmm(c.slot.startTime)))]
                  .sort()
                  .map((tm) => (
                    <div key={tm}>{tm}</div>
                  ))}
              </div>
              {daysWithData.map((d) => (
                <div
                  key={d.num}
                  className={"flex flex-col gap-1.5 p-1.5 " + (d.num === today ? "bg-indigo-50/40" : "")}
                >
                  {(byDay.get(d.num) ?? []).map((c) => {
                    const subj = c.entry?.subjectName ?? c.slot.name;
                    const col = subjectColor(subj);
                    const flagged = overlaps.get(d.num)?.has(c.slot.id) ?? false;
                    return (
                      <div
                        key={c.slot.id}
                        className={"rounded-lg px-2 py-1.5 " + (flagged ? "ring-2 ring-rose-400" : "")}
                        style={{ background: col.bg, borderLeft: `3px solid ${col.edge}` }}
                        title={`${subj} · ${hhmm(c.slot.startTime)}–${hhmm(c.slot.endTime)}${c.entry?.teacherName ? ` · ${c.entry.teacherName}` : ""}${c.entry?.room ? ` · ${c.entry.room}` : ""}`}
                      >
                        <div className="truncate text-[11px] font-extrabold" style={{ color: col.fg }}>{subj}</div>
                        <div className="truncate text-[9.5px]" style={{ color: col.edge }}>
                          {hhmm(c.slot.startTime)}–{hhmm(c.slot.endTime)}
                          {c.entry?.teacherName ? ` · ${c.entry.teacherName}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Shared legend. */}
          {legendSubjects.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10.5px] text-slate-500">
              {legendSubjects.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[3px]" style={{ background: subjectColor(s).edge }} />
                  {s}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentTimetable;
