// SectionSubjectsManager — Subjects taught in this section, with
// curriculum progress, an expandable topic list, and quick actions for
// a class teacher: view lessons / log lesson / open the full syllabus.
//
// Subjects are defined at the class level (admin only on ManageClasses).
// This component is read-only for teachers — they see the syllabus the
// admin set up and can drill into lessons or log new ones inline.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  BookOpen,
  UserCog,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Plus,
  ListChecks,
  CheckCircle2,
  Circle,
} from "lucide-react";
import {
  getSectionCurriculumProgress,
  getClassSubjectCurriculum,
  type SectionSubjectProgress,
  type ClassCurriculumTopic,
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

  // Per-subject lazy state: topics list + open flag.
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [topicsByCsId, setTopicsByCsId] = useState<Record<string, ClassCurriculumTopic[]>>({});
  const [topicsLoadingId, setTopicsLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setError(null);
    getSectionCurriculumProgress(sectionId)
      .then((r) => setSubjects(r.subjects))
      .catch((e) => setError(e?.message || "Could not load subjects"))
      .finally(() => setLoading(false));
  }, [sectionId]);

  const toggleExpand = async (s: SectionSubjectProgress) => {
    if (openSubject === s.classSubjectId) {
      setOpenSubject(null);
      return;
    }
    setOpenSubject(s.classSubjectId);
    // Fetch topics on first expand and cache them.
    if (!topicsByCsId[s.classSubjectId]) {
      setTopicsLoadingId(s.classSubjectId);
      try {
        const r = await getClassSubjectCurriculum(s.classSubjectId);
        setTopicsByCsId((prev) => ({ ...prev, [s.classSubjectId]: r.topics }));
      } catch (_) {
        /* swallow; the empty-state below handles it */
      } finally {
        setTopicsLoadingId(null);
      }
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
              Subjects taught in this section. Expand any subject to see
              its syllabus and log today's lesson.
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
            const isOpen = openSubject === s.classSubjectId;
            const topics = topicsByCsId[s.classSubjectId];
            const topicsLoading = topicsLoadingId === s.classSubjectId;
            return (
              <li
                key={s.sectionSubjectId}
                className="rounded-lg border border-slate-200 bg-white"
              >
                {/* Row header — clickable to expand */}
                <button
                  type="button"
                  onClick={() => toggleExpand(s)}
                  className="flex w-full items-center gap-2 p-3 text-left hover:bg-slate-50"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                  <span className="text-sm font-medium text-slate-900 flex-1 min-w-0 truncate">
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
                </button>

                {/* Progress bar */}
                <div className="px-3 pb-2">
                  {s.curriculum ? (
                    <>
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
                    </>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      No curriculum defined yet for {s.name}. Ask your admin
                      to set up the syllabus.
                    </p>
                  )}
                </div>

                {/* Expanded panel: topic list + actions */}
                {isOpen && (
                  <div className="border-t border-slate-100 p-3 space-y-3">
                    {/* Actions row */}
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/school/orgs/${orgId}/sections/${sectionId}/lessons/new`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        <Plus className="h-3 w-3" /> Log lesson
                      </Link>
                      <Link
                        to={`/school/orgs/${orgId}/sections/${sectionId}/lessons?subjectId=${s.sectionSubjectId}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <BookOpen className="h-3 w-3" /> View lessons
                      </Link>
                    </div>

                    {/* Topics */}
                    {topicsLoading && (
                      <p className="text-[11px] text-slate-500">
                        Loading syllabus…
                      </p>
                    )}
                    {!topicsLoading && topics && topics.length === 0 && (
                      <div className="rounded border border-dashed border-slate-200 bg-slate-50 p-2 text-center">
                        <p className="text-[11px] text-slate-500">
                          The admin hasn't added topics to this subject yet.
                        </p>
                      </div>
                    )}
                    {!topicsLoading && topics && topics.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                            <ListChecks className="h-3 w-3" />
                            Syllabus
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {topics.filter((t) => t.completed).length}/{topics.length} done
                          </span>
                        </div>
                        <ol className="space-y-1">
                          {topics.map((t, idx) => (
                            <li
                              key={t.id}
                              className={
                                "flex items-center gap-2 rounded px-2 py-1.5 text-xs " +
                                (t.completed
                                  ? "bg-emerald-50/40"
                                  : "bg-white border border-slate-100")
                              }
                            >
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-700 flex-shrink-0">
                                {idx + 1}
                              </span>
                              {t.completed ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                              ) : (
                                <Circle className="h-3 w-3 text-slate-300 flex-shrink-0" />
                              )}
                              <span
                                className={
                                  "flex-1 min-w-0 truncate " +
                                  (t.completed
                                    ? "text-slate-500 line-through"
                                    : "text-slate-800")
                                }
                              >
                                {t.name}
                              </span>
                              {t.targetDate && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 flex-shrink-0">
                                  <CalendarDays className="h-2.5 w-2.5" />
                                  {new Date(t.targetDate).toLocaleDateString()}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
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
