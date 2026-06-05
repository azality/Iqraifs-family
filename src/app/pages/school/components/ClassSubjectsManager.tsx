// ClassSubjectsManager — defines the subjects taught in a class (grade).
//
// Each subject is a template (Math, Science, English, …) plus a row per
// section showing the teacher assigned to teach it in that specific
// section. Admins set the per-section teacher inline.
//
// Mounted inside the expandable class card on ManageClasses, above the
// "Sections" list. Teachers (non-admin) don't reach this UI — they see
// the read-only list on SectionOverview.

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  listClassSubjects,
  createClassSubject,
  updateClassSubject,
  deleteClassSubject,
  setSectionSubjectTeacher,
  type ClassSubject,
  type AdminTeacher,
} from "../../../../utils/schoolApi";

interface Props {
  classId: string;
  /** Teachers eligible to be assigned to teach a subject (class_teacher + visiting_teacher). */
  teachers: AdminTeacher[];
}

const COMMON_SUBJECTS = [
  "Math",
  "English",
  "Urdu",
  "Science",
  "Social Studies",
  "Islamiat",
  "Quran",
  "Computer",
];

export function ClassSubjectsManager({ classId, teachers }: Props) {
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");

  // Rename inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = () => {
    setLoading(true);
    setError(null);
    listClassSubjects(classId)
      .then((r) => setSubjects(r.subjects))
      .catch((e) => setError(e?.message || "Could not load subjects"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!classId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const existingNames = useMemo(
    () => new Set(subjects.map((s) => s.name.toLowerCase())),
    [subjects],
  );

  const handleAdd = async () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Subject name is required");
      return;
    }
    setSaving(true);
    try {
      await createClassSubject(classId, {
        name,
        sortOrder: subjects.length,
      });
      toast.success(`Added ${name}`);
      setDraftName("");
      setAdding(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not add subject");
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      toast.error("Name required");
      return;
    }
    setSaving(true);
    try {
      await updateClassSubject(id, { name });
      toast.success("Renamed");
      setEditingId(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not rename");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: ClassSubject) => {
    if (
      !window.confirm(
        `Remove ${s.name} from this class? It will be removed from all sections.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteClassSubject(s.id);
      toast.success(`Removed ${s.name}`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    } finally {
      setSaving(false);
    }
  };

  const handleTeacherChange = async (
    sectionSubjectId: string,
    teacherUserId: string,
  ) => {
    try {
      await setSectionSubjectTeacher(
        sectionSubjectId,
        teacherUserId || null,
      );
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not assign teacher");
    }
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-violet-100 p-1.5">
            <BookOpen className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Subjects</h4>
            <p className="text-xs text-slate-500">
              Defined once for this class. Each section can have a different
              teacher per subject.
            </p>
          </div>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={saving}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add subject
          </Button>
        )}
      </div>

      {loading && <p className="mt-3 text-xs text-slate-500">Loading…</p>}
      {error && !loading && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      {adding && (
        <div className="mt-3 rounded-md border border-dashed border-violet-300 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Subject name (e.g. Math)"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="flex-1 min-w-[160px] h-8"
              autoFocus
              maxLength={100}
            />
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              <Check className="mr-1 h-3.5 w-3.5" /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraftName("");
              }}
              disabled={saving}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_SUBJECTS.filter((s) => !existingNames.has(s.toLowerCase())).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraftName(s)}
                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && subjects.length === 0 && !adding && (
        <p className="mt-3 text-xs text-slate-500">
          No subjects yet. Click "Add subject" to define Math, Science, English…
        </p>
      )}

      {subjects.length > 0 && (
        <div className="mt-3 space-y-2">
          {subjects.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <div
                key={s.id}
                className="rounded-md border border-slate-200 bg-white p-2"
              >
                {/* Subject header — name + edit / delete */}
                <div className="flex items-center justify-between gap-2">
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-0 h-7"
                        maxLength={100}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRename(s.id)}
                        disabled={saving}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-slate-900">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(s.id);
                            setEditName(s.name);
                          }}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Per-section teacher rows */}
                {s.sections.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {s.sections.map((sec) => (
                      <div
                        key={sec.sectionSubjectId}
                        className="flex flex-wrap items-center gap-2 rounded bg-slate-50 px-2 py-1.5"
                      >
                        <span className="text-xs font-medium text-slate-700 min-w-[60px]">
                          {sec.sectionName ?? "Section"}
                        </span>
                        <select
                          value={sec.teacherUserId ?? ""}
                          onChange={(e) =>
                            handleTeacherChange(sec.sectionSubjectId, e.target.value)
                          }
                          className="flex-1 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          <option value="">Unassigned</option>
                          {teachers.map((t) => (
                            <option key={t.user_id} value={t.user_id}>
                              {t.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ClassSubjectsManager;
