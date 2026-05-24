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
  const { data, error } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[schoolDashboard.hasAnyRoleInOrg] DB error:", error);
    return false;
  }
  return !!data;
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
  const { data, error } = await serviceRoleClient
    .from("school_attendance")
    .select("student_id, class_section_id, date, status")
    .eq("org_id", orgId)
    .gte("date", fmtDate(start))
    .lte("date", fmtDate(end));
  if (error) {
    console.error("[schoolDashboard.fetchAttendance] DB error:", error);
    return [];
  }
  return (data ?? []) as any;
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
  const { data, error } = await serviceRoleClient
    .from("behavior_note")
    .select("id, student_id, class_section_id, kind, category, points, created_at, created_by")
    .eq("org_id", orgId)
    .gte("created_at", start.toISOString())
    .lte("created_at", endOfDayIso(end));
  if (error) {
    console.error("[schoolDashboard.fetchBehavior] DB error:", error);
    return [];
  }
  return (data ?? []) as any;
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

    const skeleton = await loadOrgSkeleton(orgId);

    // Teachers count — distinct user_ids with any teacher-ish role in org.
    const { data: teacherRows } = await serviceRoleClient
      .from("user_roles")
      .select("user_id, role_type")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .in("role_type", ["teacher", "class_teacher", "visiting_teacher"])
      .is("revoked_at", null);
    const teacherSet = new Set((teacherRows ?? []).map((r: any) => r.user_id));

    // Attendance: pull period + previous + today in one window.
    const attRange = await fetchAttendance(orgId, prevStart, end);
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
    const behaviorPeriod = await fetchBehavior(orgId, start, end);
    const behaviorPrev = await fetchBehavior(orgId, prevStart, prevEnd);
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

    // Roster requests — pending count + oldest age.
    const { data: pendingReqs } = await serviceRoleClient
      .from("roster_change_request")
      .select("id, created_at")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    const pendingArr = (pendingReqs ?? []) as Array<{ id: string; created_at: string }>;
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
        | "concern_spike"
        | "pending_approvals"
        | "attendance_gap"
        | "roster_stale";
      title: string;
      body: string;
      actionLabel?: string;
      actionPath?: string;
    };
    const alerts: Alert[] = [];

    for (const ss of sectionStatuses) {
      const label = `${ss.section.class_name}-${ss.section.name}`;
      if (ss.pct > 0 && ss.pct < 60) {
        alerts.push({
          id: `att_dip_${ss.section.id}`,
          severity: "critical",
          kind: "attendance_dip",
          title: `${label} attendance critical`,
          body: `Period attendance is ${ss.pct}% — well below the 75% floor.`,
          actionLabel: "Open section",
          actionPath: `/school/sections/${ss.section.id}`,
        });
      } else if (ss.pct > 0 && ss.pct < 75) {
        alerts.push({
          id: `att_dip_${ss.section.id}`,
          severity: "warning",
          kind: "attendance_dip",
          title: `${label} attendance dipping`,
          body: `Period attendance is ${ss.pct}% — below the 75% target.`,
          actionLabel: "Open section",
          actionPath: `/school/sections/${ss.section.id}`,
        });
      }
      if (ss.concerns > 10) {
        alerts.push({
          id: `concern_spike_${ss.section.id}`,
          severity: "critical",
          kind: "concern_spike",
          title: `${label} concern spike`,
          body: `${ss.concerns} concern notes logged this period.`,
          actionLabel: "Review notes",
          actionPath: `/school/sections/${ss.section.id}/behavior`,
        });
      } else if (ss.concerns > 5) {
        alerts.push({
          id: `concern_spike_${ss.section.id}`,
          severity: "warning",
          kind: "concern_spike",
          title: `${label} concern uptick`,
          body: `${ss.concerns} concern notes logged this period.`,
          actionLabel: "Review notes",
          actionPath: `/school/sections/${ss.section.id}/behavior`,
        });
      }

      // attendance_gap — no attendance in last 3 weekdays
      const lastThree = lastNWeekdays(today, 3).map(fmtDate);
      const recentDates = new Set(
        (attBySection.get(ss.section.id) ?? []).map((r) => r.date),
      );
      const missingAll = lastThree.every((d) => !recentDates.has(d));
      if (missingAll && ss.section.student_count > 0) {
        alerts.push({
          id: `att_gap_${ss.section.id}`,
          severity: "warning",
          kind: "attendance_gap",
          title: `${label} attendance not taken`,
          body: `No attendance records for the last 3 school days.`,
          actionLabel: "Take attendance",
          actionPath: `/school/sections/${ss.section.id}/attendance`,
        });
      }

      if (ss.section.student_count === 0) {
        alerts.push({
          id: `roster_stale_${ss.section.id}`,
          severity: "info",
          kind: "roster_stale",
          title: `${label} has no students`,
          body: `This section is empty — assign students or archive it.`,
          actionLabel: "Open roster",
          actionPath: `/school/sections/${ss.section.id}`,
        });
      }
    }

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
        hifzProgress: { value: null, hint: "Coming with Phase C" },
        formsAwaiting: { value: null, hint: "Coming with Phase D" },
      },
      health: { healthy, watch, flagged },
      alerts: cappedAlerts,
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

    const skeleton = await loadOrgSkeleton(orgId);

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

    const attPeriod = await fetchAttendance(orgId, start, end);
    const dist = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of attPeriod) {
      if (r.status === "present") dist.present += 1;
      else if (r.status === "absent") dist.absent += 1;
      else if (r.status === "late") dist.late += 1;
      else if (r.status === "excused") dist.excused += 1;
    }

    const behaviorPeriod = await fetchBehavior(orgId, start, end);
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
    const skeleton = await loadOrgSkeleton(orgId);
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
