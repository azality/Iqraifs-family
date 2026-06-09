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
import { DataTable, HeroCard } from "../../components/school-ui";
import {
  getMyStudentHifz,
  type MyStudentHifzResponse,
  type MyStudentHifzToday,
  type MyStudentHifzDayCell,
  type HifzEntry,
} from "../../../utils/schoolPortalApi";

// Surah-number → English name lookup. Just the first dozen for now —
// teachers and parents in Karachi mostly track these. Anything past
// the first 15 falls back to "Surah 19" etc. so the card never breaks.
// (Full lookup is a follow-up; keeping the change contained to the
// portal view here so this PR doesn't pull in a 114-entry constant.)
const SURAH_NAMES: Record<number, string> = {
  1: "Al-Fatihah",
  2: "Al-Baqarah",
  3: "Al-Imran",
  4: "An-Nisa",
  5: "Al-Maidah",
  6: "Al-An'am",
  7: "Al-A'raf",
  8: "Al-Anfal",
  9: "At-Tawbah",
  10: "Yunus",
  78: "An-Naba",
  79: "An-Nazi'at",
  80: "Abasa",
  111: "Al-Masad",
  112: "Al-Ikhlas",
  113: "Al-Falaq",
  114: "An-Nas",
};
const surahLabel = (n: number) =>
  SURAH_NAMES[n] ? `Surah ${SURAH_NAMES[n]}` : `Surah ${n}`;

const QUALITY_STYLES: Record<string, { label: string; cls: string; Icon: typeof Sparkles }> = {
  excellent: { label: "Excellent", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", Icon: Sparkles },
  good:      { label: "Good",      cls: "bg-sky-100 text-sky-800 border-sky-200", Icon: CheckCircle2 },
  needs_practice: { label: "Needs practice", cls: "bg-amber-100 text-amber-800 border-amber-200", Icon: AlertCircle },
  weak:      { label: "Weak",      cls: "bg-rose-100 text-rose-800 border-rose-200", Icon: AlertCircle },
};

function QualityBadge({ quality }: { quality: string | null | undefined }) {
  if (!quality) return null;
  const meta = QUALITY_STYLES[quality];
  if (!meta) return <span className="text-slate-500 text-xs capitalize">{quality}</span>;
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium " + meta.cls}>
      <meta.Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

/** 14-day trend strip. Each cell:
 *    green   = logged + quality excellent/good
 *    amber   = logged + quality needs_practice
 *    rose    = logged + quality weak
 *    indigo  = logged but no quality recorded
 *    red ❌  = explicitly marked "missed sabaq"
 *    slate ◌ = no entry at all (likely weekend / off-day)
 *
 *  We also compute a mini "mistakes" sparkline (text-based, no SVG
 *  library) so the parent gets the trend in the same row of cells. */
function TrendStrip({ days }: { days: MyStudentHifzDayCell[] }) {
  const fmt = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { day: "numeric" });
  };
  // Color matrix — first match wins.
  const cellClass = (c: MyStudentHifzDayCell) => {
    if (c.missed) return "bg-rose-500 text-white";
    if (!c.logged) return "bg-slate-100 text-slate-400";
    switch (c.quality) {
      case "excellent": return "bg-emerald-500 text-white";
      case "good":      return "bg-emerald-400 text-white";
      case "needs_practice": return "bg-amber-400 text-white";
      case "weak":      return "bg-rose-400 text-white";
      default:          return "bg-indigo-400 text-white";
    }
  };
  const cellTitle = (c: MyStudentHifzDayCell) => {
    if (c.missed) return `${c.date} — missed sabaq`;
    if (!c.logged) return `${c.date} — no entry`;
    return `${c.date} — ${c.quality ?? "logged"}${c.mistakesCount != null ? ` · ${c.mistakesCount} mistakes` : ""}`;
  };
  // Mistakes summary — just totals over the window, no chart lib.
  const totalMistakes = days.reduce(
    (n, d) => n + (typeof d.mistakesCount === "number" ? d.mistakesCount : 0),
    0,
  );
  const loggedDays = days.filter((d) => d.logged).length;
  const missedDays = days.filter((d) => d.missed).length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Last 14 days
        </div>
        <div className="text-[11px] text-slate-500 flex gap-3">
          <span><span className="font-semibold text-slate-700">{loggedDays}</span> logged</span>
          {missedDays > 0 && (
            <span className="text-rose-700">
              <span className="font-semibold">{missedDays}</span> missed
            </span>
          )}
          {totalMistakes > 0 && (
            <span><span className="font-semibold text-slate-700">{totalMistakes}</span> mistakes</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
        {days.map((c) => (
          <div
            key={c.date}
            title={cellTitle(c)}
            className={
              "h-9 rounded-md flex flex-col items-center justify-center text-[10px] font-medium " +
              cellClass(c)
            }
          >
            <span>{fmt(c.date)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Excellent / Good</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Needs practice</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Weak</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Missed</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" /> No entry</span>
      </div>
    </div>
  );
}

/** "Today" panel — the headline parent card.
 *  Renders only the fields the backend filled in; nothing else is
 *  spec'd to appear, so we don't leak empty rows. */
function TodayCard({ today }: { today: MyStudentHifzToday }) {
  const date = new Date(today.recordedAt).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-50 to-white px-5 py-3 border-b border-indigo-100">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">Latest update</div>
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
                Today's Sabaq
              </div>
              <div className="text-sm text-slate-900 mt-0.5">
                {surahLabel(today.sabaq.surahNumber)}, ayah {today.sabaq.ayahFrom}
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
                Revision ({today.revision.kind === "sabqi" ? "recent" : "older"})
              </div>
              <div className="text-sm text-slate-900 mt-0.5">
                {surahLabel(today.revision.surahNumber)}, ayah {today.revision.ayahFrom}
                {today.revision.ayahTo !== today.revision.ayahFrom && ` – ${today.revision.ayahTo}`}
              </div>
              <div className="mt-1.5"><QualityBadge quality={today.revision.quality} /></div>
            </div>
          </div>
        )}

        {today.teacherNote && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher note</div>
            <div className="mt-1 text-sm text-slate-800">{today.teacherNote}</div>
          </div>
        )}

        {today.parentAction && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              What to do tonight
            </div>
            <div className="mt-1 text-sm text-emerald-900">{today.parentAction}</div>
          </div>
        )}

        {(today.nextTarget || today.mistakesCount != null) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
            {today.nextTarget && (
              <span>
                <span className="font-medium text-slate-700">Next target:</span> {today.nextTarget}
              </span>
            )}
            {today.mistakesCount != null && (
              <span>
                <span className="font-medium text-slate-700">Mistakes:</span> {today.mistakesCount}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentHifz() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentHifzResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Full log expanded? Default collapsed — the Today card answers
  // ~90% of parent questions. Anyone who wants more drills in.
  const [logOpen, setLogOpen] = useState(false);

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
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const last = data.summary.lastEntry
    ? new Date(data.summary.lastEntry).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-5">
      <HeroCard
        title="Hifz Progress"
        subtitle="Quran memorization log"
        rightSlot={
          <div className="text-right text-xs text-indigo-200">
            <div className="text-2xl text-white font-semibold tabular-nums">
              {data.summary.ayahsMemorized}
            </div>
            <div>ayahs · {data.summary.surahsCompleted} surahs</div>
            <div>last entry · {last}</div>
          </div>
        }
      />

      {data.today ? (
        <TodayCard today={data.today} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
          No Hifz entries yet. The teacher will start logging soon.
        </div>
      )}

      {/* 14-day trend strip — shown when we have any data at all. The
          strip itself handles the "no entry" case per cell so a partial
          history (4 logged days + 10 empty) still renders meaningfully. */}
      {data.last14Days && data.last14Days.length > 0 && (
        <TrendStrip days={data.last14Days} />
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
          <span>Full Hifz log ({data.entries.length} entries)</span>
          {logOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {logOpen && (
          <DataTable<HifzEntry>
            rows={data.entries}
            rowKey={(r) => r.id}
            emptyMessage="No hifz entries yet."
            columns={[
              {
                key: "recorded_at",
                header: "Date",
                width: "w-28",
                cell: (r) => new Date(r.recorded_at).toLocaleDateString(),
              },
              {
                key: "kind",
                header: "Kind",
                width: "w-28",
                cell: (r) => (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 capitalize">
                    {r.kind}
                  </span>
                ),
              },
              {
                key: "surah_number",
                header: "Surah",
                cell: (r) => <span className="text-sm">{surahLabel(r.surah_number)}</span>,
              },
              {
                key: "ayahs",
                header: "Ayahs",
                width: "w-24",
                cell: (r) => (
                  <span className="tabular-nums text-sm">
                    {r.ayah_from}–{r.ayah_to}
                  </span>
                ),
              },
              {
                key: "quality",
                header: "Quality",
                width: "w-36",
                cell: (r) => <QualityBadge quality={r.quality} />,
              },
              {
                key: "comments",
                header: "Note",
                cell: (r) => {
                  // Prefer the parent-facing comment field; fall back to
                  // the legacy notes column so older entries keep value.
                  const note =
                    (r as any).parentComments ||
                    (r as any).tajweedNotes ||
                    r.notes;
                  return note ? (
                    <span className="text-xs text-slate-600">{note}</span>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  );
                },
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
