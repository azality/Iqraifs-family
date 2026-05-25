// StudentBehavior — timeline of behavior notes for a student.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  getMyStudentBehavior,
  type MyStudentBehaviorResponse,
  type MyStudentBehaviorEntry,
} from "../../../utils/schoolPortalApi";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function pointsColor(points: number): string {
  if (points > 0) return "text-emerald-700";
  if (points < 0) return "text-rose-700";
  return "text-slate-600";
}

export function StudentBehavior() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentBehaviorResponse | null>(null);
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

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const sortedEntries = [...data.entries].sort(
    (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
  );

  return (
    <div className="space-y-5">
      <HeroCard
        title="Behavior"
        subtitle="Notes and observations"
        rightSlot={
          <div className="text-right text-xs text-indigo-200">
            <div className="text-lg text-white font-semibold tabular-nums">
              {data.summary.positiveCount} positive · {data.summary.concernCount} concern
            </div>
            <div>
              Net points:{" "}
              <span className="text-white tabular-nums font-medium">
                {data.summary.netPoints >= 0 ? "+" : ""}
                {data.summary.netPoints}
              </span>
            </div>
          </div>
        }
      />

      {sortedEntries.length === 0 ? (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-500 text-center`}>
          No behavior notes yet.
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
                    {n.kind}
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
                  <div className="text-[11px] text-slate-400">{relativeTime(n.observedAt)}</div>
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
