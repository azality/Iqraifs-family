// ManageAssessment — admin manages academic terms + exams in each term.
//
// Term 1 of the new report-card pipeline. Once terms + exams exist,
// MarksEntry lets teachers fill the gradebook-style sheet per exam per
// section. The next PR will lay term_report_card on top to attach
// teacher/principal comments + a finalize+publish flow.

import { useEffect, useState } from "react";
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
  getExamSchedule,
  type AcademicTerm, type Exam, type ExamType, type SchoolMeResponse,
  type ExamScheduleResponse,
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

      {/* Published written datesheet — the document parents see in the
          portal, laid out the way the school printed it. Read-only for
          now; seeded by scripts/seed-assessment-datesheet.ts. */}
      <ExamDatesheetGrid orgId={orgId} />

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

/** Read-only datesheet grid — dates down, classes across, exactly the
 *  shape of the school's printed timetable so the office can eyeball
 *  that what parents see matches the document they published. */
function ExamDatesheetGrid({ orgId }: { orgId: string }) {
  const [data, setData] = useState<ExamScheduleResponse | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getExamSchedule(orgId).then(setData).catch(() => setData(null));
  }, [orgId]);

  if (!data || data.classes.length === 0) return null;

  const byClassDate = new Map<string, string>();
  for (const c of data.classes) {
    for (const p of c.papers) byClassDate.set(`${c.classId}|${p.examDate}`, p.subjectLabel);
  }
  const timeFor = (date: string): string => {
    for (const c of data.classes) {
      const p = c.papers.find((x) => x.examDate === date);
      if (p?.startTime) return `${p.startTime}–${p.endTime ?? ""}`;
    }
    return "";
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Written datesheet
          {data.termName && <span className="ml-2 font-normal normal-case text-slate-500">{data.termName}</span>}
        </h2>
        <span className="text-xs text-slate-500">
          Parents and students see this in the portal under Timetable.
        </span>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Date</th>
                {data.classes.map((c) => (
                  <th key={c.classId} className="px-2 py-2">{c.className.replace(/^Class /, "")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.dates.map((d) => (
                <tr key={d} className="border-t border-slate-50">
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="text-[12.5px] font-semibold text-slate-800">
                      {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                    <div className="text-[10px] tabular-nums text-slate-400">{timeFor(d)}</div>
                  </td>
                  {data.classes.map((c) => {
                    const label = byClassDate.get(`${c.classId}|${d}`);
                    return (
                      <td key={c.classId} className="px-2 py-2">
                        {label ? (
                          <span className="text-[12px] font-medium text-slate-800">{label}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {data.instructions.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-[11.5px] leading-relaxed text-slate-500">
          {data.instructions.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}
    </section>
  );
}

export default ManageAssessment;
