// Daily academics — the incharge's day-to-day view (pilot ask Sep 3
// 2026): what was TAUGHT today, what homework/quiz/test was ASSIGNED,
// what's planned this week, and how the hifz round went — org-wide,
// one date at a time. Complements the curriculum coverage view (which
// answers "how far along are we", not "what happened today").
//
// Admin/principal only (backend-gated); linked from the Academics menu.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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

  // ── Roll-call rows (design 2a): merge the roster with the day's
  // activity so a section that logged nothing still answers. ──────────
  const rollCall = useMemo(() => {
    if (!data) return [];
    const bySection = new Map(data.sections.map((sec) => [sec.sectionId, sec]));
    const hifzBySection = new Map(data.hifz.map((h) => [h.sectionId, h]));
    return (data.roster ?? []).map((r) => {
      const act = bySection.get(r.sectionId);
      const hz = hifzBySection.get(r.sectionId);
      const heard = hz?.heard ?? 0;
      const total = hz?.total ?? 0;
      const silent =
        (!act || (act.lessons.length === 0 && act.assignments.length === 0)) &&
        (!r.isHifz || heard === 0);
      const planned = data.plannedTopics.find(
        (tp) => tp.targetDate === data.date && tp.className === r.className && !tp.completed,
      );
      return { ...r, act, heard, total, silent, planned };
    });
  }, [data]);
  const silentRows = rollCall.filter((r) => r.silent);
  const heardTotals = rollCall.reduce(
    (a, r) => (r.isHifz ? { heard: a.heard + r.heard, total: a.total + r.total } : a),
    { heard: 0, total: 0 },
  );

  // One-tap nudge: the pilot's real channel is WhatsApp — copy a ready
  // Roman-Urdu message instead of inventing an in-app notification.
  const nudgeText = (r: { teacherName: string | null; className: string; sectionName: string; planned?: { name: string } | null }) =>
    `Assalamualaikum ${r.teacherName ?? "ustaad"} sb — aaj ${r.className} ${r.sectionName} ki koi entry system mein nahi hui (lesson/sabaq).` +
    (r.planned ? ` Aaj ka planned topic: ${r.planned.name}.` : "") +
    ` Meherbani karke aaj ki entry update kar dein. JazakAllah.`;
  const copyNudge = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} — paste into WhatsApp.`);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  };

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
            {heardTotals.total > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
                <BookMarked className="h-3.5 w-3.5" />
                {heardTotals.heard}/{heardTotals.total} students heard
              </span>
            )}
          </div>

          {/* Roll-call banner (design 2a): silence is signal. */}
          {rollCall.length > 0 && silentRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
              <span className="text-sm font-bold text-amber-900">
                {rollCall.length - silentRows.length} of {rollCall.length} sections {rollCall.length - silentRows.length === 1 ? "has" : "have"} activity {isToday ? "today" : "this day"}.
              </span>
              <span className="text-xs text-amber-800">
                {silentRows.length} logged nothing — no lesson, no students heard.
              </span>
              {isToday && (
                <button
                  type="button"
                  onClick={() =>
                    copyNudge(
                      silentRows.map((r) => nudgeText(r)).join(String.fromCharCode(10) + String.fromCharCode(10)),
                      `${silentRows.length} nudge message${silentRows.length === 1 ? "" : "s"} copied`,
                    )
                  }
                  className="ml-auto min-h-[32px] rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                >
                  Nudge all {silentRows.length} teacher{silentRows.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}

          {/* Roll-call rows: every assigned section answers. */}
          {rollCall.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "rgba(20,22,58,.08)" }}>
              {rollCall.map((r) => (
                <div
                  key={r.sectionId}
                  className={
                    "flex flex-wrap items-start gap-3 border-b border-slate-100 px-4 py-3 sm:grid sm:grid-cols-[180px_minmax(0,1fr)_220px_110px] sm:items-center " +
                    (r.silent ? "bg-amber-50/40" : "")
                  }
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1.5 h-2 w-2 flex-none rounded-full"
                      style={{ background: r.silent ? "#f59e0b" : "#10b981" }}
                    />
                    <span className="min-w-0">
                      <Link
                        to={`/school/orgs/${orgId}/sections/${r.sectionId}${r.isHifz ? "/hifz" : ""}`}
                        className="block truncate text-sm font-bold text-slate-900 hover:text-indigo-700"
                      >
                        {r.className} · {r.sectionName}
                      </Link>
                      <span className="block truncate text-[11.5px] text-slate-400">
                        {r.teacherName ?? "no class teacher"}
                      </span>
                    </span>
                  </span>
                  <span className={"min-w-0 flex-1 text-xs leading-relaxed sm:flex-none " + (r.silent ? "text-amber-800" : "text-slate-600")}>
                    {r.silent ? (
                      <>
                        Nothing logged — no lesson{r.isHifz ? `, 0 of ${r.total} heard` : ""}.
                        {r.planned && <> Planned: {r.planned.name}.</>}
                      </>
                    ) : (
                      <>
                        {(r.act?.lessons ?? []).slice(0, 2).map((l, i) => (
                          <span key={l.id}>
                            {i > 0 && " · "}
                            {l.subjectName ? `${l.subjectName}: ` : ""}
                            {l.topicName ?? l.title}
                          </span>
                        ))}
                        {(r.act?.assignments ?? []).slice(0, 2).map((a, i) => (
                          <span key={a.id}>
                            {((r.act?.lessons.length ?? 0) > 0 || i > 0) && " · "}
                            <span className="capitalize">{a.kind.replace("_", " ")}</span>: {a.title}
                          </span>
                        ))}
                        {r.isHifz && (r.act?.lessons.length ?? 0) === 0 && (r.act?.assignments.length ?? 0) === 0 && (
                          <>Round in progress.</>
                        )}
                      </>
                    )}
                  </span>
                  {r.isHifz ? (
                    <span className="flex w-full flex-col gap-1 sm:w-auto">
                      <span className="flex justify-between text-[11px] text-slate-500">
                        <span>Hifz heard</span>
                        <span className={"font-bold " + (r.heard > 0 ? "text-emerald-700" : "text-amber-700")}>
                          {r.heard}/{r.total}
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${r.total > 0 ? Math.round((r.heard / r.total) * 100) : 0}%`,
                            background: r.heard > 0 ? "#10b981" : "#f59e0b",
                          }}
                        />
                      </span>
                    </span>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <span className="sm:text-right">
                    {r.silent && isToday ? (
                      <button
                        type="button"
                        onClick={() => copyNudge(nudgeText(r), "Nudge copied")}
                        className="min-h-[32px] rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Nudge
                      </button>
                    ) : (
                      <Link
                        to={`/school/orgs/${orgId}/sections/${r.sectionId}${r.isHifz ? "/hifz" : ""}`}
                        className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open section
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Fallback for a backend without the roster field. */}
          {(data.roster ?? []).length === 0 && data.hifz.length > 0 && (
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

          {/* Per-section day activity (roster-less fallback). */}
          {(data.roster ?? []).length > 0 ? null : data.sections.length === 0 && data.hifz.every((h) => h.heard === 0) ? (
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
