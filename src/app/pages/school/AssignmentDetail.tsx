// AssignmentDetail — view an assignment and grade every student in its
// section in one editable table. "Save grades" batches dirty rows.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { HeroCard, KpiTile, cardBase, cardElev } from "../../components/school-ui";
import {
  addQuizQuestion,
  deleteAssignment,
  deleteQuizQuestion,
  getAssignment,
  listQuizQuestions,
  updateQuizQuestion,
  type QuizQuestion,
  getAssignmentGrades,
  getSchoolMe,
  isOrgAdmin,
  listAssignmentSubmissions,
  listStudents,
  postGradesBatch,
  reviewSubmission,
  type AssignmentSubmissionRow,
  type AssignmentSubmissionsResponse,
  type AdminStudent,
  type Assignment,
  type GradeBatchEntry,
  type GradeEntry,
  type GradeStatus,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { KindChip } from "./SectionAssignmentsList";

interface Row {
  studentId: string;
  studentName: string;
  grNumber: string;
  score: string; // text for input
  status: GradeStatus;
  feedback: string;
  existingId: string | null;
  dirty: boolean;
}

const STATUS_OPTIONS: GradeStatus[] = ["graded", "missing", "excused", "late"];

export function AssignmentDetail() {
  const { orgId = "", assignmentId = "" } = useParams();
  // ?studentId= — arriving from a student's profile/gradebook keeps that
  // context: a banner names the student and their row is highlighted
  // (pilot: "it shows me the assignment without specifying which student").
  const [searchParams] = useSearchParams();
  const focusStudentId = searchParams.get("studentId") ?? "";
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const load = async () => {
    if (!orgId || !assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const a = await getAssignment(orgId, assignmentId);
      setAssignment(a);
      const [students, gradesResp] = await Promise.all([
        listStudents(orgId, { classSectionId: a.class_section_id }),
        getAssignmentGrades(orgId, assignmentId),
      ]);
      const byStudent: Record<string, GradeEntry> = {};
      for (const g of gradesResp.grades) byStudent[g.student_id] = g;
      setRows(
        students.map((s: AdminStudent) => {
          const g = byStudent[s.id];
          return {
            studentId: s.id,
            studentName: s.full_name,
            grNumber: s.gr_number,
            score: g?.score != null ? String(g.score) : "",
            status: (g?.status as GradeStatus) ?? "graded",
            feedback: g?.feedback ?? "",
            existingId: g?.id ?? null,
            dirty: false,
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, assignmentId]);

  const stats = useMemo(() => {
    if (!assignment) return { avg: null as number | null, median: null as number | null, graded: 0, missing: 0 };
    const scored = rows
      .filter((r) => r.status === "graded" && r.score !== "")
      .map((r) => Number(r.score))
      .filter((n) => !Number.isNaN(n));
    const missing = rows.filter((r) => r.status === "missing").length;
    if (scored.length === 0) return { avg: null, median: null, graded: 0, missing };
    const avg = scored.reduce((s, n) => s + n, 0) / scored.length;
    const sorted = [...scored].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { avg, median, graded: scored.length, missing };
  }, [rows, assignment]);

  if (meLoading) return null;
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !assignment) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error || "Assignment not found"}
        </div>
        <Link to="/school"><Button variant="outline" size="sm">← Back</Button></Link>
      </div>
    );
  }

  const admin = isOrgAdmin(me, orgId);
  const canEdit = admin || (!!me?.userId && assignment.created_by === me.userId);

  const markDirty = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)));
  };

  const handleSaveAll = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length === 0) {
      toast.message("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const entries: GradeBatchEntry[] = dirty.map((r) => ({
        studentId: r.studentId,
        score: r.status === "graded" && r.score !== "" ? Number(r.score) : null,
        status: r.status,
        feedback: r.feedback || undefined,
      }));
      const res = await postGradesBatch(orgId, assignmentId, entries);
      if (res.failed > 0) {
        toast.error(`Saved with ${res.failed} failure${res.failed === 1 ? "" : "s"}`);
      } else {
        toast.success(`Saved ${res.inserted + res.updated} grade${res.inserted + res.updated === 1 ? "" : "s"}`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete assignment "${assignment.title}"? All grades will be removed.`)) return;
    try {
      await deleteAssignment(orgId, assignmentId);
      toast.success("Assignment deleted");
      window.history.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const backLink = `/school/orgs/${orgId}/sections/${assignment.class_section_id}/assignments`;

  return (
    <div className="space-y-4">
      <HeroCard
        title={assignment.title}
        subtitle={
          [
            assignment.assigned_date && `Assigned ${assignment.assigned_date}`,
            assignment.due_date && `Due ${assignment.due_date}`,
            // Surface the friendly preset names where they match, fall
            // back to "Weight 1.5×" for custom values. Keeps the detail
            // page consistent with the new composer vocabulary.
            assignment.weight === 1 ? "Small (counts 1×)"
              : assignment.weight === 2 ? "Medium (counts 2×)"
              : assignment.weight === 3 ? "Big (counts 3×)"
              : `Counts ${assignment.weight}×`,
            assignment.related_topic && `Topic: ${assignment.related_topic}`,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <KindChip kind={assignment.kind} />
            <span className="inline-flex items-center rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs text-white">
              Max <b className="ml-1">{assignment.max_score}</b>
            </span>
            <Link to={backLink}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Assignments</Button>
            </Link>
            {canEdit && (
              <>
                <Link to={`/school/orgs/${orgId}/assignments/${assignmentId}/edit`}>
                  <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={handleDelete} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-300" /> Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      {focusStudentId && (() => {
        const focusRow = rows.find((r) => r.studentId === focusStudentId);
        return focusRow ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            Viewing for <span className="font-semibold">{focusRow.studentName}</span>
            {focusRow.grNumber ? ` (GR ${focusRow.grNumber})` : ""} — their row is highlighted below.
          </div>
        ) : null;
      })()}

      {assignment.description && (
        <Card className={`${cardBase} ${cardElev}`}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Description</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{assignment.description}</p>
          </CardContent>
        </Card>
      )}

      {(assignment.videoUrl || assignment.audioUrl || (assignment.attachments ?? []).length > 0) && (
        <Card className={`${cardBase} ${cardElev}`}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Materials</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {assignment.videoUrl && (
              <a href={assignment.videoUrl} target="_blank" rel="noreferrer" className="block text-sm text-indigo-600 hover:underline">
                ▶ Video
              </a>
            )}
            {assignment.audioUrl && (
              <a href={assignment.audioUrl} target="_blank" rel="noreferrer" className="block text-sm text-indigo-600 hover:underline">
                🎧 Audio
              </a>
            )}
            {(assignment.attachments ?? []).map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block text-sm text-indigo-600 hover:underline">
                📎 {a.label || "Attachment"}
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          variant="light"
          icon={TrendingUp}
          label="Average"
          value={stats.avg != null ? stats.avg.toFixed(1) : null}
          hint={stats.avg != null ? `out of ${assignment.max_score}` : undefined}
        />
        <KpiTile
          variant="light"
          icon={BarChart3}
          label="Median"
          value={stats.median != null ? stats.median.toFixed(1) : null}
        />
        <KpiTile
          variant="light"
          icon={ListChecks}
          label="Graded"
          value={stats.graded}
        />
        <KpiTile
          variant="light"
          icon={AlertTriangle}
          label="Missing"
          value={stats.missing}
        />
      </div>

      <Card className={`${cardBase} ${cardElev}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Grades</CardTitle>
          <Button size="sm" onClick={handleSaveAll} disabled={saving || !rows.some((r) => r.dirty)}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save grades"}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No students in this section.</p>
          ) : (
            <>
              {/* Phones: card per student. The 5-column table squeezed the
                  score input to ~1 digit on a 375px screen (pilot bug). */}
              <div className="sm:hidden divide-y">
                {rows.map((r, idx) => (
                  <div key={r.studentId} className={"px-3 py-2.5 " + (r.studentId === focusStudentId ? "bg-indigo-50 ring-1 ring-inset ring-indigo-300 " : "") + (r.dirty ? "bg-amber-50/40" : "")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">{r.studentName}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{r.grNumber}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max={assignment.max_score}
                        value={r.score}
                        disabled={r.status !== "graded"}
                        onChange={(e) => markDirty(idx, { score: e.target.value })}
                        className="h-9 w-24 text-center tabular-nums"
                        placeholder={`/ ${assignment.max_score}`}
                      />
                      <Select
                        value={r.status}
                        onValueChange={(v) => markDirty(idx, { status: v as GradeStatus })}
                      >
                        <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(r.feedback || r.dirty) && (
                      <Textarea
                        rows={1}
                        value={r.feedback}
                        onChange={(e) => markDirty(idx, { feedback: e.target.value })}
                        className="mt-1.5 min-h-[32px] text-xs"
                        placeholder="Feedback (optional)"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: the original table. */}
              <table className="hidden w-full text-sm sm:table">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">GR#</th>
                    <th className="px-3 py-2 w-32">Score</th>
                    <th className="px-3 py-2 w-36">Status</th>
                    <th className="px-3 py-2">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.studentId} className={"border-t " + (r.studentId === focusStudentId ? "bg-indigo-50 " : "") + (r.dirty ? "bg-amber-50/40" : "")}>
                      <td className="px-3 py-2 font-medium">{r.studentName}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{r.grNumber}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          max={assignment.max_score}
                          value={r.score}
                          disabled={r.status !== "graded"}
                          onChange={(e) => markDirty(idx, { score: e.target.value })}
                          className="h-8 w-24 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={r.status}
                          onValueChange={(v) => markDirty(idx, { status: v as GradeStatus })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Textarea
                          rows={1}
                          value={r.feedback}
                          onChange={(e) => markDirty(idx, { feedback: e.target.value })}
                          className="min-h-[32px] text-xs"
                          placeholder="optional"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Digital hand-ins (pilot 2026-09-02): what students submitted from
          the portal, plus who hasn't — grade with the photo right there. */}
      {/* Quiz engine (pilot 2026-09-02): MCQs students answer in the
          portal, auto-scored into the gradebook. Shown for quiz/test
          kinds — other kinds stay file-hand-in only. */}
      {(assignment.kind === "quiz" || assignment.kind === "test") && (
        <QuizPanel orgId={orgId} assignmentId={assignmentId} />
      )}

      <SubmissionsPanel orgId={orgId} assignmentId={assignmentId} />
    </div>
  );
}

function SubmissionsPanel({ orgId, assignmentId }: { orgId: string; assignmentId: string }) {
  const [data, setData] = useState<AssignmentSubmissionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!orgId || !assignmentId) return;
    listAssignmentSubmissions(orgId, assignmentId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load submissions"));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, assignmentId]);

  const toggleReviewed = async (row: AssignmentSubmissionRow) => {
    try {
      await reviewSubmission(orgId, row.id, !row.reviewedAt);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
  };

  if (error) return null; // e.g. visiting teacher without access — hide quietly
  if (!data) return null;
  if (data.submissions.length === 0 && data.notSubmitted.length === data.studentsTotal) {
    // Nothing submitted yet — show a slim hint instead of an empty table.
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Digital hand-ins</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-500">
          No submissions yet. Students (and parents) can send photos/PDFs of this
          work from the portal's Homework tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Digital hand-ins
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
            {data.submissions.length} / {data.studentsTotal}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <ul className="divide-y divide-slate-100">
          {data.submissions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {s.studentName}
                  {s.grNumber && (
                    <span className="ml-1.5 text-xs font-normal text-slate-500">GR {s.grNumber}</span>
                  )}
                  {s.submittedVia === "parent" && (
                    <span className="ml-1.5 text-[10px] text-slate-400">via parent</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(s.submittedAt).toLocaleString()}
                </p>
                {s.attachments.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.attachments.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                      >
                        <ListChecks className="h-3 w-3" />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}
                {s.note && (
                  <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{s.note}</p>
                )}
              </div>
              <Button
                variant={s.reviewedAt ? "outline" : "default"}
                size="sm"
                onClick={() => void toggleReviewed(s)}
              >
                {s.reviewedAt ? "Seen ✓" : "Mark seen"}
              </Button>
            </li>
          ))}
        </ul>
        {data.notSubmitted.length > 0 && (
          <p className="text-xs text-slate-500">
            <span className="font-medium text-amber-700">
              Not submitted ({data.notSubmitted.length}):
            </span>{" "}
            {data.notSubmitted.map((s) => s.fullName).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}


function QuizPanel({ orgId, assignmentId }: { orgId: string; assignmentId: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Draft form (shared by add + edit).
  const [editing, setEditing] = useState<QuizQuestion | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    listQuizQuestions(orgId, assignmentId)
      .then((r) => setQuestions(r.questions))
      .catch(() => setQuestions([]))
      .finally(() => setLoaded(true));
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, assignmentId]);

  const openAdd = () => {
    setEditing(null);
    setPrompt("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setFormOpen(true);
  };
  const openEdit = (q: QuizQuestion) => {
    setEditing(q);
    setPrompt(q.prompt);
    setOptions([...q.options]);
    setCorrectIndex(q.correctIndex);
    setFormOpen(true);
  };
  const save = async () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim() || opts.length < 2) {
      toast.error("Write the question and at least 2 options.");
      return;
    }
    if (correctIndex >= opts.length) {
      toast.error("Pick which option is correct.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateQuizQuestion(orgId, editing.id, { prompt: prompt.trim(), options: opts, correctIndex });
      } else {
        await addQuizQuestion(orgId, assignmentId, { prompt: prompt.trim(), options: opts, correctIndex });
      }
      setFormOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (q: QuizQuestion) => {
    if (!confirm("Delete this question?")) return;
    try {
      await deleteQuizQuestion(orgId, q.id);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            Quiz questions
            <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
              {questions.length}
            </span>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={openAdd}>+ Add question</Button>
        </div>
        <p className="text-xs text-slate-500">
          Students answer these in the portal; the attempt is auto-scored out of
          this assignment's max marks and lands in the gradebook — no marking needed.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {questions.length === 0 && !formOpen && (
          <p className="text-sm text-slate-500">
            No questions yet — add at least one and the portal shows a "Take quiz" button.
          </p>
        )}
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-slate-200 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{i + 1}. {q.prompt}</p>
              <div className="flex gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(q)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
              </div>
            </div>
            <ul className="mt-1 space-y-0.5">
              {q.options.map((o, j) => (
                <li key={j} className={"text-xs " + (j === q.correctIndex ? "font-semibold text-emerald-700" : "text-slate-600")}>
                  {String.fromCharCode(65 + j)}. {o} {j === q.correctIndex ? "✓" : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {formOpen && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Question — e.g. What is 7 × 8?"
              className="bg-white"
            />
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="quiz-correct"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                  title="Mark as the correct answer"
                />
                <Input
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="bg-white"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="text-xs text-rose-600 hover:underline"
                    onClick={() => {
                      setOptions((prev) => prev.filter((_, j) => j !== i));
                      if (correctIndex === i) setCorrectIndex(0);
                      else if (correctIndex > i) setCorrectIndex(correctIndex - 1);
                    }}
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              {options.length < 6 && (
                <Button variant="ghost" size="sm" onClick={() => setOptions((p) => [...p, ""])}>
                  + Option
                </Button>
              )}
              <span className="text-[11px] text-slate-500">Tick the radio next to the correct answer.</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save question" : "Add question"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
