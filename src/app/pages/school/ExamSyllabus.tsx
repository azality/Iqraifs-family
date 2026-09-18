// ExamSyllabus — the per-child exam portion for Hifz (مقدارِ خواندگی).
//
// The school's half-yearly Hifz paper asks three questions out of each
// child's OWN memorized portion, so every slip needs a different
// syllabus line. Until now a teacher wrote all ~84 of them by hand into
// the children's diaries before each exam (Ambreen, 17 Sep).
//
// This page proposes every line from what the child has actually been
// heard on, shows the whole section at once so nothing is clicked one
// student at a time, and publishes the reviewed set to the parents'
// portal — which is what retires the handwritten notice.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, BookMarked, Check, RotateCcw, Send, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin, listClasses, listTerms, listExams,
  getExamSyllabus, saveExamSyllabusLine, publishExamSyllabus, setHifzBaseline,
  type AdminClass, type SchoolMeResponse, type ExamSyllabusRow,
  type AcademicTerm, type Exam,
} from "../../../utils/schoolApi";
import { NoAccessRedirect, sectionTitleClasses } from "../../components/school-ui";
import { parseParaList, formatParaList } from "../../../utils/paraRanges";

const TRACK_LABEL: Record<string, string> = {
  hifz: "Hifz", nazra: "Nazra", qaida: "Qaida", revision: "Revision",
};
const TRACK_CLASS: Record<string, string> = {
  hifz: "bg-indigo-100 text-indigo-700 border-indigo-200",
  nazra: "bg-teal-100 text-teal-700 border-teal-200",
  qaida: "bg-orange-100 text-orange-700 border-orange-200",
  revision: "bg-violet-100 text-violet-700 border-violet-200",
};

export function ExamSyllabus() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [params] = useSearchParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState(params.get("examId") ?? "");
  const [sectionId, setSectionId] = useState(params.get("sectionId") ?? "");
  const [rows, setRows] = useState<ExamSyllabusRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [baseDraft, setBaseDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  // Every exam the school has, across all terms, newest first.
  //
  // This page used to ask for a term before it would show an exam, which
  // is a question with no answer for Hifz: Hifz sits two exams a year,
  // the half-yearly and the annual, and neither is "2nd Assessment" —
  // that is the name of a term the main school uses (Muneeb, 18 Sep).
  // Picking the paper by its own name and date asks nothing of anyone.
  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listTerms(orgId)
      .then(async (r) => {
        const lists = await Promise.all(
          r.terms.map((t) =>
            listExams(orgId, t.id).then((x) => x.exams).catch(() => []),
          ),
        );
        const all = lists.flat().filter((e) => !e.archivedAt);
        all.sort((a, b) => (b.examDate ?? "").localeCompare(a.examDate ?? ""));
        setExams(all);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Hifz sections lead the picker — this page exists for them, though the
  // model is generic enough for any class whose children sit different
  // portions.
  const sectionOptions = useMemo(() => {
    const hifz: Array<{ id: string; label: string }> = [];
    const rest: Array<{ id: string; label: string }> = [];
    for (const c of classes) {
      for (const s of c.sections ?? []) {
        const entry = { id: s.id, label: `${c.name} — ${s.name}` };
        (c.kind === "hifz" ? hifz : rest).push(entry);
      }
    }
    return [...hifz, ...rest];
  }, [classes]);

  const load = () => {
    if (!orgId || !examId || !sectionId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    getExamSyllabus(orgId, examId, sectionId)
      .then((r) => {
        setRows(r.rows);
        setDraft(Object.fromEntries(r.rows.map((x) => [x.studentId, x.portion])));
        setBaseDraft(Object.fromEntries(
          r.rows.map((x) => [x.studentId, formatParaList(x.baselineParas)]),
        ));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [orgId, examId, sectionId]);

  const anyPublished = rows.some((r) => r.publishedAt);

  const saveLine = async (row: ExamSyllabusRow) => {
    const next = (draft[row.studentId] ?? "").trim();
    if (!next || next === row.portion) return;
    try {
      await saveExamSyllabusLine(orgId, examId, row.studentId, next);
      setRows((rs) => rs.map((r) =>
        r.studentId === row.studentId ? { ...r, portion: next, source: "edited", saved: true } : r));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setDraft((d) => ({ ...d, [row.studentId]: row.portion }));
    }
  };

  // Saving a baseline re-proposes that child's line, so the whole row is
  // reloaded rather than patched locally — the proposal is the server's
  // to compute, not ours to guess.
  const saveBaseline = async (row: ExamSyllabusRow) => {
    const text = baseDraft[row.studentId] ?? "";
    if (text.trim() === formatParaList(row.baselineParas)) return;
    const paras = parseParaList(text);
    if (paras === null) {
      toast.error("Use para numbers like \"1-10, 30\".");
      setBaseDraft((d) => ({ ...d, [row.studentId]: formatParaList(row.baselineParas) }));
      return;
    }
    try {
      await setHifzBaseline(orgId, row.studentId, paras.length ? paras : null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBaseDraft((d) => ({ ...d, [row.studentId]: formatParaList(row.baselineParas) }));
    }
  };

  const doPublish = async (unpublish: boolean) => {
    setBusy(true);
    try {
      const r = await publishExamSyllabus(orgId, examId, sectionId, unpublish);
      if (unpublish) toast.success("Unpublished — parents no longer see these portions.");
      else {
        toast.success(`Published ${r.published} portion${r.published === 1 ? "" : "s"} to parents.`);
        if (r.missing && r.missing.length > 0) {
          toast.warning(`${r.missing.length} child(ren) had nothing to publish: ${r.missing.map((m) => m.name).join(", ")}`);
        }
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin
          </Button>
        </Link>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>
          <BookMarked className="mr-2 inline h-5 w-5 text-indigo-600" />
          Exam syllabus per child
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Hifz children are examined on their own memorized portion, so each slip
          carries its own syllabus line. Every line below is proposed from what the
          child has actually been heard on — review, correct anything that is off,
          then publish so parents see it in the portal.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-slate-500">Exam</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger className="h-9 w-72 text-sm"><SelectValue placeholder="Pick an exam" /></SelectTrigger>
            <SelectContent>
              {exams.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-500">No exams yet.</div>}
              {exams.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                  {e.examDate
                    ? ` · ${new Date(e.examDate + "T00:00:00").toLocaleDateString(undefined, {
                        day: "numeric", month: "short", year: "numeric",
                      })}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Section</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder="Pick a section" /></SelectTrigger>
            <SelectContent>
              {sectionOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rows.length > 0 && (
          <div className="ms-auto flex items-center gap-2">
            {anyPublished ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <Check className="h-3 w-3" /> Published to parents
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void doPublish(true)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Unpublish to edit
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void doPublish(false)}>
                <Send className="h-3.5 w-3.5 mr-1" /> Publish to parents
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!examId || !sectionId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm italic text-slate-500">
          Pick an exam and a section to review each child&apos;s portion.
        </div>
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No active students in this section.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">Student</th>
                <th className="px-3 py-2 text-start font-semibold">Track</th>
                <th className="px-3 py-2 text-start font-semibold">
                  Before the system
                  <span className="block font-normal normal-case tracking-normal text-[10px] text-slate-400">
                    paras already memorized
                  </span>
                </th>
                <th className="px-3 py-2 text-start font-semibold">Syllabus — مقدارِ خواندگی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const value = draft[r.studentId] ?? "";
                const changed = value.trim() !== r.portion;
                return (
                  <tr key={r.studentId} className="align-middle">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.studentName}</div>
                      <div className="text-[11px] text-slate-400">
                        GR {r.grNumber ?? "—"} · {r.entriesLogged} entr{r.entriesLogged === 1 ? "y" : "ies"} logged
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                        (TRACK_CLASS[r.track ?? ""] ?? "bg-slate-100 text-slate-600 border-slate-200")
                      }>
                        {TRACK_LABEL[r.track ?? ""] ?? "—"}
                      </span>
                      {r.trackInferred && (
                        <div className="mt-0.5 text-[10px] text-amber-600">assumed</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={baseDraft[r.studentId] ?? ""}
                        disabled={!!r.publishedAt}
                        placeholder="e.g. 1-10, 30"
                        dir="ltr"
                        onChange={(e) => setBaseDraft((d) => ({ ...d, [r.studentId]: e.target.value }))}
                        onBlur={() => void saveBaseline(r)}
                        className="h-9 w-32 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={value}
                          disabled={!!r.publishedAt}
                          dir="auto"
                          placeholder={r.proposed || "Type this child's portion"}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.studentId]: e.target.value }))}
                          onBlur={() => void saveLine(r)}
                          className="h-9 text-sm"
                        />
                        {r.publishedAt ? (
                          <Lock className="h-3.5 w-3.5 flex-none text-slate-400" />
                        ) : changed ? (
                          <span className="flex-none text-[10px] font-bold text-amber-600">unsaved</span>
                        ) : r.source === "edited" ? (
                          <Check className="h-3.5 w-3.5 flex-none text-emerald-500" />
                        ) : (
                          <span className="flex-none text-[10px] text-slate-400">proposed</span>
                        )}
                      </div>
                      {!r.publishedAt && r.proposed && value.trim() !== r.proposed && (
                        <button
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, [r.studentId]: r.proposed }))}
                          className="mt-1 text-[10.5px] text-indigo-600 hover:underline"
                        >
                          Reset to proposed: {r.proposed}
                        </button>
                      )}
                      {!r.proposed && r.entriesLogged === 0 && (
                        <div className="mt-1 text-[10.5px] text-amber-600">
                          Nothing logged for this child yet — type the portion by hand.
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ExamSyllabus;
