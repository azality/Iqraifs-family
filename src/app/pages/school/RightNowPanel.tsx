// "Right now" — the coverage view (pilot ask, Sep 3 2026): for every
// section in the viewer's scope (a principal sees the school, an
// incharge sees their wing via the backend's determineScope): which
// period is running THIS minute, which subject and teacher, whether
// that teacher is on approved leave, whether cover is already arranged,
// and today's logged lesson topics. Amber rows = needs cover NOW.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Clock, RefreshCw, AlertTriangle, UserCheck } from "lucide-react";
import { getNow, type NowSection } from "../../../utils/schoolApi";

export function RightNowPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<{ time: string; sections: NowSection[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = () => {
    setLoading(true);
    getNow(orgId)
      .then((r) => setData({ time: r.time, sections: r.sections }))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (orgId) load(); /* eslint-disable-next-line */ }, [orgId]);

  if (!data || data.sections.length === 0) return null;

  const active = data.sections.filter((s) => s.current);
  const needsCover = active.filter((s) => s.current?.needsCover);
  const shown = expanded ? data.sections : data.sections.filter((s) => s.current || s.next);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Clock className="h-3.5 w-3.5 text-indigo-500" />
          Right now · {data.time}
        </span>
        {needsCover.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-3 w-3" />
            {needsCover.length} class{needsCover.length === 1 ? "" : "es"} need{needsCover.length === 1 ? "s" : ""} cover
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {expanded ? "Active periods only" : `All sections (${data.sections.length})`}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} />
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No periods running right now — outside school hours or no timetable for today.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {shown.map((s) => {
            const c = s.current;
            return (
              <li key={s.sectionId} className={"py-2 " + (c?.needsCover ? "bg-amber-50/60 -mx-2 px-2 rounded" : "")}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <Link
                    to={`/school/orgs/${orgId}/sections/${s.sectionId}${s.kind === "hifz" ? "/hifz" : ""}`}
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    {s.label}
                  </Link>
                  {c ? (
                    <>
                      <span className="text-xs text-slate-500">{c.slotName} · {c.start}–{c.end}</span>
                      <span className="font-medium text-slate-800">{c.subjectName ?? "—"}</span>
                      <span className="text-slate-600">{c.teacherName ?? "no teacher set"}</span>
                      {c.room && <span className="text-xs text-slate-400">Room {c.room}</span>}
                      {c.teacherOnLeave && !c.substituteName && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          <AlertTriangle className="h-3 w-3" /> on leave — needs cover
                        </span>
                      )}
                      {c.substituteName && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                          <UserCheck className="h-3 w-3" /> covered by {c.substituteName}
                        </span>
                      )}
                    </>
                  ) : s.next ? (
                    <span className="text-xs text-slate-500">
                      free now · next {s.next.start} {s.next.subjectName ?? ""} — {s.next.teacherName ?? ""}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">no more periods today</span>
                  )}
                </div>
                {s.lessonsToday.length > 0 && (
                  <div className="mt-0.5 text-xs text-slate-500">
                    Today:{" "}
                    {s.lessonsToday.slice(0, 3).map((l, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {l.subjectName ? `${l.subjectName}: ` : ""}
                        {l.topicName ?? l.title}
                      </span>
                    ))}
                    {s.lessonsToday.length > 3 && ` +${s.lessonsToday.length - 3} more`}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        To arrange cover: open the class → attendance/schedule, or Admin → Time off for the substitution picker.
      </p>
    </div>
  );
}

export default RightNowPanel;
