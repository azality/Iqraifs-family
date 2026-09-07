// Class points leaderboard — the staff view of the recognition layer.
//
// Full mode (section page): every student, ranked, with +P / −C / net —
// including the zero rows, because a leaderboard that only lists the
// already-noticed kids tells a teacher nothing about who is being
// missed. Compact mode (teacher home): the top three and a link.
//
// The CHILD's version of this deliberately shows less (top five + self,
// no one else's concerns) — see the portal's points league.

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import {
  getBehaviorLeaderboard,
  type BehaviorLeaderboardRow,
  type BehaviorStatsPeriod,
} from "../../../utils/schoolApi";

const PERIODS: Array<{ key: BehaviorStatsPeriod; label: string }> = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "term", label: "Term" },
  { key: "all", label: "All time" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export function BehaviorLeaderboardCard({
  orgId,
  sectionId,
  compact = false,
  title = "Class points",
}: {
  orgId: string;
  sectionId: string;
  compact?: boolean;
  title?: string;
}) {
  const [period, setPeriod] = useState<BehaviorStatsPeriod>("month");
  const [rows, setRows] = useState<BehaviorLeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!orgId || !sectionId) return;
    setError(null);
    getBehaviorLeaderboard(orgId, sectionId, period)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e?.message || "Failed to load leaderboard"));
  }, [orgId, sectionId, period]);

  // A quiet line, not an alarm: for the few minutes between a frontend
  // publish and the matching backend deploy this endpoint 404s, and the
  // class page must not look broken because of a scoreboard.
  if (error) return <p className="text-xs text-slate-400">Points board unavailable right now.</p>;
  if (!rows) return <p className="text-xs text-slate-400">Loading points…</p>;

  const anyPoints = rows.some((r) => r.count > 0);
  if (!anyPoints) {
    return (
      <p className="text-xs text-slate-500">
        No behavior points logged {period === "all" ? "yet" : `this ${period}`} —
        the board starts with the first note.
      </p>
    );
  }

  const visible = compact ? rows.slice(0, 3) : showAll ? rows : rows.slice(0, 8);

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <Trophy className="h-3.5 w-3.5 text-amber-500" /> {title}
          </span>
          <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={
                  "rounded-md px-2 py-0.5 text-[11px] font-medium " +
                  (period === p.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {visible.map((r, i) => (
          <li key={r.studentId} className="flex items-center gap-2 py-1.5">
            <span className="w-7 shrink-0 text-center text-sm">
              {r.rank <= 3 && r.net > 0 ? MEDALS[r.rank - 1] : (
                <span className="text-xs tabular-nums text-slate-400">{r.rank}</span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{r.name}</span>
            {!compact && (
              <span className="hidden gap-2 text-[11px] tabular-nums sm:inline-flex">
                <span className="text-emerald-600">+{r.positive}</span>
                <span className="text-rose-500">−{r.concern}</span>
              </span>
            )}
            <span
              className={
                "w-10 shrink-0 text-right text-sm font-bold tabular-nums " +
                (r.net > 0 ? "text-emerald-700" : r.net < 0 ? "text-rose-600" : "text-slate-400")
              }
            >
              {r.net > 0 ? `+${r.net}` : r.net}
            </span>
          </li>
        ))}
      </ul>
      {!compact && rows.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          {showAll ? "Show top 8" : `Show all ${rows.length} students`}
        </button>
      )}
    </div>
  );
}

export default BehaviorLeaderboardCard;
