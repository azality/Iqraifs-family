// SubjectCurriculumPanel — admin-defined syllabus for ONE class subject in
// a given academic year. Shown inline under each subject row in
// ClassSubjectsManager when the user expands the curriculum disclosure.
//
// Model (Phase 1D): curriculum belongs to (class_subject, academic_year).
// One Math/Grade 3/2026-27 syllabus applies to every section of Grade 3.
// Teachers later log lessons against the topics defined here.

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  GripVertical,
  Trash2,
  Pencil,
  Check,
  X,
  CalendarDays,
  ListChecks,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  getClassSubjectCurriculum,
  createClassCurriculum,
  addClassCurriculumTopic,
  bulkAddClassCurriculumTopics,
  updateClassCurriculumTopic,
  deleteClassCurriculumTopic,
  reorderClassCurriculumTopics,
  type ClassCurriculum,
  type ClassCurriculumTopic,
} from "../../../../utils/schoolApi";
import { templateForSubject } from "./curriculumTemplates";
import { Textarea } from "../../../components/ui/textarea";
import { Sparkles, Library } from "lucide-react";

interface Props {
  classSubjectId: string;
  subjectName: string;
  /** Read-only when false (teacher view). */
  canManage: boolean;
}

// Default to the current academic year in Pakistani format: an academic
// year that crosses a calendar year boundary (e.g. 2026-27 if we're in
// the back half of 2026, 2025-26 if in the front half of 2026).
function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  // Pakistani school year typically starts April/August. Use a coarse
  // April-start heuristic for the default; admins can override.
  const startYear = month >= 3 ? y : y - 1;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${endYear.toString().padStart(2, "0")}`;
}

export function SubjectCurriculumPanel({
  classSubjectId,
  subjectName,
  canManage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(currentAcademicYear());
  const [curriculum, setCurriculum] = useState<ClassCurriculum | null>(null);
  const [topics, setTopics] = useState<ClassCurriculumTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add-topic form (single)
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTargetDate, setDraftTargetDate] = useState("");

  // Bulk-add — paste many topics at once, one per line.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  // Inline rename
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTargetDate, setEditTargetDate] = useState<string>("");

  const refresh = () => {
    if (!classSubjectId) return;
    setLoading(true);
    setError(null);
    getClassSubjectCurriculum(classSubjectId, { academicYear: year })
      .then((r) => {
        setCurriculum(r.curriculum);
        setTopics(r.topics);
      })
      .catch((e) => setError(e?.message || "Could not load curriculum"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classSubjectId, year]);

  const ensureCurriculum = async (): Promise<ClassCurriculum | null> => {
    if (curriculum) return curriculum;
    try {
      const r = await createClassCurriculum(classSubjectId, {
        academicYear: year,
        title: `${subjectName} · ${year}`,
      });
      setCurriculum(r.curriculum);
      return r.curriculum;
    } catch (e: any) {
      toast.error(e?.message || "Could not initialise curriculum");
      return null;
    }
  };

  const handleAddTopic = async () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Topic name required");
      return;
    }
    setSaving(true);
    try {
      const c = await ensureCurriculum();
      if (!c) return;
      await addClassCurriculumTopic(c.id, {
        name,
        targetDate: draftTargetDate || null,
      });
      setDraftName("");
      setDraftTargetDate("");
      setAdding(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not add topic");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (t: ClassCurriculumTopic) => {
    setEditingTopicId(t.id);
    setEditName(t.name);
    setEditTargetDate(t.targetDate ?? "");
  };

  const handleSaveEdit = async (topicId: string) => {
    const name = editName.trim();
    if (!name) {
      toast.error("Topic name required");
      return;
    }
    setSaving(true);
    try {
      await updateClassCurriculumTopic(topicId, {
        name,
        targetDate: editTargetDate || null,
      });
      setEditingTopicId(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAdd = async (sourceText?: string) => {
    const source = (sourceText ?? bulkText).trim();
    if (!source) {
      toast.error("Paste at least one topic per line");
      return;
    }
    const names = source
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s\-\*\d\.\)]+/, "").trim()) // strip bullets / "1." prefixes
      .filter((line) => line.length > 0);
    if (names.length === 0) {
      toast.error("No topics found in the text");
      return;
    }
    setSaving(true);
    try {
      const c = await ensureCurriculum();
      if (!c) return;
      const r = await bulkAddClassCurriculumTopics(c.id, names);
      const skipped = names.length - r.added;
      toast.success(
        skipped > 0
          ? `Added ${r.added} topic${r.added === 1 ? "" : "s"} · ${skipped} skipped as duplicates`
          : `Added ${r.added} topic${r.added === 1 ? "" : "s"}`,
      );
      setBulkText("");
      setBulkOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not add topics");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = async () => {
    const tpl = templateForSubject(subjectName);
    if (!tpl) {
      // No matching template — open the bulk dialog with empty text so the
      // admin can paste their own. Surfaced as a toast hint so they know
      // why the template button didn't pre-fill anything.
      toast("No standard template for this subject yet — paste your own list below.");
      setBulkText("");
      setBulkOpen(true);
      return;
    }
    // Two-step: prefill the textarea so the admin can edit before saving.
    // (Most schools want to nudge a topic name or two before committing.)
    setBulkText(tpl.topics.join("\n"));
    setBulkOpen(true);
  };

  const handleDeleteTopic = async (t: ClassCurriculumTopic) => {
    if (!window.confirm(`Remove topic "${t.name}"?`)) return;
    setSaving(true);
    try {
      await deleteClassCurriculumTopic(t.id);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCompleted = async (t: ClassCurriculumTopic) => {
    try {
      await updateClassCurriculumTopic(t.id, { completed: !t.completed });
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not update");
    }
  };

  const moveTopic = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= topics.length) return;
    if (!curriculum) return;
    const reordered = [...topics];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(next, 0, moved);
    // Optimistic UI
    setTopics(reordered);
    try {
      await reorderClassCurriculumTopics(
        curriculum.id,
        reordered.map((t) => t.id),
      );
    } catch (e: any) {
      toast.error(e?.message || "Could not reorder");
      refresh(); // revert
    }
  };

  const progress = useMemo(() => {
    if (topics.length === 0) return 0;
    return Math.round((topics.filter((t) => t.completed).length / topics.length) * 100);
  }, [topics]);

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
        )}
        <ListChecks className="h-3.5 w-3.5 text-indigo-600" />
        <span className="text-xs font-medium text-slate-700">Curriculum</span>
        {topics.length > 0 && (
          <span className="text-[10px] text-slate-500">
            · {topics.length} topic{topics.length === 1 ? "" : "s"}
            {progress > 0 && ` · ${progress}% done`}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3">
          {/* Year selector — defaults to current academic year. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Academic year
            </span>
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2026-27"
              className="h-7 w-28 text-xs"
              maxLength={20}
            />
            {curriculum && (
              <span className="text-[10px] text-slate-400">
                {curriculum.title}
              </span>
            )}
          </div>

          {loading && (
            <p className="text-xs text-slate-500">Loading…</p>
          )}
          {error && !loading && (
            <p className="text-xs text-rose-600">{error}</p>
          )}

          {!loading && (
            <>
              {/* Topics list */}
              {topics.length === 0 && !adding && (
                <p className="rounded border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
                  {canManage
                    ? `No topics defined for ${subjectName} in ${year}. Click "Add topic" to start.`
                    : `No curriculum defined for ${subjectName} in ${year} yet.`}
                </p>
              )}

              {topics.length > 0 && (
                <ol className="space-y-1">
                  {topics.map((t, idx) => {
                    const isEditing = editingTopicId === t.id;
                    if (isEditing) {
                      return (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-center gap-2 rounded border border-violet-200 bg-violet-50/50 p-2"
                        >
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 min-w-[160px] h-7"
                            maxLength={200}
                            autoFocus
                          />
                          <Input
                            type="date"
                            value={editTargetDate}
                            onChange={(e) => setEditTargetDate(e.target.value)}
                            className="h-7 w-36"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(t.id)}
                            disabled={saving}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingTopicId(null)}
                            disabled={saving}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={t.id}
                        className={
                          "flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1.5 " +
                          (t.completed ? "bg-emerald-50/40" : "bg-white")
                        }
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-700">
                          {idx + 1}
                        </span>
                        {canManage && (
                          <input
                            type="checkbox"
                            checked={t.completed}
                            onChange={() => handleToggleCompleted(t)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                            title={t.completed ? "Mark not done" : "Mark done"}
                          />
                        )}
                        <span
                          className={
                            "flex-1 min-w-0 text-xs " +
                            (t.completed
                              ? "text-slate-400 line-through"
                              : "text-slate-900")
                          }
                        >
                          {t.name}
                        </span>
                        {t.targetDate && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <CalendarDays className="h-2.5 w-2.5" />
                            {new Date(t.targetDate).toLocaleDateString()}
                          </span>
                        )}
                        {canManage && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveTopic(idx, -1)}
                              disabled={idx === 0 || saving}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTopic(idx, 1)}
                              disabled={idx === topics.length - 1 || saving}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => beginEdit(t)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTopic(t)}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* Add-topic form */}
              {canManage && adding && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-dashed border-violet-300 bg-violet-50/40 p-2">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Topic name (e.g. Fractions)"
                    className="flex-1 min-w-[160px] h-7"
                    maxLength={200}
                    autoFocus
                  />
                  <Input
                    type="date"
                    value={draftTargetDate}
                    onChange={(e) => setDraftTargetDate(e.target.value)}
                    className="h-7 w-36"
                    title="Target date (optional)"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddTopic}
                    disabled={saving}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAdding(false);
                      setDraftName("");
                      setDraftTargetDate("");
                    }}
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Bulk-add panel — admins paste many topics at once. Auto-
                  opened by 'Use standard template'; can also be opened
                  manually via 'Paste many'. */}
              {canManage && bulkOpen && (
                <div className="mt-3 rounded-md border border-dashed border-violet-300 bg-violet-50/40 p-3">
                  <p className="mb-2 text-xs text-slate-600">
                    One topic per line. Numbering and bullets are stripped
                    automatically. Duplicates against existing topics are
                    skipped.
                  </p>
                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={8}
                    placeholder={
                      "Place value\nFractions\nDecimals\nGeometry\n…"
                    }
                    className="text-sm font-mono"
                    autoFocus
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500">
                      {
                        bulkText
                          .split(/\r?\n/)
                          .map((s) => s.trim())
                          .filter(Boolean).length
                      }{" "}
                      topic
                      {bulkText
                        .split(/\r?\n/)
                        .map((s) => s.trim())
                        .filter(Boolean).length === 1
                        ? ""
                        : "s"}{" "}
                      ready to add
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setBulkOpen(false);
                          setBulkText("");
                        }}
                        disabled={saving}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleBulkAdd()}
                        disabled={saving || !bulkText.trim()}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Add all
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons (admins only) */}
              {canManage && !adding && !bulkOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleApplyTemplate}
                    disabled={saving}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Use standard template
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBulkText("");
                      setBulkOpen(true);
                    }}
                    disabled={saving}
                  >
                    <Library className="mr-1 h-3.5 w-3.5" />
                    Paste many
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdding(true)}
                    disabled={saving}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add one
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Keep an unused icon reference to silence lint; harmless visually. */}
      <span className="hidden">
        <GripVertical />
      </span>
    </div>
  );
}

export default SubjectCurriculumPanel;
