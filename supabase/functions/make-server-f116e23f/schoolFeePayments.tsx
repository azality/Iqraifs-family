// =============================================================================
// Fee payment ledger (Muneeb, 17 Sep 2026).
//
// Every payment is its own fee_payment row - amount, date, method, slip
// reference, who recorded it. A month's fee_status.amount_paid is the SUM
// of its non-void payments (kept as a cache, recomputed on every ledger
// write), and status is DERIVED - paid when settled, partial when some
// money is in, unpaid when none - never hand-picked. "waived" is the one
// manual status and survives recomputes.
//
// Corrections are VOIDS, never deletes: the ledger is append-only, so a
// mistaken entry stays visible with who voided it and why.
//
//   POST /school/orgs/:orgId/fees/:feeId/payments        record a payment
//   POST /school/orgs/:orgId/fee-payments/:paymentId/void undo one
//
// Both gated by mark_fees_status (same as every fee write).
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { userCanInOrg } from "./schoolAuth.ts";
import { todayInOrgTz } from "./tz.ts";

export const PAYMENT_METHODS = new Set(["cash", "bank", "online", "other"]);

export function paymentToJson(r: any) {
  return {
    id: r.id,
    feeStatusId: r.fee_status_id,
    studentId: r.student_id,
    amount: Number(r.amount),
    paidOn: r.paid_on,
    method: r.method ?? null,
    reference: r.reference ?? null,
    notes: r.notes ?? null,
    recordedBy: r.recorded_by ?? null,
    createdAt: r.created_at,
    voidedAt: r.voided_at ?? null,
    voidReason: r.void_reason ?? null,
  };
}

/** Derived month status from the ledger. Waived is manual and sticky. */
export function deriveFeeStatus(
  due: number,
  paid: number,
  currentStatus: string | null | undefined,
): string {
  if (currentStatus === "waived") return "waived";
  if (paid <= 0) return "unpaid";
  if (due > 0 && paid >= due) return "paid";
  return "partial";
}

/** Recompute a fee row's cached amount_paid / paid_date / status from its
 *  non-void payments. Returns the updated fee_status row. */
export async function recomputeFeeFromLedger(feeId: string): Promise<any> {
  const { data: fee } = await serviceRoleClient
    .from("fee_status").select("*").eq("id", feeId).maybeSingle();
  if (!fee) return null;
  const { data: pays } = await serviceRoleClient
    .from("fee_payment")
    .select("amount, paid_on")
    .eq("fee_status_id", feeId)
    .is("voided_at", null);
  let sum = 0;
  let latest: string | null = null;
  for (const p of (pays ?? []) as any[]) {
    sum += Number(p.amount) || 0;
    if (!latest || p.paid_on > latest) latest = p.paid_on;
  }
  const status = deriveFeeStatus(Number((fee as any).amount_due ?? 0), sum, (fee as any).status);
  const { data: upd } = await serviceRoleClient
    .from("fee_status")
    .update({ amount_paid: sum, paid_date: latest, status })
    .eq("id", feeId)
    .select()
    .single();
  return upd;
}

/** Fetch payments (newest first) for a set of fee ids, grouped by fee id. */
export async function paymentsByFeeId(feeIds: string[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (feeIds.length === 0) return out;
  const { data } = await serviceRoleClient
    .from("fee_payment")
    .select("*")
    .in("fee_status_id", feeIds)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  for (const r of (data ?? []) as any[]) {
    const arr = out.get(r.fee_status_id) ?? [];
    arr.push(paymentToJson(r));
    out.set(r.fee_status_id, arr);
  }
  return out;
}

/** Per-student outstanding across ALL periods (unpaid + partial money),
 *  sandbox excluded like every org rollup. */
export interface OwedPeriod {
  feeStatusId: string;
  period: string;
  owed: number;
  partial: boolean;
  dueDate: string | null;
}
export interface StudentOutstandingRow {
  total: number;
  months: number;
  oldestPeriod: string | null;
  /** Which months are owed, oldest first — the aging chips (13a). */
  owedPeriods: OwedPeriod[];
  lastPayment: { paidOn: string; amount: number; method: string | null } | null;
}

export async function outstandingByStudent(
  orgId: string,
  /** Ignore vouchers for months AFTER this one (YYYY-MM). A bill that
   *  is not due yet is not arrears: the fees page is an aging view of
   *  the month you are reading, and a family that paid ahead must not
   *  be listed among those who owe. Schools also open next month's
   *  vouchers early so parents can pay early - without this, doing so
   *  would flip the whole school to "owing" overnight. Omit for the
   *  true all-months balance (the student profile, finance rollups). */
  upToPeriod?: string,
): Promise<Record<string, StudentOutstandingRow>> {
  const { data } = await serviceRoleClient
    .from("fee_status")
    .select("id, student_id, period, amount_due, amount_paid, status, due_date, student:student_id(class_section:class_section_id(schedule_key))")
    .eq("org_id", orgId)
    .in("status", ["unpaid", "partial"]);
  const out: Record<string, StudentOutstandingRow> = {};
  for (const r of (data ?? []) as any[]) {
    if (r.student?.class_section?.schedule_key === "sandbox") continue;
    if (upToPeriod && String(r.period) > upToPeriod) continue;
    const owed = Math.max(0, (Number(r.amount_due) || 0) - (Number(r.amount_paid) || 0));
    if (owed <= 0) continue;
    const cur = out[r.student_id] ?? { total: 0, months: 0, oldestPeriod: null, owedPeriods: [], lastPayment: null };
    cur.total += owed;
    cur.months += 1;
    if (!cur.oldestPeriod || r.period < cur.oldestPeriod) cur.oldestPeriod = r.period;
    cur.owedPeriods.push({
      feeStatusId: r.id,
      period: r.period,
      owed,
      partial: (Number(r.amount_paid) || 0) > 0,
      dueDate: r.due_date ?? null,
    });
    out[r.student_id] = cur;
  }
  for (const v of Object.values(out)) v.owedPeriods.sort((a, b) => (a.period < b.period ? -1 : 1));
  // Last payment per owing student, for the "Last payment" column.
  const ids = Object.keys(out);
  if (ids.length) {
    const { data: pays } = await serviceRoleClient
      .from("fee_payment")
      .select("student_id, amount, paid_on, method")
      .eq("org_id", orgId)
      .in("student_id", ids)
      .is("voided_at", null)
      .order("paid_on", { ascending: false });
    for (const p of (pays ?? []) as any[]) {
      const cur = out[p.student_id];
      if (cur && !cur.lastPayment) {
        cur.lastPayment = { paidOn: p.paid_on, amount: Number(p.amount) || 0, method: p.method ?? null };
      }
    }
  }
  return out;
}

/** Concession label per student ("waived" / "-500 vs the class plan"),
 *  from student_fee_override joined to its plan — so the office never
 *  chases a zakat case for the full amount (design 13a). */
export async function concessionByStudent(
  orgId: string,
): Promise<Record<string, string>> {
  const { data } = await serviceRoleClient
    .from("student_fee_override")
    .select(
      "student_id, override_amount, waived, plan:class_fee_plan_id(amount, archived_at, class_id), student:student_id(class_section:class_section_id(class_id))",
    )
    .eq("org_id", orgId);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) {
    if (r.plan?.archived_at) continue;
    // A child who moves class keeps the override rows of the class they
    // left, and the label was being computed against THAT plan - so a
    // Junior child carried a "−500" from Senior's fee, which tells the
    // office to stop chasing money that is owed in full (22 Sep). Only
    // the plan of the class they are in now describes their fee.
    const ownClass = r.student?.class_section?.class_id ?? null;
    if (!ownClass || !r.plan?.class_id || ownClass !== r.plan.class_id) continue;
    if (r.waived) { out[r.student_id] = "waived"; continue; }
    const planAmt = Number(r.plan?.amount ?? 0);
    const ov = r.override_amount === null || r.override_amount === undefined ? null : Number(r.override_amount);
    if (ov !== null && planAmt > 0 && ov < planAmt && !out[r.student_id]) {
      out[r.student_id] = `−${Math.round(planAmt - ov).toLocaleString()}`;
    }
  }
  return out;
}

/** Father / guardian name per student, for the fees page's search box
 *  (22 Sep: "if someone wants to search parents name or the student
 *  name they should be able to do so"). The office knows many families
 *  by the father's name — it is how their own register is headed — and
 *  a sibling pair shares it, so searching it finds both at once.
 *
 *  One query for the whole org, keyed by student: the fees table is the
 *  only caller and it renders hundreds of rows. Father first, then any
 *  other linked parent; children with no parent row are simply absent. */
export async function parentNamesByStudent(
  orgId: string,
): Promise<Record<string, string>> {
  // PAGED: an unpaged read stops at 1000 rows (the #620 class). This
  // school passed 400 links while the office was still entering
  // parents, and a silent truncation here would drop names off the
  // END of the roll - a search that quietly finds nobody.
  const rows: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await serviceRoleClient
      .from("student_parent")
      .select("student_id, parent_role, is_primary, parent:parent_id(full_name, org_id)")
      .order("is_primary", { ascending: false })
      .order("student_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  const names: Record<string, string[]> = {};
  for (const r of rows) {
    const name = String(r.parent?.full_name ?? "").trim();
    // student_parent has no org column — filter on the parent's.
    if (!name || r.parent?.org_id !== orgId) continue;
    const list = names[r.student_id] ?? (names[r.student_id] = []);
    if (list.includes(name)) continue;
    if (r.parent_role === "father") list.unshift(name);
    else list.push(name);
  }
  const out: Record<string, string> = {};
  for (const [studentId, list] of Object.entries(names)) out[studentId] = list.join(", ");
  return out;
}

/** Which bank account this class's fees go to — the school banks per
 *  class group (settings.fee_bank_accounts, set in Org Settings). Same
 *  resolution the parent portal's fees page uses. */
export function bankAccountFromSettings(
  settings: any,
  classId: string | null | undefined,
): { bank: string | null; title: string | null; accountNumber: string | null; iban: string | null } | null {
  if (!classId) return null;
  const accounts = (settings?.fee_bank_accounts ?? []) as any[];
  const acct = accounts.find((a) => Array.isArray(a?.classIds) && a.classIds.includes(classId));
  if (!acct) return null;
  return { bank: acct.bank ?? null, title: acct.title ?? null, accountNumber: acct.accountNumber ?? null, iban: acct.iban ?? null };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]!));

/** Print-ready receipt HTML — shared by the staff route (family-JWT auth)
 *  and the parent-portal route (PIN auth), so the payer can finally print
 *  their own receipt. Lists every installment with its date and method. */
export function renderFeeReceiptHtml(opts: {
  feeId: string;
  fee: any;
  student: any;
  orgName: string;
  orgSettings: any;
  payments: any[]; // paymentToJson shapes, non-void first-class
  /** Where to deposit — printed while a balance remains (17 Sep). */
  bankAccount?: { bank: string | null; title: string | null; accountNumber: string | null } | null;
}): string {
  const { feeId, fee, student, orgName, orgSettings } = opts;
  const logoUrl = orgSettings.logo_url || "";
  const motto = orgSettings.school_motto || "";
  const address = orgSettings.address || "";
  const contactEmail = orgSettings.contact_email || "";
  const themeColor = orgSettings.theme_color || "#0f766e";
  const sectionName = student?.class_section?.name || "—";
  const studentName = student?.full_name || "—";
  // This codebase's student table has GR numbers, not roll numbers -
  // the receipt selected roll_number since the day it was written and
  // 400'd the moment the auth fix let anyone actually reach it (17 Sep).
  const rollNumber = student?.gr_number || "—";
  const amountDue = Number(fee.amount_due ?? 0);
  const amountPaid = Number(fee.amount_paid ?? 0);
  const balance = Math.max(0, amountDue - amountPaid);
  const paidDate = fee.paid_date || fee.updated_at?.slice(0, 10) || "";
  const period = fee.period || "—";
  const status = fee.status || "—";
  const live = opts.payments.filter((p) => !p.voidedAt);
  const payRows = live
    .map((p) => `<div class="row"><span>${esc(p.paidOn)}${p.method ? ` · ${esc(p.method)}` : ""}${p.reference ? ` · ref ${esc(p.reference)}` : ""}</span><span>${Number(p.amount).toFixed(2)}</span></div>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt — ${esc(studentName)} — ${esc(period)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #0f172a; max-width: 720px; margin: 0 auto; padding: 24px; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid ${esc(themeColor)}; padding-bottom: 16px; }
  header img { height: 56px; max-width: 120px; object-fit: contain; }
  header h1 { margin: 0; font-size: 22px; color: ${esc(themeColor)}; }
  header p { margin: 4px 0 0; font-size: 12px; color: #475569; }
  .meta { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
  .meta div { display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding: 4px 0; }
  .meta dt { color: #64748b; }
  .meta dd { margin: 0; font-weight: 600; }
  .totals { margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .totals .row.grand { border-top: 2px solid #e2e8f0; margin-top: 8px; padding-top: 12px; font-size: 16px; font-weight: 700; }
  .totals h3 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; }
  /* Traditional rubber-stamp look — the old solid block read as a
     BUTTON (Muneeb pressed it, 17 Sep). Rotated, inked outline, sits
     over the totals like a real counter stamp; prints fine. */
  .stamp-wrap { position: relative; height: 0; }
  .stamp {
    position: absolute; right: 24px; top: -110px;
    transform: rotate(-14deg);
    border: 4px double #16803c; color: #16803c;
    border-radius: 10px; padding: 6px 22px;
    font-size: 34px; font-weight: 900; letter-spacing: 6px;
    text-transform: uppercase; opacity: 0.55;
    mix-blend-mode: multiply; pointer-events: none;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .stamp small { display: block; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-align: center; margin-top: 2px; }
  footer { margin-top: 40px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  .print-btn { background: ${esc(themeColor)}; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<header>
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" />` : ""}
  <div>
    <h1>${esc(orgName)}</h1>
    ${motto ? `<p><em>${esc(motto)}</em></p>` : ""}
    ${address ? `<p>${esc(address)}</p>` : ""}
    ${contactEmail ? `<p>${esc(contactEmail)}</p>` : ""}
  </div>
</header>

<h2 style="margin-top:24px;font-size:18px;">Fee Receipt</h2>

<dl class="meta">
  <div><dt>Receipt ID</dt><dd>${esc(feeId.slice(0, 8))}</dd></div>
  <div><dt>Date</dt><dd>${esc(paidDate)}</dd></div>
  <div><dt>Student</dt><dd>${esc(studentName)}</dd></div>
  <div><dt>GR #</dt><dd>${esc(rollNumber)}</dd></div>
  <div><dt>Class</dt><dd>${esc(sectionName)}</dd></div>
  <div><dt>Period</dt><dd>${esc(period)}</dd></div>
</dl>

<div class="totals">
  <div class="row"><span>Amount due</span><span>${amountDue.toFixed(2)}</span></div>
${live.length > 0 ? `  <h3 style="margin-top:12px;">Payments</h3>\n${payRows}` : ""}
  <div class="row"><span>Amount paid</span><span>${amountPaid.toFixed(2)}</span></div>
  <div class="row grand"><span>${balance > 0 ? "Balance remaining" : "Balance"}</span><span>${balance.toFixed(2)}</span></div>
</div>

${balance > 0 && opts.bankAccount?.accountNumber ? `<div class="totals" style="margin-top:16px;">
  <h3>How to pay</h3>
  ${opts.bankAccount.bank ? `<div class="row"><span>Bank</span><span>${esc(opts.bankAccount.bank)}</span></div>` : ""}
  ${opts.bankAccount.title ? `<div class="row"><span>Account title</span><span>${esc(opts.bankAccount.title)}</span></div>` : ""}
  <div class="row"><span>Account number</span><span style="font-family:monospace;letter-spacing:.5px;">${esc(opts.bankAccount.accountNumber)}</span></div>
  ${opts.bankAccount.iban ? `<div class="row"><span>IBAN</span><span style="font-family:monospace;letter-spacing:.5px;">${esc(opts.bankAccount.iban)}</span></div>` : ""}
  <div class="row" style="color:#64748b;font-size:12px;"><span>Please deposit the fee at the bank account above and keep the stamped deposit slip to show the school office.</span><span></span></div>
  <div class="row" style="color:#64748b;font-size:12px;" dir="rtl"><span>فیس اوپر دیے گئے بینک اکاؤنٹ میں جمع کروائیں اور جمع شدہ پرچی اسکول آفس کو دکھائیں۔</span><span></span></div>
</div>` : ""}

${status === "paid" ? `<div class="stamp-wrap"><div class="stamp">PAID${live.length ? `<small>${esc(live[live.length - 1].paidOn)}</small>` : ""}</div></div>` : ""}

<div class="no-print" style="margin-top:24px;">
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
</div>

<footer>
  Generated ${todayInOrgTz()} · This receipt is computer-generated and does not require a signature.
</footer>
</body>
</html>`;
}

const isIsoDate = (s: unknown): boolean =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function installFeePayments(school: Hono): void {
  // POST /school/orgs/:orgId/fees/:feeId/payments
  school.post("/orgs/:orgId/fees/:feeId/payments", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const feeId = c.req.param("feeId");
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return c.json({ error: "amount must be a positive number" }, 400);
    }
    const paidOn = body?.paidOn ?? todayInOrgTz();
    if (!isIsoDate(paidOn)) return c.json({ error: "paidOn must be YYYY-MM-DD" }, 400);
    const method = body?.method ?? null;
    if (method !== null && !PAYMENT_METHODS.has(method)) {
      return c.json({ error: "method must be cash, bank, online or other" }, 400);
    }
    const { data: fee } = await serviceRoleClient
      .from("fee_status").select("id, org_id, student_id").eq("id", feeId).maybeSingle();
    if (!fee || (fee as any).org_id !== orgId) return c.json({ error: "fee not found" }, 404);

    const { data: pay, error } = await serviceRoleClient
      .from("fee_payment")
      .insert({
        org_id: orgId,
        fee_status_id: feeId,
        student_id: (fee as any).student_id,
        amount,
        paid_on: paidOn,
        method,
        reference: typeof body?.reference === "string" ? body.reference.trim() || null : null,
        notes: typeof body?.notes === "string" ? body.notes.trim() || null : null,
        recorded_by: userId,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    const updated = await recomputeFeeFromLedger(feeId);
    return c.json({ payment: paymentToJson(pay), fee: updated }, 201);
  });

  // POST /school/orgs/:orgId/students/:studentId/fee-payments
  //
  // The counter flow (design 13b): the office takes ONE amount from the
  // guardian and the system settles owed months OLDEST FIRST, splitting
  // across months as needed - partial payments are the norm, not an edge
  // case. Optional feeStatusId pins the whole amount to one month
  // instead. Anything left after every owed month is settled goes onto
  // the newest owed month as an advance (kept simple, visible in the
  // ledger). Returns the per-month allocations + updated fee rows.
  school.post("/orgs/:orgId/students/:studentId/fee-payments", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return c.json({ error: "amount must be a positive number" }, 400);
    }
    const paidOn = body?.paidOn ?? todayInOrgTz();
    if (!isIsoDate(paidOn)) return c.json({ error: "paidOn must be YYYY-MM-DD" }, 400);
    const method = body?.method ?? null;
    if (method !== null && !PAYMENT_METHODS.has(method)) {
      return c.json({ error: "method must be cash, bank, online or other" }, 400);
    }
    const reference = typeof body?.reference === "string" ? body.reference.trim() || null : null;
    const notes = typeof body?.notes === "string" ? body.notes.trim() || null : null;

    const { data: stu } = await serviceRoleClient
      .from("student").select("id, org_id").eq("id", studentId).maybeSingle();
    if (!stu || (stu as any).org_id !== orgId) return c.json({ error: "student not found" }, 404);

    // Which months take the money.
    let targets: Array<{ id: string; owed: number }> = [];
    if (body?.feeStatusId) {
      const { data: fee } = await serviceRoleClient
        .from("fee_status").select("id, org_id, student_id, amount_due, amount_paid")
        .eq("id", body.feeStatusId).maybeSingle();
      if (!fee || (fee as any).org_id !== orgId || (fee as any).student_id !== studentId) {
        return c.json({ error: "fee not found" }, 404);
      }
      targets = [{ id: (fee as any).id, owed: Number.POSITIVE_INFINITY }];
    } else {
      const { data: owedRows } = await serviceRoleClient
        .from("fee_status")
        .select("id, period, amount_due, amount_paid")
        .eq("student_id", studentId)
        .in("status", ["unpaid", "partial"])
        .order("period", { ascending: true });
      targets = ((owedRows ?? []) as any[])
        .map((r) => ({ id: r.id, owed: Math.max(0, (Number(r.amount_due) || 0) - (Number(r.amount_paid) || 0)) }))
        .filter((r) => r.owed > 0);
      if (targets.length === 0) {
        return c.json({ error: "nothing outstanding - pass feeStatusId to record against a specific month", code: "NOTHING_OUTSTANDING" }, 400);
      }
      // Whatever exceeds every owed month rides the newest owed month.
      targets[targets.length - 1].owed = Number.POSITIVE_INFINITY;
    }

    let left = amount;
    const allocations: Array<{ feeStatusId: string; amount: number }> = [];
    for (const tgt of targets) {
      if (left <= 0) break;
      const take = Math.min(left, tgt.owed);
      if (take <= 0) continue;
      allocations.push({ feeStatusId: tgt.id, amount: take });
      left -= take;
    }

    const fees: any[] = [];
    const payments: any[] = [];
    for (const a of allocations) {
      const { data: pay, error } = await serviceRoleClient
        .from("fee_payment")
        .insert({
          org_id: orgId,
          fee_status_id: a.feeStatusId,
          student_id: studentId,
          amount: a.amount,
          paid_on: paidOn,
          method,
          reference,
          notes,
          recorded_by: userId,
        })
        .select()
        .single();
      if (error) return c.json({ error: error.message }, 500);
      payments.push(paymentToJson(pay));
      fees.push(await recomputeFeeFromLedger(a.feeStatusId));
    }
    return c.json({ allocations, payments, fees }, 201);
  });

  // POST /school/orgs/:orgId/fee-payments/:paymentId/void
  school.post("/orgs/:orgId/fee-payments/:paymentId/void", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const paymentId = c.req.param("paymentId");
    if (!(await userCanInOrg(userId, orgId, "mark_fees_status"))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { body = {}; }
    const { data: pay } = await serviceRoleClient
      .from("fee_payment").select("id, org_id, fee_status_id, voided_at").eq("id", paymentId).maybeSingle();
    if (!pay || (pay as any).org_id !== orgId) return c.json({ error: "payment not found" }, 404);
    if ((pay as any).voided_at) return c.json({ error: "payment is already voided" }, 409);
    const { error } = await serviceRoleClient
      .from("fee_payment")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: userId,
        void_reason: typeof body?.reason === "string" ? body.reason.trim() || null : null,
      })
      .eq("id", paymentId);
    if (error) return c.json({ error: error.message }, 500);
    const updated = await recomputeFeeFromLedger((pay as any).fee_status_id);
    return c.json({ ok: true, fee: updated });
  });
}

export default installFeePayments;
