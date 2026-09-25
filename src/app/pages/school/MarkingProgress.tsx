// MarkingProgress — every section's marks entry on one screen.
//
// "For the admin or the incharge and the principal, if they want to see
// how the marking progress is going, as there's papers going on"
// (Muneeb, 18 Sep). Until now the only way was to open each section in
// turn — and nobody could see that Class I's written paper had not been
// started, or that nothing anywhere had been signed off.
//
// One row per section, one column per paper. A cell says how many of the
// subjects that SIT that paper are fully marked; open it to see which
// subjects are still missing, each a link straight to its marks sheet.
// Admin and principal see the whole school; an incharge sees their wing
// (the server decides — this page only renders what it is sent).

import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDashed,
  CircleDot, RefreshCw, ShieldCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  getSchoolMe, isOrgAdmin, viewerRoleForOrg, getMarkingProgress,
  type SchoolMeResponse, type MarkingProgressResponse, type MarkingExamCell,
} from "../../../utils/schoolApi";
import { NoAccessRedirect, sectionTitleClasses } from "../../components/school-ui";

type State = "none" | "empty" | "partial" | "done";

/** Same rule as the server's cellState — kept beside the render so the
 *  colour and the words can never disagree. */
function stateOf(c: MarkingExamCell): State {
  if (c.subjectCount === 0) return "none";
  if (c.subjectsDone === c.subjectCount) return "done";
  if (c.marksEntered === 0) return "empty";
  return "partial";
}

/** Colour AND an icon per state, so a gap reads without relying on colour
 *  alone. Semantic, not brand: green done, amber under way, red not started. */
const STATE_STYLE: Record<State, { cell: string; bar: string; Icon: typeof Circle; word: string }> = {
  done: { cell: "border-emerald-200 bg-emerald-50 text-emerald-800", bar: "bg-emerald-500", Icon: CheckCircle2, word: "Complete" },
  partial: { cell: "border-amber-200 bg-amber-50 text-amber-900", bar: "bg-amber-500", Icon: CircleDot, word: "Under way" },
  empty: { cell: "border-rose-200 bg-rose-50 text-rose-800", bar: "bg-rose-400", Icon: Circle, word: "Not started" },
  none: { cell: "border-transparent bg-transparent text-slate-300", bar: "bg-slate-200", Icon: CircleDashed, word: "No paper" },
};

/** "Oral", "Written" — the part after the dash in "1st Assessment — Oral". */
const shortExam = (name: string) => name.replace(/^.*?—\s*/, "") || name;

export function MarkingProgress() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [data, setData] = useState<MarkingProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // `${sectionId}:${examId}`
  const [attentionFirst, setAttentionFirst] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  // Which term's papers to show. Empty = let the server pick the one
  // being marked, which is NOT always the current term: the school rolled
  // into the 2nd Assessment on 21 Sep with the 1st still half marked.
  const [termId, setTermId] = useState("");

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    getMarkingProgress(orgId, termId || undefined)
      .then((r) => { setData(r); setLoadedAt(new Date()); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [orgId, termId]);

  // Marks arrive while the papers are being checked, so re-read when the
  // tab comes back rather than showing a morning's numbers all afternoon.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const exams = data?.exams ?? [];

  // Per paper: how many sections that sit it are complete.
  const summary = useMemo(() => exams.map((e, i) => {
    const cells = (data?.sections ?? []).map((s) => s.exams[i]).filter((c) => c && c.subjectCount > 0);
    return {
      id: e.id,
      name: shortExam(e.name),
      done: cells.filter((c) => stateOf(c) === "done").length,
      empty: cells.filter((c) => stateOf(c) === "empty").length,
      total: cells.length,
    };
  }), [data, exams]);

  const signoff = useMemo(() => {
    const rows = data?.sections ?? [];
    return {
      done: rows.reduce((s, r) => s + r.signedOff, 0),
      needed: rows.reduce((s, r) => s + r.signOffNeeded, 0),
    };
  }, [data]);

  // Results-day readiness (24 Sep): sections whose every child is
  // finalized, and children who would carry a BLANK card if results
  // went out as they stand. Only sections that sit a paper count -
  // Reception/Junior have no written assessment, Hifz its own paper.
  const readiness = useMemo(() => {
    const rows = (data?.sections ?? []).filter((r) => r.signOffNeeded > 0);
    return {
      ready: rows.filter((r) => (r.finalized ?? 0) === r.studentCount && r.studentCount > 0).length,
      sections: rows.length,
      blank: rows.reduce((n, r) => n + ((r.finalized ?? 0) > 0 ? (r.unmarked ?? 0) : 0), 0),
    };
  }, [data]);

  // "Needs attention" = the most unmarked work first. School order keeps
  // the classes youngest-first, the way the server sends them.
  const rows = useMemo(() => {
    const list = [...(data?.sections ?? [])];
    if (!attentionFirst) return list;
    const owed = (r: (typeof list)[number]) =>
      r.exams.reduce((s, c) => s + (c.marksExpected - c.marksEntered), 0);
    return list.sort((a, b) => owed(b) - owed(a));
  }, [data, attentionFirst]);

  if (meLoading) return null;
  const allowed = isOrgAdmin(me, orgId) || viewerRoleForOrg(me, orgId) === "incharge";
  if (!allowed) return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Dashboard
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {(data?.terms ?? []).length > 1 && (
            <select
              aria-label="Assessment"
              value={termId || data?.term?.id || ""}
              onChange={(e) => setTermId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
            >
              {(data?.terms ?? []).map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}{tm.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </select>
          )}
          {loadedAt && <span>Updated {loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (loading ? "animate-spin" : "")} /> Refresh
          </Button>
        </div>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Marking progress</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data?.term ? `${data.term.name} — ` : ""}how far each section's marks have come.
          A paper counts as complete for a section once every student has a mark
          or an absence in every subject that sits it.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* The headline: one figure per paper, then sign-off. */}
      {data && exams.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.name}</div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                {s.done}<span className="text-sm font-medium text-slate-400"> / {s.total}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                sections complete{s.empty > 0 ? ` · ${s.empty} not started` : ""}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Signed off</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
              {signoff.done}<span className="text-sm font-medium text-slate-400"> / {signoff.needed}</span>
            </div>
            <div className="text-[11px] text-slate-500">subject columns</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Report cards ready</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
              {readiness.ready}<span className="text-sm font-medium text-slate-400"> / {readiness.sections}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              sections fully finalized
              {readiness.blank > 0 && (
                <span className="text-rose-600"> · {readiness.blank} card{readiness.blank === 1 ? "" : "s"} would be blank</span>
              )}
            </div>
          </div>
        </div>
      )}

      {data && data.sections.length > 0 && exams.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            {(["done", "partial", "empty"] as State[]).map((st) => {
              const { Icon, word, cell } = STATE_STYLE[st];
              return (
                <span key={st} className="inline-flex items-center gap-1">
                  <Icon className={"h-3.5 w-3.5 " + cell.split(" ").find((c) => c.startsWith("text-"))} />
                  {word}
                </span>
              );
            })}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={attentionFirst}
              onChange={(e) => setAttentionFirst(e.target.checked)}
            />
            Most unmarked first
          </label>
        </div>
      )}

      {loading && !data ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : data && exams.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No papers in {data.term?.name ?? "this term"} yet.
        </p>
      ) : data && data.sections.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No sections to show.
        </p>
      ) : data ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-semibold text-slate-700">Section</th>
                {exams.map((e) => (
                  <th key={e.id} className="px-2 py-2 font-semibold text-slate-700">{shortExam(e.name)}</th>
                ))}
                <th className="px-3 py-2 font-semibold text-slate-700">Signed off</th>
                <th className="px-3 py-2 font-semibold text-slate-700">Report cards</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const openExamIdx = exams.findIndex((e) => open === `${r.sectionId}:${e.id}`);
                const openCell = openExamIdx >= 0 ? r.exams[openExamIdx] : null;
                return (
                  <Fragment key={r.sectionId}>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 align-top">
                        <span className="block font-medium text-slate-800">{r.label}</span>
                        <span className="block text-[11px] text-slate-500">{r.studentCount} students</span>
                      </td>
                      {r.exams.map((c, i) => {
                        const st = stateOf(c);
                        const style = STATE_STYLE[st];
                        const key = `${r.sectionId}:${exams[i].id}`;
                        const isOpen = open === key;
                        if (st === "none") {
                          return (
                            <td key={c.examId} className="px-2 py-2 align-top text-xs text-slate-300" title="No subject sits this paper here">
                              —
                            </td>
                          );
                        }
                        const pct = c.marksExpected ? Math.round((c.marksEntered / c.marksExpected) * 100) : 0;
                        return (
                          <td key={c.examId} className="px-2 py-2 align-top">
                            <button
                              type="button"
                              onClick={() => setOpen(isOpen ? null : key)}
                              aria-expanded={isOpen}
                              className={"w-full min-w-[110px] rounded-md border px-2 py-1.5 text-left transition-colors hover:brightness-95 " + style.cell}
                            >
                              <span className="flex items-center gap-1 text-xs font-semibold">
                                <style.Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="tabular-nums">{c.subjectsDone}/{c.subjectCount}</span>
                                <span className="font-normal opacity-80">subjects</span>
                                {isOpen
                                  ? <ChevronDown className="ms-auto h-3 w-3" />
                                  : <ChevronRight className="ms-auto h-3 w-3" />}
                              </span>
                              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/70">
                                <span className={"block h-full " + style.bar} style={{ width: `${pct}%` }} />
                              </span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 align-top">
                        {r.signOffNeeded === 0 ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <span className={
                            "inline-flex items-center gap-1 text-xs font-medium tabular-nums " +
                            (r.signedOff === r.signOffNeeded ? "text-emerald-700" : "text-slate-600")
                          }>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {r.signedOff}/{r.signOffNeeded}
                          </span>
                        )}
                      </td>
                      {/* "Can I see that everyone has finalized" (24 Sep).
                          Finalized is the gate for results day; a blank
                          card (a child with no marks) is called out
                          because publishing one helps nobody. */}
                      <td className="px-3 py-2 align-top">
                        {r.finalized === undefined ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className={
                              "inline-flex items-center gap-1 text-xs font-medium tabular-nums " +
                              (r.finalized === r.studentCount && r.studentCount > 0
                                ? "text-emerald-700"
                                : r.finalized === 0 ? "text-slate-500" : "text-amber-700")
                            }>
                              {r.finalized === r.studentCount && r.studentCount > 0
                                ? <CheckCircle2 className="h-3.5 w-3.5" />
                                : <CircleDot className="h-3.5 w-3.5" />}
                              {r.finalized}/{r.studentCount} finalized
                            </span>
                            {(r.published ?? 0) > 0 && (
                              <span className="text-[11px] text-emerald-700">{r.published} published</span>
                            )}
                            {(r.unmarked ?? 0) > 0 && (r.finalized ?? 0) > 0 && (
                              <span className="text-[11px] text-rose-600">
                                {r.unmarked} would be blank
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {openCell && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={exams.length + 3} className="px-3 py-2.5">
                          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {r.label} · {shortExam(exams[openExamIdx].name)}
                          </div>
                          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {openCell.subjects.map((sub) => (
                              <li key={sub.subjectId}>
                                <Link
                                  to={`/school/orgs/${orgId}/admin/assessment/exams/${exams[openExamIdx].id}/marks?sectionId=${r.sectionId}`}
                                  className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white"
                                >
                                  {sub.done
                                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    : sub.marked === 0
                                    ? <Circle className="h-4 w-4 shrink-0 text-rose-500" />
                                    : <CircleDot className="h-4 w-4 shrink-0 text-amber-600" />}
                                  <span className="min-w-0 flex-1 truncate text-slate-800">{sub.subjectName}</span>
                                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                                    {sub.done ? "done" : sub.marked === 0 ? "not started" : `${sub.marked} of ${r.studentCount}`}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.sections.length > 0 && (
        <p className="text-xs text-slate-500">
          Hifz is marked on its own paper and is not counted here. A “—” means no
          subject in that section sits that paper — Classes IX and X have no oral.
        </p>
      )}
    </div>
  );
}

export default MarkingProgress;
