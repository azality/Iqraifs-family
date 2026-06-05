// SectionSubjectsManager — principal / admin UI to define subjects for a
// class section (Math, Science, English, Quran, Urdu, …) and assign each
// to a teacher. Mounted on SectionOverview.
//
// Phase 1B of the per-subject rewiring. Phase 2 onwards will read
// these rows when filtering lessons / assignments / gradebook.
//
// Read access: open to anyone with an org role (backend enforces).
// Write access (add / edit / delete): principal + admin only — gated
// here AND on the backend.

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  BookOpen,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  listSectionSubjects,
  createSectionSubject,
  updateSectionSubject,
  deleteSectionSubject,
  listAdminTeachers,
  type SectionSubject,
  type AdminTeacher,
} from "../../../../utils/schoolApi";

interface Props {
  orgId: string;
  sectionId: string;
  /** Whether the viewer can add / edit / delete subjects (principal or admin). */
  canManage: boolean;
}

interface RowDraft {
  name: string;
  teacherUserId: string; // "" = unassigned
}

const EMPTY_DRAFT: RowDraft = { name: "", teacherUserId: "" };

// Common Pakistani-school subjects, surfaced as quick-add chips so the
// admin doesn't have to retype them per section. Click → prefills the
// add form. Order matches typical timetable order.
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

export function SectionSubjectsManager({ orgId, sectionId, canManage }: Props) {
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form (only shown when canManage && adding=true)
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RowDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  // Edit state — subjectId currently being edited (or null)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RowDraft>(EMPTY_DRAFT);

  const refresh = () => {
    setLoading(true);
    setError(null);
    listSectionSubjects(sectionId)
      .then((r) => setSubjects(r.subjects))
      .catch((e) => setError(e?.message || "Could not load subjects"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!sectionId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  // Teachers list — only loaded once per org. Filtered to teaching roles
  // so the dropdown doesn't include office_staff / financial_staff who
  // shouldn't be assigned to teach a subject.
  useEffect(() => {
    if (!orgId || !canManage) return;
    listAdminTeachers(orgId)
      .then((arr) =>
        setTeachers(
          arr.filter(
            (t) =>
              t.role_template === "class_teacher" ||
              t.role_template === "visiting_teacher",
          ),
        ),
      )
      .catch(() => {
        /* non-fatal; dropdown stays empty */
      });
  }, [orgId, canManage]);

  const teacherById = useMemo(() => {
    const m = new Map<string, AdminTeacher>();
    for (const t of teachers) m.set(t.user_id, t);
    return m;
  }, [teachers]);

  const handleAdd = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Subject name is required");
      return;
    }
    setSaving(true);
    try {
      await createSectionSubject(sectionId, {
        name,
        teacherUserId: draft.teacherUserId || null,
        sortOrder: subjects.length,
      });
      toast.success(`Added ${name}`);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not add subject");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (s: SectionSubject) => {
    setEditingId(s.id);
    setEditDraft({ name: s.name, teacherUserId: s.teacherUserId ?? "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  };

  const handleSaveEdit = async (subjectId: string) => {
    const name = editDraft.name.trim();
    if (!name) {
      toast.error("Subject name is required");
      return;
    }
    setSaving(true);
    try {
      await updateSectionSubject(subjectId, {
        name,
        teacherUserId: editDraft.teacherUserId || null,
      });
      toast.success("Saved");
      cancelEdit();
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: SectionSubject) => {
    if (!window.confirm(`Remove ${s.name} from this section?`)) return;
    setSaving(true);
    try {
      await deleteSectionSubject(s.id);
      toast.success(`Removed ${s.name}`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-50 p-1.5">
            <BookOpen className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Subjects</h3>
            <p className="text-xs text-slate-500">
              {canManage
                ? "Set up the subjects taught in this section and who teaches each."
                : "Subjects taught in this section."}
            </p>
          </div>
        </div>
        {canManage && !adding && (
          <Button size="sm" onClick={() => setAdding(true)} disabled={saving}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add subject
          </Button>
        )}
      </div>

      {loading && (
        <p className="mt-4 text-xs text-slate-500">Loading subjects…</p>
      )}
      {error && !loading && (
        <p className="mt-4 text-xs text-rose-600">{error}</p>
      )}

      {/* Add form */}
      {canManage && adding && (
        <div className="mt-4 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Subject name (e.g. Math)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="flex-1 min-w-[180px]"
              autoFocus
              maxLength={100}
            />
            <select
              value={draft.teacherUserId}
              onChange={(e) =>
                setDraft({ ...draft, teacherUserId: e.target.value })
              }
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 min-w-[180px]"
            >
              <option value="">Unassigned</option>
              {teachers.map((t) => (
                <option key={t.user_id} value={t.user_id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              <Check className="mr-1 h-3.5 w-3.5" /> Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setDraft(EMPTY_DRAFT);
              }}
              disabled={saving}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
          {/* Quick-pick chips for common subjects */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_SUBJECTS.filter(
              (s) =>
                !subjects.some((x) => x.name.toLowerCase() === s.toLowerCase()),
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft({ ...draft, name: s })}
                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subjects list */}
      {!loading && subjects.length === 0 && !adding && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs text-slate-500">
            No subjects yet for this section.
          </p>
          {canManage && (
            <p className="mt-1 text-xs text-slate-400">
              Click "Add subject" to set up Math, Science, English…
            </p>
          )}
        </div>
      )}

      {subjects.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {subjects.map((s) => {
            const isEditing = editingId === s.id;
            if (isEditing) {
              return (
                <li key={s.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={editDraft.name}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, name: e.target.value })
                      }
                      className="flex-1 min-w-[180px]"
                      maxLength={100}
                      autoFocus
                    />
                    <select
                      value={editDraft.teacherUserId}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          teacherUserId: e.target.value,
                        })
                      }
                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 min-w-[180px]"
                    >
                      <option value="">Unassigned</option>
                      {teachers.map((t) => (
                        <option key={t.user_id} value={t.user_id}>
                          {t.full_name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(s.id)}
                      disabled={saving}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </li>
              );
            }
            const teacherName =
              s.teacherName ??
              (s.teacherUserId
                ? teacherById.get(s.teacherUserId)?.full_name ?? "Teacher"
                : null);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {s.name}
                    </span>
                    {teacherName ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        <UserCog className="h-2.5 w-2.5" />
                        {teacherName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => beginEdit(s)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SectionSubjectsManager;
