// Daily academics — the incharge's day-to-day view (pilot ask Sep 3
// 2026): what was TAUGHT today, what homework/quiz/test was ASSIGNED,
// what's planned this week, and how the hifz round went — org-wide,
// one date at a time. Complements the curriculum coverage view (which
// answers "how far along are we", not "what happened today").
//
// Admin/principal only (backend-gated); linked from the Academics menu.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  BookOpen, BookMarked, ChevronLeft, ChevronRight, ClipboardList,
  FileQuestion, GraduationCap, ListChecks, NotebookPen,
} from "lucide-react";
import {
  getAcademicsDay,
  type AcademicsDayResponse,
} from "../../../utils/schoolApi";

function pktToday(): string {
  return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
}
function shiftDate(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400e3)
    .toISOString().slice(0, 10);
}
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

const KIND_STYLE: Record<string, string> = {
  homework: "bg-sky-50 text-sky-700 ring-sky-200",
  quiz: "bg-violet-50 text-violet-700 ring-violet-200",
  test: "bg-rose-50 text-rose-700 ring-rose-200",
  project: "bg-amber-50 text-amber-800 ring-amber-200",
  class_participation: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  other: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function AdminAcademicsDay() {
  const { orgId = "" } = useParams();
  const [date, setDate] = useState<string>(pktToday());
  const [data, setData] = useState<AcademicsDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    getAcademicsDay(orgId, date)
      .then(setData)
      .catch((e) => setError(e?.message || "Could not load"))
      .finally(() => setLoading(false));
  }, [orgId, date]);

  const isToday = date === pktToday();
  const quietDay = useMemo(
    () =>
      !!data &&
      data.sections.length === 0 &&
      data.hifz.every((h) => h.heard === 0),
    [data],
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Daily academics
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            What was taught and assigned, day by day — across the whole school.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            max={pktToday()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={isToday}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(pktToday())}
              className="ml-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Today
            </button>
          )}
        </div>
      </div>

      <div className="text-sm font-medium text-slate-700">{dayLabel(date)}</div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Loading…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Totals strip */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200">
              <NotebookPen className="h-3.5 w-3.5 text-indigo-500" />
              {data.totals.lessons} lesson{data.totals.lessons === 1 ? "" : "s"} taught
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200">
              <BookOpen className="h-3.5 w-3.5 text-sky-500" />
              {data.totals.homework} homework
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200">
              <FileQuestion className="h-3.5 w-3.5 text-violet-500" />
              {data.totals.quizzes} quiz{data.totals.quizzes === 1 ? "" : "zes"}
            </span>
            {data.totals.tests > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200">
                <ClipboardList className="h-3.5 w-3.5 text-rose-500" />
                {data.totals.tests} test{data.totals.tests === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* Hifz round strip */}
          {data.hifz.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <BookMarked className="h-4 w-4 text-emerald-600" />
                Hifz — students heard this day
              </div>
              <div className="flex flex-wrap gap-2">
                {data.hifz.map((h) => (
                  <Link
                    key={h.sectionId}
                    to={`/school/orgs/${orgId}/sections/${h.sectionId}/hifz`}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 " +
                      (h.heard >= h.total && h.total > 0
                        ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                        : h.heard > 0
                        ? "bg-white text-emerald-800 ring-emerald-200"
                        : "bg-white text-slate-500 ring-slate-200")
                    }
                  >
                    {h.label}
                    <span className="tabular-nums">{h.heard}/{h.total}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Per-section day activity */}
          {quietDay ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Nothing logged for this day — no lessons or assignments recorded.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {data.sections.map((s) => (
                <div
                  key={s.sectionId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <Link
                    to={`/school/orgs/${orgId}/sections/${s.sectionId}`}
                    className="text-sm font-semibold text-slate-900 hover:text-indigo-700"
                  >
                    {s.className} · {s.sectionName}
                  </Link>

                  {s.lessons.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.lessons.map((l) => (
                        <li key={l.id} className="flex items-start gap-2 text-xs">
                          <NotebookPen className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
                          <span className="min-w-0 text-slate-700">
                            {l.subjectName && (
                              <span className="font-medium">{l.subjectName} — </span>
                            )}
                            {l.title}
                            {l.topicName && (
                              <span className="text-slate-500"> · topic: {l.topicName}</span>
                            )}
                            {l.teacherName && (
                              <span className="text-slate-400"> · {l.teacherName}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {s.assignments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.assignments.map((a) => (
                        <li key={a.id} className="flex items-start gap-2 text-xs">
                          <span
                            className={
                              "mt-px inline-flex flex-shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ring-1 " +
                              (KIND_STYLE[a.kind] ?? KIND_STYLE.other)
                            }
                          >
                            {a.kind.replace("_", " ")}
                          </span>
                          <span className="min-w-0 text-slate-700">
                            {a.title}
                            {a.dueDate && (
                              <span className="text-slate-500">
                                {" "}· due {new Date(`${a.dueDate}T00:00:00`).toLocaleDateString()}
                              </span>
                            )}
                            {a.teacherName && (
                              <span className="text-slate-400"> · {a.teacherName}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* This week's plan */}
          {data.plannedTopics.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ListChecks className="h-4 w-4 text-violet-500" />
                Planned this week (topic target dates)
              </div>
              <ul className="space-y-1">
                {data.plannedTopics.map((tp, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-xs">
                    <span className="w-20 flex-shrink-0 font-medium tabular-nums text-slate-500">
                      {new Date(`${tp.targetDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <span className={"min-w-0 " + (tp.completed ? "text-slate-400 line-through" : "text-slate-700")}>
                      {tp.className}
                      {tp.subjectName ? ` · ${tp.subjectName}` : ""} — {tp.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminAcademicsDay;
