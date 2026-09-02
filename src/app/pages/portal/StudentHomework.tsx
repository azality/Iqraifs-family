// StudentHomework — digital hand-in (pilot, 2026-09-02).
//
// Lists the section's assignments with due dates; the student (or a
// parent on their behalf) attaches photos/PDFs of the completed work and
// submits. Teachers see the hand-ins on the assignment page and can
// mark them as seen — the "Seen by teacher" tick closes the loop.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { HeroCard } from "../../components/school-ui";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  getMyQuiz,
  listMyAssignments,
  submitAssignmentWork,
  submitQuizAttempt,
  uploadSubmissionFile,
  type PortalAssignmentRow,
  type PortalQuizResponse,
  type SubmissionAttachment,
} from "../../../utils/schoolPortalApi";
import { BookOpen, Camera, CheckCircle2, Clock, FileText, Loader2, Paperclip } from "lucide-react";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const t = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return due < t;
}

function AssignmentCard({
  studentId,
  a,
  onChanged,
}: {
  studentId: string;
  a: PortalAssignmentRow;
  onChanged: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submitted = a.quiz ? a.quiz.taken : !!a.submission;
  const overdue = !submitted && isOverdue(a.dueDate);

  const doSubmit = async () => {
    if (files.length === 0 && !note.trim()) {
      toast.error("Attach a photo/PDF of your work (or write a note).");
      return;
    }
    setBusy(true);
    try {
      const attachments: SubmissionAttachment[] = [];
      for (const f of files) {
        attachments.push(await uploadSubmissionFile(studentId, f));
      }
      await submitAssignmentWork(studentId, a.id, {
        attachments,
        note: note.trim() || undefined,
      });
      toast.success("Homework submitted — your teacher can see it now.");
      setFiles([]);
      setNote("");
      setFormOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{a.title}</h3>
          <p className="text-xs text-slate-500">
            {a.subjectName ? `${a.subjectName} · ` : ""}
            {a.kind}
            {a.maxScore ? ` · ${a.maxScore} marks` : ""}
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium " +
            (submitted
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : overdue
                ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                : "bg-amber-50 text-amber-800 ring-1 ring-amber-200")
          }
        >
          {submitted ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> Submitted
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" /> Due {fmtDate(a.dueDate)}
              {overdue ? " · overdue" : ""}
            </>
          )}
        </span>
      </div>

      {a.description && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.description}</p>
      )}

      {a.grade && a.grade.score !== null && (
        <p className="text-sm font-medium text-indigo-700">
          Marked: {a.grade.score}
          {a.maxScore ? ` / ${a.maxScore}` : ""}
        </p>
      )}

      {a.submission && !a.quiz && (
        <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-2.5 space-y-1.5">
          <p className="text-xs text-emerald-800">
            Submitted {new Date(a.submission.submittedAt).toLocaleString()}
            {a.submission.reviewedAt ? " · Seen by teacher ✓" : " · Waiting for teacher"}
          </p>
          {a.submission.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.submission.attachments.map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
                >
                  <FileText className="h-3 w-3" />
                  {f.name}
                </a>
              ))}
            </div>
          )}
          {a.submission.note && (
            <p className="text-xs text-slate-600 whitespace-pre-wrap">{a.submission.note}</p>
          )}
        </div>
      )}

      {a.quiz && a.quiz.questionCount > 0 ? (
        <QuizBlock studentId={studentId} a={a} onChanged={onChanged} />
      ) : !formOpen ? (
        <Button
          variant={submitted ? "outline" : "default"}
          size="sm"
          onClick={() => setFormOpen(true)}
        >
          <Camera className="h-3.5 w-3.5 mr-1.5" />
          {submitted ? "Add more files" : "Submit my work"}
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, 5));
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Choose photo / PDF
          </Button>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-xs text-slate-700">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="text-rose-600 hover:underline flex-shrink-0 ml-2"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note for your teacher (optional)"
            className="bg-white"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void doSubmit()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…
                </>
              ) : (
                "Send to teacher"
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function StudentHomework() {
  const { studentId = "" } = useParams();
  const [rows, setRows] = useState<PortalAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!studentId) return;
    listMyAssignments(studentId)
      .then((r) => setRows(r.assignments))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load homework"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const isDone = (r: PortalAssignmentRow) => (r.quiz ? r.quiz.taken : !!r.submission);
  const pending = useMemo(() => rows.filter((r) => !isDone(r)), [rows]);
  const done = useMemo(() => rows.filter(isDone), [rows]);

  return (
    <div className="space-y-4">
      <HeroCard
        eyebrow="Homework"
        title="Homework"
        subtitle="Submit photos or PDFs of completed work"
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          <BookOpen className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          No homework assigned yet.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                To submit ({pending.length})
              </h2>
              {pending.map((a) => (
                <AssignmentCard key={a.id} studentId={studentId} a={a} onChanged={refresh} />
              ))}
            </section>
          )}
          {done.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Submitted ({done.length})
              </h2>
              {done.map((a) => (
                <AssignmentCard key={a.id} studentId={studentId} a={a} onChanged={refresh} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}


function QuizBlock({
  studentId,
  a,
  onChanged,
}: {
  studentId: string;
  a: PortalAssignmentRow;
  onChanged: () => void;
}) {
  const [quiz, setQuiz] = useState<PortalQuizResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const taken = a.quiz?.taken ?? false;

  const load = async () => {
    setOpen(true);
    if (quiz) return;
    try {
      setQuiz(await getMyQuiz(studentId, a.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the quiz");
      setOpen(false);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    const list = quiz.questions.map((_, i) => answers[i]);
    if (list.some((x) => x === undefined)) {
      toast.error("Answer every question first.");
      return;
    }
    setBusy(true);
    try {
      const r = await submitQuizAttempt(studentId, a.id, list as number[]);
      toast.success(`Done! You scored ${r.correctCount}/${r.total} (${r.score}${r.maxScore ? ` / ${r.maxScore}` : ""} marks)`);
      setQuiz(null);
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit the quiz");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant={taken ? "outline" : "default"} size="sm" onClick={() => void load()}>
        {taken
          ? `Review quiz${a.quiz?.score !== null && a.quiz?.score !== undefined ? ` — scored ${a.quiz.score}${a.maxScore ? ` / ${a.maxScore}` : ""}` : ""}`
          : `Take quiz (${a.quiz?.questionCount} question${(a.quiz?.questionCount ?? 0) === 1 ? "" : "s"})`}
      </Button>
    );
  }
  if (!quiz) return <p className="text-sm text-slate-500">Loading quiz…</p>;

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      {quiz.questions.map((q, i) => (
        <div key={q.id} className="space-y-1">
          <p className="text-sm font-medium text-slate-900">{i + 1}. {q.prompt}</p>
          <div className="space-y-1">
            {q.options.map((o, j) => {
              const chosen = quiz.taken ? q.myAnswer === j : answers[i] === j;
              const isCorrect = quiz.taken && q.correctIndex === j;
              const isWrongPick = quiz.taken && q.myAnswer === j && q.correct === false;
              return (
                <label
                  key={j}
                  className={
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm " +
                    (isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : isWrongPick
                        ? "border-rose-300 bg-rose-50 text-rose-900"
                        : chosen
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white") +
                    (quiz.taken ? "" : " cursor-pointer hover:bg-slate-50")
                  }
                >
                  {!quiz.taken && (
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[i] === j}
                      onChange={() => setAnswers((prev) => ({ ...prev, [i]: j }))}
                    />
                  )}
                  <span>{o}</span>
                  {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 ml-auto" />}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {quiz.taken ? (
        <p className="text-sm font-medium text-violet-800">
          Scored {quiz.score}{quiz.maxScore ? ` / ${quiz.maxScore}` : ""}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void submit()} disabled={busy}>
            {busy ? "Submitting…" : "Submit answers"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Not now
          </Button>
        </div>
      )}
      {!quiz.taken && (
        <p className="text-[11px] text-violet-700">One attempt only — check your answers before submitting.</p>
      )}
    </div>
  );
}

export default StudentHomework;
