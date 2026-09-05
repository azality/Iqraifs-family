// Section overview — clicking a leaderboard row lands here.
//
// Design 8a ("Today first, plumbing second"): the page leads with a
// Today panel — attendance taken? lessons logged vs scheduled periods?
// homework due? — because that's the question a principal or teacher
// actually opens it with. Subjects render as compact syllabus-pace rows
// (row click expands logging links; topic checkboxes / reorder /
// templates live behind "Manage curriculum"), the empty behavior feed
// collapses to one line, the seven full-height nav cards become a
// two-column "Go to" link grid, and a "Needs a look" digest calls out
// the furthest-behind subjects and missing curricula.
//
// Routed at /school/orgs/:orgId/sections/:sectionId.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ClipboardCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { HeroCard, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  getSectionCurriculumProgress,
  getSectionsLeaderboard,
  getSectionBehaviorNotes,
  getSectionAttendance,
  getSectionLessons,
  getSectionTimetable,
  getSectionAssignments,
  getSectionHifzSummary,
  postAttendanceFlag,
  viewerRoleForOrg,
  type Assignment,
  type BehaviorNote,
  type Lesson,
  type LeaderboardRow,
  type SchoolMeResponse,
  type SectionAttendanceEntry,
  type SectionSubjectProgress,
  type TimetableWeekCell,
} from "../../../utils/schoolApi";
import { toast } from "sonner";
import { SectionSubjectsManager } from "./components/SectionSubjectsManager";
import { useOrgPermission } from "./useOrgPermission";

function todayIsoLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function SectionOverview() {
  const { orgId = "", sectionId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [row, setRow] = useState<LeaderboardRow | null>(null);
  // Per-child Quran model (Classes II-VIII): the Quran/Nazra SUBJECT
  // teacher logs each student's daily portion through the Hifz view.
  // The backend gate already admits them (requireTeacherOfSection
  // includes subject teachers since #337) - this flag just unhides the
  // card, WITHOUT granting the attendance/roll-call surface.
  const [teachesQuranHere, setTeachesQuranHere] = useState(false);
  const [subjects, setSubjects] = useState<SectionSubjectProgress[]>([]);
  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [loading, setLoading] = useState(true);
  // Today panel (8a): the day's actual state, loaded best-effort.
  const [todayAtt, setTodayAtt] = useState<SectionAttendanceEntry[] | null>(null);
  const [todayLessons, setTodayLessons] = useState<Lesson[] | null>(null);
  const [weekCells, setWeekCells] = useState<TimetableWeekCell[] | null>(null);
  const [dueAssignments, setDueAssignments] = useState<Assignment[] | null>(null);
  const [hifzHeard, setHifzHeard] = useState<{ heard: number; total: number } | null>(null);
  const [expandedSubj, setExpandedSubj] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    if (!sectionId) return;
    getSectionCurriculumProgress(sectionId)
      .then((r) => {
        setSubjects(r.subjects);
        setTeachesQuranHere(
          r.subjects.some(
            (sub) =>
              sub.teacherUserId != null &&
              sub.teacherUserId === me?.userId &&
              /quran|nazra/i.test(sub.name),
          ),
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, me?.userId]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    Promise.all([
      // Month-to-date, fixed — the hero's stat trio reads "attendance ·
      // month" (design 8a dropped the period toggle from this page).
      getSectionsLeaderboard(orgId, "MTD"),
      getSectionBehaviorNotes(orgId, sectionId),
    ])
      .then(([lb, bh]) => {
        const found = lb.sections.find((s) => s.sectionId === sectionId) ?? null;
        setRow(found);
        // Already sorted newest-first by the backend; cap to the 10 most
        // recent for the card view (drill-in page has full pagination).
        setNotes(bh.notes.slice(0, 10));
      })
      .finally(() => setLoading(false));
  }, [orgId, sectionId]);

  // Today panel data — each piece independent and best-effort.
  useEffect(() => {
    if (!orgId || !sectionId) return;
    const today = todayIsoLocal();
    getSectionAttendance(orgId, sectionId, { date: today })
      .then((r) => setTodayAtt(r.entries))
      .catch(() => setTodayAtt([]));
    getSectionLessons(orgId, sectionId, { startDate: today, endDate: today, limit: 50 })
      .then((r) => setTodayLessons(r.lessons))
      .catch(() => setTodayLessons([]));
    getSectionTimetable(orgId, sectionId)
      .then((r) => setWeekCells(r.cells))
      .catch(() => setWeekCells([]));
    getSectionAssignments(orgId, sectionId, { startDate: today, endDate: today, limit: 50 })
      .then((r: any) => setDueAssignments(r.assignments ?? []))
      .catch(() => setDueAssignments([]));
  }, [orgId, sectionId]);

  // Hifz classes: "N of M heard" is that section's real today-state.
  useEffect(() => {
    if (!orgId || !sectionId) return;
    if (!(row?.classKind === "hifz" || row?.scheduleKey === "hifz")) return;
    getSectionHifzSummary(orgId, sectionId)
      .then((r) => {
        const heard = r.students.filter(
          (s) => s.today && (s.today.sabaq || s.today.sabqi || s.today.manzil),
        ).length;
        setHifzHeard({ heard, total: r.students.length });
      })
      .catch(() => {});
  }, [orgId, sectionId, row?.classKind, row?.scheduleKey]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, { positive: number; concern: number; pts: number }>();
    for (const n of notes) {
      const cat = n.category ?? "uncategorized";
      const cur = counts.get(cat) ?? { positive: 0, concern: 0, pts: 0 };
      if (n.kind === "positive") cur.positive += 1;
      else cur.concern += 1;
      cur.pts += Math.abs(n.points ?? 0);
      counts.set(cat, cur);
    }
    return Array.from(counts.entries())
      .map(([cat, v]) => ({ category: cat, ...v, total: v.positive + v.concern }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [notes]);

  // "Needs a look" digest (8a): furthest-behind subject, zero-progress
  // subjects, subjects without a curriculum.
  const needsLook = useMemo(() => {
    const out: Array<{ tone: "rose" | "amber"; strong: string; rest: string }> = [];
    // Quran / Nazra / Qaidah are tracked per child (each student sits at
    // their own position in the Quran), not as a shared topic list — so
    // "no curriculum set up" is not a gap for them, it is the design.
    // Nagging about it sent teachers to an admin who had nothing to add.
    const trackedPerChild = (name: string) => /quran|nazra|nazira|qaidah|qaida|hifz/i.test(name);
    const gradedSubjects = subjects.filter((s) => !trackedPerChild(s.name));
    const withCur = gradedSubjects.filter((s) => s.curriculum && s.curriculum.topicTotal > 0);
    const zeros = withCur.filter((s) => s.curriculum!.topicCompleted === 0);
    const behind = withCur
      .filter((s) => s.curriculum!.topicCompleted > 0 && s.curriculum!.progressPct < 50)
      .sort((a, b) => a.curriculum!.progressPct - b.curriculum!.progressPct);
    if (behind[0]) {
      out.push({
        tone: "rose",
        strong: `${behind[0].name} ${behind[0].curriculum!.progressPct}%`,
        rest: `— furthest behind pace${behind[0].teacherName ? ` (${behind[0].teacherName})` : ""}`,
      });
    }
    if (zeros.length > 0) {
      out.push({
        tone: "amber",
        strong: `${zeros.map((s) => s.name).slice(0, 3).join(" & ")} 0%`,
        rest: "— no topics logged yet",
      });
    }
    const noCur = gradedSubjects.filter((s) => !s.curriculum || s.curriculum.topicTotal === 0);
    if (noCur.length > 0) {
      out.push({
        tone: "amber",
        strong: noCur.map((s) => s.name).slice(0, 3).join(", "),
        rest: `— no curriculum set up${noCur.length > 3 ? ` (+${noCur.length - 3} more)` : ""}`,
      });
    }
    return out;
  }, [subjects]);

  // Any non-other school role in this org can read the section overview.
  // Backend already enforces per-section scoping for class teachers and
  // visiting teachers (determineScope), so the page either renders their
  // own sections or returns empty data.
  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  // Effective define_curriculum for this viewer — lets a class teacher
  // the principal granted the permission edit the syllabus from here
  // (the admin Classes page bounces non-admins). Hook must run before
  // any early return so hook order stays stable across renders.
  const canEditCurriculum = useOrgPermission(orgId, viewerRole, "define_curriculum");
  // Students chip: the roster page requires admin or manage_students —
  // don't render a link that bounces a teacher to "no access".
  const canManageStudents = useOrgPermission(orgId, viewerRole, "manage_students");

  // Teachers came to this page to tick their syllabus topics (pre-8a
  // behavior): when the viewer teaches subjects in this section, open
  // the syllabus manager by default so their tick-boxes stay one
  // glance away rather than behind the toggle.
  useEffect(() => {
    if (!me?.userId) return;
    if (subjects.some((s) => s.teacherUserId === me.userId)) setManageOpen(true);
  }, [subjects, me?.userId]);

  if (meLoading) return null;
  if (viewerRole === "other") {
    return <NoAccessRedirect />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
          <p className="text-sm text-slate-500">Loading section…</p>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-3">
        <HeroCard title="Section not found" subtitle="No leaderboard row matches this section." />
        <Link to={`/school/orgs/${orgId}`}>
          <Button variant="outline" size="sm">← Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  const isHifzClass = row.classKind === "hifz" || row.scheduleKey === "hifz";
  // Attendance + Hifz are the section's own class/Hifz teacher's (or
  // admin's) tools — a subject teacher works through lessons / gradebook.
  // Missing ids = older cached backend; show rather than lock out.
  const canRollCall =
    viewerRole === "admin" || viewerRole === "principal" ||
    row.classTeacherUserId === undefined ||
    row.classTeacherUserId === me?.userId ||
    row.hifzTeacherUserId === me?.userId;

  const tileBase = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

  // ── Today panel derived values ──────────────────────────────────────
  const todayDow = ((new Date().getDay() + 6) % 7) + 1; // ISO 1=Mon
  const periodsToday = weekCells === null
    ? null
    : weekCells.filter((c) => c.entry && c.slot.dayOfWeek === todayDow).length;
  const lessonSubjects = [...new Set(
    (todayLessons ?? []).map((l) => l.subjectName).filter(Boolean) as string[],
  )];
  const todayIso = todayIsoLocal();
  const dueToday = (dueAssignments ?? []).filter((a) => a.due_date === todayIso);
  const attTaken = (todayAtt?.length ?? 0) > 0;
  const attCounts = { present: 0, absent: 0 };
  for (const e of todayAtt ?? []) {
    if (e.status === "present" || e.status === "late") attCounts.present += 1;
    if (e.status === "absent") attCounts.absent += 1;
  }
  const attendanceMissing = todayAtt !== null && !attTaken;
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  // Hero stat trio (8a): attendance · month, curriculum % across the
  // section's subjects, open concerns. Hifz classes have no syllabus —
  // the middle stat falls back to the student count.
  const withCurriculum = subjects.filter((s) => s.curriculum && s.curriculum.topicTotal > 0);
  const curriculumPct = withCurriculum.length > 0
    ? Math.round(withCurriculum.reduce((sum, s) => sum + s.curriculum!.progressPct, 0) / withCurriculum.length)
    : null;

  const goTo: Array<{ label: string; to: string } | null> = [
    canRollCall ? { label: "Attendance", to: `/school/orgs/${orgId}/sections/${sectionId}/attendance` } : null,
    (canRollCall || teachesQuranHere)
      ? { label: "Hifz progress", to: `/school/orgs/${orgId}/sections/${sectionId}/hifz` }
      : null,
    { label: "Lessons / diary", to: `/school/orgs/${orgId}/sections/${sectionId}/lessons` },
    { label: "Assignments", to: `/school/orgs/${orgId}/sections/${sectionId}/assignments` },
    { label: "Gradebook", to: `/school/orgs/${orgId}/sections/${sectionId}/gradebook` },
    (viewerRole === "admin" || viewerRole === "principal" || canManageStudents)
      ? { label: `Students (${row.studentCount})`, to: `/school/orgs/${orgId}/admin/students?classSectionId=${encodeURIComponent(sectionId)}` }
      : null,
    { label: "Behavior feed", to: `/school/orgs/${orgId}/sections/${sectionId}/behavior` },
    (viewerRole === "admin" || viewerRole === "principal")
      // Deep-link straight into THIS class's weekly grid, not the
      // school-wide picker (pilot: "it takes me to the school timetable").
      ? { label: "Timetable", to: `/school/orgs/${orgId}/admin/timetable?scope=section&id=${encodeURIComponent(sectionId)}` }
      : null,
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          to={`/school/orgs/${orgId}`}
          className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* Hero (8a): compact header — name + teacher line, stat trio
          (attendance · month / curriculum / concerns), and the primary
          Take attendance. The old four-tile KPI grid + sparkline +
          period toggle moved out; the leaderboard keeps the deep
          analytics. */}
      <HeroCard
        eyebrow="Section"
        title={`${row.className} · ${row.sectionName}`}
        subtitle={row.classTeacherName ? `Class teacher: ${row.classTeacherName} · ${row.studentCount} students` : `No class teacher assigned · ${row.studentCount} students`}
        rightSlot={
          canRollCall ? (
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}/attendance`}>
              <Button size="sm" className="h-8 bg-indigo-500 text-white hover:bg-indigo-400">
                <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Take attendance
              </Button>
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className="text-lg font-extrabold tabular-nums text-white">
              {row.attendancePct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-400">attendance · month</div>
          </div>
          {curriculumPct != null ? (
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">{curriculumPct}%</div>
              <div className="text-[11px] text-slate-400">
                curriculum · {subjects.length} subject{subjects.length === 1 ? "" : "s"}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">{row.studentCount}</div>
              <div className="text-[11px] text-slate-400">students</div>
            </div>
          )}
          <div>
            <div className={
              "text-lg font-extrabold tabular-nums " +
              (row.concernCount > 0 ? "text-amber-300" : "text-emerald-300")
            }>
              {row.concernCount}
            </div>
            <div className="text-[11px] text-slate-400">concerns · month</div>
          </div>
        </div>
      </HeroCard>

      {/* Two-column body (8a): today's state + subjects on the left,
          compact nav + digest on the right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Today panel — the question this page is opened with. */}
          <div className={
            "rounded-xl border p-4 " +
            (attendanceMissing ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white shadow-sm")
          }>
            <div className="mb-2.5 flex items-center gap-2">
              <span className={"h-2 w-2 rounded-full " + (attendanceMissing ? "bg-amber-500" : "bg-emerald-500")} />
              <span className={
                "text-xs font-extrabold uppercase tracking-wide " +
                (attendanceMissing ? "text-amber-800" : "text-slate-600")
              }>
                Today · {todayLabel}
              </span>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Attendance</span>
                {todayAtt === null ? (
                  <span className="text-slate-400">…</span>
                ) : attTaken ? (
                  <span className="font-semibold text-slate-800">
                    {attCounts.present} present
                    {attCounts.absent > 0 && <span className="text-rose-700"> · {attCounts.absent} absent</span>}
                  </span>
                ) : (
                  <span className="font-semibold text-amber-700">
                    not taken yet
                    {canRollCall && (
                      <Link to={`/school/orgs/${orgId}/sections/${sectionId}/attendance`} className="ml-1.5 font-medium text-indigo-700 hover:underline">
                        roll call →
                      </Link>
                    )}
                  </span>
                )}
              </div>
              {isHifzClass && hifzHeard && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span>Hifz heard</span>
                  <span className={"font-semibold " + (hifzHeard.heard === 0 ? "text-amber-700" : "text-slate-800")}>
                    {hifzHeard.heard} of {hifzHeard.total}
                    <Link to={`/school/orgs/${orgId}/sections/${sectionId}/hifz?round=1`} className="ml-1.5 font-medium text-indigo-700 hover:underline">
                      {hifzHeard.heard < hifzHeard.total ? "start round →" : "open log →"}
                    </Link>
                  </span>
                </div>
              )}
              {!isHifzClass && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span>Lessons logged</span>
                  {todayLessons === null || periodsToday === null ? (
                    <span className="text-slate-400">…</span>
                  ) : (
                    <span className="min-w-0 text-right font-semibold text-slate-800">
                      {todayLessons.length}{periodsToday > 0 ? ` of ${periodsToday} periods` : ""}
                      {lessonSubjects.length > 0 && (
                        <span className="font-normal text-slate-400"> · {lessonSubjects.slice(0, 3).join(", ")}</span>
                      )}
                    </span>
                  )}
                </div>
              )}
              {!isHifzClass && dueToday.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span>Homework due today</span>
                  <span className="min-w-0 text-right font-semibold text-slate-800">
                    {dueToday.length}
                    <span className="font-normal text-slate-400"> · {dueToday.slice(0, 2).map((a) => a.title).join(", ")}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Subjects — compact syllabus-pace rows. Curriculum admin
              (topic checkboxes, reorder, templates) lives behind
              "Manage curriculum"; logging links live in the row expand. */}
          {isHifzClass ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">This is a Hifz class</h3>
              <p className="mt-0.5 text-xs text-slate-600 max-w-xl">
                Hifz work is tracked per child — each student is at their own
                surah. Use <Link to={`/school/orgs/${orgId}/sections/${sectionId}/hifz`} className="font-medium text-emerald-800 underline">Hifz progress</Link>{" "}
                to record today&apos;s sabaq, sabqi and manzil. The program-wide
                view lives under Academics → Hifz program.
              </p>
            </div>
          ) : (
            <div className={tileBase}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">
                  Subjects · syllabus pace
                </h3>
                <button
                  type="button"
                  onClick={() => setManageOpen((v) => !v)}
                  className="text-xs font-semibold text-indigo-700 hover:underline"
                >
                  {viewerRole === "admin" || viewerRole === "principal" || canEditCurriculum
                    ? manageOpen ? "Hide curriculum manager" : "Manage curriculum →"
                    : manageOpen ? "Hide syllabus" : "View syllabus & tick topics →"}
                </button>
              </div>
              {subjects.length === 0 ? (
                <p className="py-1 text-xs text-slate-400">No subjects set up yet — use Manage curriculum.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {subjects.map((s) => {
                    const pct = s.curriculum?.progressPct ?? null;
                    const bar = pct == null ? "bg-slate-200" : pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
                    const fg = pct == null ? "text-slate-400" : pct >= 75 ? "text-emerald-700" : pct >= 40 ? "text-amber-700" : "text-rose-600";
                    const open = expandedSubj === s.sectionSubjectId;
                    return (
                      <div key={s.sectionSubjectId}>
                        <button
                          type="button"
                          onClick={() => setExpandedSubj(open ? null : s.sectionSubjectId)}
                          className="grid w-full grid-cols-[96px_minmax(0,1fr)_46px] items-center gap-3 py-2 text-left sm:grid-cols-[110px_minmax(0,1fr)_120px_46px]"
                        >
                          <span className="truncate text-[12.5px] font-bold text-slate-900">{s.name}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <span className={"block h-full rounded-full " + bar} style={{ width: `${Math.max(2, pct ?? 0)}%` }} />
                          </span>
                          <span className="hidden truncate text-[11px] text-slate-400 sm:block">{s.teacherName ?? "—"}</span>
                          <span className={"text-right text-xs font-bold tabular-nums " + fg}>
                            {pct == null ? "—" : `${pct}%`}
                          </span>
                        </button>
                        {open && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2.5 pl-1 text-xs text-slate-500">
                            <span>
                              {s.curriculum
                                ? `${s.curriculum.topicCompleted} of ${s.curriculum.topicTotal} topics done`
                                : "No curriculum mapped"}
                              {s.teacherName ? ` · ${s.teacherName}` : ""}
                            </span>
                            <Link
                              to={`/school/orgs/${orgId}/sections/${sectionId}/lessons/new`}
                              className="font-semibold text-indigo-700 hover:underline"
                            >
                              Log lesson →
                            </Link>
                            <Link
                              to={`/school/orgs/${orgId}/sections/${sectionId}/gradebook`}
                              className="font-semibold text-indigo-700 hover:underline"
                            >
                              Gradebook →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {manageOpen && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <SectionSubjectsManager
                    orgId={orgId}
                    sectionId={sectionId}
                    canManage={viewerRole === "principal" || viewerRole === "admin"}
                    canEditCurriculum={canEditCurriculum}
                    viewerUserId={me?.userId ?? null}
                  />
                </div>
              )}
            </div>
          )}

          {/* Behavior — one line while empty (8a), full card once it has
              content. */}
          {notes.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-[13px] text-slate-500">Behavior — no notes yet this term</span>
              <Link
                to={`/school/orgs/${orgId}/sections/${sectionId}/behavior`}
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                + Log behavior
              </Link>
            </div>
          ) : (
            <div className={tileBase}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Recent behavior</h3>
                  <p className="text-xs text-slate-500">Last 10 entries</p>
                </div>
                <Link
                  to={`/school/orgs/${orgId}/sections/${sectionId}/behavior`}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  View all →
                </Link>
              </div>

              {topCategories.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {topCategories.map((c) => {
                    const dominant = c.concern > c.positive ? "concern" : "positive";
                    const cls = dominant === "concern"
                      ? "bg-rose-50 text-rose-700 ring-rose-200"
                      : "bg-emerald-50 text-emerald-700 ring-emerald-200";
                    return (
                      <span key={c.category} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}>
                        {c.category} · {c.total}
                      </span>
                    );
                  })}
                </div>
              )}

              <ul className="divide-y divide-slate-100">
                {notes.map((n) => (
                  <li key={n.id} className="flex items-start gap-2 py-2">
                    <span
                      className={
                        "mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full " +
                        (n.kind === "positive" ? "bg-emerald-500" : "bg-rose-500")
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 capitalize truncate">
                          {n.category ?? "—"}
                        </span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{relativeDate(n.observedAt)}</span>
                      </div>
                      <p className="text-xs text-slate-600 truncate">{n.notes}</p>
                    </div>
                    <span
                      className={
                        "flex-shrink-0 text-xs font-medium tabular-nums " +
                        (n.kind === "positive" ? "text-emerald-700" : "text-rose-700")
                      }
                    >
                      {n.kind === "positive" ? "+" : ""}{n.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right rail: compact nav grid + digest. */}
        <div className="flex flex-col gap-4">
          <div className={tileBase}>
            <div className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-600">Go to</div>
            <div className="grid grid-cols-2 gap-1.5">
              {goTo.filter(Boolean).map((g) => (
                <Link
                  key={g!.label}
                  to={g!.to}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-800"
                >
                  {g!.label}
                </Link>
              ))}
            </div>
          </div>

          {!isHifzClass && needsLook.length > 0 && (
            <div className={tileBase}>
              <div className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-600">Needs a look</div>
              <div className="space-y-2 text-[13px] text-slate-600">
                {needsLook.map((n, i) => (
                  <div key={i}>
                    <span className={"font-bold " + (n.tone === "rose" ? "text-rose-600" : "text-amber-700")}>
                      {n.strong}
                    </span>{" "}
                    {n.rest}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subject teachers: read-only view of today's roll + a way to
              flag a headcount discrepancy. The class teacher decides. */}
          {!canRollCall && <TodayRollCard orgId={orgId} sectionId={sectionId} />}
        </div>
      </div>
    </div>
  );
}

// ─── Subject-teacher read-only roll + discrepancy flag ────────────────────
// Attendance stays the class teacher's to TAKE; a subject teacher can SEE
// today's register (so a headcount mismatch is checkable on the spot) and
// raise a flag the class teacher then resolves on the roll-call page.
function TodayRollCard({ orgId, sectionId }: { orgId: string; sectionId: string }) {
  const todayIso = todayIsoLocal();
  const [entries, setEntries] = useState<SectionAttendanceEntry[] | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagStudentId, setFlagStudentId] = useState<string>("");
  const [flagNote, setFlagNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSectionAttendance(orgId, sectionId, { date: todayIso })
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId]);

  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const e of entries ?? []) {
    if (e.status in counts) counts[e.status as keyof typeof counts] += 1;
  }
  const leftEarly = (entries ?? []).filter((e) => e.leftEarlyAt);
  const absentees = (entries ?? []).filter((e) => e.status === "absent");

  const submitFlag = async () => {
    if (!flagNote.trim()) { toast.error("Say what you observed"); return; }
    setBusy(true);
    try {
      await postAttendanceFlag(orgId, sectionId, {
        date: todayIso,
        studentId: flagStudentId || null,
        note: flagNote.trim(),
      });
      toast.success("Flag sent — the class teacher will review it");
      setFlagOpen(false); setFlagNote(""); setFlagStudentId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send flag");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Today's roll call</div>
      {entries === null ? (
        <p className="mt-1 text-xs text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Not taken yet today — the class teacher records it.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-600">
            <span className="font-semibold text-emerald-700">{counts.present} present</span>
            {counts.late > 0 && <> · {counts.late} late</>}
            {counts.absent > 0 && <> · <span className="text-rose-700">{counts.absent} absent</span></>}
            {counts.excused > 0 && <> · {counts.excused} excused</>}
          </p>
          {absentees.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-500">
              Absent: {absentees.map((e) => e.studentName).filter(Boolean).join(", ")}
            </p>
          )}
          {leftEarly.length > 0 && (
            <p className="mt-1 text-[11px] text-sky-700">
              Left early: {leftEarly.map((e) => `${e.studentName} (${e.leftEarlyReason ?? ""})`).join(", ")}
            </p>
          )}
        </>
      )}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setFlagOpen((o) => !o)}
          className="text-xs font-medium text-amber-700 hover:underline"
        >
          {flagOpen ? "Cancel" : "Flag a discrepancy…"}
        </button>
        {flagOpen && (
          <div className="mt-2 space-y-2">
            <select
              value={flagStudentId}
              onChange={(e) => setFlagStudentId(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="">Whole class / not sure who</option>
              {(entries ?? []).map((e) => (
                <option key={e.studentId} value={e.studentId}>
                  {e.studentName} (marked {e.status})
                </option>
              ))}
            </select>
            <textarea
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              placeholder="e.g. Marked present but not in my 3rd-period class"
              className="w-full rounded-md border border-slate-200 p-2 text-xs"
              rows={2}
            />
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={submitFlag}>
              {busy ? "Sending…" : "Send to class teacher"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
