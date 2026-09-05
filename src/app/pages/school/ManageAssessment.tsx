// ManageAssessment — admin manages academic terms + exams in each term.
//
// Term 1 of the new report-card pipeline. Once terms + exams exist,
// MarksEntry lets teachers fill the gradebook-style sheet per exam per
// section. The next PR will lay term_report_card on top to attach
// teacher/principal comments + a finalize+publish flow.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Plus, Pencil, Trash2, ClipboardList, Calendar } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin,
  listTerms, createTerm, updateTerm, archiveTerm,
  listExams, createExam, updateExam, archiveExam,
  getExamSchedule, listClasses,
  createExamPapers, updateExamPaper, deleteExamPaper, setExamInstructions,
  type AcademicTerm, type AdminClass, type Exam, type ExamType,
  type SchoolMeResponse, type ExamScheduleResponse, type ExamSchedulePaper,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  midterm: "Mid-term", final: "Final", test: "Test", quiz: "Quiz", other: "Other",
};

interface TermForm { name: string; startDate: string; endDate: string; isCurrent: boolean }
interface ExamForm { name: string; examType: ExamType; weight: string; examDate: string }
const emptyTerm: TermForm = { name: "", startDate: "", endDate: "", isCurrent: false };
const emptyExam: ExamForm = { name: "", examType: "midterm", weight: "1", examDate: "" };

export function ManageAssessment() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [search, setSearch] = useSearchParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedTermId = search.get("term") || "";
  const setSelectedTermId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("term", id); else next.delete("term");
    setSearch(next);
  };

  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [termForm, setTermForm] = useState<TermForm>(emptyTerm);

  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [examForm, setExamForm] = useState<ExamForm>(emptyExam);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refreshTerms = () => {
    if (!orgId) return;
    listTerms(orgId).then((r) => {
      setTerms(r.terms);
      // Auto-select the current term on first load.
      if (!selectedTermId && r.terms.length > 0) {
        const cur = r.terms.find((t) => t.isCurrent) ?? r.terms[0];
        setSelectedTermId(cur.id);
      }
    }).catch(() => {});
  };
  const refreshExams = () => {
    if (!orgId || !selectedTermId) { setExams([]); return; }
    listExams(orgId, selectedTermId).then((r) => setExams(r.exams)).catch(() => setExams([]));
  };
  useEffect(refreshTerms, [orgId]);
  useEffect(refreshExams, [orgId, selectedTermId]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  const openAddTerm = () => { setEditingTerm(null); setTermForm(emptyTerm); setTermDialogOpen(true); };
  const openEditTerm = (t: AcademicTerm) => {
    setEditingTerm(t);
    setTermForm({ name: t.name, startDate: t.startDate, endDate: t.endDate, isCurrent: t.isCurrent });
    setTermDialogOpen(true);
  };
  const saveTerm = async () => {
    try {
      if (editingTerm) {
        await updateTerm(orgId, editingTerm.id, termForm);
      } else {
        await createTerm(orgId, termForm);
      }
      setTermDialogOpen(false); setError(null); refreshTerms();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const handleArchiveTerm = async (t: AcademicTerm) => {
    if (!confirm(`Archive "${t.name}"? Exams + scores under it stay readable.`)) return;
    try { await archiveTerm(orgId, t.id); refreshTerms(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const openAddExam = () => { setEditingExam(null); setExamForm(emptyExam); setExamDialogOpen(true); };
  const openEditExam = (ex: Exam) => {
    setEditingExam(ex);
    setExamForm({
      name: ex.name, examType: ex.examType,
      weight: String(ex.weight), examDate: ex.examDate ?? "",
    });
    setExamDialogOpen(true);
  };
  const saveExam = async () => {
    if (!selectedTermId) return;
    try {
      const body = {
        name: examForm.name.trim(),
        examType: examForm.examType,
        weight: Number(examForm.weight),
        examDate: examForm.examDate || null,
      };
      if (editingExam) await updateExam(orgId, editingExam.id, body);
      else await createExam(orgId, selectedTermId, body);
      setExamDialogOpen(false); setError(null); refreshExams();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const handleArchiveExam = async (ex: Exam) => {
    if (!confirm(`Archive "${ex.name}"? Scores remain queryable.`)) return;
    try { await archiveExam(orgId, ex.id); refreshExams(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin
          </Button>
        </Link>
        <Link to={`/school/orgs/${orgId}/admin/assessment/grade-scales`}>
          <Button variant="outline" size="sm">Grade scales →</Button>
        </Link>
      </div>
      <div>
        <h1 className={sectionTitleClasses}>Assessment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Define terms and the exams in each term. Teachers enter marks per exam
          from the section gradebook. Report cards (next) will aggregate these
          alongside attendance, behavior, and Hifz.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Written datesheet — the document parents see in the portal,
          laid out the way the school printed it, and editable here by
          any school's own admin (no seed script required). */}
      <ExamDatesheetGrid orgId={orgId} termId={selectedTermId} />

      {/* Terms */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Terms</h2>
          <Button size="sm" onClick={openAddTerm}><Plus className="h-4 w-4 mr-1" /> Add term</Button>
        </div>
        {terms.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-slate-500 italic">
            No terms yet. Add Term 1, Term 2, Term 3 (or whatever your school uses).
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {terms.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTermId(t.id)}
                className={
                  "text-left rounded-lg border p-3 transition " +
                  (t.id === selectedTermId
                    ? "border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/50"
                    : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900 text-sm">
                    {t.name}
                    {t.isCurrent && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600 text-white text-[10px] font-medium px-2 py-0.5">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); openEditTerm(t); }}
                      className="opacity-50 hover:opacity-100 p-1"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleArchiveTerm(t); }}
                      className="opacity-50 hover:opacity-100 p-1 text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {t.startDate} → {t.endDate}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Exams for selected term */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Exams {selectedTermId && terms.find((t) => t.id === selectedTermId) && (
              <span className="text-slate-400 font-normal normal-case ml-1">
                · {terms.find((t) => t.id === selectedTermId)!.name}
              </span>
            )}
          </h2>
          <Button size="sm" onClick={openAddExam} disabled={!selectedTermId}>
            <Plus className="h-4 w-4 mr-1" /> Add exam
          </Button>
        </div>
        {!selectedTermId ? (
          <Card><CardContent className="p-4 text-sm text-slate-500 italic">
            Pick a term above to see its exams.
          </CardContent></Card>
        ) : exams.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-slate-500 italic">
            No exams in this term yet. Add Mid-term / Final / Monthly Test etc.
          </CardContent></Card>
        ) : (
          <div className="space-y-1.5">
            {exams.map((ex) => (
              <div key={ex.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm flex items-center flex-wrap gap-2">
                <ClipboardList className="h-4 w-4 text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">{ex.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {EXAM_TYPE_LABEL[ex.examType]} · weight {ex.weight}
                    {ex.examDate ? ` · ${ex.examDate}` : ""}
                  </div>
                </div>
                <Link to={`/school/orgs/${orgId}/admin/assessment/exams/${ex.id}/marks`}>
                  <Button size="sm" variant="outline" className="text-xs">Enter marks →</Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => openEditExam(ex)}>
                  <Pencil className="h-3.5 w-3.5 text-slate-600" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleArchiveExam(ex)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingTerm ? "Edit term" : "Add term"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label>
              <Input value={termForm.name} onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
                placeholder="Term 1" className="h-9 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Start</Label>
                <Input type="date" value={termForm.startDate}
                  onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })}
                  className="h-9 text-sm" /></div>
              <div><Label className="text-xs">End</Label>
                <Input type="date" value={termForm.endDate}
                  onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })}
                  className="h-9 text-sm" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={termForm.isCurrent}
                onChange={(e) => setTermForm({ ...termForm, isCurrent: e.target.checked })} />
              Mark as current term
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTerm}>{editingTerm ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={examDialogOpen} onOpenChange={setExamDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingExam ? "Edit exam" : "Add exam"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label>
              <Input value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                placeholder="Mid-term" className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Type</Label>
              <Select value={examForm.examType} onValueChange={(v) => setExamForm({ ...examForm, examType: v as ExamType })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXAM_TYPE_LABEL) as ExamType[]).map((k) => (
                    <SelectItem key={k} value={k}>{EXAM_TYPE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Weight</Label>
                <Input type="number" inputMode="decimal" step="0.1"
                  value={examForm.weight}
                  onChange={(e) => setExamForm({ ...examForm, weight: e.target.value })}
                  className="h-9 text-sm" /></div>
              <div><Label className="text-xs">Date</Label>
                <Input type="date" value={examForm.examDate}
                  onChange={(e) => setExamForm({ ...examForm, examDate: e.target.value })}
                  className="h-9 text-sm" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExamDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveExam}>{editingExam ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Editable datesheet — dates down, classes across, the shape of the
 *  school's printed timetable. Click any cell to set, change or clear
 *  that class's paper for that day; parents see the result in the
 *  portal under Timetable.
 *
 *  Before this existed the only way to publish a datesheet was a seed
 *  script run with the service-role key, which meant the next school we
 *  onboard could not publish one at all. Nothing here is specific to a
 *  single school's sheet: classes, dates and subject labels all come
 *  from the org's own data. */
function ExamDatesheetGrid({ orgId, termId }: { orgId: string; termId: string }) {
  const [data, setData] = useState<ExamScheduleResponse | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Cell editor. `paper` null = creating a new paper in that slot.
  const [cell, setCell] = useState<
    { classId: string; className: string; date: string; paper: ExamSchedulePaper | null } | null
  >(null);
  const [form, setForm] = useState({ subjectLabel: "", examDate: "", startTime: "", endTime: "", notes: "" });

  const [instrOpen, setInstrOpen] = useState(false);
  const [instrText, setInstrText] = useState("");

  const reload = () => {
    getExamSchedule(orgId, termId || undefined).then(setData).catch(() => setData(null));
  };
  useEffect(() => {
    if (!orgId) return;
    reload();
    listClasses(orgId).then(setClasses).catch(() => setClasses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, termId]);

  // Columns: every class that already has a paper, plus the org's other
  // classes so a school building its first datesheet has somewhere to
  // click. Sandbox is a QA fixture and never belongs on the sheet.
  const columns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of data?.classes ?? []) seen.set(c.classId, c.className);
    for (const c of classes) if (!seen.has(c.id) && c.name !== "Sandbox") seen.set(c.id, c.name);
    const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    const rank = (n: string) => {
      const m = /^Class\s+([IVX]+)$/i.exec(n.trim());
      return m ? (ROMAN[m[1].toUpperCase()] ?? 90) : 100;
    };
    return Array.from(seen, ([classId, className]) => ({ classId, className }))
      .sort((a, b) => rank(a.className) - rank(b.className) || a.className.localeCompare(b.className));
  }, [data, classes]);

  const paperAt = useMemo(() => {
    const m = new Map<string, ExamSchedulePaper>();
    for (const c of data?.classes ?? []) {
      for (const p of c.papers) m.set(`${c.classId}|${p.examDate}`, p);
    }
    return m;
  }, [data]);

  const openCell = (classId: string, className: string, date: string) => {
    const paper = paperAt.get(`${classId}|${date}`) ?? null;
    setCell({ classId, className, date, paper });
    setForm({
      subjectLabel: paper?.subjectLabel ?? "",
      examDate: paper?.examDate ?? date,
      startTime: paper?.startTime ?? "",
      endTime: paper?.endTime ?? "",
      notes: paper?.notes ?? "",
    });
    setErr(null);
  };

  const saveCell = async () => {
    if (!cell) return;
    if (!form.subjectLabel.trim()) { setErr("Enter the subject as it should appear to parents."); return; }
    if (!termId) { setErr("Pick a term first."); return; }
    setBusy(true); setErr(null);
    try {
      if (cell.paper) {
        await updateExamPaper(orgId, cell.paper.id, {
          subjectLabel: form.subjectLabel,
          examDate: form.examDate,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          notes: form.notes || null,
        });
      } else {
        await createExamPapers(orgId, [{
          termId, classId: cell.classId,
          subjectLabel: form.subjectLabel,
          examDate: form.examDate,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          notes: form.notes || null,
        }]);
      }
      setCell(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the paper.");
    } finally { setBusy(false); }
  };

  const removeCell = async () => {
    if (!cell?.paper) return;
    setBusy(true); setErr(null);
    try {
      await deleteExamPaper(orgId, cell.paper.id);
      setCell(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove the paper.");
    } finally { setBusy(false); }
  };

  const saveInstructions = async () => {
    if (!termId) return;
    setBusy(true); setErr(null);
    try {
      await setExamInstructions(orgId, termId, instrText.split("\n"));
      setInstrOpen(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the instructions.");
    } finally { setBusy(false); }
  };

  // Dates already on the sheet, plus one empty "add a day" slot so the
  // first paper of a brand-new datesheet has somewhere to go.
  const [extraDate, setExtraDate] = useState("");
  const dates = useMemo(() => {
    const set = new Set(data?.dates ?? []);
    if (extraDate) set.add(extraDate);
    return Array.from(set).sort();
  }, [data, extraDate]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Written datesheet
          {data?.termName && <span className="ml-2 font-normal normal-case text-slate-500">{data.termName}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Parents and students see this in the portal under Timetable.
          </span>
          <Button
            size="sm" variant="outline"
            onClick={() => { setInstrText((data?.instructions ?? []).join("\n")); setInstrOpen(true); }}
            disabled={!termId}
          >
            Instructions
          </Button>
        </div>
      </div>

      {!termId && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Choose a term above to build or edit its datesheet.
        </p>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Date</th>
                {columns.map((c) => (
                  <th key={c.classId} className="px-2 py-2">{c.className.replace(/^Class /, "")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d} className="border-t border-slate-50">
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="text-[12.5px] font-semibold text-slate-800">
                      {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                    <div className="text-[10px] tabular-nums text-slate-400">
                      {(() => {
                        for (const c of data?.classes ?? []) {
                          const p = c.papers.find((x) => x.examDate === d);
                          if (p?.startTime) return `${p.startTime}–${p.endTime ?? ""}`;
                        }
                        return "";
                      })()}
                    </div>
                  </td>
                  {columns.map((c) => {
                    const p = paperAt.get(`${c.classId}|${d}`);
                    return (
                      <td key={c.classId} className="px-1 py-1">
                        <button
                          type="button"
                          onClick={() => openCell(c.classId, c.className, d)}
                          disabled={!termId}
                          className={
                            "w-full rounded px-1.5 py-1 text-left text-[12px] transition-colors disabled:cursor-not-allowed " +
                            (p
                              ? "font-medium text-slate-800 hover:bg-indigo-50"
                              : "text-slate-300 hover:bg-slate-50 hover:text-slate-500")
                          }
                          aria-label={
                            p
                              ? `Edit ${c.className} paper on ${d}: ${p.subjectLabel}`
                              : `Add a ${c.className} paper on ${d}`
                          }
                        >
                          {p ? p.subjectLabel : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {dates.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-xs text-slate-500">
                    No papers yet. Add an exam day below, then click a cell to set each class's paper.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-slate-500">Add an exam day</Label>
        <Input
          type="date"
          value={extraDate}
          onChange={(e) => setExtraDate(e.target.value)}
          disabled={!termId}
          className="h-8 w-auto text-xs"
        />
        {extraDate && (
          <span className="text-[11px] text-slate-500">
            Now click a cell in that row to add the first paper.
          </span>
        )}
      </div>

      {(data?.instructions.length ?? 0) > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-[11.5px] leading-relaxed text-slate-500">
          {data!.instructions.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}

      {/* Cell editor */}
      <Dialog open={!!cell} onOpenChange={(o) => { if (!o) setCell(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {cell?.paper ? "Edit paper" : "Add paper"} — {cell?.className}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Subject, as parents should see it</Label>
              <Input
                value={form.subjectLabel}
                onChange={(e) => setForm({ ...form, subjectLabel: e.target.value })}
                placeholder="e.g. Mathematics"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.examDate}
                onChange={(e) => setForm({ ...form, examDate: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Start <span className="font-normal text-slate-400">(optional)</span></Label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End <span className="font-normal text-slate-400">(optional)</span></Label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note <span className="font-normal text-slate-400">(optional)</span></Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Bring geometry box"
              />
            </div>
            {err && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {cell?.paper ? (
              <Button variant="outline" onClick={removeCell} disabled={busy}
                className="text-rose-700 hover:bg-rose-50">
                <Trash2 className="mr-1 h-4 w-4" /> Remove
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCell(null)} disabled={busy}>Cancel</Button>
              <Button onClick={saveCell} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instructions editor */}
      <Dialog open={instrOpen} onOpenChange={setInstrOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Datesheet instructions</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              One instruction per line. These appear under the datesheet for
              parents and students — fee rules, timings, what to bring.
            </p>
            <textarea
              value={instrText}
              onChange={(e) => setInstrText(e.target.value)}
              rows={7}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={"Students must arrive on time with the required stationery.\nNo re-assessment will be conducted for absent students."}
            />
            {err && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstrOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveInstructions} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default ManageAssessment;
