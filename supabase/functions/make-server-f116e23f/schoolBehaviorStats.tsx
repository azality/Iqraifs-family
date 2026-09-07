// Behavior points, aggregated — the recognition layer over behavior_note.
//
// Teachers started logging behavior daily (pilot, 7 Sep) and immediately
// wanted the obvious next thing: who is leading the class, what is a
// student's score over time, and — from the principal — "this bar says
// Attendance · 12 pts and tells me nothing; WHO, logged by WHOM?".
//
//   GET /orgs/:orgId/sections/:sectionId/behavior-leaderboard?period=
//       Full ranked table for one class. Teacher-of-section gate, so the
//       class teacher, subject teachers, the wing incharge and the
//       principal all see it; a teacher from another class does not.
//
//   GET /orgs/:orgId/students/:studentId/behavior-summary
//       One student's +P / −C / net across week / month / term / all.
//
//   GET /orgs/:orgId/behavior-drilldown?kind=&category=&period=&sectionId=
//       The notes BEHIND an aggregate bar: student, class, who logged it,
//       the text, when. Admin/principal (org-wide, Sandbox excluded); a
//       teacher may pass sectionId for a class they teach.
//
// The child-facing league lives in schoolPortal.tsx (it needs the PIN
// gate); it shares windowStarts() from here so "this month" can never
// mean two different things on two screens.
//
// Ranking is by NET points. Ties share a rank (competition style: two
// kids on 23 are both #1 and the next is #3).

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAdminOrPrincipal, requireTeacherOfSection } from "./schoolAuth.ts";
import { todayInOrgTz, orgTimezone } from "./tz.ts";

export type StatsPeriod = "week" | "month" | "term" | "all";

export function parseStatsPeriod(raw: string | undefined): StatsPeriod | null {
  if (!raw) return "month"; // winnable default: a bad first week of term
  //                           does not bury a child until December
  return raw === "week" || raw === "month" || raw === "term" || raw === "all"
    ? raw
    : null;
}

/** Inclusive start date (YYYY-MM-DD) for each window, on the SCHOOL's
 *  calendar. null = unbounded (all time, or a term that isn't set up). */
export async function windowStarts(
  orgId: string,
): Promise<Record<StatsPeriod, string | null>> {
  const tz = await orgTimezone(orgId);
  const today = todayInOrgTz(tz);
  const anchor = new Date(`${today}T12:00:00Z`);
  const shift = (days: number) =>
    new Date(anchor.getTime() - days * 86400000).toISOString().slice(0, 10);

  // Week = Monday-start, matching the dashboard's WTD.
  const dow = (anchor.getUTCDay() + 6) % 7; // Mon=0
  const weekStart = shift(dow);
  const monthStart = `${today.slice(0, 8)}01`;

  let termStart: string | null = null;
  const { data: term } = await serviceRoleClient
    .from("academic_term")
    .select("start_date")
    .eq("org_id", orgId)
    .eq("is_current", true)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if ((term as any)?.start_date) termStart = (term as any).start_date;

  return { week: weekStart, month: monthStart, term: termStart, all: null };
}

type Tally = { positive: number; concern: number; net: number; count: number };
const zeroTally = (): Tally => ({ positive: 0, concern: 0, net: 0, count: 0 });

function addNote(t: Tally, points: number): void {
  const p = Number(points) || 0;
  if (p >= 0) t.positive += p;
  else t.concern += -p; // stored negative; shown as a magnitude
  t.net += p;
  t.count += 1;
}

/** Ranked per-student tallies for one section within a window. Names are
 *  resolved here so every caller shows the same thing. */
export async function sectionTallies(
  orgId: string,
  sectionId: string,
  sinceIso: string | null,
): Promise<Array<{ studentId: string; name: string; grNumber: string | null } & Tally & { rank: number }>> {
  let q = serviceRoleClient
    .from("behavior_note")
    .select("student_id, points")
    .eq("org_id", orgId)
    .eq("class_section_id", sectionId)
    .limit(10000);
  if (sinceIso) q = q.gte("observed_at", sinceIso);
  const { data: notes } = await q;

  const byStudent = new Map<string, Tally>();
  for (const n of (notes ?? []) as any[]) {
    const t = byStudent.get(n.student_id) ?? zeroTally();
    addNote(t, n.points);
    byStudent.set(n.student_id, t);
  }

  // Every enrolled student appears, including those with no notes yet —
  // a leaderboard that only lists the already-noticed kids tells a
  // teacher nothing about who is being missed.
  const { data: students } = await serviceRoleClient
    .from("student")
    .select("id, full_name, gr_number")
    .eq("class_section_id", sectionId)
    .neq("status", "withdrawn");

  const rows = ((students ?? []) as any[]).map((s) => ({
    studentId: s.id,
    name: s.full_name as string,
    grNumber: (s.gr_number as string) ?? null,
    ...(byStudent.get(s.id) ?? zeroTally()),
  }));
  rows.sort((a, b) => b.net - a.net || b.positive - a.positive || a.name.localeCompare(b.name));

  // Competition ranking: equal net (and positive) shares a rank.
  let rank = 0;
  let lastKey = "";
  const ranked = rows.map((r, i) => {
    const key = `${r.net}|${r.positive}`;
    if (key !== lastKey) {
      rank = i + 1;
      lastKey = key;
    }
    return { ...r, rank };
  });
  return ranked;
}

export function installBehaviorStats(school: Hono): void {
  // ─── Class leaderboard (staff) ──────────────────────────────────────
  school.get("/orgs/:orgId/sections/:sectionId/behavior-leaderboard", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const period = parseStatsPeriod(c.req.query("period"));
    if (!period) return c.json({ error: "period must be week|month|term|all" }, 400);

    const gate = await requireTeacherOfSection(userId, orgId, sectionId);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const starts = await windowStarts(orgId);
    if (period === "term" && starts.term === null) {
      return c.json({ error: "no current term is set up", code: "NO_TERM" }, 409);
    }
    const rows = await sectionTallies(orgId, sectionId, starts[period]);
    return c.json({ period, since: starts[period], rows });
  });

  // ─── One student's score across every window (staff) ────────────────
  school.get("/orgs/:orgId/students/:studentId/behavior-summary", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");

    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, org_id, class_section_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu || (stu as any).org_id !== orgId) {
      return c.json({ error: "student not found" }, 404);
    }
    // Same audience as the student's behavior notes: their teachers, the
    // wing incharge, admin/principal.
    let allowed = await hasAdminOrPrincipal(userId, orgId);
    if (!allowed && (stu as any).class_section_id) {
      const gate = await requireTeacherOfSection(
        userId, orgId, (stu as any).class_section_id,
      );
      allowed = gate.ok;
    }
    if (!allowed) return c.json({ error: "forbidden" }, 403);

    const starts = await windowStarts(orgId);
    const { data: notes } = await serviceRoleClient
      .from("behavior_note")
      .select("points, observed_at")
      .eq("org_id", orgId)
      .eq("student_id", studentId)
      .limit(10000);

    const out: Record<string, Tally> = {
      week: zeroTally(), month: zeroTally(), term: zeroTally(), all: zeroTally(),
    };
    for (const n of (notes ?? []) as any[]) {
      const day = String(n.observed_at).slice(0, 10);
      addNote(out.all, n.points);
      if (starts.week && day >= starts.week) addNote(out.week, n.points);
      if (starts.month && day >= starts.month) addNote(out.month, n.points);
      if (starts.term && day >= starts.term) addNote(out.term, n.points);
    }
    return c.json({
      studentId,
      windows: out,
      // term is null when no current term exists; the UI hides that chip.
      termConfigured: starts.term !== null,
    });
  });

  // ─── What is behind an aggregate bar (drilldown) ────────────────────
  school.get("/orgs/:orgId/behavior-drilldown", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const kind = c.req.query("kind");
    const category = c.req.query("category") ?? "";
    const sectionId = c.req.query("sectionId") ?? "";
    const period = parseStatsPeriod(c.req.query("period"));
    if (!period) return c.json({ error: "period must be week|month|term|all" }, 400);
    if (kind && kind !== "positive" && kind !== "concern") {
      return c.json({ error: "kind must be positive or concern" }, 400);
    }

    const isTop = await hasAdminOrPrincipal(userId, orgId);
    if (!isTop) {
      // A teacher may drill into a class they teach — never the org.
      if (!sectionId) return c.json({ error: "forbidden" }, 403);
      const gate = await requireTeacherOfSection(userId, orgId, sectionId);
      if (!gate.ok) return c.json({ error: gate.error }, gate.status);
    }

    const starts = await windowStarts(orgId);
    let q = serviceRoleClient
      .from("behavior_note")
      .select(
        "id, student_id, class_section_id, kind, category, points, notes, observed_at, recorded_by, student:student_id(full_name, gr_number)",
      )
      .eq("org_id", orgId)
      .order("observed_at", { ascending: false })
      .limit(100);
    if (starts[period]) q = q.gte("observed_at", starts[period]);
    if (kind) q = q.eq("kind", kind);
    if (category) {
      // "No category" on the dashboard = notes with none.
      if (category === "__none__") q = q.is("category", null);
      else q = q.eq("category", category);
    }
    if (sectionId) q = q.eq("class_section_id", sectionId);
    const { data: notes } = await q;

    // Org-wide view: the QA Sandbox never reaches a principal (the same
    // rule every org rollup follows — see #468/#475).
    let rows = (notes ?? []) as any[];
    if (!sectionId) {
      const { data: sbSecs } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id!inner(org_id)")
        .eq("schedule_key", "sandbox")
        .eq("class.org_id", orgId);
      const sandbox = new Set(((sbSecs ?? []) as any[]).map((s) => s.id));
      rows = rows.filter((r) => !r.class_section_id || !sandbox.has(r.class_section_id));
    }

    // Section + recorder names, batched.
    const secIds = [...new Set(rows.map((r) => r.class_section_id).filter(Boolean))];
    const secLabel = new Map<string, string>();
    if (secIds.length > 0) {
      const { data: secs } = await serviceRoleClient
        .from("class_section")
        .select("id, name, class:class_id(name)")
        .in("id", secIds);
      for (const s of (secs ?? []) as any[]) {
        secLabel.set(s.id, `${s.class?.name ?? ""} ${s.name ?? ""}`.trim());
      }
    }
    const recorderIds = [...new Set(rows.map((r) => r.recorded_by).filter(Boolean))];
    const recorderName = new Map<string, string>();
    for (const rid of recorderIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(rid);
        recorderName.set(rid, u?.user?.user_metadata?.name || u?.user?.email || "Staff");
      } catch { /* leave unnamed */ }
    }

    return c.json({
      period,
      since: starts[period],
      notes: rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student?.full_name ?? null,
        grNumber: r.student?.gr_number ?? null,
        sectionId: r.class_section_id,
        sectionLabel: r.class_section_id
          ? secLabel.get(r.class_section_id) ?? null
          : null,
        kind: r.kind,
        category: r.category,
        points: Number(r.points) || 0,
        notes: r.notes,
        observedAt: r.observed_at,
        recordedByName: r.recorded_by
          ? recorderName.get(r.recorded_by) ?? null
          : null,
      })),
    });
  });
}
