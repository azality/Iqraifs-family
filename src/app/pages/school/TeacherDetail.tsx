// Admin detail view for a single staff member (teacher / visiting teacher
// / office staff / financial staff). Routed at
// /school/orgs/:orgId/admin/teachers/:userId.
//
// Design 7a (Sep 2026): mirrors the student profile (5b). The navy hero
// answers "who is this and are they doing the daily work" before any tab
// opens — role pills, sections + subjects, roll-call/week-load/last-active
// quick stats. Account plumbing (profile fields, password reset, resend
// invite, remove-from-staff) lives behind the Account tab so the landing
// view is the coaching agenda, not the office toolbox. During the
// new-staff ramp the pace pills are actually MUTED (gray "pace muted ·
// ramp") instead of painting red −pp deltas under a banner that says to
// ignore them.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  GraduationCap,
  Mail,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  Calendar,
  UserCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
} from "../../components/school-ui";
import {
  getTeacherDetail,
  deleteTeacher,
  resendInvite,
  getSchoolMe,
  isOrgAdmin,
  updateTeacherProfile,
  resetTeacherPassword,
  getTeacherPerformance,
  listTeacherEntries,
  listAdminTeachers,
  type TeacherDetail as TeacherDetailType,
  type TeacherEntrySummary,
  type AdminTeacher,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const ROLE_LABEL: Record<string, string> = {
  class_teacher: "Class Teacher",
  visiting_teacher: "Visiting Teacher",
  teacher: "Teacher",
  financial_staff: "Financial Staff",
  office_staff: "Office Staff",
  incharge: "Incharge",
  admin: "Admin",
  principal: "Principal",
};

const ROLE_BADGE_CLS: Record<string, string> = {
  class_teacher: "bg-indigo-50 text-indigo-700 border-indigo-200",
  visiting_teacher: "bg-amber-50 text-amber-700 border-amber-200",
  financial_staff: "bg-emerald-50 text-emerald-700 border-emerald-200",
  office_staff: "bg-sky-50 text-sky-700 border-sky-200",
  incharge: "bg-violet-50 text-violet-700 border-violet-200",
  teacher: "bg-slate-50 text-slate-700 border-slate-200",
};

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

/** "HH:MM" → minutes since midnight. */
function mins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** last_sign_in_at → "today" / "yesterday" / "3d ago" / short date / "never". */
function lastActiveLabel(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d}d ago`;
  return fmtDate(iso);
}

export function TeacherDetail() {
  const { orgId = "", userId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "performance";
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [detail, setDetail] = useState<TeacherDetailType | null>(null);
  // Admin-editable profile (pilot Sep 3): name / email / phone, plus a
  // temp-password reset that forces the teacher to choose their own at
  // next login (mirrors the parent-PIN model).
  const [profileForm, setProfileForm] = useState({ fullName: "", email: "", phone: "" });
  const [profileBusy, setProfileBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  // Teacher Track Record Phase 1 — aggregated performance for this
  // staff member, per term. See the scope artifact for definitions.
  const [perf, setPerf] = useState<any>(null);
  const [perfTerm, setPerfTerm] = useState<string>("");
  const [perfLoading, setPerfLoading] = useState(true);
  // Hero quick stats: timetable entries (week load + subjects taught) and
  // the staff-list row (last_sign_in_at). Both best-effort.
  const [entries, setEntries] = useState<TeacherEntrySummary[] | null>(null);
  // undefined = still loading; null = loaded but not in the staff list
  // (e.g. an org admin) — keeps "last active" from flashing "never".
  const [adminRow, setAdminRow] = useState<AdminTeacher | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !userId) return;
    setPerfLoading(true);
    getTeacherPerformance(orgId, userId, perfTerm || undefined)
      .then(setPerf)
      .catch(() => setPerf(null))
      .finally(() => setPerfLoading(false));
  }, [orgId, userId, perfTerm]);

  useEffect(() => {
    if (!orgId || !userId) return;
    listTeacherEntries(orgId, userId)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
    listAdminTeachers(orgId)
      .then((rows) => setAdminRow(rows.find((t) => t.user_id === userId) ?? null))
      .catch(() => setAdminRow(null));
  }, [orgId, userId]);

  useEffect(() => {
    if (!orgId || !userId) return;
    setLoading(true);
    setError(null);
    getTeacherDetail(orgId, userId)
      .then((d) => {
        setDetail(d);
        setProfileForm({
          fullName: d.fullName ?? "",
          email: d.email ?? "",
          phone: (d as any).phone ?? "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [orgId, userId]);

  const saveProfile = async () => {
    setProfileBusy(true);
    try {
      await updateTeacherProfile(orgId, userId, {
        fullName: profileForm.fullName.trim() || undefined,
        email: profileForm.email.trim() || undefined,
        phone: profileForm.phone,
      });
      setNotice("Profile updated. Name/email changes apply on their next sign-in.");
      setError(null);
      const d = await getTeacherDetail(orgId, userId);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm("Reset this staff member's password? They'll get a temporary password and must choose their own at next login.")) return;
    setProfileBusy(true);
    try {
      const res = await resetTeacherPassword(orgId, userId);
      setTempPassword(res.tempPassword);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileBusy(false);
    }
  };

  if (meLoading) return null;
  // Detail view is for admins/principals only; class teachers shouldn't
  // see other staff members' records.
  if (!isOrgAdmin(me, orgId)) {
    return <Navigate to={`/school/orgs/${orgId}`} replace />;
  }

  const handleResend = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await resendInvite(orgId, detail.userId);
      if (res.sent) {
        setNotice(`Invite email re-sent to ${res.email ?? detail.email}.`);
        setError(null);
      } else {
        setError(`Could not send invite: ${res.reason ?? "unknown reason"}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const label = detail.fullName || detail.email;
    if (!confirm(`Remove ${label} from this school's staff?\n\nTheir login still works (they just lose access to this school's admin/teacher pages). You can re-add them later.`)) return;
    setBusy(true);
    try {
      await deleteTeacher(orgId, detail.userId);
      // Redirect back to the list — the detail row will 404 once the
      // last assignment is revoked.
      window.location.href = `/school/orgs/${orgId}/admin/teachers`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <HeroCard title="Staff member" subtitle="Loading…" ignoreBranding />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="space-y-5">
        <HeroCard title="Staff member" subtitle={error ?? "Not found"} ignoreBranding />
        <Link
          to={`/school/orgs/${orgId}/admin/teachers`}
          className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to staff list
        </Link>
      </div>
    );
  }

  // ── Hero derivations (plain computations — no hooks below the early
  //    returns, the recurring pilot crash class). ─────────────────────────
  const initials =
    (detail.fullName || detail.email || "?")
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  // Incharge rows aren't in `assignments` (the detail endpoint returns the
  // five teaching/office roles only) — the staff-list row carries the wing.
  const inchargeCount = adminRow?.inchargeClasses?.length ?? 0;
  // One pill per distinct role (class_teacher repeats per section — the
  // sections themselves are named in the subtitle line).
  const rolePillLabels = [...new Set(
    detail.assignments.map((a) => ROLE_LABEL[a.roleType] ?? a.roleType),
  )];

  // "Class teacher of" comes from class_section ownership (via the perf
  // footprint) — most pilots grant class_teacher at org scope, so the
  // assignments list can't name the sections.
  const sectionNames: string[] = perf?.footprint?.ownedSections ?? [];
  const hifzSectionNames: string[] = perf?.footprint?.hifzSections ?? [];
  const subjects = entries
    ? [...new Set(entries.map((e) => e.subjectName).filter(Boolean) as string[])]
    : [];

  const weekPeriods = entries?.length ?? null;
  const weekHours = entries
    ? Math.round(
        (entries.reduce(
          (s, e) => s + Math.max(0, mins(e.slot.endTime) - mins(e.slot.startTime)),
          0,
        ) / 60) * 10,
      ) / 10
    : null;

  const rollCall = perf?.consistency?.rollCall ?? null;
  const inRamp = !!perf?.ramp?.inRamp;
  const rampUntil: string | null = perf?.ramp?.rampUntil ?? null;
  // Ramp is 42 days from first grant; derive "wk N/6" from days remaining.
  let rampWeek = 1;
  if (rampUntil) {
    const daysLeft = Math.ceil((new Date(rampUntil).getTime() - Date.now()) / 86400000);
    rampWeek = Math.min(6, Math.max(1, 6 - Math.ceil(daysLeft / 7) + 1));
  }

  // Roll-call deep link: owned-section refs are additive in
  // v1.0.89-teacher-profile — link appears once the backend ships them.
  const firstSection: { id: string; label: string } | null =
    perf?.footprint?.ownedSectionRefs?.[0] ?? null;
  const rollCallHref = firstSection
    ? `/school/orgs/${orgId}/sections/${firstSection.id}/attendance`
    : null;

  const lastActive =
    adminRow === undefined ? "…" : adminRow === null ? "—" : lastActiveLabel(adminRow.last_sign_in_at);
  const neverSignedIn = adminRow != null && !adminRow.last_sign_in_at;

  const paceMutedPill = (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
      pace muted · ramp
    </span>
  );

  // Schedule tab: entries grouped by ISO day, sorted by start time.
  const dayGroups = entries
    ? [1, 2, 3, 4, 5, 6, 7]
        .map((d) => ({
          day: d,
          rows: entries
            .filter((e) => e.slot.dayOfWeek === d)
            .sort((a, b) => mins(a.slot.startTime) - mins(b.slot.startTime)),
        }))
        .filter((g) => g.rows.length > 0)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          to={`/school/orgs/${orgId}/admin/teachers`}
          className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to staff list
        </Link>
      </div>

      {/* Hero — 7a: who is this, what do they do, are they doing the
          daily work. Mirrors the student profile hero (5b). */}
      <HeroCard
        eyebrow="Staff member"
        title={detail.fullName || "(no name)"}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {inchargeCount > 0 && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                Incharge · {inchargeCount}
              </span>
            )}
            {rolePillLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-100 ring-1 ring-white/25"
              >
                {label}
              </span>
            ))}
            {inRamp && (
              <span
                className="rounded-full bg-sky-400/20 px-2.5 py-0.5 text-[11px] font-bold text-sky-200 ring-1 ring-sky-300/40"
                title={`New this term — pace judgments muted until ${rampUntil}`}
              >
                ramp · wk {rampWeek}/6
              </span>
            )}
            {sectionNames.length > 0 && (
              <span className="text-slate-200">{sectionNames.join(", ")} (class teacher)</span>
            )}
            {hifzSectionNames.length > 0 && (
              <span className="text-emerald-200">{hifzSectionNames.join(", ")} (hifz)</span>
            )}
            {subjects.length > 0 && (
              <span className="text-slate-300">
                teaches {subjects.slice(0, 4).join(", ")}
                {subjects.length > 4 ? ` +${subjects.length - 4}` : ""}
              </span>
            )}
            {detail.email && <span className="text-slate-400">{detail.email}</span>}
          </span>
        }
        rightSlot={
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 rounded-full bg-indigo-500/40 flex items-center justify-center text-white font-bold text-lg ring-2 ring-white/20">
              {initials}
            </div>
            <div className="flex flex-col gap-1.5">
              <Link to={`/school/orgs/${orgId}/admin/teachers/${userId}/schedule`}>
                <Button size="sm" className="h-7 w-full bg-white text-slate-900 hover:bg-slate-100">
                  <CalendarDays className="h-3.5 w-3.5 mr-1" /> Weekly schedule
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleResend} disabled={busy || !detail.email}>
                    <Mail className="h-3.5 w-3.5 mr-2" /> Resend invite email
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleResetPassword} disabled={profileBusy}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Reset password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} disabled={busy} className="text-rose-700 focus:text-rose-700">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove from staff
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      >
        {/* Quick stats trio — roll calls / week load / last active. */}
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className={
              "text-lg font-extrabold tabular-nums " +
              (rollCall && rollCall.markedDays === 0 && rollCall.schoolDays > 0
                ? "text-amber-300"
                : "text-white")
            }>
              {rollCall ? `${rollCall.markedDays}/${rollCall.schoolDays}` : "—"}
            </div>
            <div className="text-[11px] text-slate-400">roll calls marked</div>
          </div>
          <div>
            <div className="text-lg font-extrabold tabular-nums text-white">
              {weekHours == null ? "…" : `${weekHours}h`}
            </div>
            <div className="text-[11px] text-slate-400">
              week{weekPeriods != null ? ` · ${weekPeriods} periods` : ""}
            </div>
          </div>
          <div>
            <div className={
              "text-lg font-extrabold " + (neverSignedIn ? "text-amber-300" : "text-white")
            }>
              {lastActive}
            </div>
            <div className="text-[11px] text-slate-400">last active</div>
          </div>
        </div>
      </HeroCard>

      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {tempPassword && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
          <div className="text-[11px] uppercase tracking-wide text-emerald-700">
            Temporary password — share with the staff member
          </div>
          <div className="mt-1 text-2xl font-bold tracking-widest text-emerald-900">{tempPassword}</div>
          <div className="mt-1 text-[11px] text-emerald-800">
            They sign in with it once and are asked to choose their own password.
          </div>
        </div>
      )}

      <Tabs defaultValue={initialTab} className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="sections">Sections &amp; subjects</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>
          {perf?.terms?.length > 0 && (
            <select
              value={perfTerm || (perf.term?.id ?? "")}
              onChange={(e) => setPerfTerm(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
            >
              {perf.terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Performance — Teacher Track Record Phase 1. Read as a
            coaching agenda, not a scoreboard: term-scoped, ramp-aware,
            admin/principal only (backend-gated). ─────────────────────── */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          {perfLoading ? (
            <p className="text-sm text-slate-500">Computing…</p>
          ) : !perf || perf.empty ? (
            <section className={`${cardBase} ${cardElev} p-5`}>
              <p className="text-sm text-slate-500">
                No sections or subjects assigned yet — nothing to measure.
              </p>
            </section>
          ) : (
            <>
              {inRamp && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  New-staff ramp until {rampUntil} — pace comparisons are{" "}
                  <strong>muted</strong> below; the numbers show, the judgments don't.
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {/* Consistency */}
                <section className={`${cardBase} ${cardElev} p-5`}>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Is the daily work happening?
                  </div>
                  <div className="mt-3 space-y-2.5 text-sm text-slate-600">
                    {rollCall && (
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                        <span>Roll call marked</span>
                        <span className="min-w-0 text-right tabular-nums">
                          <span className={
                            "font-bold " +
                            (rollCall.markedDays === 0 && rollCall.schoolDays > 0
                              ? "text-amber-700"
                              : "text-slate-800")
                          }>
                            {rollCall.markedDays} of {rollCall.schoolDays} days
                          </span>
                          {rollCallHref && (
                            <Link to={rollCallHref} className="ml-2 text-xs text-indigo-700 hover:underline">
                              open {firstSection?.label} roll call →
                            </Link>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span>Lessons logged</span>
                      <span className="min-w-0 text-right font-bold tabular-nums text-slate-800">
                        {perf.consistency.lessonsLogged}
                        <span className="font-normal text-slate-400">
                          {" "}· {perf.consistency.lessonsPerWeek}/wk of {perf.consistency.scheduledPerWeek} periods scheduled
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span>Grading turnaround</span>
                      <span className="min-w-0 text-right tabular-nums">
                        {perf.consistency.gradebookFreshnessDays == null ? (
                          <span className="text-slate-400">no graded work yet</span>
                        ) : (
                          <span className="font-bold text-slate-800">
                            {perf.consistency.gradebookFreshnessDays}d median
                          </span>
                        )}
                        {perf.consistency.ungradedPastDue > 0 && (
                          <span className="ml-2 text-xs font-semibold text-amber-700">
                            {perf.consistency.ungradedPastDue} ungraded
                          </span>
                        )}
                      </span>
                    </div>
                    {perf.hifz && (
                      <div className="flex items-center justify-between gap-3">
                        <span>Hifz heard-rate</span>
                        <span className="font-bold tabular-nums text-emerald-700">
                          {perf.hifz.heardRatePct}%
                          <span className="font-normal text-slate-400">
                            {" "}· {perf.hifz.avgHeardPerDay}/{perf.hifz.roster} per day
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Pace — during ramp the judgment pill is muted; the
                    topic counts still show. */}
                <section className={`${cardBase} ${cardElev} p-5`}>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Is the syllabus on pace?
                  </div>
                  {perf.pace.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No syllabus mapped to their subjects yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2.5 text-sm text-slate-600">
                      {perf.pace.map((pc: any, i: number) => (
                        <div key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold text-slate-800">{pc.subjectName}</span>
                            <span className="text-slate-500"> · {pc.sectionLabel}</span>
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <span className="text-slate-600">{pc.topicsDone}/{pc.topicsTotal} topics</span>
                            {inRamp ? (
                              paceMutedPill
                            ) : pc.deltaPp != null ? (
                              <span className={
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                                (pc.deltaPp >= 0
                                  ? "bg-emerald-50 text-emerald-700"
                                  : pc.deltaPp <= -15
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-800")
                              }>
                                {pc.deltaPp >= 0 ? "+" : ""}{pc.deltaPp}pp vs pace
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                      {inRamp && (
                        <p className="text-[11px] text-slate-400">
                          After {rampUntil} these pills become the normal green/amber/red vs-pace deltas.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {/* Outcomes */}
              {perf.outcomes.length > 0 && (
                <section className={`${cardBase} ${cardElev} p-5`}>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    How are the students doing?
                    <span className="ml-2 normal-case font-normal tracking-normal">pass ≥ {perf.passMarkPct}%</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {perf.outcomes.map((o: any, i: number) => (
                      <div key={i} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{o.subjectName}</span>
                          <span className="tabular-nums text-slate-700">
                            avg {o.avgPct}% · pass {o.passRatePct}% · {o.gradesEntered} grades
                            {o.prevTermAvgPct != null && (
                              <span className={"ml-2 font-semibold " + (o.avgPct >= o.prevTermAvgPct ? "text-emerald-700" : "text-rose-700")}>
                                {o.avgPct >= o.prevTermAvgPct ? "▲" : "▼"} vs last term {o.prevTermAvgPct}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          {o.buckets.below40 > 0 && <div className="bg-rose-400" style={{ width: `${(o.buckets.below40 / o.gradesEntered) * 100}%` }} />}
                          {o.buckets.b40to59 > 0 && <div className="bg-amber-400" style={{ width: `${(o.buckets.b40to59 / o.gradesEntered) * 100}%` }} />}
                          {o.buckets.b60to79 > 0 && <div className="bg-emerald-400" style={{ width: `${(o.buckets.b60to79 / o.gradesEntered) * 100}%` }} />}
                          {o.buckets.b80plus > 0 && <div className="bg-emerald-600" style={{ width: `${(o.buckets.b80plus / o.gradesEntered) * 100}%` }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Distribution: &lt;40 · 40–59 · 60–79 · 80+. Term comparison appears
                    once a second term has grades.
                  </p>
                </section>
              )}

              {/* Hifz depth */}
              {perf.hifz && (
                <section className={`${cardBase} ${cardElev} p-5`}>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Hifz progress
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-md border border-slate-200 px-3 py-1.5 tabular-nums">
                      {perf.hifz.newAyahs} new ayahs · {perf.hifz.ayahsPerStudent}/student
                    </span>
                    {Object.entries(perf.hifz.qualityMix as Record<string, number>).map(([q, n]) => (
                      <span key={q} className="rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                        {q.replace("_", " ")}: <span className="font-semibold tabular-nums">{n as number}</span>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Engagement strip */}
              <section className={`${cardBase} ${cardElev} p-4`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Engagement
                  </span>
                  <span className="tabular-nums">
                    {perf.engagement.behaviorNotes} behavior notes
                    <span className="text-slate-400"> ({perf.engagement.positiveNotes}+ / {perf.engagement.concernNotes}−)</span>
                  </span>
                  {perf.engagement.resourceRatePct != null && (
                    <span className="tabular-nums">{perf.engagement.resourceRatePct}% lessons with resources</span>
                  )}
                  {perf.engagement.quizShare != null && (
                    <span className="tabular-nums">
                      {perf.engagement.quizShare}% quizzes of {perf.engagement.assignmentsGiven} assignments
                    </span>
                  )}
                  <span className="tabular-nums">
                    subs covered {perf.engagement.substitutionsCovered} · needed {perf.engagement.substitutionsNeeded}
                  </span>
                </div>
              </section>
            </>
          )}
        </TabsContent>

        {/* ── Schedule — compact week agenda; the full grid (with clash
            outlines) stays one click away. ──────────────────────────── */}
        <TabsContent value="schedule" className="mt-4 space-y-4">
          <section className={`${cardBase} ${cardElev} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={sectionTitleClasses}>This week</h3>
              <Link
                to={`/school/orgs/${orgId}/admin/teachers/${userId}/schedule`}
                className="text-sm font-medium text-indigo-700 hover:underline"
              >
                Open full weekly grid →
              </Link>
            </div>
            {entries === null ? (
              <p className="mt-3 text-sm text-slate-500">Loading…</p>
            ) : dayGroups.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No timetable entries yet — assign periods from the timetable editor.
              </p>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {dayGroups.map((g) => (
                  <div key={g.day} className="rounded-lg border border-slate-100 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      {DAY_NAMES[g.day]}
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {g.rows.length} period{g.rows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {g.rows.map((e) => (
                        <div key={e.id} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums">
                            {e.slot.startTime.slice(0, 5)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                            {e.subjectName ?? "—"}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">{e.scopeLabel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Sections & subjects — every active user_roles row for this
            user in this org, org-scoped roles first. ────────────────── */}
        <TabsContent value="sections" className="mt-4 space-y-4">
          <section className={`${cardBase} ${cardElev} p-5`}>
            <h3 className={sectionTitleClasses}>
              Active assignments
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({detail.assignments.length})
              </span>
            </h3>
            <div className="mt-4 divide-y divide-slate-100 border-t border-b border-slate-100">
              {detail.assignments.map((a) => (
                <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      variant="outline"
                      className={
                        (ROLE_BADGE_CLS[a.roleType] ?? "bg-slate-50 text-slate-700 border-slate-200") +
                        " text-[10px] font-medium shrink-0"
                      }
                    >
                      {ROLE_LABEL[a.roleType] ?? a.roleType}
                    </Badge>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {a.scopeType === "organization"
                          ? "Organization-wide"
                          : a.className && a.sectionName
                          ? `${a.className} · ${a.sectionName}`
                          : "Section"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Granted {fmtDate(a.grantedAt)}
                        </span>
                        {a.grantedByName && (
                          <span className="inline-flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />
                            by {a.grantedByName}
                          </span>
                        )}
                        {a.validFrom && a.validUntil && (
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Valid {fmtDate(a.validFrom)} → {fmtDate(a.validUntil)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {a.scopeType === "class" && (
                    <Link
                      to={`/school/orgs/${orgId}/sections/${a.scopeId}`}
                      className="text-xs text-indigo-700 hover:underline shrink-0"
                    >
                      Open section →
                    </Link>
                  )}
                </div>
              ))}
            </div>
            {detail.assignments.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                <GraduationCap className="inline h-4 w-4 mr-1" />
                No active assignments — this staff member has been fully removed.
              </p>
            )}
            {subjects.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Teaches
                </span>
                {subjects.map((s) => (
                  <span key={s} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Account — admin-edited profile + password reset + invite +
            the destructive remove action, deliberately last and behind
            the tab (not on the landing view). ───────────────────────── */}
        <TabsContent value="account" className="mt-4 space-y-4">
          <section className={`${cardBase} ${cardElev} p-5`}>
            <h3 className={sectionTitleClasses}>Profile</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Full name</Label>
                <Input
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email (login)</Label>
                <Input
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={saveProfile} disabled={profileBusy}>
                {profileBusy ? "Saving…" : "Save profile"}
              </Button>
              <Button variant="outline" onClick={handleResetPassword} disabled={profileBusy}>
                Reset password (temporary)
              </Button>
              <Button variant="outline" onClick={handleResend} disabled={busy || !detail.email}>
                <Mail className="mr-2 h-4 w-4" /> Resend invite email
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Changing the email changes their LOGIN — tell them before saving.
              Staff can update their own name &amp; password anytime from the
              workspace menu → My account.
            </p>
          </section>

          <section className={`${cardBase} ${cardElev} p-5`}>
            <h3 className={sectionTitleClasses}>Remove from staff</h3>
            <p className="mt-2 text-sm text-slate-600">
              Revokes every role this person holds at this school. Their login
              still works for parent / other-school use, and you can re-add
              them later.
            </p>
            <Button variant="outline" className="mt-3" onClick={handleDelete} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4 text-rose-600" />
              <span className="text-rose-700">Remove from staff</span>
            </Button>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TeacherDetail;
