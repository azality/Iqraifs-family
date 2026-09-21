// MyMarks — "Enter marks": every column a teacher enters, in one list.
//
// Named "My marks" for a day; teachers read that as marks ABOUT them
// (Muneeb, 22 Sep). The verb says what the page is for. The route
// stays /my-marks so nothing bookmarked breaks.
//
// "As soon as they enter a few students' marks there's no way for them to
// go back to tally, to confirm or to enter one or two students"
// (teachers, 22 Sep). The only doorway into a marks sheet was the
// Needs-attention nudge on the teacher's home page — and that nudge
// disappears the moment a column is finished, so a teacher who had
// entered everything could not get back in to check it.
//
// This page does not disappear. One row per paper × class × subject,
// with how far it has come, and a link straight into the sheet.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { CheckCircle2, ClipboardList, Lock, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  getSchoolMe, getMyExamMarksTodo,
  type SchoolMeResponse, type MyMarksColumn,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

/** "Oral", "Written" — the part after the dash in "1st Assessment — Oral". */
const shortExam = (name: string) => name.replace(/^.*?—\s*/, "") || name;

type Status = "locked" | "ready" | "started" | "none";

function statusOf(c: MyMarksColumn): Status {
  if (c.signedOff) return "locked";
  if (c.marked >= c.studentCount && c.studentCount > 0) return "ready";
  return c.marked > 0 ? "started" : "none";
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  locked: { label: "Submitted", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  ready: { label: "Ready to submit", cls: "border-amber-200 bg-amber-50 text-amber-900" },
  started: { label: "In progress", cls: "border-sky-200 bg-sky-50 text-sky-800" },
  none: { label: "Not started", cls: "border-slate-200 bg-slate-50 text-slate-600" },
};

export function MyMarks() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [columns, setColumns] = useState<MyMarksColumn[] | null>(null);
  const [termName, setTermName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => {});
  }, []);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    getMyExamMarksTodo(orgId)
      .then((r) => { setColumns(r.columns ?? []); setTermName(r.term?.name ?? null); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [orgId]);
  // Marks change in the sheet next door; re-read on return.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // One group per paper, newest first — the server already sorted.
  const groups = useMemo(() => {
    const out: Array<{ examId: string; examName: string; rows: MyMarksColumn[] }> = [];
    for (const c of columns ?? []) {
      let g = out.find((x) => x.examId === c.examId);
      if (!g) { g = { examId: c.examId, examName: c.examName, rows: [] }; out.push(g); }
      g.rows.push(c);
    }
    return out;
  }, [columns]);

  const owed = (columns ?? []).reduce((s, c) => s + Math.max(0, c.studentCount - c.marked), 0);
  const toSubmit = (columns ?? []).filter((c) => statusOf(c) === "ready").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className={sectionTitleClasses}>Enter marks</h1>
          <p className="mt-1 text-sm text-slate-600">
            {termName ? `${termName} — ` : ""}every class and subject you enter marks for,
            finished ones included. Open a sheet any time to check it or to add a student you missed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (loading ? "animate-spin" : "")} /> Refresh
        </Button>
      </div>

      {(owed > 0 || toSubmit > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {owed > 0 && (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-800">
              {owed} {owed === 1 ? "student" : "students"} still without a mark
            </span>
          )}
          {toSubmit > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-900">
              {toSubmit} {toSubmit === 1 ? "column is" : "columns are"} ready to submit
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {columns !== null && columns.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          <ClipboardList className="mx-auto mb-2 h-5 w-5 text-slate-300" />
          No marks to enter yet. Columns appear here once a paper has been sat.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.examId} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
            {shortExam(g.examName)}
            <span className="ml-2 text-xs font-normal text-slate-500">{g.examName}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {g.rows.map((c) => {
              const st = statusOf(c);
              const missing = Math.max(0, c.studentCount - c.marked);
              const pct = c.studentCount > 0 ? Math.round((c.marked / c.studentCount) * 100) : 0;
              return (
                <Link
                  key={`${c.examId}-${c.classSectionId}-${c.classSubjectId}`}
                  to={`/school/orgs/${orgId}/admin/assessment/exams/${c.examId}/marks?sectionId=${c.classSectionId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {c.subjectName} <span className="text-slate-400">·</span> {c.sectionLabel}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={"h-full " + (st === "locked" ? "bg-emerald-500" : st === "ready" ? "bg-amber-500" : "bg-sky-500")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11.5px] tabular-nums text-slate-500">
                        {c.marked} of {c.studentCount}
                        {c.absent > 0 ? ` · ${c.absent} absent` : ""}
                        {missing > 0 ? ` · ${missing} to go` : ""}
                      </span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${STATUS[st].cls}`}>
                    {st === "locked" ? <Lock className="h-3 w-3" /> : st === "ready" ? <CheckCircle2 className="h-3 w-3" /> : null}
                    {STATUS[st].label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {me === null && <div className="text-sm text-slate-500">Loading…</div>}
    </div>
  );
}

export default MyMarks;
