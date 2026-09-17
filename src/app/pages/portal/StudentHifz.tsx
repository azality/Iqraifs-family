// StudentHifz — parent / student portal view of one kid's memorization
// progress.
//
// Card layout, top-down:
//   1. HeroCard with ayahs memorized + surahs completed totals
//   2. "Today" snapshot card — surfaces what the teacher worked on today
//      and what the parent should do tonight. This is the single most
//      important panel for a Karachi parent who picks up the kid at
//      sundown and wants to know what to revise over dinner.
//   3. Full log table (collapsed by default) — same as before but
//      enriched with parent-friendly comments.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import {
  BookOpen,
  RefreshCw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { formatJuzExtent } from "../../../utils/hifzExtent";
import { getSurah } from "../../../utils/quranSurahs";
import {
  getMyStudentHifz,
  type MyStudentHifzResponse,
  type MyStudentHifzToday,
  type MyStudentHifzDayCell,
  type HifzEntry,
} from "../../../utils/schoolPortalApi";

// Full 114-surah lookup (shared with the staff surfaces) — the partial
// local list used to render "Surah 24" where the teacher's own history
// dialog said "An-Nur" (parent-parity pass, 17 Sep).
const surahLabel = (n: number) => {
  const s = getSurah(n);
  return s ? `Surah ${s.nameTransliterated}` : `Surah ${n}`;
};

// Labels come from the hifzTeach.q* keys — already translated for the
// staff surfaces, so the parent sees the same word the teacher picked.
const QUALITY_STYLES: Record<string, { labelKey: string; cls: string; Icon: typeof Sparkles }> = {
  excellent: { labelKey: "hifzTeach.qExcellent", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", Icon: Sparkles },
  good:      { labelKey: "hifzTeach.qGood",      cls: "bg-sky-100 text-sky-800 border-sky-200", Icon: CheckCircle2 },
  needs_practice: { labelKey: "hifzTeach.qNeedsPractice", cls: "bg-amber-100 text-amber-800 border-amber-200", Icon: AlertCircle },
  weak:      { labelKey: "hifzTeach.qWeak",      cls: "bg-rose-100 text-rose-800 border-rose-200", Icon: AlertCircle },
  not_learned: { labelKey: "hifzTeach.qNotLearned", cls: "bg-slate-200 text-slate-700 border-slate-300", Icon: AlertCircle },
};

// Kind chip palette — identical to the staff history feed so the parent
// sees the same colors the teacher does (parent-parity pass, 17 Sep).
const KIND_CLASSES: Record<string, string> = {
  sabaq: "bg-blue-100 text-blue-800 border-blue-200",
  sabqi: "bg-indigo-100 text-indigo-800 border-indigo-200",
  manzil: "bg-violet-100 text-violet-800 border-violet-200",
  memorized: "bg-emerald-100 text-emerald-800 border-emerald-200",
  revised: "bg-cyan-100 text-cyan-800 border-cyan-200",
  tested: "bg-amber-100 text-amber-800 border-amber-200",
  nazra: "bg-teal-100 text-teal-800 border-teal-200",
  nazra_revision: "bg-teal-50 text-teal-700 border-teal-200",
  qaida: "bg-orange-100 text-orange-800 border-orange-200",
};

function QualityBadge({ quality }: { quality: string | null | undefined }) {
  const { t } = useTranslation();
  if (!quality) return null;
  const meta = QUALITY_STYLES[quality];
  if (!meta) return <span className="text-slate-500 text-xs capitalize">{quality}</span>;
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium " + meta.cls}>
      <meta.Icon className="h-3 w-3" />
      {t(meta.labelKey)}
    </span>
  );
}

/** Shared color matrix for both the 14-day strip and the 30-day
 *  monthly grid. Extracted so they look identical and stay in sync. */
function cellClass(c: MyStudentHifzDayCell): string {
  if (c.missed) return "bg-rose-500 text-white";
  if (!c.logged) return "bg-slate-100 text-slate-400";
  switch (c.quality) {
    case "excellent": return "bg-emerald-500 text-white";
    case "good":      return "bg-emerald-400 text-white";
    case "needs_practice": return "bg-amber-400 text-white";
    case "weak":      return "bg-rose-400 text-white";
    case "not_learned": return "bg-slate-400 text-white";
    default:          return "bg-indigo-400 text-white";
  }
}
function cellTitle(c: MyStudentHifzDayCell): string {
  if (c.missed) return `${c.date} — missed sabaq`;
  if (!c.logged) return `${c.date} — no entry`;
  return `${c.date} — ${c.quality ?? "logged"}${c.mistakesCount != null ? ` · ${c.mistakesCount} mistakes` : ""}`;
}

/** 30-day calendar grid — aligned to weekday columns starting Sun.
 *  Renders the same color-coded cells as the weekly strip, but laid out
 *  as a month-of-30 grid so streaks read at a glance. Days outside the
 *  window appear as empty placeholders in the first row. */
function MonthGrid({ days }: { days: MyStudentHifzDayCell[] }) {
  if (days.length === 0) return null;
  // Pad the leading row so the first day lands in the right weekday
  // column (0 = Sun). Calendar conventions vary in PK schools — Sunday
  // start is the safest neutral.
  const firstDow = new Date(days[0].date + "T00:00:00Z").getUTCDay();
  const padCount = firstDow; // 0..6
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1.5 text-[10px] text-slate-500 text-center">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={`hd-${i}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: padCount }, (_, i) => (
          <div key={`pad-${i}`} className="h-9" />
        ))}
        {days.map((c) => (
          <div
            key={c.date}
            title={cellTitle(c)}
            className={
              "h-9 rounded-md flex items-center justify-center text-[10px] font-medium " +
              cellClass(c)
            }
          >
            {new Date(c.date + "T00:00:00Z").getUTCDate()}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Today" panel — the headline parent card.
 *  Renders only the fields the backend filled in; nothing else is
 *  spec'd to appear, so we don't leak empty rows. */
function TodayCard({ today }: { today: MyStudentHifzToday }) {
  const { t, i18n } = useTranslation();
  // The date reads in the parent's own calendar language.
  const date = new Date(today.recordedAt).toLocaleDateString(
    i18n.language?.startsWith("ur") ? "ur-PK" : undefined,
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );
  return (
    <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-50 to-white px-5 py-3 border-b border-indigo-100">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">{t("portal.hifz.latestUpdate")}</div>
        <div className="text-sm text-slate-700">{date}</div>
      </div>

      <div className="p-5 space-y-4">
        {today.sabaq && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-indigo-100 p-2 text-indigo-700">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("portal.hifz.todaysSabaq")}
              </div>
              <div className="text-sm text-slate-900 mt-0.5">
                {surahLabel(today.sabaq.surahNumber)}, {t("portal.hifz.ayahWord")} {today.sabaq.ayahFrom}
                {today.sabaq.ayahTo !== today.sabaq.ayahFrom && ` – ${today.sabaq.ayahTo}`}
              </div>
              <div className="mt-1.5"><QualityBadge quality={today.sabaq.quality} /></div>
            </div>
          </div>
        )}

        {today.revision && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {today.revision.kind === "sabqi"
                  ? t("portal.hifz.revisionRecent")
                  : t("portal.hifz.revisionOlder")}
              </div>
              <div className="text-sm text-slate-900 mt-0.5">
                {surahLabel(today.revision.surahNumber)}, {t("portal.hifz.ayahWord")} {today.revision.ayahFrom}
                {today.revision.ayahTo !== today.revision.ayahFrom && ` – ${today.revision.ayahTo}`}
              </div>
              <div className="mt-1.5"><QualityBadge quality={today.revision.quality} /></div>
            </div>
          </div>
        )}

        {today.teacherNote && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("portal.hifz.teacherNote")}</div>
            <div className="mt-1 text-sm text-slate-800">{today.teacherNote}</div>
          </div>
        )}

        {/* "Tonight at home" is hoisted ABOVE this card (design 10g) —
            the one thing a parent can act on leads the page. */}

        {(today.nextTarget || today.mistakesCount != null) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
            {today.nextTarget && (
              <span>
                <span className="font-medium text-slate-700">{t("portal.hifz.nextTarget")}</span> {today.nextTarget}
              </span>
            )}
            {today.mistakesCount != null && (
              <span>
                <span className="font-medium text-slate-700">{t("portal.hifz.mistakes")}</span> {today.mistakesCount}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentHifz() {
  const { t, i18n } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentHifzResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Full log expanded by DEFAULT now — the school asked for the parent
  // to see the same history the teacher sees, not a hidden table
  // (Muneeb, 17 Sep). The collapse toggle stays for tidiness.
  const [logOpen, setLogOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyStudentHifz(studentId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;

  const last = data.summary.lastEntry
    ? new Date(data.summary.lastEntry).toLocaleDateString(
        i18n.language?.startsWith("ur") ? "ur-PK" : undefined,
      )
    : "—";

  return (
    <div className="space-y-5">
      <HeroCard
        title={t("portal.hifz.title")}
        subtitle={t("portal.hifz.subtitle")}
        rightSlot={
          <div className="text-right text-xs text-indigo-200">
            <div className="text-2xl text-white font-semibold tabular-nums">
              {data.summary.ayahsMemorized}
            </div>
            <div>{t("portal.hifz.ayahsLine", { s: data.summary.surahsCompleted })}</div>
            <div>{t("portal.hifz.lastEntry")} · {last}</div>
          </div>
        }
      />

      {/* 10g: "Tonight at home" LEADS — the one actionable thing. */}
      {data.today?.parentAction && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-emerald-700">
            {t("portal.hifz.tonight")}
          </div>
          <div className="mt-1 text-sm font-bold text-emerald-900">{data.today.parentAction}</div>
          {data.today.nextTarget && (
            <div className="mt-0.5 text-[11.5px] text-emerald-700">
              {t("portal.hifz.next")} {data.today.nextTarget}
            </div>
          )}
        </div>
      )}

      {data.today ? (
        <TodayCard today={data.today} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
          {t("portal.hifz.noEntries")}
        </div>
      )}

      {/* ONE 30-day calendar (10g) — the 14-day strip duplicated it and
          is gone; its week stats live in this header now. */}
      {data.last30Days && data.last30Days.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("portal.hifz.last30")}
            </div>
            <div className="text-[11px] text-slate-500">
              {t("portal.hifz.loggedCount", { n: data.last30Days.filter((d) => d.logged).length })} ·{" "}
              <span className={data.last30Days.some((d) => d.missed) ? "font-semibold text-rose-600" : ""}>
                {t("portal.hifz.missedCount", { n: data.last30Days.filter((d) => d.missed).length })}
              </span>
              {(() => {
                const wk = (data.last14Days ?? []).slice(-7);
                const mistakes = wk.reduce((s, d) => s + ((d as any).mistakes ?? 0), 0);
                return mistakes > 0 ? <> · {t("portal.hifz.weekMistakes", { n: mistakes })}</> : null;
              })()}
            </div>
          </div>
          <MonthGrid days={data.last30Days} />
          <div className="mt-2 text-[10px] text-slate-400">
            {t("portal.hifz.legend")}
          </div>
        </div>
      )}

      {/* Full log — collapsed by default. Keeps the entries searchable
          without dumping a table on parents who only want the daily
          snapshot. */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <button
          type="button"
          onClick={() => setLogOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>{t("portal.hifz.fullLog", { n: data.entries.length })}</span>
          {logOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {logOpen && (
          <div className="space-y-2 p-3 pt-0">
            {data.entries.length === 0 && (
              <p className="py-3 text-center text-sm text-slate-500">{t("portal.hifz.noEntries")}</p>
            )}
            {data.entries.map((e) => {
              const kindLabel =
                e.kind === "qaida"
                  ? t("portal.hifz.kindQaida")
                  : e.kind === "nazra"
                  ? t("portal.hifz.kindNazra")
                  : e.kind === "nazra_revision"
                  ? t("portal.hifz.kindNazraRevision")
                  : ["sabaq", "sabqi", "manzil"].includes(e.kind)
                  ? t(`hifzTeach.${e.kind}`)
                  : e.kind.replace(/_/g, " ");
              // Portion line — same rules as the teacher's history:
              // Qaida shows the lesson; para-mode (manzil / sabqi-by-juz)
              // shows "Juz N — how much"; everything else surah + ayahs.
              const portion =
                e.kind === "qaida"
                  ? t("portal.hifz.qaidaLesson", { n: e.qaidaLesson ?? "—" })
                  : (e.kind === "manzil" || e.juzExtent) && e.juzNumber
                  ? `${t("hifzTeach.juzN", { n: e.juzNumber })}${formatJuzExtent(e.juzExtent ?? null)}`
                  : `${surahLabel(e.surahNumber)} · ${t("portal.hifz.ayahWord")} ${e.ayahFrom}${e.ayahTo !== e.ayahFrom ? `–${e.ayahTo}` : ""}`;
              const when = new Date(e.recordedAt).toLocaleDateString(
                i18n.language?.startsWith("ur") ? "ur-PK" : undefined,
                { weekday: "short", month: "short", day: "numeric" },
              );
              // The teacher's own summary sentence (usually Urdu) and the
              // parent-facing comment both reach the family — same text
              // the staff history shows.
              const remark = e.teacherRemarks || (e as HifzEntry & { parentComments?: string }).parentComments || (e as HifzEntry & { tajweedNotes?: string }).tajweedNotes || null;
              return (
                <div key={e.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_CLASSES[e.kind] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                      {kindLabel}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{portion}</span>
                    {e.missed ? (
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                        {t("portal.hifz.missedEntry")}
                      </span>
                    ) : (
                      <QualityBadge quality={e.quality} />
                    )}
                  </div>
                  {remark && (
                    <p dir="auto" className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{remark}</p>
                  )}
                  {e.nextTarget && (
                    <p dir="auto" className="mt-1 text-xs font-medium text-indigo-700">
                      {t("portal.hifz.nextTarget")} {e.nextTarget}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">{when}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
