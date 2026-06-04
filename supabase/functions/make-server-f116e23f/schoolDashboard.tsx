// =============================================================================
// School module — Performance Dashboard aggregates.
//
// Endpoints attached under the parent `school` Hono sub-app (which already
// enforces auth via `requireAuth`). All routes here additionally require the
// caller hold *any* non-revoked role in the target organization — admins,
// principals, class teachers and visiting teachers all share these views.
//
// Mounted from `school.tsx` via `installDashboard(school)`. The parent app
// owns the `/school/*` prefix; this module contributes:
//   GET /school/orgs/:orgId/dashboard
//   GET /school/orgs/:orgId/sections/leaderboard
//   GET /school/orgs/:orgId/insights
//
// Data sources (Postgres tables, never KV):
//   - student, class, class_section, user_roles                 (Phase A)
//   - school_attendance, behavior_note, roster_change_request   (Phase B)
//
// Style mirrors `schoolPhaseB.tsx`: service-role queries, in-memory rollups,
// graceful empty-state responses (no 500 when a table is empty).
// =============================================================================

import { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

// -----------------------------------------------------------------------------
// Period math — period boundaries computed server-side. All dates are
// interpreted in UTC since Edge Functions don't have a configurable TZ; the
// pilot school operates in PKT (+05) so this is good enough until v2.
// -----------------------------------------------------------------------------

type Period = "T" | "WTD" | "MTD" | "QTD" | "YTD";

function parsePeriod(raw: string | null | undefined): Period {
  const p = (raw ?? "MTD").toUpperCase();
  if (p === "T" || p === "WTD" || p === "MTD" || p === "QTD" || p === "YTD") return p;
  return "MTD";
}

// Returns [start, end] as YYYY-MM-DD inclusive boundaries for the current
// period and the previous period of the same length.
function periodWindows(now: Date, period: Period): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
} {
  const end = startOfDay(now);
  let start = startOfDay(now);
  if (period === "T") {
    // single day
  } else if (period === "WTD") {
    const dow = start.getUTCDay(); // 0=Sun..6=Sat; we treat Monday as week start
    const daysSinceMon = (dow + 6) % 7; // Mon=0
    start = addDays(start, -daysSinceMon);
  } else if (period === "MTD") {
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  } else if (period === "QTD") {
    const qStartMonth = Math.floor(start.getUTCMonth() / 3) * 3;
    start = new Date(Date.UTC(start.getUTCFullYear(), qStartMonth, 1));
  } else {
    // YTD
    start = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  }
  // Previous period: same length immediately preceding.
  const lengthDays =
    Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1;
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(lengthDays - 1));
  return { start, end, prevStart, prevEnd };
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isWeekday(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

// Returns the last `n` weekday dates ending on or before `end`, oldest→newest.
function lastNWeekdays(end: Date, n: number): Date[] {
  const out: Date[] = [];
  let cursor = startOfDay(end);
  while (out.length < n) {
    if (isWeekday(cursor)) out.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return out.reverse();
}

// -----------------------------------------------------------------------------
// Role gate — any non-revoked role in the org (matches schoolPhaseB pattern).
// -----------------------------------------------------------------------------
async function hasAnyRoleInOrg(userId: string, orgId: string): Promise<boolean> {
  // Also accept class-section scoped roles (visiting teachers) — they still
  // need read access to the dashboard, just scoped.
  const { data: orgRow, error: orgErr } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (orgErr) {
    console.error("[schoolDashboard.hasAnyRoleInOrg] DB error:", orgErr);
    return false;
  }
  if (orgRow) return true;

  // Check class-teacher assignment via class_section.class_teacher_user_id
  // (these users may not have a user_roles org row).
  const { data: classSections } = await serviceRoleClient
    .from("class_section")
    .select("id, class!inner(org_id)")
    .eq("class_teacher_user_id", userId)
    .eq("class.org_id", orgId)
    .limit(1);
  if (classSections && classSections.length > 0) return true;

  // Check class-scoped visiting teacher roles tied to sections in this org.
  const { data: classScoped } = await serviceRoleClient
    .from("user_roles")
    .select("scope_id")
    .eq("user_id", userId)
    .eq("scope_type", "class")
    .is("revoked_at", null);
  if (classScoped && classScoped.length > 0) {
    const sectionIds = (classScoped as Array<{ scope_id: string }>)
      .map((r) => r.scope_id)
      .filter(Boolean);
    if (sectionIds.length > 0) {
      const { data: matching } = await serviceRoleClient
        .from("class_section")
        .select("id, class!inner(org_id)")
        .in("id", sectionIds)
        .eq("class.org_id", orgId)
        .limit(1);
      if (matching && matching.length > 0) return true;
    }
  }
  return false;
}

// -----------------------------------------------------------------------------
// Caller scope — does this user see the whole org, or only specific sections?
// -----------------------------------------------------------------------------
type CallerScope =
  | { kind: "org"; sectionIds: string[] }
  | { kind: "sections"; sectionIds: string[] };

async function determineScope(
  userId: string,
  orgId: string,
  allSectionIds: string[],
): Promise<CallerScope> {
  // 1. Org-scoped role: principal, admin, or org-wide teacher → org view.
  const { data: orgRoles } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  const orgRoleTypes = new Set(
    (orgRoles ?? []).map((r: any) => String(r.role_type)),
  );
  if (
    orgRoleTypes.has("principal") ||
    orgRoleTypes.has("admin") ||
    orgRoleTypes.has("teacher") // org-scoped teacher = full-org view
  ) {
    return { kind: "org", sectionIds: allSectionIds };
  }

  // 2. Gather sections this user is attached to.
  const scopedSectionIds = new Set<string>();

  // 2a. class_section.class_teacher_user_id
  const { data: ownedSections } = await serviceRoleClient
    .from("class_section")
    .select("id, class!inner(org_id)")
    .eq("class_teacher_user_id", userId)
    .eq("class.org_id", orgId);
  for (const s of (ownedSections ?? []) as Array<{ id: string }>) {
    scopedSectionIds.add(s.id);
  }

  // 2b. user_roles rows: visiting_teacher class-scoped
  const { data: classScoped } = await serviceRoleClient
    .from("user_roles")
    .select("scope_id, role_type")
    .eq("user_id", userId)
    .eq("scope_type", "class")
    .is("revoked_at", null);
  const candidateIds = (classScoped ?? [])
    .map((r: any) => r.scope_id)
    .filter((x: any): x is string => !!x);
  if (candidateIds.length > 0) {
    const { data: matching } = await serviceRoleClient
      .from("class_section")
      .select("id, class!inner(org_id)")
      .in("id", candidateIds)
      .eq("class.org_id", orgId);
    for (const s of (matching ?? []) as Array<{ id: string }>) {
      scopedSectionIds.add(s.id);
    }
  }

  return { kind: "sections", sectionIds: Array.from(scopedSectionIds) };
}

// -----------------------------------------------------------------------------
// Helpers — fetch the org's student/section/class skeleton once, reuse it.
// -----------------------------------------------------------------------------

type SectionRow = {
  id: string;
  class_id: string;
  name: string;
  class_teacher_user_id: string | null;
  class_name: string;
  student_count: number;
};

async function loadOrgSkeleton(orgId: string): Promise<{
  classes: Array<{ id: string; name: string }>;
  sections: SectionRow[];
  studentsBySection: Map<string, string[]>; // section_id -> [studentId]
  totalStudents: number;
}> {
  const { data: classes } = await serviceRoleClient
    .from("class")
    .select("id, name")
    .eq("org_id", orgId);
  const classRows = (classes ?? []) as Array<{ id: string; name: string }>;
  const classById = new Map(classRows.map((c) => [c.id, c.name]));

  const classIds = classRows.map((c) => c.id);
  let sectionRows: Array<{
    id: string;
    class_id: string;
    name: string;
    class_teacher_user_id: string | null;
  }> = [];
  if (classIds.length > 0) {
    const { data } = await serviceRoleClient
      .from("class_section")
      .select("id, class_id, name, class_teacher_user_id")
      .in("class_id", classIds);
    sectionRows = (data ?? []) as typeof sectionRows;
  }

  const { data: students } = await serviceRoleClient
    .from("student")
    .select("id, class_section_id")
    .eq("org_id", orgId);
  const studentRows = (students ?? []) as Array<{
    id: string;
    class_section_id: string | null;
  }>;
  const studentsBySection = new Map<string, string[]>();
  for (const s of studentRows) {
    if (!s.class_section_id) continue;
    const arr = studentsBySection.get(s.class_section_id) ?? [];
    arr.push(s.id);
    studentsBySection.set(s.class_section_id, arr);
  }

  const sections: SectionRow[] = sectionRows.map((s) => ({
    id: s.id,
    class_id: s.class_id,
    name: s.name,
    class_teacher_user_id: s.class_teacher_user_id,
    class_name: classById.get(s.class_id) ?? "",
    student_count: (studentsBySection.get(s.id) ?? []).length,
  }));

  return {
    classes: classRows,
    sections,
    studentsBySection,
    totalStudents: studentRows.length,
  };
}

// Pull all attendance rows for the org within [start, end] inclusive.
async function fetchAttendance(
  orgId: string,
  start: Date,
  end: Date,
): Promise<Array<{
  student_id: string;
  class_section_id: string | null;
  date: string;
  status: string;
}>> {
  // BUG FIX: the column is `attendance_date`, not `date`. Selecting/
  // filtering by a non-existent column made PostgREST return an error and
  // we caught it silently, so the dashboard showed 0% for everything.
  // We alias to `date` in the response shape so callers don't need to
  // change.
  const { data, error } = await serviceRoleClient
    .from("school_attendance")
    .select("student_id, class_section_id, attendance_date, status")
    .eq("org_id", orgId)
    .gte("attendance_date", fmtDate(start))
    .lte("attendance_date", fmtDate(end));
  if (error) {
    console.error("[schoolDashboard.fetchAttendance] DB error:", error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => ({
    student_id: r.student_id,
    class_section_id: r.class_section_id,
    date: r.attendance_date,
    status: r.status,
  })) as any;
}

async function fetchBehavior(
  orgId: string,
  start: Date,
  end: Date,
): Promise<Array<{
  id: string;
  student_id: string;
  class_section_id: string | null;
  kind: string;
  category: string | null;
  points: number | null;
  created_at: string;
  created_by: string | null;
}>> {
  // BUG FIX: the columns are `recorded_by` (not created_by) and the
  // relevant timestamp for "when did this happen" is `observed_at`, not
  // `created_at`. created_at is when the row was INSERTED — useful for
  // audit but not for "behavior events this period". The seeder
  // sometimes back-dates observed_at, so filtering by created_at
  // misses them.
  const { data, error } = await serviceRoleClient
    .from("behavior_note")
    .select("id, student_id, class_section_id, kind, category, points, observed_at, recorded_by")
    .eq("org_id", orgId)
    .gte("observed_at", start.toISOString())
    .lte("observed_at", endOfDayIso(end));
  if (error) {
    console.error("[schoolDashboard.fetchBehavior] DB error:", error);
    return [];
  }
  // Preserve the legacy shape callers expect: rename observed_at → created_at,
  // recorded_by → created_by so we don't have to touch every consumer.
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    student_id: r.student_id,
    class_section_id: r.class_section_id,
    kind: r.kind,
    category: r.category,
    points: r.points,
    created_at: r.observed_at,
    created_by: r.recorded_by,
  })) as any;
}

function endOfDayIso(d: Date): string {
  return new Date(d.getTime() + 24 * 3600 * 1000 - 1).toISOString();
}

// -----------------------------------------------------------------------------
// Status thresholds — kept in one place so health rollup and leaderboard agree.
// -----------------------------------------------------------------------------
function sectionStatus(attendancePct: number, concernCount: number):
  "compliant" | "watch" | "flagged" {
  if (attendancePct < 75 || concernCount >= 6) return "flagged";
  if (attendancePct < 85 || concernCount >= 3) return "watch";
  return "compliant";
}

// Attendance % for a set of attendance rows. Counts present + late as "in
// attendance" against the present+absent+late+excused universe. If no rows,
// returns 0.
function attendancePct(rows: Array<{ status: string }>): number {
  if (rows.length === 0) return 0;
  let inAtt = 0;
  for (const r of rows) {
    if (r.status === "present" || r.status === "late") inAtt += 1;
  }
  return Math.round((inAtt / rows.length) * 1000) / 10; // one decimal
}

// -----------------------------------------------------------------------------
// installDashboard — mount routes on the parent `school` Hono app.
// -----------------------------------------------------------------------------
export function installDashboard(school: Hono): void {
  // ---------------------------------------------------------------------------
  // GET /orgs/:orgId/dashboard
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/dashboard", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const period = parsePeriod(c.req.query("period"));
    const now = new Date();
    const { start, end, prevStart, prevEnd } = periodWindows(now, period);
    const today = startOfDay(now);

    const fullSkeleton = await loadOrgSkeleton(orgId);
    const scope = await determineScope(
      userId,
      orgId,
      fullSkeleton.sections.map((s) => s.id),
    );
    const scopeSet = new Set(scope.sectionIds);
    const isOrgView = scope.kind === "org";

    // Skeleton restricted to scope (sections/students the caller can see).
    const skeleton = isOrgView
      ? fullSkeleton
      : (() => {
          const sections = fullSkeleton.sections.filter((s) =>
            scopeSet.has(s.id),
          );
          let totalStudents = 0;
          const studentsBySection = new Map<string, string[]>();
          for (const sec of sections) {
            const arr = fullSkeleton.studentsBySection.get(sec.id) ?? [];
            studentsBySection.set(sec.id, arr);
            totalStudents += arr.length;
          }
          return {
            classes: fullSkeleton.classes,
            sections,
            studentsBySection,
            totalStudents,
          };
        })();

    // sectionLabels exposed in response for the frontend "Your sections:" hint.
    const sectionLabels = skeleton.sections.map((s) => ({
      id: s.id,
      label: `${s.class_name} · ${s.name}`,
    }));

    // Filter helper for attendance/behavior rows: when in section-scope, drop
    // rows not belonging to the caller's sections.
    const inScope = (sectionId: string | null | undefined): boolean =>
      isOrgView || (sectionId != null && scopeSet.has(sectionId));

    // Teachers count — distinct user_ids with any teacher-ish role in org.
    // (Stays org-wide; informational for teacher views per spec.)
    const { data: teacherRows } = await serviceRoleClient
      .from("user_roles")
      .select("user_id, role_type")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .in("role_type", ["teacher", "class_teacher", "visiting_teacher"])
      .is("revoked_at", null);
    const teacherSet = new Set((teacherRows ?? []).map((r: any) => r.user_id));

    // Attendance: pull period + previous + today in one window.
    const attRangeAll = await fetchAttendance(orgId, prevStart, end);
    const attRange = attRangeAll.filter((r) => inScope(r.class_section_id));
    const attToday = attRange.filter((r) => r.date === fmtDate(today));
    const attPeriod = attRange.filter(
      (r) => r.date >= fmtDate(start) && r.date <= fmtDate(end),
    );
    const attPrev = attRange.filter(
      (r) => r.date >= fmtDate(prevStart) && r.date <= fmtDate(prevEnd),
    );

    const pctToday = attendancePct(attToday);
    const pctPeriod = attendancePct(attPeriod);
    const pctPrev = attPrev.length > 0 ? attendancePct(attPrev) : null;
    const deltaPp = pctPrev === null ? null
      : Math.round((pctPeriod - pctPrev) * 10) / 10;

    // Behavior: period + previous.
    const behaviorPeriodAll = await fetchBehavior(orgId, start, end);
    const behaviorPrevAll = await fetchBehavior(orgId, prevStart, prevEnd);
    const behaviorPeriod = behaviorPeriodAll.filter((b) =>
      inScope(b.class_section_id),
    );
    const behaviorPrev = behaviorPrevAll.filter((b) =>
      inScope(b.class_section_id),
    );
    const behaviorScore = behaviorPeriod.reduce((sum, b) => {
      const pts = Number(b.points ?? 0);
      return sum + (b.kind === "concern" ? -Math.abs(pts) : Math.abs(pts));
    }, 0);
    const behaviorScorePrev = behaviorPrev.reduce((sum, b) => {
      const pts = Number(b.points ?? 0);
      return sum + (b.kind === "concern" ? -Math.abs(pts) : Math.abs(pts));
    }, 0);
    const behaviorDelta = behaviorPrev.length === 0
      ? null
      : behaviorScore - behaviorScorePrev;

    const concernsOpen = behaviorPeriod.filter((b) => b.kind === "concern").length;

    // Hifz progress — org-wide avg ayahs memorized per active student that has
    // at least one hifz entry. We dedupe (surah, ayah) pairs per student so
    // overlapping re-recordings don't inflate the total.
    const { data: hifzRowsRaw } = await serviceRoleClient
      .from("hifz_progress")
      .select("student_id, surah_number, ayah_from, ayah_to, kind")
      .eq("org_id", orgId)
      .eq("kind", "memorized");
    const hifzRowsAll = (hifzRowsRaw ?? []) as Array<{
      student_id: string;
      surah_number: number;
      ayah_from: number;
      ayah_to: number;
    }>;
    // Restrict hifz to students in scoped sections (when teacher-scoped).
    const scopedStudentIds: Set<string> | null = isOrgView
      ? null
      : (() => {
          const s = new Set<string>();
          for (const arr of skeleton.studentsBySection.values()) {
            for (const id of arr) s.add(id);
          }
          return s;
        })();
    const hifzRows = scopedStudentIds
      ? hifzRowsAll.filter((r) => scopedStudentIds.has(r.student_id))
      : hifzRowsAll;
    const ayahsByStudent = new Map<string, Map<number, Set<number>>>();
    for (const r of hifzRows) {
      let bySurah = ayahsByStudent.get(r.student_id);
      if (!bySurah) {
        bySurah = new Map();
        ayahsByStudent.set(r.student_id, bySurah);
      }
      let set = bySurah.get(r.surah_number);
      if (!set) {
        set = new Set<number>();
        bySurah.set(r.surah_number, set);
      }
      for (let a = r.ayah_from; a <= r.ayah_to; a += 1) {
        set.add(a);
      }
    }
    let hifzStudentsWithEntries = 0;
    let hifzAyahSum = 0;
    for (const bySurah of ayahsByStudent.values()) {
      let n = 0;
      for (const set of bySurah.values()) n += set.size;
      if (n > 0) {
        hifzStudentsWithEntries += 1;
        hifzAyahSum += n;
      }
    }
    const hifzAvg = hifzStudentsWithEntries > 0
      ? Math.round(hifzAyahSum / hifzStudentsWithEntries)
      : 0;

    // Roster requests — pending count + oldest age.
    // Org view: all org pending. Teacher view: only their own submissions.
    let pendingQuery = serviceRoleClient
      .from("roster_change_request")
      .select("id, created_at, requested_by, kind, class_section_id, student_id")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (!isOrgView) {
      pendingQuery = pendingQuery.eq("requested_by", userId);
    }
    const { data: pendingReqs } = await pendingQuery;
    const pendingArr = (pendingReqs ?? []) as Array<{
      id: string;
      created_at: string;
      requested_by?: string | null;
      kind?: string | null;
      class_section_id?: string | null;
      student_id?: string | null;
    }>;
    const oldestPendingAgeDays = pendingArr.length > 0
      ? Math.floor(
          (now.getTime() - new Date(pendingArr[0].created_at).getTime()) /
            (24 * 3600 * 1000),
        )
      : 0;

    // Per-section rollups for health bands + alerts.
    const concernsBySection = new Map<string, number>();
    for (const b of behaviorPeriod) {
      if (b.kind !== "concern" || !b.class_section_id) continue;
      concernsBySection.set(
        b.class_section_id,
        (concernsBySection.get(b.class_section_id) ?? 0) + 1,
      );
    }
    const attBySection = new Map<string, Array<{ status: string; date: string }>>();
    for (const r of attPeriod) {
      if (!r.class_section_id) continue;
      const arr = attBySection.get(r.class_section_id) ?? [];
      arr.push({ status: r.status, date: r.date });
      attBySection.set(r.class_section_id, arr);
    }

    let healthy = 0, watch = 0, flagged = 0;
    const sectionStatuses: Array<{
      section: SectionRow;
      pct: number;
      concerns: number;
      status: "compliant" | "watch" | "flagged";
    }> = [];
    for (const sec of skeleton.sections) {
      const rows = attBySection.get(sec.id) ?? [];
      const pct = attendancePct(rows);
      const concerns = concernsBySection.get(sec.id) ?? 0;
      const status = sectionStatus(pct, concerns);
      if (status === "compliant") healthy += 1;
      else if (status === "watch") watch += 1;
      else flagged += 1;
      sectionStatuses.push({ section: sec, pct, concerns, status });
    }

    // Alerts.
    type Alert = {
      id: string;
      severity: "critical" | "warning" | "info";
      kind:
        | "attendance_dip"
        | "consecutive_dip"
        | "concern_spike"
        | "pending_approvals"
        | "attendance_gap"
        | "roster_stale"
        | "no_assignment";
      title: string;
      body: string;
      actionLabel?: string;
      actionPath?: string;
    };
    const alerts: Alert[] = [];

    if (isOrgView) {
      // ── Org-wide rollup alerts ─────────────────────────────────────────
      const dippingFlagged = sectionStatuses.filter(
        (s) => s.pct > 0 && s.pct < 75,
      );
      const dippingCritical = sectionStatuses.filter(
        (s) => s.pct > 0 && s.pct < 60,
      );
      if (dippingFlagged.length > 0) {
        alerts.push({
          id: "rollup_att_dip",
          severity: dippingCritical.length > 0 ? "critical" : "warning",
          kind: "attendance_dip",
          title: `${dippingFlagged.length} section${dippingFlagged.length === 1 ? "" : "s"} flagged for attendance`,
          body:
            dippingCritical.length > 0
              ? `${dippingCritical.length} section${dippingCritical.length === 1 ? "" : "s"} below 60% this period.`
              : `${dippingFlagged.length} section${dippingFlagged.length === 1 ? "" : "s"} below the 75% target.`,
          actionLabel: "View leaderboard",
          actionPath: `/school/orgs/${orgId}?filter=flagged`,
        });
      }

      const concernSections = sectionStatuses.filter((s) => s.concerns > 5);
      if (concernSections.length > 0) {
        const critical = sectionStatuses.some((s) => s.concerns > 10);
        alerts.push({
          id: "rollup_concern_spike",
          severity: critical ? "critical" : "warning",
          kind: "concern_spike",
          title: `${concernSections.length} section${concernSections.length === 1 ? "" : "s"} with concern spike`,
          body: `${concernSections.length} section${concernSections.length === 1 ? "" : "s"} logged 6+ concern notes this period.`,
          actionLabel: "View leaderboard",
          actionPath: `/school/orgs/${orgId}`,
        });
      }

      // attendance_gap rollup — sections missing all of last 3 weekdays
      const lastThree = lastNWeekdays(today, 3).map(fmtDate);
      const gapSections = sectionStatuses.filter((ss) => {
        if (ss.section.student_count === 0) return false;
        const dates = new Set(
          (attBySection.get(ss.section.id) ?? []).map((r) => r.date),
        );
        return lastThree.every((d) => !dates.has(d));
      });
      if (gapSections.length > 0) {
        alerts.push({
          id: "rollup_att_gap",
          severity: "warning",
          kind: "attendance_gap",
          title: `${gapSections.length} section${gapSections.length === 1 ? "" : "s"} with no attendance in 3 days`,
          body: `Attendance has not been recorded for the last 3 school days in ${gapSections.length} section${gapSections.length === 1 ? "" : "s"}.`,
          actionLabel: "View leaderboard",
          actionPath: `/school/orgs/${orgId}`,
        });
      }

      // roster_stale rollup — sections with 0 students
      const emptySections = sectionStatuses.filter(
        (ss) => ss.section.student_count === 0,
      );
      if (emptySections.length > 0) {
        alerts.push({
          id: "rollup_roster_stale",
          severity: "info",
          kind: "roster_stale",
          title: `${emptySections.length} class${emptySections.length === 1 ? "" : "es"} have empty sections`,
          body: `Assign students or archive ${emptySections.length === 1 ? "this section" : "these sections"}.`,
          actionLabel: "Open roster",
          actionPath: `/school/orgs/${orgId}/admin/classes`,
        });
      }

      // Pending approvals rollup (existing behaviour).
      if (pendingArr.length >= 5 || oldestPendingAgeDays > 7) {
        const critical = oldestPendingAgeDays > 14;
        alerts.push({
          id: "pending_approvals",
          severity: critical ? "critical" : "warning",
          kind: "pending_approvals",
          title: `${pendingArr.length} roster change${pendingArr.length === 1 ? "" : "s"} awaiting approval`,
          body: critical
            ? `Oldest request is ${oldestPendingAgeDays} days old — overdue.`
            : `Oldest request is ${oldestPendingAgeDays} day${oldestPendingAgeDays === 1 ? "" : "s"} old.`,
          actionLabel: "Review requests",
          actionPath: `/school/approvals`,
        });
      }
    } else {
      // ── Section-scoped (teacher) drill-down alerts ─────────────────────
      if (skeleton.sections.length === 0) {
        alerts.push({
          id: "no_assignment",
          severity: "info",
          kind: "no_assignment",
          title: `You are not assigned to any sections yet`,
          body: `Ask an admin to add you to a class so you can see attendance, behavior, and roster activity here.`,
        });
      }

      // Per-section attendance dip + consecutive dip + concern + gap.
      const lastThree = lastNWeekdays(today, 3).map(fmtDate);
      // For consecutive_dip we need per-day attendance per section.
      // Build section -> date -> rows from already-filtered attPeriod.
      const attBySectionDate = new Map<
        string,
        Map<string, Array<{ status: string }>>
      >();
      for (const r of attPeriod) {
        if (!r.class_section_id) continue;
        const byDate =
          attBySectionDate.get(r.class_section_id) ?? new Map();
        const arr = byDate.get(r.date) ?? [];
        arr.push({ status: r.status });
        byDate.set(r.date, arr);
        attBySectionDate.set(r.class_section_id, byDate);
      }

      for (const ss of sectionStatuses) {
        const label = `${ss.section.class_name} · ${ss.section.name}`;

        if (ss.pct > 0 && ss.pct < 60) {
          alerts.push({
            id: `att_dip_${ss.section.id}`,
            severity: "critical",
            kind: "attendance_dip",
            title: `${label}: attendance ${ss.pct}% (below 75%)`,
            body: `Period attendance is ${ss.pct}% — well below the 75% floor.`,
            actionLabel: "Open section",
            actionPath: `/school/sections/${ss.section.id}`,
          });
        } else if (ss.pct > 0 && ss.pct < 75) {
          alerts.push({
            id: `att_dip_${ss.section.id}`,
            severity: "warning",
            kind: "attendance_dip",
            title: `${label}: attendance ${ss.pct}% (below 75%)`,
            body: `Period attendance is ${ss.pct}% — below the 75% target.`,
            actionLabel: "Open section",
            actionPath: `/school/sections/${ss.section.id}`,
          });
        }

        // consecutive_dip — daily pct below 75 for >=3 consecutive school days
        // ending on/before today.
        const byDate = attBySectionDate.get(ss.section.id);
        if (byDate && byDate.size > 0) {
          // walk back from today over weekdays, accumulating streak.
          let streak = 0;
          let cursor = startOfDay(today);
          // limit walk to ~20 weekdays
          for (let i = 0; i < 30 && streak < 30; i += 1) {
            if (isWeekday(cursor)) {
              const rows = byDate.get(fmtDate(cursor)) ?? [];
              if (rows.length === 0) break; // gap; streak broken
              const dailyPct = attendancePct(rows);
              if (dailyPct < 75) streak += 1;
              else break;
            }
            cursor = addDays(cursor, -1);
          }
          if (streak >= 3) {
            alerts.push({
              id: `consec_dip_${ss.section.id}`,
              severity: "critical",
              kind: "consecutive_dip",
              title: `${label}: attendance below threshold for ${streak} consecutive days`,
              body: `Daily attendance has stayed under 75% for ${streak} school day${streak === 1 ? "" : "s"} in a row.`,
              actionLabel: "Open section",
              actionPath: `/school/sections/${ss.section.id}`,
            });
          }
        }

        if (ss.concerns > 10) {
          alerts.push({
            id: `concern_spike_${ss.section.id}`,
            severity: "critical",
            kind: "concern_spike",
            title: `${label}: ${ss.concerns} concerns this period (above 5)`,
            body: `${ss.concerns} concern notes logged this period — review and follow up.`,
            actionLabel: "Review notes",
            actionPath: `/school/sections/${ss.section.id}/behavior`,
          });
        } else if (ss.concerns > 5) {
          alerts.push({
            id: `concern_spike_${ss.section.id}`,
            severity: "warning",
            kind: "concern_spike",
            title: `${label}: ${ss.concerns} concerns this period (above 5)`,
            body: `${ss.concerns} concern notes logged this period.`,
            actionLabel: "Review notes",
            actionPath: `/school/sections/${ss.section.id}/behavior`,
          });
        }

        // attendance_gap
        const recentDates = new Set(
          (attBySection.get(ss.section.id) ?? []).map((r) => r.date),
        );
        const missingAll = lastThree.every((d) => !recentDates.has(d));
        if (missingAll && ss.section.student_count > 0) {
          alerts.push({
            id: `att_gap_${ss.section.id}`,
            severity: "warning",
            kind: "attendance_gap",
            title: `${label}: no attendance recorded in last 3 weekdays`,
            body: `No attendance records for the last 3 school days.`,
            actionLabel: "Take attendance",
            actionPath: `/school/sections/${ss.section.id}/attendance`,
          });
        }
      }

      // Caller's own pending roster requests.
      for (const p of pendingArr) {
        const ageDays = Math.floor(
          (now.getTime() - new Date(p.created_at).getTime()) /
            (24 * 3600 * 1000),
        );
        const kindLabel = p.kind ?? "request";
        alerts.push({
          id: `pending_own_${p.id}`,
          severity: ageDays > 7 ? "warning" : "info",
          kind: "pending_approvals",
          title: `Your roster request (${kindLabel}) still pending review (${ageDays} day${ageDays === 1 ? "" : "s"})`,
          body: `Submitted ${ageDays} day${ageDays === 1 ? "" : "s"} ago — awaiting admin decision.`,
          actionLabel: "View request",
          actionPath: `/school/approvals`,
        });
      }
    }

    // Sort by severity (critical > warning > info), cap to 8.
    const sevRank = { critical: 0, warning: 1, info: 2 } as const;
    alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
    const cappedAlerts = alerts.slice(0, 8);

    return c.json({
      asOf: now.toISOString(),
      period,
      tiles: {
        students: {
          value: skeleton.totalStudents,
          hint: "Enrolled across all sections",
        },
        attendanceToday: {
          value: pctToday,
          hint:
            attToday.length === 0
              ? "No attendance taken yet today"
              : `${attToday.length} marks recorded today`,
        },
        attendancePeriod: {
          value: pctPeriod,
          deltaPp,
          hint:
            deltaPp === null
              ? "No prior-period data to compare"
              : `${deltaPp >= 0 ? "+" : ""}${deltaPp}pp vs previous period`,
        },
        teachers: {
          value: teacherSet.size,
          hint: "Teachers + class teachers + visiting teachers",
        },
        behaviorScore: {
          value: behaviorScore,
          deltaPp: behaviorDelta,
          hint:
            behaviorDelta === null
              ? "No prior-period data to compare"
              : `${behaviorDelta >= 0 ? "+" : ""}${behaviorDelta} vs previous period`,
        },
        pendingApprovals: {
          value: pendingArr.length,
          hint:
            pendingArr.length === 0
              ? "No requests waiting"
              : `Oldest is ${oldestPendingAgeDays} day${oldestPendingAgeDays === 1 ? "" : "s"} old`,
        },
        concernsOpen: {
          value: concernsOpen,
          hint: "Concern notes logged this period",
        },
        feesPaidPct: { value: null, hint: "Coming with Phase D" },
        hifzProgress: {
          value: hifzAvg,
          hint: hifzStudentsWithEntries === 0
            ? "no hifz entries yet"
            : "avg ayahs / student",
        },
        formsAwaiting: { value: null, hint: "Coming with Phase D" },
      },
      health: { healthy, watch, flagged },
      alerts: cappedAlerts,
      viewScope: {
        kind: scope.kind,
        sectionIds: scope.sectionIds,
        sectionLabels,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /orgs/:orgId/sections/leaderboard
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/leaderboard", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const period = parsePeriod(c.req.query("period"));
    const now = new Date();
    const { start, end, prevStart, prevEnd } = periodWindows(now, period);
    const today = startOfDay(now);

    const fullSkeleton = await loadOrgSkeleton(orgId);
    const scope = await determineScope(
      userId,
      orgId,
      fullSkeleton.sections.map((s) => s.id),
    );
    const scopeSet = new Set(scope.sectionIds);
    const skeleton =
      scope.kind === "org"
        ? fullSkeleton
        : {
            ...fullSkeleton,
            sections: fullSkeleton.sections.filter((s) => scopeSet.has(s.id)),
          };

    // Need 10 weekday window in addition to period range for last10Days chart.
    const last10Dates = lastNWeekdays(today, 10);
    const earliest = new Date(
      Math.min(
        prevStart.getTime(),
        last10Dates.length > 0 ? last10Dates[0].getTime() : prevStart.getTime(),
      ),
    );
    const attRange = await fetchAttendance(orgId, earliest, end);
    const behaviorPeriod = await fetchBehavior(orgId, start, end);

    // Index attendance by section -> date -> rows.
    const attBySectionDate = new Map<string, Map<string, Array<{ status: string }>>>();
    for (const r of attRange) {
      if (!r.class_section_id) continue;
      const byDate = attBySectionDate.get(r.class_section_id) ?? new Map();
      const arr = byDate.get(r.date) ?? [];
      arr.push({ status: r.status });
      byDate.set(r.date, arr);
      attBySectionDate.set(r.class_section_id, byDate);
    }

    // Behavior aggregates by section.
    const behaviorBySection = new Map<string, {
      net: number;
      positive: number;
      concern: number;
    }>();
    for (const b of behaviorPeriod) {
      if (!b.class_section_id) continue;
      const cur = behaviorBySection.get(b.class_section_id) ?? {
        net: 0,
        positive: 0,
        concern: 0,
      };
      const pts = Math.abs(Number(b.points ?? 0));
      if (b.kind === "concern") {
        cur.net -= pts;
        cur.concern += 1;
      } else {
        cur.net += pts;
        cur.positive += 1;
      }
      behaviorBySection.set(b.class_section_id, cur);
    }

    // Resolve teacher names — single batched auth admin lookup is awkward;
    // we read profiles if available, otherwise null.
    const teacherUserIds = Array.from(
      new Set(
        skeleton.sections
          .map((s) => s.class_teacher_user_id)
          .filter((x): x is string => !!x),
      ),
    );
    const teacherNames = new Map<string, string>();
    if (teacherUserIds.length > 0) {
      // Best-effort: try `profiles` table; if not present, leave names null.
      const { data: profs, error: profsErr } = await serviceRoleClient
        .from("profiles")
        .select("id, full_name")
        .in("id", teacherUserIds);
      if (!profsErr && profs) {
        for (const p of profs as Array<{ id: string; full_name: string | null }>) {
          if (p.full_name) teacherNames.set(p.id, p.full_name);
        }
      }
    }

    const sections = skeleton.sections.map((sec) => {
      const byDate = attBySectionDate.get(sec.id) ?? new Map();
      // Period rows
      const periodRows: Array<{ status: string }> = [];
      for (const [date, arr] of byDate.entries()) {
        if (date >= fmtDate(start) && date <= fmtDate(end)) {
          periodRows.push(...arr);
        }
      }
      const prevRows: Array<{ status: string }> = [];
      for (const [date, arr] of byDate.entries()) {
        if (date >= fmtDate(prevStart) && date <= fmtDate(prevEnd)) {
          prevRows.push(...arr);
        }
      }
      const pct = attendancePct(periodRows);
      const pctPrevForSec = prevRows.length === 0 ? null : attendancePct(prevRows);
      const delta = pctPrevForSec === null
        ? null
        : Math.round((pct - pctPrevForSec) * 10) / 10;

      const last10Days = last10Dates.map((d) => {
        const arr = byDate.get(fmtDate(d)) ?? [];
        return attendancePct(arr);
      });
      const behavior = behaviorBySection.get(sec.id) ?? {
        net: 0,
        positive: 0,
        concern: 0,
      };

      return {
        sectionId: sec.id,
        classId: sec.class_id,
        className: sec.class_name,
        sectionName: sec.name,
        studentCount: sec.student_count,
        classTeacherName: sec.class_teacher_user_id
          ? teacherNames.get(sec.class_teacher_user_id) ?? null
          : null,
        attendancePct: pct,
        attendanceDelta: delta,
        behaviorScore: behavior.net,
        positiveCount: behavior.positive,
        concernCount: behavior.concern,
        last10Days,
        last10Dates: last10Dates.map(fmtDate),
        status: sectionStatus(pct, behavior.concern),
      };
    });

    sections.sort((a, b) => b.attendancePct - a.attendancePct);

    return c.json({ sections });
  });

  // ---------------------------------------------------------------------------
  // GET /orgs/:orgId/insights
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/insights", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const period = parsePeriod(c.req.query("period"));
    const now = new Date();
    const { start, end } = periodWindows(now, period);

    // Determine scope up front for filtering.
    const fullSkeletonForScope = await loadOrgSkeleton(orgId);
    const scope = await determineScope(
      userId,
      orgId,
      fullSkeletonForScope.sections.map((s) => s.id),
    );
    const scopeSet = new Set(scope.sectionIds);
    const inScope = (sectionId: string | null | undefined): boolean =>
      scope.kind === "org" ||
      (sectionId != null && scopeSet.has(sectionId));

    const attPeriodAll = await fetchAttendance(orgId, start, end);
    const attPeriod = attPeriodAll.filter((r) => inScope(r.class_section_id));
    const dist = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of attPeriod) {
      if (r.status === "present") dist.present += 1;
      else if (r.status === "absent") dist.absent += 1;
      else if (r.status === "late") dist.late += 1;
      else if (r.status === "excused") dist.excused += 1;
    }

    const behaviorPeriodAll = await fetchBehavior(orgId, start, end);
    const behaviorPeriod = behaviorPeriodAll.filter((b) =>
      inScope(b.class_section_id),
    );
    const positiveAgg = new Map<string, { count: number; totalPoints: number }>();
    const concernAgg = new Map<string, { count: number; totalPoints: number }>();
    for (const b of behaviorPeriod) {
      const cat = b.category ?? "uncategorized";
      const pts = Math.abs(Number(b.points ?? 0));
      const bucket = b.kind === "concern" ? concernAgg : positiveAgg;
      const cur = bucket.get(cat) ?? { count: 0, totalPoints: 0 };
      cur.count += 1;
      cur.totalPoints += pts;
      bucket.set(cat, cur);
    }
    const toTop6 = (m: Map<string, { count: number; totalPoints: number }>) =>
      Array.from(m.entries())
        .map(([category, v]) => ({ category, count: v.count, totalPoints: v.totalPoints }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

    // Recent activity — last 20 mixed events.
    const activityWindowStart = addDays(startOfDay(now), -30);
    const [recentAtt, recentBehavior, recentRoster] = await Promise.all([
      // Attendance: group later in memory by (section, date).
      serviceRoleClient
        .from("school_attendance")
        .select("id, class_section_id, date, status, created_at")
        .eq("org_id", orgId)
        .gte("created_at", activityWindowStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      serviceRoleClient
        .from("behavior_note")
        .select("id, class_section_id, kind, category, created_at, created_by")
        .eq("org_id", orgId)
        .gte("created_at", activityWindowStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(40),
      serviceRoleClient
        .from("roster_change_request")
        .select("id, status, kind, created_at, decided_at, requested_by, decided_by")
        .eq("org_id", orgId)
        .gte("created_at", activityWindowStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    // Build a section-id -> label map for activity summaries.
    const skeleton = fullSkeletonForScope;
    const sectionLabel = new Map<string, string>();
    for (const s of skeleton.sections) {
      sectionLabel.set(s.id, `${s.class_name}-${s.name}`);
    }

    type Activity = {
      id: string;
      at: string;
      kind: "attendance" | "behavior" | "roster_request" | "roster_decision";
      summary: string;
      actorName: string | null;
    };
    const activity: Activity[] = [];

    // Attendance: collapse per (section, date).
    const attBuckets = new Map<string, {
      sectionId: string | null;
      date: string;
      present: number;
      total: number;
      latestAt: string;
      latestId: string;
    }>();
    for (const r of (recentAtt.data ?? []) as Array<any>) {
      if (!inScope(r.class_section_id)) continue;
      const key = `${r.class_section_id ?? "none"}|${r.date}`;
      const cur = attBuckets.get(key) ?? {
        sectionId: r.class_section_id,
        date: r.date,
        present: 0,
        total: 0,
        latestAt: r.created_at,
        latestId: r.id,
      };
      cur.total += 1;
      if (r.status === "present" || r.status === "late") cur.present += 1;
      if (r.created_at > cur.latestAt) {
        cur.latestAt = r.created_at;
        cur.latestId = r.id;
      }
      attBuckets.set(key, cur);
    }
    for (const b of attBuckets.values()) {
      const label = b.sectionId ? sectionLabel.get(b.sectionId) ?? "Section" : "Section";
      activity.push({
        id: `att_${b.latestId}`,
        at: b.latestAt,
        kind: "attendance",
        summary: `${label} attendance taken — ${b.present}/${b.total} present`,
        actorName: null,
      });
    }

    for (const n of (recentBehavior.data ?? []) as Array<any>) {
      if (!inScope(n.class_section_id)) continue;
      const label = n.class_section_id
        ? sectionLabel.get(n.class_section_id) ?? "Section"
        : "Section";
      const kindLabel = n.kind === "concern" ? "concern" : "positive";
      activity.push({
        id: `beh_${n.id}`,
        at: n.created_at,
        kind: "behavior",
        summary: `${label}: ${kindLabel} note logged${n.category ? ` (${n.category})` : ""}`,
        actorName: null,
      });
    }

    for (const r of (recentRoster.data ?? []) as Array<any>) {
      // Teacher-scoped: only show roster activity they submitted themselves.
      if (scope.kind !== "org" && r.requested_by !== userId) continue;
      if (r.decided_at) {
        activity.push({
          id: `roster_dec_${r.id}`,
          at: r.decided_at,
          kind: "roster_decision",
          summary: `Roster change ${r.kind ?? "request"} ${r.status}`,
          actorName: null,
        });
      }
      activity.push({
        id: `roster_req_${r.id}`,
        at: r.created_at,
        kind: "roster_request",
        summary: `Roster change requested${r.kind ? ` — ${r.kind}` : ""}`,
        actorName: null,
      });
    }

    activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const recentActivity = activity.slice(0, 20);

    return c.json({
      attendanceDistribution: dist,
      topPositive: toTop6(positiveAgg),
      topConcern: toTop6(concernAgg),
      recentActivity,
    });
  });
}

export default installDashboard;
