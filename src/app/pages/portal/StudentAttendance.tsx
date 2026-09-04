// StudentAttendance — exception-first (design 10g).
//
// Stops rendering twelve green "Present" rows: a headline % + the
// exception rows only (late / absent / excused, with the teacher's
// reason), and the full day log behind a "Show all days" disclosure.
// The headline is computed honestly — present days only, with lates
// counted beside it, so it can't read "100%" over a visible Late.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { HeroCard } from "../../components/school-ui";
import {
  getMyStudentAttendance,
  type MyStudentAttendanceResponse,
} from "../../../utils/schoolPortalApi";

type Row = MyStudentAttendanceResponse["entries"][number];

export function StudentAttendance() {
  const { t } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentAttendanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyStudentAttendance(studentId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [studentId]);

  const { pct, exceptions, total } = useMemo(() => {
    const entries = data?.entries ?? [];
    const total = entries.length;
    const present = entries.filter((e) => e.status === "present").length;
    return {
      // Honest headline: present days ÷ marked days. A Late is not a
      // silent 100%.
      pct: total > 0 ? Math.round((present / total) * 100) : null,
      exceptions: entries.filter((e) => e.status !== "present"),
      total,
    };
  }, [data]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;

  const s = data.summary;

  const chip = (r: Row) => {
    const map: Record<Row["status"], { cls: string; label: string }> = {
      present: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", label: t("portal.home.present") },
      late: { cls: "bg-amber-50 border-amber-200 text-amber-800", label: t("portal.home.late") },
      absent: { cls: "bg-rose-50 border-rose-200 text-rose-700", label: t("portal.home.absent") },
      excused: { cls: "bg-sky-50 border-sky-200 text-sky-700", label: t("portal.home.excused") },
    };
    const m = map[r.status];
    return (
      <span className={`flex-none rounded-full border px-2 py-0.5 text-[10.5px] font-extrabold ${m.cls}`}>
        {m.label}
      </span>
    );
  };

  const dayRow = (r: Row) => (
    <div key={r.id} className="flex items-center gap-2.5 border-t border-slate-50 px-3.5 py-2 first:border-t-0">
      {chip(r)}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700">
        {new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        {r.notes ? <span className="text-slate-400"> · {r.notes}</span> : null}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <HeroCard
        title={t("portal.nav.attendance")}
        subtitle={t("portal.att.subtitle", { count: total })}
        rightSlot={
          <div className="text-right">
            <div className={"text-2xl font-semibold tabular-nums " + ((pct ?? 100) >= 90 ? "text-emerald-300" : (pct ?? 0) >= 75 ? "text-amber-300" : "text-rose-300")}>
              {pct == null ? "—" : `${pct}%`}
            </div>
            <div className="text-xs uppercase tracking-wide text-indigo-200">{t("portal.att.present")}</div>
          </div>
        }
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-slate-600">
        <span>{s.present} {t("portal.home.present").toLowerCase()}</span>
        {s.late > 0 && <span className="font-semibold text-amber-700">{s.late} {t("portal.home.late").toLowerCase()}</span>}
        {s.absent > 0 && <span className="font-semibold text-rose-700">{s.absent} {t("portal.home.absent").toLowerCase()}</span>}
        {s.excused > 0 && <span>{s.excused} {t("portal.home.excused").toLowerCase()}</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {total === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t("portal.att.empty")}</p>
        ) : exceptions.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-emerald-700">{t("portal.att.allPresent")}</p>
        ) : (
          <>
            <div className="border-b border-slate-100 px-3.5 py-2 text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400">
              {t("portal.att.exceptions", { count: exceptions.length })}
            </div>
            {exceptions.map(dayRow)}
          </>
        )}
      </div>

      {total > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-bold text-indigo-700 hover:underline"
          >
            {showAll ? t("portal.att.hideAll") : t("portal.att.showAll", { count: total })}
          </button>
          {showAll && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {(data.entries ?? []).map(dayRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StudentAttendance;
