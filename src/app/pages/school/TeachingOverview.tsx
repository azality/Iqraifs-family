// Teaching overview — Teacher Track Record Phase 2. Every teacher as
// one sortable row: pace delta, lessons/week, gradebook freshness,
// roll-call, hifz heard-rate, feedback footprint. Principals see the
// school; incharges land here with their wing only (backend-scoped).
// Default sort = furthest behind pace, so the eye lands where coaching
// is needed. A coaching agenda, not a league table — ramp badges keep
// new staff readable as onboarding.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowUpDown, GraduationCap } from "lucide-react";
import { getTeachingOverview } from "../../../utils/schoolApi";

type SortKey = "pace" | "lessons" | "freshness" | "rollcall" | "heard" | "notes" | "name";

export function TeachingOverview() {
  const { orgId = "" } = useParams();
  const [data, setData] = useState<any>(null);
  const [term, setTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("pace");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getTeachingOverview(orgId, term || undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [orgId, term]);

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])].filter((r: any) =>
      !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase()));
    const num = (v: number | null | undefined, worstHigh: boolean) =>
      v == null ? (worstHigh ? -1 : 999) : v;
    switch (sortKey) {
      case "name": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "pace": list.sort((a, b) => num(a.paceDeltaPp, false) - num(b.paceDeltaPp, false)); break;
      case "lessons": list.sort((a, b) => a.lessonsPerWeek - b.lessonsPerWeek); break;
      case "freshness": list.sort((a, b) => num(b.freshnessDays, true) - num(a.freshnessDays, true)); break;
      case "rollcall":
        list.sort((a, b) =>
          (a.rollCall ? a.rollCall.marked / a.rollCall.schoolDays : 2) -
          (b.rollCall ? b.rollCall.marked / b.rollCall.schoolDays : 2));
        break;
      case "heard": list.sort((a, b) => num(a.heardRatePct, false) - num(b.heardRatePct, false)); break;
      case "notes": list.sort((a, b) => (a.notes.pos + a.notes.con) - (b.notes.pos + b.notes.con)); break;
    }
    return list;
  }, [data, sortKey, query]);

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      onClick={() => setSortKey(k)}
      className={
        "cursor-pointer whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider " +
        (sortKey === k ? "text-indigo-700" : "text-slate-400 hover:text-slate-600")
      }
    >
      <span className="inline-flex items-center gap-1">{children}<ArrowUpDown className="h-3 w-3" /></span>
    </th>
  );

  const paceChip = (pp: number | null) =>
    pp == null ? <span className="text-slate-300">—</span> : (
      <span className={
        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums " +
        (pp >= 0 ? "bg-emerald-50 text-emerald-700"
          : pp <= -15 ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-800")
      }>
        {pp >= 0 ? "+" : ""}{pp}pp
      </span>
    );

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            Teaching overview
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every teacher{data?.wingScoped ? " in your wing" : ""}, one row —
            sorted furthest-behind-first. Click a name for their full track record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teacher…"
            className="h-8 w-48 rounded-md border border-slate-200 bg-white px-2 text-sm"
          />
          {data?.terms?.length > 0 && (
            <select
              value={term || (data.term?.id ?? "")}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              {data.terms.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}{t.isCurrent ? " (current)" : ""}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Computing across all teachers…
        </div>
      ) : !data || rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No teaching activity to show.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-100">
              <tr>
                <Th k="name">Teacher</Th>
                <Th k="pace">Pace</Th>
                <Th k="lessons">Lessons/wk</Th>
                <Th k="freshness">Grading lag</Th>
                <Th k="rollcall">Roll call</Th>
                <Th k="heard">Hifz heard</Th>
                <Th k="notes">Notes +/−</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r: any) => (
                <tr key={r.userId} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <Link
                      to={`/school/orgs/${orgId}/admin/teachers/${r.userId}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <span className="ml-2 text-[11px] text-slate-400">
                      {r.sectionCount} sec · {r.subjectCount} subj
                    </span>
                    {r.inRamp && (
                      <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200">
                        ramp
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{paceChip(r.paceDeltaPp)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.lessonsPerWeek}
                    <span className="text-[11px] text-slate-400"> ({r.lessons})</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.freshnessDays == null ? <span className="text-slate-300">—</span> : `${r.freshnessDays}d`}
                    {r.ungradedPastDue > 0 && (
                      <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {r.ungradedPastDue} ungraded
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.rollCall ? `${r.rollCall.marked}/${r.rollCall.schoolDays}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.heardRatePct == null ? <span className="text-slate-300">—</span> : (
                      <span className={r.heardRatePct >= 80 ? "text-emerald-700 font-semibold" : r.heardRatePct >= 50 ? "text-amber-700" : "text-rose-700 font-semibold"}>
                        {r.heardRatePct}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className="text-emerald-700">{r.notes.pos}+</span>
                    <span className="text-slate-300"> / </span>
                    <span className="text-rose-600">{r.notes.con}−</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Pace = avg topics-complete % minus term-elapsed % across the teacher's
        subjects{data?.expectedPct != null ? ` (expected ~${data.expectedPct}% by now)` : ""}.
        Grading lag = median days from due date to first grade. Read alongside
        each teacher's full Performance tab — context beats ranking.
      </p>
    </div>
  );
}

export default TeachingOverview;
