// StudentLessons — feed of daily lessons for a student.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { Video, Headphones, Paperclip, CheckCircle2, Circle, BookOpen, ListChecks } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  getMyStudentLessons,
  markLessonComplete,
  unmarkLessonComplete,
  getLessonCompletion,
  type Lesson,
} from "../../../utils/schoolPortalApi";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StudentLessons() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { subject } = usePinAuth();
  const isStudent = subject?.subjectType === "student";
  const [startDate, setStartDate] = useState<string>(isoDaysAgo(30));
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Map of lessonId → completedAt ISO (null = not completed). Hydrated
  // lazily; null entries are "unknown until fetched".
  const [completion, setCompletion] = useState<Record<string, string | null>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  // Phase 4b: subject filter chip ("" = all subjects).
  const [subjectFilter, setSubjectFilter] = useState<string>("");

  const range = useMemo(() => ({ startDate, endDate, limit: 100 }), [startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    setLessons(null);
    (async () => {
      try {
        const res = await getMyStudentLessons(studentId, range);
        if (!cancelled) setLessons(res.lessons);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, range]);

  // Fetch completion state for each lesson we don't yet have.
  useEffect(() => {
    if (!lessons || !studentId) return;
    let cancelled = false;
    (async () => {
      for (const l of lessons) {
        if (l.id in completion) continue;
        try {
          const r = await getLessonCompletion(studentId, l.id);
          if (cancelled) return;
          setCompletion((s) => ({ ...s, [l.id]: r.completed ? r.completedAt : null }));
        } catch {
          // ignore individual failures — keeps the toggle usable as fallback
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only depends on lessons + studentId; completion is mutated here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, studentId]);

  const toggleComplete = async (lessonId: string) => {
    if (!isStudent || pending.has(lessonId)) return;
    const wasComplete = Boolean(completion[lessonId]);
    setPending((s) => new Set(s).add(lessonId));
    try {
      if (wasComplete) {
        await unmarkLessonComplete(studentId, lessonId);
        setCompletion((s) => ({ ...s, [lessonId]: null }));
      } else {
        const r = await markLessonComplete(studentId, lessonId);
        setCompletion((s) => ({ ...s, [lessonId]: r.completedAt }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(lessonId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-5">
      <HeroCard
        title="Lessons"
        subtitle="Daily sabaq and class lessons"
        rightSlot={
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white/10 text-white border border-white/20 rounded px-2 py-1"
            />
            <span className="text-indigo-200">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white/10 text-white border border-white/20 rounded px-2 py-1"
            />
          </div>
        }
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!lessons && !error && <div className="text-slate-500 text-sm">Loading…</div>}

      {/* Phase 4b: subject filter chip row. Derived from the lesson set so
          it only shows subjects the student actually has lessons for. */}
      {lessons && lessons.length > 0 && (() => {
        const seen = new Map<string, string>();
        for (const l of lessons) {
          if (l.subjectName && !seen.has(l.subjectName)) {
            seen.set(l.subjectName, l.subjectName);
          }
        }
        if (seen.size === 0) return null;
        const subjectNames = Array.from(seen.keys()).sort();
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">
              Subject
            </span>
            <button
              type="button"
              onClick={() => setSubjectFilter("")}
              className={
                "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
                (subjectFilter === ""
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
              }
            >
              All
            </button>
            {subjectNames.map((name) => {
              const active = subjectFilter === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSubjectFilter(name)}
                  className={
                    "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
                    (active
                      ? "bg-indigo-600 text-white ring-indigo-600"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        );
      })()}

      {lessons && lessons.length === 0 && (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-500 text-center`}>
          No lessons in this range.
        </div>
      )}

      <div className="space-y-3">
        {lessons
          ?.filter((l) => !subjectFilter || l.subjectName === subjectFilter)
          .map((l) => {
          const completedAt = completion[l.id];
          const isComplete = Boolean(completedAt);
          const isPending = pending.has(l.id);
          return (
          <article key={l.id} className={`${cardBase} ${cardElev} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{l.title}</h3>
                {/* Phase 4b: subject + topic badges so parents see the
                    academic context at a glance. */}
                {(l.subjectName || l.topicName) && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {l.subjectName && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                        <BookOpen className="h-2.5 w-2.5" />
                        {l.subjectName}
                      </span>
                    )}
                    {l.topicName && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
                        <ListChecks className="h-2.5 w-2.5" />
                        {l.topicName}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(l.lesson_date).toLocaleDateString()}
                  {l.taught_by_name ? ` · by ${l.taught_by_name}` : ""}
                </p>
              </div>
              {isStudent ? (
                <button
                  type="button"
                  onClick={() => toggleComplete(l.id)}
                  disabled={isPending}
                  className={
                    "inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 border font-medium whitespace-nowrap transition " +
                    (isComplete
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50") +
                    (isPending ? " opacity-50 cursor-wait" : "")
                  }
                >
                  {isComplete ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completed
                    </>
                  ) : (
                    <>
                      <Circle className="h-3.5 w-3.5" />
                      Mark complete
                    </>
                  )}
                </button>
              ) : isComplete && completedAt ? (
                <span className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completed {new Date(completedAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            {l.body && (
              <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{l.body}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {l.video_url && (
                <a
                  href={l.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1"
                >
                  <Video className="h-3.5 w-3.5" />
                  Video
                </a>
              )}
              {l.audio_url && (
                <a
                  href={l.audio_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1"
                >
                  <Headphones className="h-3.5 w-3.5" />
                  Audio
                </a>
              )}
              {l.attachments?.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2 py-1"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {a.label}
                </a>
              ))}
            </div>

            {/* Phase 4b: topic resources surface in the parent portal
                too — same payload the staff feed gets. Kept compact for
                the smaller portal cards. */}
            {l.topicResources && l.topicResources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  {l.topicName ? `${l.topicName} resources` : "Topic resources"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {l.topicResources.map((tr) => {
                    const tone =
                      tr.kind === "worksheet"
                        ? "bg-amber-50 text-amber-800 ring-amber-200"
                        : tr.kind === "video"
                        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                        : tr.kind === "quiz"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : tr.kind === "pdf"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : "bg-slate-100 text-slate-700 ring-slate-200";
                    const kindLabel =
                      tr.kind === "pdf"
                        ? "PDF"
                        : tr.kind === "video"
                        ? "Video"
                        : tr.kind === "worksheet"
                        ? "Worksheet"
                        : tr.kind === "quiz"
                        ? "Quiz"
                        : "Link";
                    return (
                      <a
                        key={tr.id}
                        href={tr.url}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 hover:underline " +
                          tone
                        }
                      >
                        <span className="font-semibold uppercase tracking-wider text-[9px]">
                          {kindLabel}
                        </span>
                        <span>·</span>
                        <span>{tr.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
          );
        })}
      </div>
    </div>
  );
}
