// =============================================================================
// School module — Finance staff dashboard data (Phase 6d).
//
// The financial_staff role spends the day:
//   - Tracking collection vs invoiced for the current period
//   - Chasing overdue accounts (call/SMS parents)
//   - Recording new payments + printing receipts
//
//   GET /school/orgs/:orgId/finance-snapshot
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

async function hasAnyOrgRole(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function installFinance(school: Hono) {
  school.get("/orgs/:orgId/finance-snapshot", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const period = c.req.query("period") || currentPeriod();
    const todayIso = new Date().toISOString().slice(0, 10);

    // ────────────────────────────────────────────────────────────────────
    // 1. This-period collection summary.
    // ────────────────────────────────────────────────────────────────────
    const { data: feeRows } = await serviceRoleClient
      .from("fee_status")
      .select(
        "id, student_id, amount_due, amount_paid, status, due_date, paid_date, student:student_id(full_name, gr_number, class_section:class_section_id(name, class:class_id(name)))",
      )
      .eq("org_id", orgId)
      .eq("period", period);

    let dueTotal = 0;
    let paidTotal = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let partialCount = 0;
    let waivedCount = 0;
    for (const r of (feeRows ?? []) as any[]) {
      const due = Number(r.amount_due) || 0;
      const paid = Number(r.amount_paid) || 0;
      dueTotal += due;
      paidTotal += paid;
      if (r.status === "paid") paidCount += 1;
      else if (r.status === "partial") partialCount += 1;
      else if (r.status === "waived") waivedCount += 1;
      else unpaidCount += 1;
    }
    const collectionPct =
      dueTotal > 0 ? Math.round((paidTotal / dueTotal) * 100) : 0;

    // ────────────────────────────────────────────────────────────────────
    // 2. Overdue list — rows with status != paid/waived and due_date in
    //    the past. Sort by oldest due_date so the worst offenders are
    //    surfaced first.
    // ────────────────────────────────────────────────────────────────────
    const overdueRows = ((feeRows ?? []) as any[])
      .filter(
        (r) =>
          r.status !== "paid" &&
          r.status !== "waived" &&
          r.due_date &&
          r.due_date < todayIso,
      )
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));

    // Also include prior-period unpaid as a broader "any-period overdue"
    // count so the KPI tile reflects the school's total uncollected.
    const { count: anyPeriodOverdueCount } = await serviceRoleClient
      .from("fee_status")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["unpaid", "partial"])
      .lt("due_date", todayIso);

    const overdueList = overdueRows.slice(0, 8).map((r: any) => ({
      feeStatusId: r.id,
      studentId: r.student_id,
      studentName: r.student?.full_name ?? "Student",
      grNumber: r.student?.gr_number ?? null,
      className: r.student?.class_section?.class?.name ?? null,
      sectionName: r.student?.class_section?.name ?? null,
      amountDue: Number(r.amount_due) || 0,
      amountPaid: Number(r.amount_paid) || 0,
      remaining: Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0)),
      dueDate: r.due_date,
    }));

    // ────────────────────────────────────────────────────────────────────
    // 3. Recent payments — last 8 rows where paid_date IS NOT NULL,
    //    newest first. Helps finance confirm what they've recorded.
    // ────────────────────────────────────────────────────────────────────
    const { data: recentPaidRows } = await serviceRoleClient
      .from("fee_status")
      .select(
        "id, student_id, amount_paid, period, paid_date, student:student_id(full_name, gr_number)",
      )
      .eq("org_id", orgId)
      .not("paid_date", "is", null)
      .order("paid_date", { ascending: false })
      .limit(8);

    const recentPayments = (recentPaidRows ?? []).map((r: any) => ({
      feeStatusId: r.id,
      studentId: r.student_id,
      studentName: r.student?.full_name ?? "Student",
      grNumber: r.student?.gr_number ?? null,
      period: r.period as string,
      amountPaid: Number(r.amount_paid) || 0,
      paidDate: r.paid_date as string,
    }));

    return c.json({
      period,
      collection: {
        dueTotal,
        paidTotal,
        collectionPct,
        paidCount,
        unpaidCount,
        partialCount,
        waivedCount,
        studentCount: feeRows?.length ?? 0,
      },
      overdue: {
        countAnyPeriod: anyPeriodOverdueCount ?? 0,
        thisPeriodCount: overdueRows.length,
        recent: overdueList,
      },
      recentPayments,
    });
  });
}
