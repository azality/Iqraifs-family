// "Right now" — the coverage view (pilot ask, Sep 3 2026): for every
// section in the viewer's scope (a principal sees the school, an
// incharge sees their wing via the backend's determineScope): which
// period is running THIS minute, which subject and teacher, whether
// that teacher is on approved leave, whether cover is already arranged.
//
// Sep 2026 redesign (design handoff, option 1a): the flat per-section
// list becomes a time-grouped timeline — sections that started together
// share one node, a NOW marker splits past from future, and upcoming
// start times are collapsed expanders. 20 rows become ~4 time slots.
// Needs-cover stays the loudest thing on the card (amber chips + header
// count) because that's the one actionable signal.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { RefreshCw, AlertTriangle, UserCheck } from "lucide-react";
import { getNow, type NowSection } from "../../../utils/schoolApi";

const ACCENT = "#5b5bd6";
const NAVY = "#14163a";

function sectionHref(orgId: string, s: NowSection) {
  return `/school/orgs/${orgId}/sections/${s.sectionId}${s.kind === "hifz" ? "/hifz" : ""}`;
}

/** Timeline node dot, positioned on the rail. */
function NodeDot({ variant }: { variant: "past" | "now" | "soon" | "later" }) {
  if (variant === "now") {
    return (
      <span
        className="absolute -left-[7px] top-[3px] h-3 w-3 rounded-full"
        style={{ background: ACCENT, boxShadow: "0 0 0 4px rgba(91,91,214,.18)" }}
      />
    );
  }
  const border =
    variant === "past" ? "#94a3b8" : variant === "soon" ? "#c7c8f0" : "#e2e2f5";
  return (
    <span
      className="absolute -left-1.5 top-0.5 h-2.5 w-2.5 rounded-full bg-white box-border"
      style={{ border: `2px solid ${border}` }}
    />
  );
}

/** Chip for a section that is in session right now. */
function SessionChip({ orgId, s }: { orgId: string; s: NowSection }) {
  const c = s.current!;
  const needsCover = c.needsCover || (c.teacherOnLeave && !c.substituteName);
  const cls = needsCover
    ? "bg-amber-50 border-amber-300 text-amber-900"
    : "bg-emerald-50 border-emerald-200 text-emerald-800";
  return (
    <Link
      to={sectionHref(orgId, s)}
      className={"inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] whitespace-nowrap hover:opacity-80 " + cls}
    >
      <b>{s.label}</b>
      <span className="opacity-80">· {c.subjectName ?? c.slotName}</span>
      <span className="opacity-70">· {c.teacherName ?? "no teacher"}</span>
      {needsCover && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 font-semibold">
          <AlertTriangle className="h-3 w-3" /> needs cover
        </span>
      )}
      {c.substituteName && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 font-medium text-emerald-700">
          <UserCheck className="h-3 w-3" /> {c.substituteName}
        </span>
      )}
    </Link>
  );
}

export function RightNowPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<{ time: string; sections: NowSection[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    getNow(orgId)
      .then((r) => setData({ time: r.time, sections: r.sections }))
      .catch(() => { if (!silent) setData(null); })
      .finally(() => setLoading(false));
  };
  // Live: refresh each minute so the NOW marker and slot rollovers track
  // the school clock without a manual reload.
  useEffect(() => {
    if (!orgId) return;
    load();
    const iv = setInterval(() => load(true), 60_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [orgId]);

  const grouped = useMemo(() => {
    const sections = data?.sections ?? [];
    const active = sections.filter((s) => s.current);
    const freeNow = sections.filter((s) => !s.current && s.next);
    const done = sections.filter((s) => !s.current && !s.next);
    const needsCover = active.filter(
      (s) => s.current!.needsCover || (s.current!.teacherOnLeave && !s.current!.substituteName),
    );
    const byStart = (list: NowSection[], key: (s: NowSection) => string) => {
      const m = new Map<string, NowSection[]>();
      for (const s of list) {
        const k = key(s);
        m.set(k, [...(m.get(k) ?? []), s]);
      }
      return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    };
    const inSession = byStart(active, (s) => s.current!.start);
    const upcoming = byStart(freeNow, (s) => s.next!.start);
    // Free teachers, deduped, with their first upcoming period time.
    const seen = new Set<string>();
    const freeTeachers: Array<{ name: string; time: string }> = [];
    for (const [time, list] of upcoming) {
      for (const s of list) {
        const name = s.next!.teacherName;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        freeTeachers.push({ name, time });
      }
    }
    return { sections, active, freeNow, done, needsCover, inSession, upcoming, freeTeachers };
  }, [data]);

  if (!data || grouped.sections.length === 0) return null;
  const { active, freeNow, done, needsCover, inSession, upcoming, freeTeachers } = grouped;
  const firstUpcoming = upcoming[0]?.[0] ?? null;

  const slotSummary = (list: NowSection[]) => {
    const labels = list.slice(0, 3).map((s) => s.label).join(", ");
    return list.length > 3 ? `${labels} +${list.length - 3}` : labels;
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "rgba(20,22,58,.08)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: "rgba(20,22,58,.07)" }}>
        {/* On phones the accordion header already says "Right now" — keep
            only the live clock/counts here to avoid a doubled label. */}
        <span
          className="h-2 w-2 rounded-full max-lg:hidden"
          style={{ background: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,.15)" }}
        />
        <span className="text-[11px] font-bold tracking-[1.2px] max-lg:hidden" style={{ color: NAVY }}>
          RIGHT NOW
        </span>
        <span className="text-xs text-slate-400">{data.time}</span>
        {needsCover.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="h-3 w-3" />
            {needsCover.length} need{needsCover.length === 1 ? "s" : ""} cover
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="whitespace-nowrap text-[11.5px] text-slate-500">
            {active.length} in session · {freeNow.length} free
          </span>
          <button
            onClick={() => load()}
            disabled={loading}
            className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} />
          </button>
        </span>
      </div>

      {/* Timeline */}
      <div className="py-4 pl-6 pr-4">
        <div className="border-l-2" style={{ borderColor: "rgba(20,22,58,.1)" }}>
          {/* Started slots (in session) */}
          {inSession.map(([start, list]) => (
            <div key={start} className="relative pb-3.5 pl-4 opacity-[.85]">
              <NodeDot variant="past" />
              <div className="text-[11px] font-bold text-slate-500">
                {start} · started — {list.length} in session
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {list.map((s) => (
                  <SessionChip key={s.sectionId} orgId={orgId} s={s} />
                ))}
              </div>
            </div>
          ))}

          {/* NOW */}
          <div className="relative pb-3.5 pl-4">
            <NodeDot variant="now" />
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[11px] font-extrabold tracking-[.6px]" style={{ color: ACCENT }}>
                NOW · {data.time}
              </span>
              <span
                className="h-0.5 flex-1"
                style={{ background: `linear-gradient(90deg, ${ACCENT}, rgba(91,91,214,0))` }}
              />
            </div>
            <div className="mt-1 text-[12.5px] text-slate-700">
              {active.length} in session · <b>{freeNow.length} teachers free</b>
              {firstUpcoming && ` · next start ${firstUpcoming}`}
              {active.length === 0 && upcoming.length === 0 && done.length === 0 && " · no periods today"}
            </div>
            {freeTeachers.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer list-none text-[11.5px] font-semibold" style={{ color: ACCENT }}>
                  Show free teachers ▾
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {freeTeachers.map((f) => (
                    <span
                      key={f.name}
                      className="rounded-full border px-2.5 py-0.5 text-[11px]"
                      style={{ background: "#f4f4fb", borderColor: "rgba(91,91,214,.18)", color: "#3f3f7a" }}
                    >
                      {f.name} <span className="text-slate-400">· {f.time}</span>
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Upcoming slots */}
          {upcoming.map(([start, list], i) => (
            <div key={start} className="relative pb-3.5 pl-4 last:pb-1">
              <NodeDot variant={i === 0 ? "soon" : "later"} />
              <details>
                <summary className="cursor-pointer list-none text-[11px] font-bold text-slate-500">
                  {start} · <span style={{ color: NAVY }}>{list.length} class{list.length === 1 ? "" : "es"} start</span>{" "}
                  — {slotSummary(list)} <span style={{ color: ACCENT }}>▾</span>
                </summary>
                <div className="mt-1.5 grid gap-x-3 gap-y-1 sm:grid-cols-2">
                  {list.map((s) => (
                    <div key={s.sectionId} className="flex items-baseline gap-1.5 text-[11.5px] text-slate-700">
                      <Link
                        to={sectionHref(orgId, s)}
                        className="whitespace-nowrap font-bold hover:underline"
                        style={{ color: NAVY }}
                      >
                        {s.label}
                      </Link>
                      <span className="truncate">{s.next!.subjectName ?? ""}</span>
                      <span className="ml-auto whitespace-nowrap text-slate-400">
                        {s.next!.teacherName ?? "no teacher"}
                      </span>
                      {(s.next!.needsCover || (s.next!.teacherOnLeave && !s.next!.substituteName)) && (
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10.5px] font-semibold text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> cover
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ))}

          {/* Done for today */}
          {done.length > 0 && (
            <div className="relative pl-4">
              <NodeDot variant="later" />
              <div className="text-[11px] font-bold text-slate-400">
                Done for today · {done.length} section{done.length === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2.5 text-[11.5px]" style={{ borderColor: "rgba(20,22,58,.07)" }}>
        <span className="text-slate-400">Updates live · tap a class to open it</span>
        <Link to={`/school/orgs/${orgId}/admin/timetable`} className="font-semibold" style={{ color: ACCENT }}>
          Full timetable →
        </Link>
      </div>
    </div>
  );
}

export default RightNowPanel;
