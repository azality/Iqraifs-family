// AssignmentForm — create or edit an assignment for a section.
// Edit mode is detected by presence of :assignmentId in the URL.
//
// Design 9a ("five decisions, not twelve fields"): creating homework is
// a daily 30-second task. Kind chips replace BOTH the Kind dropdown and
// the Counts-as segmented row — picking Homework/Quiz/Test/Project/
// Participation infers the gradebook weight (override link) and a
// per-kind max-score default (10 for homework, 100 for tests). Due is
// one-tap presets — Tomorrow / "Next <subject> class · Mon" read from
// the section timetable / Pick date. The curriculum topic suggests the
// next incomplete topic for the picked subject. Instructions, files,
// video and audio collapse behind "+ add" chips ("Related topic note"
// merged into Instructions); the assigned date is a footer "change"
// link defaulting to today. The header names the receiving section and
// Create shows the recipient count.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { AlertCircle } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  getAssignment,
  patchAssignment,
  postAssignment,
  listSectionSubjects,
  listClasses,
  getSectionTimetable,
  getSectionsLeaderboard,
  getClassSubjectCurriculum,
  uploadSchoolFile,
  SCHOOL_FILE_ACCEPT,
  type AssignmentInput,
  type AssignmentKind,
  type SectionSubject,
  type ClassCurriculumTopic,
  type TimetableWeekCell,
} from "../../../utils/schoolApi";

// One decision instead of two: the kind sets the gradebook weight
// (Small 1× / Medium 2× / Big 3×) and a sensible max-score default.
const KIND_CHIPS: Array<{ value: AssignmentKind; label: string; weight: number; maxScore: number }> = [
  { value: "homework", label: "Homework", weight: 1, maxScore: 10 },
  { value: "quiz", label: "Quiz", weight: 1, maxScore: 10 },
  { value: "test", label: "Test", weight: 2, maxScore: 100 },
  { value: "project", label: "Project", weight: 2, maxScore: 50 },
  { value: "class_participation", label: "Participation", weight: 1, maxScore: 10 },
];
const WEIGHT_LABEL: Record<number, string> = { 1: "Small (1×)", 2: "Medium (2×)", 3: "Big (3×)" };

const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AssignmentForm() {
  const { orgId = "", sectionId = "", assignmentId = "" } = useParams();
  const navigate = useNavigate();
  const editMode = !!assignmentId;

  const [loading, setLoading] = useState(editMode);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Section id may not be in URL in edit mode (route is /assignments/:id/edit).
  // We capture it from the loaded assignment.
  const [resolvedSectionId, setResolvedSectionId] = useState<string>(sectionId);

  const [form, setForm] = useState<AssignmentInput & { assignedDate: string }>({
    title: "",
    kind: "homework",
    description: "",
    maxScore: 10,
    weight: 1,
    dueDate: "",
    relatedTopic: "",
    assignedDate: todayIso(),
    sectionSubjectId: null,
    curriculumTopicId: null,
    videoUrl: "",
    audioUrl: "",
  });
  // Attachment rows (label + url). Mirrors LessonForm.
  const [attachments, setAttachments] = useState<Array<{ label: string; url: string }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [topics, setTopics] = useState<ClassCurriculumTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // 9a: header section label + recipient count, timetable for due
  // presets — all best-effort.
  const [sectionLabel, setSectionLabel] = useState<string>("");
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [weekCells, setWeekCells] = useState<TimetableWeekCell[]>([]);
  // "+ add" chips — sections open on demand (or when they have content).
  const [addOpen, setAddOpen] = useState({ instructions: false, files: false, video: false, audio: false });
  // Once the teacher touches score/weight/topic/due, the kind chips and
  // suggestions stop overwriting their choices.
  const [scoreTouched, setScoreTouched] = useState(editMode);
  const [weightOverride, setWeightOverride] = useState(false);
  const [topicTouched, setTopicTouched] = useState(editMode);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(false);

  useEffect(() => {
    if (!editMode || !orgId || !assignmentId) return;
    setLoading(true);
    getAssignment(orgId, assignmentId)
      .then((a) => {
        setResolvedSectionId(a.class_section_id);
        setForm({
          title: a.title,
          kind: a.kind,
          description: a.description ?? "",
          maxScore: a.max_score,
          weight: a.weight,
          dueDate: a.due_date ?? "",
          relatedTopic: a.related_topic ?? "",
          assignedDate: a.assigned_date,
          sectionSubjectId: a.sectionSubjectId ?? null,
          curriculumTopicId: a.curriculumTopicId ?? null,
          videoUrl: (a as any).videoUrl ?? "",
          audioUrl: (a as any).audioUrl ?? "",
        });
        const att = ((a as any).attachments ?? []) as Array<{ label: string; url: string }>;
        setAttachments(att);
        setAddOpen({
          instructions: !!(a.description ?? "").trim() || !!(a.related_topic ?? "").trim(),
          files: att.length > 0,
          video: !!((a as any).videoUrl ?? "").trim(),
          audio: !!((a as any).audioUrl ?? "").trim(),
        });
        if (a.due_date) setDuePickerOpen(true);
      })
      .catch((e) => setError(e?.message || "Failed to load assignment"))
      .finally(() => setLoading(false));
  }, [editMode, orgId, assignmentId]);

  useEffect(() => {
    const sid = resolvedSectionId || sectionId;
    if (!sid) return;
    listSectionSubjects(sid)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [resolvedSectionId, sectionId]);

  // 9a: section label, recipient count, timetable (for due presets).
  useEffect(() => {
    const sid = resolvedSectionId || sectionId;
    if (!orgId || !sid) return;
    listClasses(orgId)
      .then((classes) => {
        for (const c of classes) for (const s of c.sections ?? []) {
          if (s.id === sid) { setSectionLabel(`${c.name} · ${s.name}`); return; }
        }
      })
      .catch(() => {});
    getSectionsLeaderboard(orgId, "T")
      .then((r) => {
        const row = r.sections.find((s) => s.sectionId === sid);
        if (row) setStudentCount(row.studentCount);
      })
      .catch(() => {});
    getSectionTimetable(orgId, sid)
      .then((r) => setWeekCells(r.cells))
      .catch(() => setWeekCells([]));
  }, [orgId, resolvedSectionId, sectionId]);

  // When a subject is picked, load its current-year curriculum.
  useEffect(() => {
    if (!form.sectionSubjectId) {
      setTopics([]);
      return;
    }
    const subj = subjects.find((s) => s.id === form.sectionSubjectId);
    if (!subj) return;
    setTopicsLoading(true);
    getClassSubjectCurriculum(subj.classSubjectId)
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics([]))
      .finally(() => setTopicsLoading(false));
  }, [form.sectionSubjectId, subjects]);

  // 9a: suggest the next incomplete topic once topics load.
  useEffect(() => {
    if (editMode || topicTouched || topics.length === 0) return;
    const next = topics
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .find((t) => !t.completed);
    if (next) setForm((f) => (f.curriculumTopicId ? f : { ...f, curriculumTopicId: next.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, editMode, topicTouched]);

  const topicsDone = topics.filter((t) => t.completed).length;
  const suggestedTopicId = useMemo(() => {
    const next = topics.slice().sort((a, b) => a.displayOrder - b.displayOrder).find((t) => !t.completed);
    return next?.id ?? null;
  }, [topics]);

  // 9a: "Next <subject> class · Mon" — the section timetable's next
  // future occurrence of the picked subject (matched by id, falling
  // back to name).
  const nextClass = useMemo(() => {
    if (weekCells.length === 0) return null;
    const subj = subjects.find((s) => s.id === form.sectionSubjectId);
    const matches = weekCells.filter((c) => {
      if (!c.entry) return false;
      if (form.sectionSubjectId && c.entry.sectionSubjectId) {
        return c.entry.sectionSubjectId === form.sectionSubjectId;
      }
      if (subj && c.entry.subjectName) return c.entry.subjectName === subj.name;
      return false;
    });
    if (matches.length === 0) return null;
    const todayDow = ((new Date().getDay() + 6) % 7) + 1;
    let best: { daysAhead: number; dow: number } | null = null;
    for (const c of matches) {
      const daysAhead = ((c.slot.dayOfWeek - todayDow + 7) % 7) || 7; // strictly future
      if (!best || daysAhead < best.daysAhead) best = { daysAhead, dow: c.slot.dayOfWeek };
    }
    if (!best) return null;
    return {
      dateIso: addDaysIso(best.daysAhead),
      label: `Next ${subj?.name ?? "class"} · ${DAY_SHORT[best.dow]}`,
    };
  }, [weekCells, subjects, form.sectionSubjectId]);

  const pickKind = (chip: (typeof KIND_CHIPS)[number]) => {
    setForm((f) => ({
      ...f,
      kind: chip.value,
      weight: weightOverride ? f.weight : chip.weight,
      maxScore: scoreTouched ? f.maxScore : chip.maxScore,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.maxScore || form.maxScore <= 0) {
      setError("Max score must be greater than 0.");
      return;
    }
    setSaving(true);
    try {
      const body: AssignmentInput & { assignedDate?: string } = {
        title: form.title.trim(),
        kind: form.kind,
        description: form.description?.trim() || undefined,
        maxScore: Number(form.maxScore),
        weight: form.weight != null ? Number(form.weight) : undefined,
        dueDate: form.dueDate || undefined,
        // "Related topic note" merged into Instructions (9a) — existing
        // values still round-trip untouched in edit mode.
        relatedTopic: form.relatedTopic?.trim() || undefined,
        assignedDate: form.assignedDate || undefined,
        sectionSubjectId: form.sectionSubjectId || null,
        curriculumTopicId: form.curriculumTopicId || null,
        videoUrl: form.videoUrl?.trim() || null,
        audioUrl: form.audioUrl?.trim() || null,
        attachments: attachments.filter((a) => a.url.trim()),
      };
      let saved;
      if (editMode) {
        saved = await patchAssignment(orgId, assignmentId, body);
      } else {
        saved = await postAssignment(orgId, sectionId, body);
      }
      toast.success(editMode ? "Assignment updated" : "Assignment created");
      navigate(`/school/orgs/${orgId}/assignments/${saved.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const backLink = resolvedSectionId
    ? `/school/orgs/${orgId}/sections/${resolvedSectionId}/assignments`
    : `/school/orgs/${orgId}/admin/classes`;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading assignment…</p>;
  }

  const chips: Array<(typeof KIND_CHIPS)[number]> =
    form.kind === "other"
      ? [...KIND_CHIPS, { value: "other" as AssignmentKind, label: "Other", weight: 1, maxScore: 10 }]
      : KIND_CHIPS;

  const dueChip = (label: string, dateIso: string) => {
    const active = form.dueDate === dateIso && !duePickerOpen;
    return (
      <button
        key={label}
        type="button"
        onClick={() => { setForm({ ...form, dueDate: dateIso }); setDuePickerOpen(false); }}
        className={
          "rounded-full border px-3 py-1.5 text-xs font-semibold " +
          (active
            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
        }
      >
        {label}
      </button>
    );
  };

  const addChip = (key: keyof typeof addOpen, label: string) =>
    !addOpen[key] && (
      <button
        key={key}
        type="button"
        onClick={() => setAddOpen((o) => ({ ...o, [key]: true }))}
        className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        {label}
      </button>
    );

  return (
    <div className="space-y-4 max-w-2xl">
      <HeroCard
        title={editMode ? "Edit assignment" : "New assignment"}
        subtitle={sectionLabel || "Quiz, test, homework, project, or participation"}
        rightSlot={
          <Link to={backLink}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Back</Button>
          </Link>
        }
      />

      {error && (
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <Card className={`${cardBase} ${cardElev}`}>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Kind — one decision: chip sets weight + max-score default. */}
            <div className="space-y-1.5">
              <Label>Kind *</Label>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => pickKind(chip)}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-bold " +
                      (form.kind === chip.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                    }
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Sets the gradebook weight too — this counts as{" "}
                <span className="font-semibold text-slate-600">{WEIGHT_LABEL[form.weight ?? 1] ?? `${form.weight}×`}</span>.{" "}
                {!weightOverride ? (
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => setWeightOverride(true)}>
                    override
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {[{ v: 1, l: "Small" }, { v: 2, l: "Medium" }, { v: 3, l: "Big" }].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setForm({ ...form, weight: o.v })}
                        className={
                          "rounded-full border px-2 py-0.5 " +
                          ((form.weight ?? 1) === o.v
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800 font-semibold"
                            : "border-slate-200 text-slate-500")
                        }
                      >
                        {o.l}
                      </button>
                    ))}
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.weight ?? 1}
                      onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                      className="h-6 w-16 text-xs"
                      aria-label="Custom weight"
                    />
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Fractions worksheet — Ch. 4"
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="subject">Subject</Label>
                <select
                  id="subject"
                  value={form.sectionSubjectId ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sectionSubjectId: e.target.value || null,
                      curriculumTopicId: null,
                    })
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="">— Pick a subject —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.teacherName ? ` · ${s.teacherName}` : ""}
                    </option>
                  ))}
                </select>
                {subjects.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No subjects defined for this section yet.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="curriculumTopic">Curriculum topic</Label>
                <select
                  id="curriculumTopic"
                  value={form.curriculumTopicId ?? ""}
                  onChange={(e) => {
                    setTopicTouched(true);
                    setForm({ ...form, curriculumTopicId: e.target.value || null });
                  }}
                  disabled={!form.sectionSubjectId || topicsLoading}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                >
                  <option value="">
                    {!form.sectionSubjectId
                      ? "— Pick a subject first —"
                      : topicsLoading
                      ? "Loading topics…"
                      : topics.length === 0
                      ? "No topics in the syllabus yet"
                      : "— Optional: pick a topic —"}
                  </option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.completed ? "✓ " : ""}
                      {t.displayOrder + 1}. {t.name}
                    </option>
                  ))}
                </select>
                {topics.length > 0 && form.curriculumTopicId === suggestedTopicId && suggestedTopicId && (
                  <p className="text-[11px] text-slate-400">
                    Suggested — next incomplete topic ({topicsDone}/{topics.length} done).
                  </p>
                )}
              </div>
            </div>

            {/* Due — one-tap presets; "Next <subject> class" reads the
                timetable. Max score sits beside it (kind default). */}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_130px] sm:items-end">
              <div className="space-y-1.5">
                <Label>Due</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {dueChip("Tomorrow", addDaysIso(1))}
                  {nextClass && dueChip(nextClass.label, nextClass.dateIso)}
                  <button
                    type="button"
                    onClick={() => setDuePickerOpen((v) => !v)}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-semibold " +
                      (duePickerOpen
                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                    }
                  >
                    Pick date…
                  </button>
                  {duePickerOpen && (
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                      className="h-8 w-40"
                      aria-label="Due date"
                    />
                  )}
                  {form.dueDate && !duePickerOpen && (
                    <span className="text-[11px] text-slate-400 tabular-nums">{form.dueDate}</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="max">Max score *</Label>
                <Input
                  id="max"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.maxScore}
                  onChange={(e) => { setScoreTouched(true); setForm({ ...form, maxScore: Number(e.target.value) }); }}
                  required
                />
              </div>
            </div>

            {/* Rarely-used extras behind "+ add" chips. */}
            <div className="space-y-1.5">
              <Label>Add to the assignment</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {attachments.filter((a) => a.url.trim()).map((a, i) => (
                  <span key={`att-${i}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    📄 <span className="max-w-[160px] truncate">{a.label || a.url}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                      aria-label={`Remove ${a.label || "attachment"}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {addChip("instructions", "+ Instructions")}
                {addChip("files", "+ File / link")}
                {addChip("video", "+ Video")}
                {addChip("audio", "+ Audio")}
              </div>
            </div>

            {addOpen.instructions && (
              <div className="space-y-1">
                <Label htmlFor="desc">Instructions</Label>
                <Textarea
                  id="desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="What to do, learning objective, related topic notes…"
                />
                {(form.relatedTopic ?? "").trim() !== "" && (
                  <p className="text-[11px] text-slate-400">
                    Legacy topic note kept: “{form.relatedTopic}”
                  </p>
                )}
              </div>
            )}

            {addOpen.files && (
              <div className="space-y-1">
                <Label>Files / links (PDF, worksheet)</Label>
                {attachments.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="w-40"
                      value={a.label}
                      onChange={(e) => setAttachments(attachments.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="Label (e.g. Worksheet)"
                    />
                    <Input
                      type="url"
                      value={a.url}
                      onChange={(e) => setAttachments(attachments.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      placeholder="https://… (Google Drive, PDF link)"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                      ✕
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    id="assignment-file-input"
                    type="file"
                    accept={SCHOOL_FILE_ACCEPT}
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      setUploadingFile(true);
                      try {
                        const { url } = await uploadSchoolFile(orgId, f);
                        setAttachments((a) => [...a, { label: f.name, url }]);
                        toast.success(`"${f.name}" uploaded`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Upload failed");
                      } finally {
                        setUploadingFile(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingFile}
                    onClick={() => document.getElementById("assignment-file-input")?.click()}
                  >
                    {uploadingFile ? "Uploading…" : "⇧ Upload file"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAttachments([...attachments, { label: "", url: "" }])}>
                    + Add link
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  PDF, Word, Excel, PowerPoint, InPage, or image — up to 15 MB;
                  photos are compressed automatically.
                </p>
              </div>
            )}

            {addOpen.video && (
              <div className="space-y-1">
                <Label htmlFor="video">Video URL (YouTube etc.)</Label>
                <Input
                  id="video"
                  type="url"
                  value={form.videoUrl ?? ""}
                  onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                  placeholder="https://youtube.com/watch?v=…"
                />
              </div>
            )}

            {addOpen.audio && (
              <div className="space-y-1">
                <Label htmlFor="audio">Audio URL</Label>
                <Input
                  id="audio"
                  type="url"
                  value={form.audioUrl ?? ""}
                  onChange={(e) => setForm({ ...form, audioUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              <span className="mr-auto text-[11.5px] text-slate-400">
                Assigned {form.assignedDate === todayIso() ? "today" : form.assignedDate} ·{" "}
                {assignedOpen ? (
                  <Input
                    type="date"
                    value={form.assignedDate}
                    onChange={(e) => setForm({ ...form, assignedDate: e.target.value })}
                    className="inline-block h-7 w-36 align-middle text-xs"
                    aria-label="Assigned date"
                  />
                ) : (
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => setAssignedOpen(true)}>
                    change
                  </button>
                )}
              </span>
              <Link to={backLink}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editMode
                  ? "Save changes"
                  : studentCount != null
                  ? `Create → ${studentCount} students`
                  : "Create assignment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
