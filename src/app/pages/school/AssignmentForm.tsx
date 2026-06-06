// AssignmentForm — create or edit an assignment for a section.
// Edit mode is detected by presence of :assignmentId in the URL.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { AlertCircle } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  getAssignment,
  patchAssignment,
  postAssignment,
  listSectionSubjects,
  getClassSubjectCurriculum,
  type AssignmentInput,
  type AssignmentKind,
  type SectionSubject,
  type ClassCurriculumTopic,
} from "../../../utils/schoolApi";

const KIND_OPTIONS: Array<{ value: AssignmentKind; label: string }> = [
  { value: "quiz", label: "Quiz" },
  { value: "test", label: "Test" },
  { value: "homework", label: "Homework" },
  { value: "project", label: "Project" },
  { value: "class_participation", label: "Class Participation" },
  { value: "other", label: "Other" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
    maxScore: 100,
    weight: 1,
    dueDate: "",
    relatedTopic: "",
    assignedDate: todayIso(),
    sectionSubjectId: null,
    curriculumTopicId: null,
  });

  // Phase 3: subject + topic dropdowns mirror LessonForm.
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [topics, setTopics] = useState<ClassCurriculumTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

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
        });
      })
      .catch((e) => setError(e?.message || "Failed to load assignment"))
      .finally(() => setLoading(false));
  }, [editMode, orgId, assignmentId]);

  // Phase 3: load subjects for this section.
  useEffect(() => {
    const sid = resolvedSectionId || sectionId;
    if (!sid) return;
    listSectionSubjects(sid)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [resolvedSectionId, sectionId]);

  // Phase 3: when a subject is picked, load its current-year curriculum.
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
        relatedTopic: form.relatedTopic?.trim() || undefined,
        // assignedDate is accepted by the backend's optional fields; ignored if not supported.
        assignedDate: form.assignedDate || undefined,
        // Phase 3 — subject + topic. null clears on PATCH.
        sectionSubjectId: form.sectionSubjectId || null,
        curriculumTopicId: form.curriculumTopicId || null,
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

  return (
    <div className="space-y-4 max-w-2xl">
      <HeroCard
        title={editMode ? "Edit assignment" : "New assignment"}
        subtitle="Quiz, test, homework, project, or class participation"
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
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Chapter 4 quiz"
                required
              />
            </div>

            {/* Phase 3 — subject + curriculum topic. Topic dropdown
                disables until a subject is picked; clearing the subject
                also clears the topic. */}
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
                  onChange={(e) =>
                    setForm({ ...form, curriculumTopicId: e.target.value || null })
                  }
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
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Kind *</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as AssignmentKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="related">Related topic note</Label>
                <Input
                  id="related"
                  value={form.relatedTopic}
                  onChange={(e) => setForm({ ...form, relatedTopic: e.target.value })}
                  placeholder="Free-text tag (optional)"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Instructions, learning objective, etc."
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="max">Max score *</Label>
                <Input
                  id="max"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.maxScore}
                  onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.weight ?? 1}
                  onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground">Weight in the gradebook average.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="due">Due date</Label>
                <Input
                  id="due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1 max-w-xs">
              <Label htmlFor="assigned">Assigned date</Label>
              <Input
                id="assigned"
                type="date"
                value={form.assignedDate}
                onChange={(e) => setForm({ ...form, assignedDate: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Link to={backLink}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editMode ? "Save changes" : "Create assignment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
