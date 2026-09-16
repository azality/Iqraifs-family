// FeesOverview — admin surface listing fee statuses across the org for a period.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Pencil, Trash2, Banknote } from "lucide-react";
import { HeroCard, KpiTile, DataTable, type DataTableColumn, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  listOrgFees,
  bulkGenerateFees,
  type BulkFeeGenerateResult,
  addFeePayment,
  voidFeePayment,
  deleteFee,
  type AdminClass,
  type FeeStatus,
  type FeePayment,
  type FeeStatusValue,
  type StudentOutstanding,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { useOrgPermissionState } from "./useOrgPermission";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = -6; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const STATUS_LABEL: Record<FeeStatusValue, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  partial: "Partial",
  waived: "Waived",
};

const STATUS_BADGE: Record<FeeStatusValue, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  waived: "bg-indigo-100 text-indigo-700",
};

/** Overdue is a VIEW, not a stored status: unpaid/partial past its due
 *  date. The old code kept "overdue" in the status vocabulary, which the
 *  server rejects with 400 and which nothing ever set (fees review). */
export function isOverdue(f: FeeStatus): boolean {
  if (f.status === "paid" || f.status === "waived") return false;
  if (!f.due_date) return false;
  return f.due_date < new Date().toISOString().slice(0, 10);
}

export function FeeStatusBadge({ fee }: { fee: FeeStatus }) {
  if (isOverdue(fee)) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700">
        Overdue{fee.status === "partial" ? " - partial" : ""}
      </span>
    );
  }
  const status = (fee.status in STATUS_BADGE ? fee.status : "unpaid") as FeeStatusValue;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export const fmtRs = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;

// Record-payment dialog (17 Sep). Replaces "Mark paid": shows the month's
// due / paid-so-far / REMAINING (prefilled), captures amount + date +
// method + slip reference, lists every earlier installment with a void
// link, and never disappears — the old dialog hardcoded status "paid" on
// any amount and then hid its own button, so a partial payment could
// neither be completed nor corrected.
export function RecordPaymentDialog({
  fee,
  onClose,
  onSaved,
  orgId,
}: {
  fee: FeeStatus | null;
  onClose: () => void;
  onSaved: () => void;
  orgId: string;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fee) return;
    const due = fee.amount_due ?? 0;
    const paid = fee.amount_paid ?? 0;
    const remaining = Math.max(0, due - paid);
    setAmount(remaining > 0 ? String(remaining) : "");
    setPaidOn(new Date().toISOString().slice(0, 10));
    setMethod("cash");
    setReference("");
    setNotes("");
    setPayments(fee.payments ?? []);
  }, [fee]);

  if (!fee) return null;
  const due = fee.amount_due ?? 0;
  const paid = fee.amount_paid ?? 0;
  const remaining = Math.max(0, due - paid);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter the amount received.");
      return;
    }
    setSaving(true);
    try {
      const r = await addFeePayment(orgId, fee.id, {
        amount: amt,
        paidOn: paidOn || undefined,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const nowPaid = r.fee?.amount_paid ?? paid + amt;
      const left = Math.max(0, due - nowPaid);
      toast.success(
        left > 0
          ? `Recorded ${fmtRs(amt)} — ${fmtRs(left)} still due for ${fee.period}`
          : `Recorded ${fmtRs(amt)} — ${fee.period} settled`,
      );
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const voidOne = async (p: FeePayment) => {
    if (!confirm(`Void the ${fmtRs(p.amount)} payment from ${p.paidOn}? The month's total recalculates.`)) return;
    const reason = prompt("Reason (optional):") ?? "";
    try {
      await voidFeePayment(orgId, p.id, reason.trim() || undefined);
      toast.success("Payment voided");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={!!fee} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600 -mt-1">
          {fee.student_name ?? fee.student_id} · {fee.period}
        </p>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center">
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Due</div><div className="text-sm font-bold tabular-nums">{fmtRs(due)}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Paid</div><div className="text-sm font-bold tabular-nums text-emerald-700">{fmtRs(paid)}</div></div>
          <div><div className="text-[10px] font-bold uppercase text-slate-400">Remaining</div><div className={`text-sm font-bold tabular-nums ${remaining > 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmtRs(remaining)}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Amount received</Label><Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><Label>Date</Label><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
          <div>
            <Label>Method</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank deposit</option>
              <option value="online">Online transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div><Label>Slip / reference #</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" /></div>
        </div>
        <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" /></div>
        {payments.length > 0 && (
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Payments so far
            </div>
            {payments.map((p) => (
              <div key={p.id} className={`flex items-center justify-between px-2.5 py-1.5 text-xs ${p.voidedAt ? "text-slate-400 line-through" : "text-slate-700"}`}>
                <span className="tabular-nums">{p.paidOn}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span className="flex items-center gap-2">
                  <b className="tabular-nums">{fmtRs(p.amount)}</b>
                  {!p.voidedAt && (
                    <button type="button" className="text-rose-600 underline" onClick={() => void voidOne(p)}>
                      void
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeesOverview() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [period, setPeriod] = useState(currentPeriod());
  const [sectionFilter, setSectionFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [fees, setFees] = useState<FeeStatus[]>([]);
  // Design 4e: empty month becomes onboarding — a dry-run of the bulk
  // generator previews what "Generate" would create.
  const [dryInfo, setDryInfo] = useState<BulkFeeGenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  // Which classes to bill (7 Sep: Ambreen wanted vouchers for Catch Up
  // only — the button billed the whole school). "__all__" = every class.
  const [genClassId, setGenClassId] = useState<string>("__all__");
  const [feesLoaded, setFeesLoaded] = useState(false);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [payFee, setPayFee] = useState<FeeStatus | null>(null);
  // What each family owes across EVERY month - "unpaid August + September
  // should show 8000, not 4000" (fees review, 17 Sep).
  const [outstanding, setOutstanding] = useState<Record<string, StudentOutstanding>>({});

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    // "overdue" is a view, not a stored status (the server 400s on it) -
    // fetch everything and filter client-side by due date.
    const serverStatus =
      statusFilter !== "__all__" && statusFilter !== "overdue"
        ? (statusFilter as FeeStatusValue)
        : undefined;
    listOrgFees(orgId, {
      period,
      status: serverStatus,
      sectionId: sectionFilter !== "__all__" ? sectionFilter : undefined,
    })
      .then((r) => {
        const rows = statusFilter === "overdue" ? r.fees.filter(isOverdue) : r.fees;
        setFees(rows);
        setOutstanding(r.outstandingByStudent ?? {});
        setFeesLoaded(true);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, period, sectionFilter, statusFilter]);

  const monthEmpty =
    feesLoaded && fees.length === 0 && statusFilter === "__all__" && sectionFilter === "__all__";
  useEffect(() => {
    if (!orgId || !monthEmpty) { setDryInfo(null); return; }
    let cancelled = false;
    bulkGenerateFees(orgId, {
      period,
      dryRun: true,
      ...(genClassId !== "__all__" ? { classIds: [genClassId] } : {}),
    })
      .then((r) => { if (!cancelled) setDryInfo(r); })
      .catch(() => { if (!cancelled) setDryInfo(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, period, monthEmpty, genClassId]);
  const runGenerate = async () => {
    setGenerating(true);
    try {
      const r = await bulkGenerateFees(orgId, {
        period,
        ...(genClassId !== "__all__" ? { classIds: [genClassId] } : {}),
      });
      toast.success(
        `${r.created} voucher${r.created === 1 ? "" : "s"} created` +
          (r.skipped > 0 ? ` · ${r.skipped} skipped (no fee plan)` : "") +
          (r.waived > 0 ? ` · ${r.waived} waived` : ""),
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate vouchers.");
    } finally {
      setGenerating(false);
    }
  };
  const monthLabel = (() => {
    try {
      return new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } catch { return period; }
  })();

  const sectionOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const c of classes) for (const s of c.sections || []) out.push({ id: s.id, label: `${c.name} - ${s.name}` });
    return out;
  }, [classes]);

  const totals = useMemo(() => {
    let due = 0, paid = 0, paidCount = 0, unpaidCount = 0;
    for (const f of fees) {
      due += f.amount_due ?? 0;
      paid += f.amount_paid ?? 0;
      if (f.status === "paid" || f.status === "waived") paidCount++;
      else unpaidCount++;
    }
    return { due, paid, paidCount, unpaidCount };
  }, [fees]);
  const outstandingTotal = useMemo(
    () => Object.values(outstanding).reduce((n, o) => n + o.total, 0),
    [outstanding],
  );

  // Permission-aware gate. isOrgAdmin still short-circuits for
  // principal/admin; other roles resolve through the effective matrix
  // (mark_fees_status) so the Permissions editor's toggles govern this page.
  // While the matrix fetch is in flight we render nothing rather than
  // bouncing a legitimately-permitted user.
  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "mark_fees_status");

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }

  const handleDelete = async (f: FeeStatus) => {
    if (!confirm(`Delete fee record for ${f.student_name ?? f.student_id} (${f.period})?`)) return;
    try {
      await deleteFee(orgId, f.id);
      toast.success("Fee record deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the fee record.");
    }
    refresh();
  };

  const columns: Array<DataTableColumn<FeeStatus>> = [
    {
      key: "student",
      header: "Student",
      cell: (f) => (
        <div>
          <div className="font-medium text-slate-900">{f.student_name ?? f.student_id}</div>
          <div className="text-xs text-slate-500">{f.gr_number ?? ""}</div>
        </div>
      ),
    },
    {
      key: "class",
      header: "Class",
      width: "w-28",
      cell: (f) => (
        <span className="text-xs text-slate-600">{f.class_name ?? "—"}</span>
      ),
    },
    {
      key: "section",
      header: "Section",
      width: "w-24",
      cell: (f) => (
        <span className="text-xs text-slate-600">{f.section_name ?? "—"}</span>
      ),
    },
    { key: "period", header: "Period", width: "w-24", cell: (f) => <span className="text-xs tabular-nums">{f.period}</span> },
    { key: "status", header: "Status", width: "w-24", cell: (f) => <FeeStatusBadge fee={f} /> },
    { key: "due", header: "Due", align: "right", width: "w-24", cell: (f) => <span className="tabular-nums">{f.amount_due ?? "—"}</span> },
    { key: "paid", header: "Paid", align: "right", width: "w-24", cell: (f) => <span className="tabular-nums">{f.amount_paid ?? "—"}</span> },
    {
      key: "outstanding",
      header: "Owes (all months)",
      align: "right",
      width: "w-32",
      cell: (f) => {
        const o = outstanding[f.student_id];
        if (!o || o.total <= 0) return <span className="text-xs text-emerald-600">clear</span>;
        return (
          <span className="tabular-nums font-semibold text-rose-600" title={`${o.months} month${o.months === 1 ? "" : "s"} since ${o.oldestPeriod ?? ""}`}>
            {fmtRs(o.total)}
            {o.months > 1 && <span className="ml-1 text-[10px] font-normal text-rose-400">×{o.months}</span>}
          </span>
        );
      },
    },
    { key: "dueDate", header: "Due date", width: "w-28", cell: (f) => <span className="text-xs text-slate-600 tabular-nums">{f.due_date ?? "—"}</span> },
    {
      key: "receipt",
      header: "Receipt",
      width: "w-20",
      cell: (f) =>
        f.receipt_url ? (
          <a href={f.receipt_url} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs underline" onClick={(e) => e.stopPropagation()}>
            View
          </a>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-32",
      cell: (f) => (
        <div className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title={f.status === "paid" ? "Payments / corrections" : "Record payment"}
            onClick={() => setPayFee(f)}
          >
            <Banknote className={`h-3.5 w-3.5 ${f.status === "paid" ? "text-slate-400" : "text-emerald-600"}`} />
          </Button>
          <Link to={`/school/orgs/${orgId}/students/${f.student_id}/fees`} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(f)}>
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Fees"
        subtitle="Fee status across the org"
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-32 bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {periodOptions().map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="h-9 w-44 bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {sectionOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Link to={`/school/orgs/${orgId}/admin/fees/plans`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">Plans</Button>
            </Link>
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
          </div>
        }
      />

      {monthEmpty ? (
        <div className="rounded-xl border bg-white px-6 py-9 text-center" style={{ borderColor: "rgba(20,22,58,.08)" }}>
          <div className="text-[15px] font-extrabold text-slate-900">
            No vouchers generated for {monthLabel} yet
          </div>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500">
            {dryInfo
              ? <>Generating creates vouchers for <strong className="text-slate-700">{dryInfo.total} student{dryInfo.total === 1 ? "" : "s"}</strong> from each class&apos;s fee plan{dryInfo.waived > 0 ? <>, honoring {dryInfo.waived} waiver{dryInfo.waived === 1 ? "" : "s"}</> : null}.</>
              : "Vouchers are created from each class's monthly fee plan, honoring per-student overrides."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {/* Scope: one class or the whole school — Ambreen only
                wanted Catch Up billed and got everyone (7 Sep). */}
            <Select value={genClassId} onValueChange={setGenClassId}>
              <SelectTrigger className="h-10 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Whole school</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} only</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={runGenerate} disabled={generating}>
              {generating
                ? "Generating…"
                : `Generate ${monthLabel} vouchers${genClassId !== "__all__" ? ` — ${classes.find((c) => c.id === genClassId)?.name ?? ""}` : ""}`}
            </Button>
            <Link to={`/school/orgs/${orgId}/admin/fees/plans`}>
              <Button variant="outline">Review fee plans first</Button>
            </Link>
          </div>
          {dryInfo && dryInfo.skipped > 0 && (
            <div className="mt-4 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
              {dryInfo.skipped} student{dryInfo.skipped === 1 ? "" : "s"} in classes with no fee plan will be skipped.
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile variant="light" label="Students" value={fees.length} hint="this period" />
        <KpiTile variant="light" label="Paid" value={totals.paidCount} hint={`${totals.unpaidCount} unpaid`} />
        <KpiTile variant="light" label="Total due" value={totals.due} hint="this period" />
        <KpiTile variant="light" label="Collected" value={totals.paid} hint="this period" />
        <KpiTile
          variant="light"
          label="Outstanding"
          value={fmtRs(outstandingTotal)}
          hint={`all months · ${Object.keys(outstanding).length} students`}
        />
      </div>

      <div className="flex gap-2 flex-wrap items-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue (past due date)</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
        {/* Bill more classes after a partial run — generating Catch Up
            first no longer strands the rest of the school (re-running an
            already-billed class just refreshes its amounts, never
            doubles). */}
        <div className="ml-auto flex items-center gap-2">
          <Select value={genClassId} onValueChange={setGenClassId}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Whole school</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} only</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={runGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate vouchers"}
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={fees}
        rowKey={(f) => f.id}
        emptyMessage="No fee records."
        onRowClick={(f) =>
          navigate(`/school/orgs/${orgId}/students/${f.student_id}/fees`)
        }
      />
      </>
      )}

      <RecordPaymentDialog fee={payFee} onClose={() => setPayFee(null)} onSaved={refresh} orgId={orgId} />
    </div>
  );
}
