// ReportCardsBrowser — the office reads a class's cards one click apart.
//
// Ambreen (27 Sep, voice note): reading cards meant People → student →
// profile → report card → pick the term → back, back, back → the next
// child. This page is the short way: pick the class, see every child
// with their card's state, open one — and the card page's Previous/Next
// (carried by ?browse=<sectionId>) steps through the class without ever
// coming back here.

import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, FileText, CheckCircle2, Send, CircleDashed, CircleSlash } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getReportCardsBrowser,
  type ReportCardsBrowserResponse,
} from "../../../utils/schoolApi";

export function ReportCardsBrowser() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [search, setSearch] = useSearchParams();
  const termId = search.get("term") || "";
  const sectionId = search.get("section") || "";
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value); else next.delete(key);
    setSearch(next);
  };

  const [data, setData] = useState<ReportCardsBrowserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getReportCardsBrowser(orgId, { termId: termId || undefined, sectionId: sectionId || undefined })
      .then((r) => { setData(r); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [orgId, termId, sectionId]);

  const statusChip = (s: { hasMarks: boolean; finalizedAt: string | null; publishedAt: string | null }) => {
    if (s.publishedAt) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          <Send className="h-3 w-3" /> Published
        </span>
      );
    }
    if (s.finalizedAt) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
          <CheckCircle2 className="h-3 w-3" /> Finalized
        </span>
      );
    }
    if (s.hasMarks) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <CircleDashed className="h-3 w-3" /> Marks entered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <CircleSlash className="h-3 w-3" /> No marks — would print blank
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
        {data && data.terms.length > 1 && (
          <Select value={data.term?.id ?? ""} onValueChange={(v) => setParam("term", v)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Term" /></SelectTrigger>
            <SelectContent>
              {data.terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-500" /> Report cards
          {data?.term && <span className="text-slate-400 font-normal">· {data.term.name}</span>}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {data?.scope === "own-class"
            ? "Your class. Open a child's card to write their remark, then use Previous / Next on the card to move through the class."
            : "Pick a class, open a child's card, then use Previous / Next on the card itself to step through the class."}
        </p>
        {data?.scope === "own-class" && (
          <p className="mt-1 text-xs text-slate-500">
            You can write the class teacher&apos;s remark and the per-subject
            comments. Finalizing and sending to parents stays with the office.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}

      {/* Class picker: always visible so switching class is one click. */}
      {data && (
        <div className="flex flex-wrap gap-2">
          {data.sections.map((s) => {
            const label = s.name && s.name !== "A" ? `${s.className} — ${s.name}` : s.className;
            const active = s.id === sectionId;
            return (
              <button
                key={s.id}
                onClick={() => setParam("section", active ? "" : s.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label} <span className={active ? "text-indigo-200" : "text-slate-400"}>({s.students})</span>
              </button>
            );
          })}
        </div>
      )}

      {data?.students && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {data.students.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No active students in this class.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {data.students.map((s, i) => (
              <li key={s.id}>
                <Link
                  to={`/school/orgs/${orgId}/admin/students/${s.id}/report-card?term=${data.term?.id ?? ""}&browse=${sectionId}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                    <span className="truncate text-sm font-medium text-slate-800">{s.name}</span>
                    {s.gr && <span className="shrink-0 text-xs text-slate-400">GR {s.gr}</span>}
                  </span>
                  {statusChip(s)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && !sectionId && (
        <p className="text-sm text-slate-500">Choose a class above to list its children.</p>
      )}
    </div>
  );
}
