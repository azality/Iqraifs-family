// StudentBehavior — timeline of behavior notes for a student.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  getMyStudentBehavior,
  getMyPointsLeague,
  type MyStudentBehaviorResponse,
  type MyStudentBehaviorEntry,
  type PointsLeagueResponse,
} from "../../../utils/schoolPortalApi";

type LeaguePeriod = "week" | "month" | "term" | "all";

type TFn = (k: string, o?: Record<string, unknown>) => string;

function relativeTime(iso: string, t: TFn, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return t("behavior.minsAgo", { n: Math.max(mins, 0) });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t("behavior.hoursAgo", { n: hrs });
  const days = Math.round(hrs / 24);
  if (days < 7) return t("behavior.daysAgo", { n: days });
  return new Date(iso).toLocaleDateString(lang.startsWith("ur") ? "ur-PK" : undefined);
}

function pointsColor(points: number): string {
  if (points > 0) return "text-emerald-700";
  if (points < 0) return "text-rose-700";
  return "text-slate-600";
}

export function StudentBehavior() {
  const { t, i18n } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentBehaviorResponse | null>(null);
  const [league, setLeague] = useState<PointsLeagueResponse | null>(null);
  // Window chips like the staff leaderboard (Muneeb, 9 Sep). Month is
  // the winnable default everywhere the league appears.
  const [period, setPeriod] = useState<LeaguePeriod>("month");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyStudentBehavior(studentId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    // The league is optional decoration — it must never block the page.
    // A window the school hasn't set up (no current term) keeps the
    // previous data rather than blanking the card.
    getMyPointsLeague(studentId, period)
      .then((l) => { if (!cancelled) setLeague(l); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [studentId, period]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;

  const sortedEntries = [...data.entries].sort(
    (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
  );

  const PERIODS: Array<{ key: LeaguePeriod; label: string }> = [
    { key: "week", label: t("portal.beh.week") },
    { key: "month", label: t("portal.beh.month") },
    { key: "term", label: t("portal.beh.term") },
    { key: "all", label: t("portal.beh.allTime") },
  ];

  return (
    <div className="space-y-5">
      <HeroCard
        title={t("portal.nav.behavior")}
        subtitle={t("portal.beh.subtitle")}
        rightSlot={
          <div className="text-right text-xs text-indigo-200">
            <div className="text-lg text-white font-semibold tabular-nums">
              {t("portal.beh.counts", { p: data.summary.positiveCount, c: data.summary.concernCount })}
            </div>
            <div>
              {t("portal.beh.netPoints")}{" "}
              <span className="text-white tabular-nums font-medium">
                {data.summary.netPoints >= 0 ? "+" : ""}
                {data.summary.netPoints}
              </span>
            </div>
          </div>
        }
      />

      {/* ── The class league ──
          Like a sports table: the top five and where I stand. No screen in
          the classroom, so the child's own login IS the scoreboard
          (Muneeb, 7 Sep). Deliberately never the full table - a list that
          shows the whole class also shows somebody last, publicly - and
          classmates appear as name + points only, never their concerns. */}
      {league?.enabled && league.league && (
        <div className={`${cardBase} ${cardElev} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              🏆 {t("portal.beh.leagueTitle")}
            </h2>
            {league.league.me && (
              <span className="text-xs text-slate-500">
                {t("portal.beh.youAre")} <b className="text-slate-900">#{league.league.me.rank}</b> / {league.league.classSize}
              </span>
            )}
          </div>
          {/* Same windows as the classroom board - Month is the default. */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={
                  "rounded-md px-2.5 py-0.5 text-[11px] font-medium " +
                  (period === p.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <ul className="space-y-1.5">
            {league.league.top.map((r) => (
              <li
                key={`${r.rank}-${r.name}`}
                className={
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm " +
                  (r.isMe ? "bg-indigo-50 ring-1 ring-indigo-200 font-semibold" : "")
                }
              >
                <span className="w-7 text-center">
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {r.name}{r.isMe ? ` ${t("portal.beh.you")}` : ""}
                </span>
                <span className="font-bold tabular-nums text-emerald-700">
                  {r.points > 0 ? `+${r.points}` : r.points}
                </span>
              </li>
            ))}
            {league.league.me && !league.league.top.some((r) => r.isMe) && (
              <li className="flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-sm font-semibold ring-1 ring-indigo-200">
                <span className="w-7 text-center">#{league.league.me.rank}</span>
                <span className="min-w-0 flex-1 truncate">{t("portal.beh.you")}</span>
                <span className="font-bold tabular-nums text-emerald-700">
                  {league.league.me.points > 0 ? `+${league.league.me.points}` : league.league.me.points}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* How to earn points - the school's own list, so it always matches
          what teachers actually award. */}
      {league?.enabled && (league.earn?.length ?? 0) > 0 && (
        <div className={`${cardBase} ${cardElev} p-4`}>
          <h2 className="text-sm font-bold text-slate-900">{t("portal.beh.howToEarn")}</h2>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {league!.earn!.map((e) => (
              <li key={e.label} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-slate-700">{e.label}</span>
                <span className="font-semibold tabular-nums text-emerald-700">+{e.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sortedEntries.length === 0 ? (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-500 text-center`}>
          {t("portal.beh.noNotes")}
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedEntries.map((n: MyStudentBehaviorEntry) => (
            <li key={n.id} className={`${cardBase} ${cardElev} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize " +
                      (n.kind === "positive"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700")
                    }
                  >
                    {t(`behavior.${n.kind}`)}
                  </span>
                  {n.category && (
                    <span className="text-xs text-slate-500 capitalize truncate">
                      {n.category.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className={"text-sm font-semibold tabular-nums " + pointsColor(n.points)}>
                    {n.points > 0 ? "+" : ""}
                    {n.points}
                  </div>
                  <div className="text-[11px] text-slate-400">{relativeTime(n.observedAt, t, i18n.language ?? "en")}</div>
                </div>
              </div>
              {n.notes && <p className="mt-2 text-sm text-slate-700">{n.notes}</p>}
              {n.recordedByName && (
                <p className="mt-1 text-xs text-slate-500">— {n.recordedByName}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
