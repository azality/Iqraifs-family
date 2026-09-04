// ExamDatesheetCard — the school's published written-assessment
// timetable for this child's class.
//
// Parents print this document and stick it on the fridge; in the portal
// it leads the Timetable tab while the assessment is near. Next paper
// is highlighted, past papers dim, and the school's own instructions
// (fee clearance, timings, stationery) print underneath verbatim.
//
// Subject labels are shown exactly as the school published them
// ("Sst", "Computer/Biology") — this is a notice, not our data model.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { subjectColor } from "../../../utils/subjectColors";
import {
  getMyExamSchedule,
  type MyExamScheduleResponse,
} from "../../../utils/schoolPortalApi";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useExamSchedule(studentId: string) {
  const [data, setData] = useState<MyExamScheduleResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!studentId) return;
    getMyExamSchedule(studentId)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [studentId]);
  return data;
}

export function ExamDatesheetCard({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const data = useExamSchedule(studentId);
  const [showPast, setShowPast] = useState(false);

  const { upcoming, past, next } = useMemo(() => {
    const today = todayIso();
    const papers = (data?.papers ?? []).slice().sort((a, b) => a.examDate.localeCompare(b.examDate));
    const upcoming = papers.filter((p) => p.examDate >= today);
    return { upcoming, past: papers.filter((p) => p.examDate < today), next: upcoming[0] ?? null };
  }, [data]);

  if (!data || data.papers.length === 0) return null;

  const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short",
    });
  const daysAway = (iso: string) =>
    Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400e3);

  const row = (p: (typeof upcoming)[number], dim: boolean) => {
    const c = subjectColor(p.subjectLabel);
    const isNext = !dim && next?.id === p.id;
    const away = daysAway(p.examDate);
    return (
      <div
        key={p.id}
        className={
          "flex items-center gap-3 px-3.5 py-2.5 " +
          (dim ? "opacity-45" : "") +
          (isNext ? " bg-indigo-50/60" : "")
        }
        style={{ borderLeft: `4px solid ${dim ? "#cbd5e1" : c.edge}` }}
      >
        <span className="w-[86px] flex-none">
          <span className="block text-[12px] font-extrabold text-slate-900">{dayLabel(p.examDate)}</span>
          {!dim && (
            <span className="text-[10px] text-slate-500">
              {away === 0 ? t("portal.exam.today") : away === 1 ? t("portal.exam.tomorrow") : t("portal.exam.inDays", { count: away })}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-slate-900">{p.subjectLabel}</span>
          {p.notes && <span className="block truncate text-[11px] text-slate-500">{p.notes}</span>}
        </span>
        {(p.startTime || p.endTime) && (
          <span className="flex-none text-[11.5px] font-semibold tabular-nums text-slate-600">
            {p.startTime}{p.endTime ? `–${p.endTime}` : ""}
          </span>
        )}
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
      <div className="flex items-baseline gap-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2.5">
        <span className="text-[13px] font-extrabold text-indigo-900">
          {t("portal.exam.title", { term: data.termName ?? "" }).trim()}
        </span>
        <span className="ml-auto text-[11px] text-indigo-600">
          {upcoming.length > 0
            ? t("portal.exam.papersLeft", { count: upcoming.length })
            : t("portal.exam.finished")}
        </span>
      </div>

      <div className="divide-y divide-slate-50">
        {showPast && past.map((p) => row(p, true))}
        {upcoming.map((p) => row(p, false))}
        {upcoming.length === 0 && past.length > 0 && !showPast && (
          <div className="px-4 py-3 text-sm text-slate-500">{t("portal.exam.allDone")}</div>
        )}
      </div>

      {past.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          className="w-full border-t border-slate-100 px-4 py-2 text-left text-[11.5px] font-bold text-indigo-700"
        >
          {showPast ? t("portal.exam.hidePast") : t("portal.exam.showPast", { count: past.length })}
        </button>
      )}

      {data.instructions.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-500">
            {t("portal.exam.instructions")}
          </div>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-slate-600">
            {data.instructions.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ExamDatesheetCard;
