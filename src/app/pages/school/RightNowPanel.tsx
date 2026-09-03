// "Right now" — the coverage view (pilot ask, Sep 3 2026): for every
// section in the viewer's scope (a principal sees the school, an
// incharge sees their wing via the backend's determineScope): which
// period is running THIS minute, which subject and teacher, whether
// that teacher is on approved leave, whether cover is already arranged,
// and today's logged lesson topics.
//
// Layout principle (Sep 4 redesign after principal feedback): rows are
// for exceptions; routine states collapse into summaries. Out of school
// hours the panel is one line (plus a heads-up if an upcoming first
// period already needs cover). During school, needs-cover rows lead,
// covered classes are compact lines, normal in-period classes render as
// a dense grid, and free/done sections collapse to a single line each.

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

  const sectionHref = (s: NowSection) =>
    `/school/orgs/${orgId}/sections/${s.sectionId}${s.kind === "hifz" ? "/hifz" : ""}`;

  const active = data.sections.filter((s) => s.current);
  const needsCover = active.filter((s) => s.current!.needsCover);
  const covered = active.filter((s) => !s.current!.needsCover && s.current!.substituteName);
  const inPeriod = active.filter((s) => !s.current!.needsCover && !s.current!.substituteName);
  const freeNow = data.sections.filter((s) => !s.current && s.next);
  const doneToday = data.sections.filter((s) => !s.current && !s.next);

  // Upcoming periods already known to need cover (teacher on approved
  // leave, no substitute yet) — the pre-assembly morning glance.
  const upcomingNeedsCover = freeNow.filter(
    (s) => s.next!.needsCover || (s.next!.teacherOnLeave && !s.next!.substituteName),
  );
  const earliestNext = freeNow.reduce<string | null>(
    (min, s) => (min === null || s.next!.start < min ? s.next!.start : min),
    null,
  );

  const header = (
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
          {expanded ? "Compact view" : `All sections (${data.sections.length})`}
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
  );

  // Full detail row — used by the expanded view and for exception rows.
  const fullRow = (s: NowSection) => {
    const c = s.current;
    return (
      <li key={s.sectionId} className={"py-2 " + (c?.needsCover ? "bg-amber-50/60 -mx-2 px-2 rounded" : "")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <Link to={sectionHref(s)} className="font-semibold text-indigo-700 hover:underline">
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
  };

  // Inline comma list of section links for collapsed summary lines.
  const sectionLinks = (list: NowSection[]) =>
    list.map((s, i) => (
      <span key={s.sectionId}>
        {i > 0 && ", "}
        <Link to={sectionHref(s)} className="text-indigo-600 hover:underline">
          {s.label}
        </Link>
      </span>
    ));

  let body: React.ReactNode;

  if (expanded) {
    body = <ul className="mt-2 divide-y divide-slate-100">{data.sections.map(fullRow)}</ul>;
  } else if (active.length === 0) {
    // ── Out of session (before school, a break, or no timetable) ──────
    body = (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-slate-500">
          {earliestNext
            ? `No period running right now — next period at ${earliestNext}.`
            : "No periods scheduled today."}
        </p>
        {upcomingNeedsCover.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
            <p className="text-xs font-semibold text-amber-800">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Heads-up: {upcomingNeedsCover.length} upcoming period{upcomingNeedsCover.length === 1 ? "" : "s"} need{upcomingNeedsCover.length === 1 ? "s" : ""} cover
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
              {upcomingNeedsCover.map((s) => (
                <li key={s.sectionId}>
                  <Link to={sectionHref(s)} className="font-semibold hover:underline">{s.label}</Link>
                  {" "}· {s.next!.start} {s.next!.subjectName ?? ""} — {s.next!.teacherName ?? "no teacher set"} on leave
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else {
    // ── School in session: exceptions as rows, routine as summaries ───
    body = (
      <div className="mt-2 space-y-1">
        {(needsCover.length > 0 || covered.length > 0) && (
          <ul className="divide-y divide-slate-100">
            {needsCover.map(fullRow)}
            {covered.map((s) => (
              <li key={s.sectionId} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
                <Link to={sectionHref(s)} className="font-semibold text-indigo-700 hover:underline">
                  {s.label}
                </Link>
                <span className="text-slate-600">{s.current!.subjectName ?? "—"}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <UserCheck className="h-3 w-3" /> covered by {s.current!.substituteName}
                </span>
              </li>
            ))}
          </ul>
        )}
        {inPeriod.length > 0 && (
          <div className="grid gap-x-6 gap-y-0.5 pt-1 sm:grid-cols-2">
            {inPeriod.map((s) => (
              <div key={s.sectionId} className="flex items-baseline gap-x-2 truncate text-sm">
                <Link to={sectionHref(s)} className="shrink-0 font-semibold text-indigo-700 hover:underline">
                  {s.label}
                </Link>
                <span className="truncate text-slate-700">{s.current!.subjectName ?? "—"}</span>
                <span className="truncate text-xs text-slate-500">
                  {s.current!.teacherName ?? "no teacher set"} · until {s.current!.end}
                </span>
              </div>
            ))}
          </div>
        )}
        {freeNow.length > 0 && (
          <p className="pt-1 text-xs text-slate-500">
            Free now ({freeNow.length}): {sectionLinks(freeNow)}
            {earliestNext && ` — next periods from ${earliestNext}`}
          </p>
        )}
        {doneToday.length > 0 && (
          <p className="text-xs text-slate-400">Done for today ({doneToday.length}).</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {header}
      {body}
      <p className="mt-2 text-[11px] text-slate-400">
        To arrange cover: open the class → attendance/schedule, or Admin → Time off for the substitution picker.
      </p>
    </div>
  );
}

export default RightNowPanel;
