// TeacherHome — section-scoped landing for class_teacher / visiting_teacher.
//
// Routed under /school/orgs/:orgId (index) via SchoolHomeRouter, which
// picks this when isSectionTeacherOnly(me, orgId) === true. Principals,
// admins, and org-scoped teachers still see PerformanceDashboard.
//
// Backend already scopes data per-caller via determineScope() in
// schoolDashboard.tsx — for a class teacher, getSectionsLeaderboard
// returns ONLY their assigned sections. So this page just composes the
// teacher-relevant pieces and links into existing per-section pages.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { UpNextCard } from "../../components/school-ui/UpNextCard";
import {
  CheckCircle,
  ClipboardList,
  Sparkles,
  AlertTriangle,
  Users,
  ChevronRight,
  Eye,
  ListChecks,
  Calendar,
  BookOpen,
  MapPin,
} from "lucide-react";
import {
  getSectionsLeaderboard,
  getMySectionSubjects,
  getMyTeacherSnapshot,
  getMyTeacherTimetable,
  getMyUpcoming,
  type MySectionSubject,
  type MyTimetableCell,
  type TeacherSnapshot,
  getSectionBehaviorNotes,
  type LeaderboardRow,
  type BehaviorNote,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

function todayDow(): number {
  // ISO day: Mon=1 ... Sun=7. JS getDay(): Sun=0.
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

interface Props {
  orgId: string;
  me: SchoolMeResponse;
}

function firstName(me: SchoolMeResponse | null): string {
  // /school/me doesn't return a name field today — fall back to a
  // friendly generic. The header still personalises the org name.
  const stored =
    typeof window !== "undefined"
      ? window.localStorage.getItem("fgs_user_name")
      : null;
  if (stored) return stored.split(/\s+/)[0];
  void me;
  return "Teacher";
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function statusTone(status: LeaderboardRow["status"]): string {
  if (status === "flagged") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "watch") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function pctTone(pct: number): string {
  if (pct >= 85) return "text-emerald-600";
  if (pct >= 70) return "text-amber-600";
  return "text-rose-600";
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.max(1, Math.round((now - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function TeacherHome({ orgId, me }: Props) {
  const [sections, setSections] = useState<LeaderboardRow[] | null>(null);
  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [mySubjects, setMySubjects] = useState<MySectionSubject[]>([]);
  const [snapshot, setSnapshot] = useState<TeacherSnapshot | null>(null);
  const [todayCells, setTodayCells] = useState<MyTimetableCell[]>([]);
  const [upcoming, setUpcoming] = useState<import("../../../utils/schoolApi").LessonPrepItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 4a: section_subjects this teacher owns, with curriculum progress.
  useEffect(() => {
    let cancelled = false;
    getMySectionSubjects()
      .then((r) => {
        if (!cancelled) setMySubjects(r.sectionSubjects);
      })
      .catch(() => {
        /* non-fatal — widget just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 6b: teacher-snapshot (topics due, untagged, grades to enter,
  // recent grades). Non-blocking — widgets hide if the call errors.
  useEffect(() => {
    let cancelled = false;
    getMyTeacherSnapshot()
      .then((r) => {
        if (!cancelled) setSnapshot(r);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 2 (timetable consumers): today's slots for the signed-in
  // teacher. Non-blocking widget — hidden silently on error / empty.
  // Smart "Up next" — backend pulls topic + lesson + resources per entry.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getMyUpcoming(orgId, 3)
      .then((r) => { if (!cancelled) setUpcoming(r.upcoming); })
      .catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getMyTeacherTimetable(orgId, { day: todayDow() })
      .then((r) => {
        if (!cancelled) {
          // Sort: substitutions-in (covering) first, then own entries.
          const sorted = [...r.cells].sort((a, b) => {
            const aCov = a.substitution?.role === "covering" ? 0 : 1;
            const bCov = b.substitution?.role === "covering" ? 0 : 1;
            if (aCov !== bCov) return aCov - bCov;
            return a.slot.startTime.localeCompare(b.slot.startTime);
          });
          setTodayCells(sorted);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSectionsLeaderboard(orgId, "WTD")
      .then(async (r) => {
        if (cancelled) return;
        setSections(r.sections);
        // Pull recent behavior notes across the teacher's sections.
        const all = await Promise.all(
          r.sections.map((s) =>
            getSectionBehaviorNotes(orgId, s.sectionId).catch(() => ({
              sectionId: s.sectionId,
              notes: [] as BehaviorNote[],
            })),
          ),
        );
        if (cancelled) return;
        const merged = all
          .flatMap((x) => x.notes)
          .filter((n): n is BehaviorNote => !!n)
          .sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))
          .slice(0, 5);
        setNotes(merged);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Could not load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Sections still needing today's attendance. Heuristic: last10Days[last]
  // is today's count; if 0, treat as not-yet-marked. Not perfect (could
  // be a true zero) but the only signal exposed without a new endpoint,
  // and benign — the worst case is a "Take attendance" nudge for a
  // section already marked, which is one click away from confirmation.
  const needRollCall = useMemo(() => {
    if (!sections) return [];
    return sections.filter(
      (s) => s.last10Days.length > 0 && s.last10Days[s.last10Days.length - 1] === 0,
    );
  }, [sections]);

  // Students to follow up on — derive from sections flagged as watch /
  // flagged. We don't have a per-student "needs follow-up" feed without
  // a new backend endpoint, so we surface sections rather than students
  // here; clicking goes to the per-section overview which has the
  // student-level detail.
  const sectionsToWatch = useMemo(() => {
    if (!sections) return [];
    return sections
      .filter((s) => s.status !== "compliant")
      .sort((a, b) => a.attendancePct - b.attendancePct)
      .slice(0, 4);
  }, [sections]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {firstName(me)}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{todayLabel()}</p>
        </div>
        {sections && sections.length > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            <ClipboardList className="h-3.5 w-3.5 text-indigo-500" />
            {sections.length} {sections.length === 1 ? "section" : "sections"}
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Loading your classes…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Could not load: {error}
        </div>
      )}

      {/* Smart "Up next" — driven by the lesson-prep endpoint. Replaces
          the old full-day listing. */}
      {upcoming !== null && (
        <UpNextCard items={upcoming} audience="teacher" orgId={orgId} />
      )}

      {/* Legacy: substitutions for today still surface here so the
          covering / covered teacher can see them without scrolling. */}
      {todayCells.some((c) => c.substitution) && (
        <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-900">
            <Calendar className="h-4 w-4 text-amber-600" />
            Substitutions today
          </h2>
          <div className="mt-2 space-y-1.5">
            {todayCells.filter((c) => c.substitution).map((c) => {
              const covering = c.substitution?.role === "covering";
              const covered = c.substitution?.role === "covered";
              return (
                <div
                  key={c.entry.id + (covering ? ":cov" : "")}
                  className={
                    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm " +
                    (covering
                      ? "border-amber-200 bg-amber-50"
                      : covered
                      ? "border-slate-200 bg-slate-50 opacity-70"
                      : "border-slate-200 bg-slate-50/40")
                  }
                >
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-slate-900">
                      {c.slot.name}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {c.slot.startTime}–{c.slot.endTime}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                      {c.entry.subjectName ?? "Class"}
                    </span>
                    <span className="text-xs text-slate-600">{c.scopeLabel}</span>
                    {c.entry.room && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" /> Room {c.entry.room}
                      </span>
                    )}
                    {covering && (
                      <span className="text-[11px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        Covering{c.substitution?.originalTeacherName ? ` for ${c.substitution.originalTeacherName}` : ""}
                      </span>
                    )}
                    {covered && (
                      <span className="text-[11px] font-medium text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">
                        Covered{c.substitution?.substituteTeacherName ? ` by ${c.substitution.substituteTeacherName}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Roll-call nudge */}
      {!loading && needRollCall.length > 0 && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <div className="font-medium">
                Attendance not yet recorded for{" "}
                {needRollCall.length === 1
                  ? "1 section"
                  : `${needRollCall.length} sections`}{" "}
                today
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {needRollCall.map((s) => (
                  <Link
                    key={s.sectionId}
                    to={`/school/orgs/${orgId}/sections/${s.sectionId}/attendance`}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    {s.className} · {s.sectionName}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My sections grid.
          If the teacher has subjects assigned but no sections, they're
          likely a visiting/specialist teacher (PR F #Q5 case) — they
          appear on subject pages and the timetable rather than owning
          a homeroom. Show a friendlier message in that case so the
          screen doesn't read as "your principal forgot you." */}
      {sections && sections.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            {mySubjects.length > 0 ? "Subject teacher" : "No sections assigned"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {mySubjects.length > 0
              ? "You're set up as a subject teacher — your assigned subjects are listed below. Class teachers see roll-call here."
              : "Your principal hasn't assigned you to a class yet. Once they do, you'll see roll-call, students, and behavior tools here."}
          </p>
        </div>
      )}

      {sections && sections.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              My classes
            </h2>
            <span className="text-xs text-slate-400">Week-to-date</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {sections.map((s) => (
              <div
                key={s.sectionId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-slate-400">
                      {s.className}
                    </div>
                    <div className="mt-0.5 text-base font-semibold text-slate-900">
                      Section {s.sectionName}
                    </div>
                  </div>
                  <span
                    className={
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 " +
                      statusTone(s.status)
                    }
                  >
                    {s.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className={"text-lg font-semibold " + pctTone(s.attendancePct)}>
                      {Math.round(s.attendancePct)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Attendance
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      {s.studentCount}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Students
                    </div>
                  </div>
                  <div>
                    <div
                      className={
                        "text-lg font-semibold " +
                        (s.behaviorScore >= 0 ? "text-emerald-600" : "text-rose-600")
                      }
                    >
                      {s.behaviorScore >= 0 ? "+" : ""}
                      {s.behaviorScore}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      Behavior
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/school/orgs/${orgId}/sections/${s.sectionId}/attendance`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Take attendance
                  </Link>
                  <Link
                    to={`/school/orgs/${orgId}/sections/${s.sectionId}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Overview
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Phase 4a: My subjects across sections, with curriculum progress.
          Helps a teacher who teaches multiple subjects per section (or the
          same subject across sections) see the academic-content view of
          their workload rather than only the homeroom view above. */}
      {mySubjects.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              My subjects
            </h2>
            <span className="text-xs text-slate-400">
              Curriculum progress · this academic year
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {mySubjects.map((s) => {
              const pct = s.curriculum?.progressPct ?? 0;
              const pctTone =
                pct >= 75
                  ? "bg-emerald-500"
                  : pct >= 40
                  ? "bg-amber-500"
                  : "bg-rose-500";
              return (
                <Link
                  key={s.id}
                  to={`/school/orgs/${s.orgId}/sections/${s.classSectionId}/assignments`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider text-slate-400">
                        {s.className ?? "Class"} ·{" "}
                        {s.sectionName ?? "Section"}
                      </div>
                      <div className="mt-0.5 text-base font-semibold text-slate-900">
                        {s.subjectName}
                      </div>
                    </div>
                    {s.curriculum && (
                      <span className="text-xs text-slate-500">
                        {s.curriculum.academicYear}
                      </span>
                    )}
                  </div>

                  {s.curriculum ? (
                    <>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {s.curriculum.topicCompleted}/{s.curriculum.topicTotal} topics
                        </span>
                        <span className="font-semibold text-slate-700">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={"h-full " + pctTone}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">
                      No curriculum defined yet — ask your admin to set up the
                      syllabus for {s.subjectName}.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50">
                      Assignments
                    </span>
                    <Link
                      to={`/school/orgs/${s.orgId}/sections/${s.classSectionId}/gradebook`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Gradebook
                    </Link>
                    <Link
                      to={`/school/orgs/${s.orgId}/sections/${s.classSectionId}/lessons`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Lessons
                    </Link>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Phase 6b: focused-work widgets — topics due soon, assignments
          waiting on grades, untagged lessons nudge, recent grades I gave.
          Hidden when the snapshot has nothing to surface, so a brand-new
          teacher account doesn't see four empty cards. */}
      {snapshot &&
        (snapshot.topicsDueSoon.length > 0 ||
          snapshot.assignmentsToGrade.length > 0 ||
          snapshot.untaggedLessonsCount > 0 ||
          snapshot.recentGradesGiven.length > 0) && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Focus this week
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Topics due soon */}
              {snapshot.topicsDueSoon.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Topics due soon
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
                      <ListChecks className="h-2.5 w-2.5" />
                      {snapshot.topicsDueSoon.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {snapshot.topicsDueSoon.slice(0, 5).map((t) => {
                      const due = new Date(t.targetDate);
                      const days = Math.max(
                        0,
                        Math.round(
                          (due.getTime() - Date.now()) /
                            (24 * 60 * 60 * 1000),
                        ),
                      );
                      const tone =
                        days <= 3
                          ? "text-rose-700"
                          : days <= 7
                          ? "text-amber-700"
                          : "text-slate-700";
                      return (
                        <li key={t.topicId} className="py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {t.topicName}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {t.subjectName}
                                {t.className ? ` · ${t.className}` : ""}
                              </div>
                            </div>
                            <span className={"text-[10px] font-semibold whitespace-nowrap " + tone}>
                              {days === 0
                                ? "today"
                                : days === 1
                                ? "tomorrow"
                                : `${days}d`}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Assignments to grade */}
              {snapshot.assignmentsToGrade.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Grades to enter
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {snapshot.assignmentsToGrade.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {snapshot.assignmentsToGrade.map((a) => (
                      <li key={a.assignmentId} className="py-2">
                        <Link
                          to={`/school/orgs/${orgId}/sections/${a.classSectionId}/gradebook`}
                          className="block hover:bg-slate-50 -mx-2 px-2 rounded"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {a.title}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {a.subjectName ?? "General"} · due{" "}
                                {new Date(a.dueDate).toLocaleDateString()}
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold text-amber-700 whitespace-nowrap">
                              {a.missingCount}/{a.rosterSize} ungraded
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Untagged lessons nudge */}
              {snapshot.untaggedLessonsCount > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm md:col-span-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-amber-900">
                        {snapshot.untaggedLessonsCount} of your lessons (last 30
                        days) have no subject tag
                      </div>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Tag them to subjects so curriculum progress updates and
                        parents see the academic context.
                      </p>
                      {snapshot.untaggedLessons.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {snapshot.untaggedLessons.slice(0, 3).map((l) => (
                            <li key={l.lessonId}>
                              <Link
                                to={`/school/orgs/${orgId}/lessons/${l.lessonId}/edit`}
                                className="text-[11px] text-amber-900 hover:underline"
                              >
                                {new Date(l.lessonDate).toLocaleDateString()} ·{" "}
                                {l.title}
                                {l.sectionName
                                  ? ` (${l.className ?? ""} ${l.sectionName})`
                                  : ""}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent grades I gave */}
              {snapshot.recentGradesGiven.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Recent grades you entered
                    </h3>
                    <span className="text-[10px] text-slate-500">
                      Latest {snapshot.recentGradesGiven.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {snapshot.recentGradesGiven.map((g) => {
                      const pct =
                        g.score != null && g.maxScore && g.maxScore > 0
                          ? Math.round((g.score / g.maxScore) * 100)
                          : null;
                      const tone =
                        pct == null
                          ? "text-slate-500"
                          : pct >= 80
                          ? "text-emerald-700"
                          : pct >= 60
                          ? "text-amber-700"
                          : "text-rose-700";
                      return (
                        <li key={g.gradeId} className="py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {g.studentName}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {g.subjectName ? `${g.subjectName} · ` : ""}
                                {g.assignmentTitle}
                              </div>
                            </div>
                            <span className={"text-xs font-semibold tabular-nums " + tone}>
                              {g.score == null
                                ? g.status
                                : g.maxScore
                                ? `${g.score}/${g.maxScore}`
                                : g.score}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

      {/* Sections needing attention */}
      {sectionsToWatch.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Needs attention
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {sectionsToWatch.map((s) => (
                <li key={s.sectionId}>
                  <Link
                    to={`/school/orgs/${orgId}/sections/${s.sectionId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {s.className} · {s.sectionName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {s.status === "flagged"
                          ? "Attendance below 60% this period"
                          : "Attendance trending down"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={"text-sm font-semibold " + pctTone(s.attendancePct)}>
                        {Math.round(s.attendancePct)}%
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Recent behavior notes */}
      {notes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent behavior notes
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Sparkles
                      className={
                        "mt-0.5 h-4 w-4 flex-shrink-0 " +
                        (n.kind === "positive" ? "text-emerald-500" : "text-rose-500")
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {n.studentName ?? "Student"}{" "}
                          {n.category && (
                            <span className="font-normal text-slate-500">
                              · {n.category}
                            </span>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-xs text-slate-400">
                          {timeAgo(n.observedAt)}
                        </span>
                      </div>
                      {n.notes && (
                        <div className="mt-0.5 text-xs text-slate-600 line-clamp-2">
                          {n.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

export default TeacherHome;
