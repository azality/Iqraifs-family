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
import {
  CheckCircle,
  ClipboardList,
  Sparkles,
  AlertTriangle,
  Users,
  ChevronRight,
  Eye,
} from "lucide-react";
import {
  getSectionsLeaderboard,
  getSectionBehaviorNotes,
  type LeaderboardRow,
  type BehaviorNote,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      {/* My sections grid */}
      {sections && sections.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            No sections assigned
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Your principal hasn't assigned you to a class yet. Once they do,
            you'll see roll-call, students, and behavior tools here.
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
