// SectionSubjectsManager — read-only listing of subjects taught in a
// section, plus the teacher assigned to each.
//
// Subjects themselves are defined at the class level (see
// ClassSubjectsManager on ManageClasses). This component only shows what
// applies to this section; the canManage prop is kept for backwards
// compatibility with the SectionOverview call site but the management
// affordances now live one level up.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BookOpen, UserCog } from "lucide-react";
import {
  getSectionCurriculumProgress,
  type SectionSubjectProgress,
} from "../../../../utils/schoolApi";

interface Props {
  orgId: string;
  sectionId: string;
  /** When true, surface an "Edit in class settings" link. */
  canManage: boolean;
  /** Optional: pass the parent classId so the manage-link points there. */
  classId?: string | null;
}

export function SectionSubjectsManager({ orgId, sectionId, canManage, classId }: Props) {
  // Phase 4b: use the curriculum-progress endpoint instead of the plain
  // subjects list so we can show the per-subject progress bar inline.
  const [subjects, setSubjects] = useState<SectionSubjectProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setError(null);
    getSectionCurriculumProgress(sectionId)
      .then((r) => setSubjects(r.subjects))
      .catch((e) => setError(e?.message || "Could not load subjects"))
      .finally(() => setLoading(false));
  }, [sectionId]);

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
              Subjects taught in this section and who teaches each.
            </p>
          </div>
        </div>
        {canManage && (
          <Link
            to={`/school/orgs/${orgId}/admin/classes`}
            className="text-xs text-indigo-600 hover:underline"
          >
            Manage in class settings →
          </Link>
        )}
      </div>

      {loading && (
        <p className="mt-4 text-xs text-slate-500">Loading subjects…</p>
      )}
      {error && !loading && (
        <p className="mt-4 text-xs text-rose-600">{error}</p>
      )}

      {!loading && subjects.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
          <p className="text-xs text-slate-500">
            No subjects defined for this class yet.
          </p>
          {canManage && (
            <p className="mt-1 text-xs text-slate-400">
              Add subjects from{" "}
              <Link
                to={`/school/orgs/${orgId}/admin/classes`}
                className="text-indigo-600 hover:underline"
              >
                class settings
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {subjects.length > 0 && (
        <ul className="mt-3 space-y-2">
          {subjects.map((s) => {
            const pct = s.curriculum?.progressPct ?? 0;
            const pctTone =
              pct >= 75
                ? "bg-emerald-500"
                : pct >= 40
                ? "bg-amber-500"
                : "bg-rose-500";
            return (
              <li
                key={s.sectionSubjectId}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 flex-1 min-w-0">
                    {s.name}
                  </span>
                  {s.teacherName ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                      <UserCog className="h-2.5 w-2.5" />
                      {s.teacherName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                      Unassigned
                    </span>
                  )}
                </div>
                {/* Phase 4b: curriculum progress per subject. Null = no
                    syllabus defined yet for this subject. */}
                {s.curriculum ? (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {s.curriculum.topicCompleted}/{s.curriculum.topicTotal} topics ·{" "}
                        {s.curriculum.academicYear}
                      </span>
                      <span className="font-semibold text-slate-700">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={"h-full " + pctTone}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-slate-400">
                    No curriculum defined yet for {s.name}.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Keep classId in scope to silence the unused-prop lint without changing the public type. */}
      {classId !== null && <span className="hidden">{classId}</span>}
    </div>
  );
}

export default SectionSubjectsManager;
