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
import { userCanInOrg } from "./schoolAuth.ts";
import { todayInOrgTz } from "./tz.ts";
import { outstandingByStudent } from "./schoolFeePayments.tsx";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function installFinance(school: Hono) {
  school.get("/orgs/:orgId/finance-snapshot", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    // Permissions audit (16 Sep): was any-role — every teacher could read
    // the whole school's collection numbers and overdue families. Fee data
    // follows the mark_fees_status key (principal/admin short-circuit).
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_PERMISSION" }, 403);
    }

    const period = c.req.query("period") || currentPeriod();
    const todayIso = todayInOrgTz();

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
    // 3. Recent payments — the LEDGER's last 8 non-void rows (17 Sep):
    //    every installment is its own line, so a second partial adds an
    //    entry instead of replacing the first.
    // ────────────────────────────────────────────────────────────────────
    const { data: recentPaidRows } = await serviceRoleClient
      .from("fee_payment")
      .select(
        "id, fee_status_id, student_id, amount, paid_on, method, fee:fee_status_id(period), student:student_id(full_name, gr_number)",
      )
      .eq("org_id", orgId)
      .is("voided_at", null)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);

    const recentPayments = (recentPaidRows ?? []).map((r: any) => ({
      feeStatusId: r.fee_status_id,
      studentId: r.student_id,
      studentName: r.student?.full_name ?? "Student",
      grNumber: r.student?.gr_number ?? null,
      period: (r.fee?.period ?? "") as string,
      amountPaid: Number(r.amount) || 0,
      paidDate: r.paid_on as string,
      method: r.method ?? null,
    }));

    // ────────────────────────────────────────────────────────────────────
    // 4. Outstanding MONEY across every period — the number the office
    //    was challenged on. Per student, summed org-wide, with the worst
    //    balances first for the follow-up list.
    // ────────────────────────────────────────────────────────────────────
    const owedByStudent = await outstandingByStudent(orgId);
    let outstandingTotal = 0;
    for (const v of Object.values(owedByStudent)) outstandingTotal += v.total;
    const outstandingStudents = Object.keys(owedByStudent).length;
    const topIds = Object.entries(owedByStudent)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([sid]) => sid);
    const { data: topStuRows } = topIds.length
      ? await serviceRoleClient
          .from("student")
          .select("id, full_name, gr_number, class_section:class_section_id(name, class:class_id(name))")
          .in("id", topIds)
      : { data: [] as any[] };
    const stuById = new Map(((topStuRows ?? []) as any[]).map((s) => [s.id, s]));
    const topOutstanding = topIds.map((sid) => {
      const s: any = stuById.get(sid) ?? {};
      const o = owedByStudent[sid];
      return {
        studentId: sid,
        studentName: s.full_name ?? "Student",
        grNumber: s.gr_number ?? null,
        className: s.class_section?.class?.name ?? null,
        sectionName: s.class_section?.name ?? null,
        total: o.total,
        months: o.months,
        oldestPeriod: o.oldestPeriod,
      };
    });

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
      outstanding: {
        total: outstandingTotal,
        students: outstandingStudents,
        top: topOutstanding,
      },
      recentPayments,
    });
  });
}
