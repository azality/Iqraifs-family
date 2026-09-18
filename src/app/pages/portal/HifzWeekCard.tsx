// HifzWeekCard — a hifz child's recent days on the portal's Today page,
// one row per day: sabaq, sabqi, manzil as the teacher heard them.
//
// Replaces the hifz lines in the mixed "This week" digest, which was
// capped at five rows — two days for a child heard three times a day
// (18 Sep). Parents and students both land on this page.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { getMyStudentHifz } from "../../../utils/schoolPortalApi";
import type { HifzEntry } from "../../../utils/schoolApi";
import { hifzKindWord, hifzPortion, hifzQualityWord } from "../../../utils/hifzWording";
import {
  HIFZ_RANGES, type HifzRange, daysInRange, earliestFrom, firstHeardDay, localDate, rangeBounds,
  rangeSummary,
} from "../../../utils/hifzWeek";

const RANGE_KEY: Record<HifzRange, string> = {
  week: "portal.hifzWeek.thisWeek",
  lastWeek: "portal.hifzWeek.lastWeek",
  month: "portal.hifzWeek.thisMonth",
};

const QUALITY_CLS: Record<string, string> = {
  excellent: "text-emerald-700",
  good: "text-sky-700",
  needs_practice: "text-amber-700",
  weak: "text-rose-700",
  not_learned: "text-slate-600",
};

/** Renders nothing for a child with no hifz record this month or last
 *  week — a regular-class child never sees it. */
export function HifzWeekCard({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const locale = lang.startsWith("ur") ? "ur-PK" : undefined;
  const [entries, setEntries] = useState<HifzEntry[] | null>(null);
  const [range, setRange] = useState<HifzRange>("week");
  const today = localDate(new Date());

  useEffect(() => {
    let cancelled = false;
    // One fetch covers every range, so switching is instant. The server
    // compares to UTC midnight; a day earlier catches a hearing logged
    // just after local midnight, and daysInRange trims to the real day.
    const d = new Date(`${earliestFrom(today)}T12:00:00`);
    d.setDate(d.getDate() - 1);
    getMyStudentHifz(studentId, { startDate: localDate(d), limit: 500 })
      .then((res) => { if (!cancelled) setEntries(res.entries ?? []); })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [studentId, today]);

  const { from, to } = rangeBounds(range, today);
  // The fetch reaches back past every range, so the earliest hearing in
  // it is the child's first on record whenever that falls inside.
  const rows = useMemo(
    () => daysInRange(entries ?? [], from, to, firstHeardDay(entries ?? [])),
    [entries, from, to],
  );

  if (!entries || entries.length === 0) return null;
  const { heardDays, missedSabaqDays } = rangeSummary(rows);

  const dayLabel = (iso: string) =>
    iso === today
      ? t("portal.hifzWeek.today")
      : new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
          weekday: "short", day: "numeric", month: "short",
        });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
          {t("portal.hifzWeek.title")}
        </h3>
        <div role="tablist" aria-label={t("portal.hifzWeek.title")} className="flex rounded-lg bg-slate-100 p-0.5">
          {HIFZ_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={
                "rounded-md px-2.5 py-1 text-[11.5px] font-semibold " +
                (range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
              }
            >
              {t(RANGE_KEY[r])}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1.5 text-[11.5px] text-slate-500">
        {t("portal.hifzWeek.heardDays", { count: heardDays })}
        {missedSabaqDays > 0 && (
          <span className="font-semibold text-rose-600">
            {" · "}{t("portal.hifzWeek.missedDays", { count: missedSabaqDays })}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t("portal.hifzWeek.nothingYet")}</p>
      ) : (
        <div className="mt-2 divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.date} className="flex gap-3 py-2">
              <div className="w-20 flex-none pt-0.5 text-[12px] font-semibold text-slate-500">
                {dayLabel(row.date)}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5 text-[12.5px]">
                {row.entries.length === 0 ? (
                  <div className="text-slate-400">{t("portal.hifzWeek.nothingRecorded")}</div>
                ) : (
                  row.entries.map((e) => {
                    const q = hifzQualityWord(e.quality, t);
                    return (
                      <div key={e.id} className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="font-semibold text-slate-800">{hifzKindWord(e.kind, t)}</span>
                        <span dir="auto" className="text-slate-700">{hifzPortion(e, t, lang)}</span>
                        {e.missed ? (
                          <span className="text-[11px] font-semibold text-rose-600">{t("portal.hifz.missedEntry")}</span>
                        ) : q ? (
                          <span className={`text-[11px] font-semibold ${QUALITY_CLS[e.quality ?? ""] ?? "text-slate-500"}`}>{q}</span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        to={`/school-portal/students/${studentId}/hifz`}
        className="mt-2 inline-block text-[12px] font-semibold text-indigo-600 hover:text-indigo-800"
      >
        {t("portal.hifzWeek.fullRecord")}
      </Link>
    </div>
  );
}
