// Sections + Hifz-group checklist — the new home of /admin/timetable.
//
// Replaces the bare "Pick a section" dropdown. Lists every class
// section and every Hifz group with a progress bar (filled / academic
// slots), so the admin can see at a glance what's already scheduled
// and where to start. Clicking a row drops the page into per-section
// fill-in mode via ?scope=section&id=...

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronRight, CircleDashed, ListChecks } from "lucide-react";
import {
  getTimetableSectionProgress,
  type TimetableSectionProgress,
} from "../../../utils/schoolApi";

interface RowProps {
  to: string;
  primary: string;
  secondary?: string;
  filled: number;
  total: number;
}

function ProgressRow({ to, primary, secondary, filled, total }: RowProps) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const done = total > 0 && filled >= total;
  const empty = filled === 0;
  const label = done ? "Edit" : empty ? "Start" : "Finish";
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50"
    >
      <span className="shrink-0">
        {done ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : empty ? (
          <CircleDashed className="h-4 w-4 text-slate-300" />
        ) : (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-400" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{primary}</div>
        {secondary && <div className="text-[11px] text-slate-500">{secondary}</div>}
      </div>
      <div className="hidden sm:flex w-40 items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full"
               style={{ width: `${pct}%`, background: done ? "#059669" : "#4F46E5" }} />
        </div>
        <span className="text-[11px] font-medium tabular-nums text-slate-600 w-14 text-right">
          {filled}/{total}
        </span>
      </div>
      <span className={
        "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border " +
        (done ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-indigo-200 bg-indigo-50 text-indigo-800")
      }>
        {label} <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

export function TimetableSectionsChecklist() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [data, setData] = useState<TimetableSectionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getTimetableSectionProgress(orgId).then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [orgId]);

  if (error) {
    return <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>;
  }
  if (!data) {
    return <div className="text-sm text-slate-500">Loading sections…</div>;
  }

  const total = data.academicSlots > 0 ? data.academicSlots : data.totalSlots;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        Your school day isn't defined yet. Set it up in <Link to={`/school/orgs/${orgId}/admin/settings/school-schedule`} className="underline font-medium">Settings → School schedule</Link> first — that creates the empty grid each class fills in.
      </div>
    );
  }

  const allItems = [
    ...data.sections.map((s) => ({ kind: "section" as const, id: s.id, name: `${s.className ?? ""} · ${s.name}`.replace(/^ · /, ""), filled: s.filledSlots })),
    ...data.hifzGroups.map((g) => ({ kind: "group" as const, id: g.id, name: g.name, filled: g.filledSlots })),
  ];
  const completeCount = allItems.filter((i) => i.filled >= total).length;
  const totalFilled = allItems.reduce((sum, i) => sum + Math.min(i.filled, total), 0);
  const grandTotal = allItems.length * total;
  const grandPct = grandTotal > 0 ? Math.round((totalFilled / grandTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Aggregate progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-indigo-500" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Build the timetable</div>
              <div className="text-xs text-slate-600">
                {completeCount} of {allItems.length} {allItems.length === 1 ? "class" : "classes"} complete · {totalFilled} of {grandTotal} periods filled
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold tabular-nums text-indigo-700">{grandPct}%</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
               style={{ width: `${grandPct}%` }} />
        </div>
      </div>

      {/* Sections */}
      {data.sections.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Class sections</h2>
          </div>
          {data.sections.map((s) => (
            <ProgressRow
              key={s.id}
              to={`/school/orgs/${orgId}/admin/timetable?scope=section&id=${s.id}`}
              primary={`${s.className ?? "Class"} · ${s.name}`}
              filled={s.filledSlots}
              total={total}
            />
          ))}
        </section>
      )}

      {/* Hifz groups */}
      {data.hifzGroups.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Hifz groups</h2>
          </div>
          {data.hifzGroups.map((g) => (
            <ProgressRow
              key={g.id}
              to={`/school/orgs/${orgId}/admin/timetable?scope=group&id=${g.id}`}
              primary={g.name}
              filled={g.filledSlots}
              total={total}
            />
          ))}
        </section>
      )}

      {data.sections.length === 0 && data.hifzGroups.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No class sections or Hifz groups yet. Add some in{" "}
          <Link to={`/school/orgs/${orgId}/admin/classes`} className="underline text-indigo-700">Classes</Link>,
          then come back here.
        </div>
      )}
    </div>
  );
}

export default TimetableSectionsChecklist;
