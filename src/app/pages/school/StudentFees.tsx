// StudentFees — the student's fee page as a RUNNING LEDGER (design
// handoff redesign-13-fees, 13c, 17 Sep): charges down, payments down,
// balance on the right — what every paper fee register in Pakistan
// already is. Concessions and each installment appear as their own
// lines so the balance is always explainable to a parent at the
// counter. Corrections are voids on the payment lines.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Plus, FileText, MessageSquare, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { HeroCard, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  getStudent,
  isOrgAdmin,
  listStudentFees,
  createFee,
  deleteFee,
  voidFeePayment,
  type FeeStatus,
  type FeePayment,
  type SchoolMeResponse,
  type StudentWithParents,
} from "../../../utils/schoolApi";
import {
  AllocatePaymentDialog,
  type AllocateTarget,
  fmtRs,
  longPeriod,
} from "./FeesOverview";

interface LedgerLine {
  key: string;
  date: string;
  entry: string;
  charge: number | null;
  paid: number | null;
  balance: number;
  kind: "charge" | "payment" | "void" | "waive";
  receiptFeeId?: string;
  payment?: FeePayment;
  fee?: FeeStatus;
}

export function StudentFees() {
  const { orgId = "", studentId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [student, setStudent] = useState<StudentWithParents | null>(null);
  const [fees, setFees] = useState<FeeStatus[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<AllocateTarget | null>(null);
  const [form, setForm] = useState({
    year: String(new Date().getUTCFullYear()),
    month: String(new Date().getUTCMonth() + 1).padStart(2, "0"),
    amountDue: "",
    dueDate: "",
    notes: "",
  });

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId || !studentId) return;
    getStudent(orgId, studentId).then(setStudent).catch(() => {});
    listStudentFees(orgId, studentId)
      .then((r) => setFees(r.fees))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };
  useEffect(refresh, [orgId, studentId]);

  // ── Ledger assembly: sort events oldest-first, run the balance, then
  //    display newest-first with the running balance on the right. ──
  const { ledger, owedTotal, owedMonths, owedPeriods, monthlyFee } = useMemo(() => {
    type Ev = Omit<LedgerLine, "balance" | "key">;
    const evs: Ev[] = [];
    for (const f of fees) {
      const chargeDate = f.due_date ?? `${f.period}-01`;
      evs.push({
        date: chargeDate,
        entry: `${longPeriod(f.period)} tuition${f.notes ? ` · ${f.notes}` : ""}`,
        charge: f.amount_due ?? 0,
        paid: null,
        kind: "charge",
        fee: f,
      });
      if (f.status === "waived") {
        evs.push({
          date: chargeDate,
          entry: `Waived · ${longPeriod(f.period)}`,
          charge: -(f.amount_due ?? 0),
          paid: null,
          kind: "waive",
          fee: f,
        });
      }
      for (const p of f.payments ?? []) {
        if (p.voidedAt) {
          evs.push({
            date: p.paidOn,
            entry: `Payment of ${fmtRs(p.amount)} voided${p.voidReason ? ` · ${p.voidReason}` : ""}`,
            charge: null,
            paid: null,
            kind: "void",
            payment: p,
            fee: f,
          });
        } else {
          evs.push({
            date: p.paidOn,
            entry: `Payment · ${p.method ?? "—"}${p.reference ? ` · ${p.reference}` : ""}`,
            charge: null,
            paid: p.amount,
            kind: "payment",
            receiptFeeId: f.id,
            payment: p,
            fee: f,
          });
        }
      }
    }
    evs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "charge" ? -1 : 1));
    let bal = 0;
    const lines: LedgerLine[] = evs.map((e, i) => {
      bal += (e.charge ?? 0) - (e.paid ?? 0);
      return { ...e, balance: bal, key: `${i}:${e.date}:${e.kind}` };
    });
    lines.reverse();

    let owedTotal = 0, owedMonths = 0;
    const owedPeriods = fees
      .filter((f) => f.status === "unpaid" || f.status === "partial")
      .map((f) => ({
        feeStatusId: f.id,
        period: f.period,
        owed: Math.max(0, (f.amount_due ?? 0) - (f.amount_paid ?? 0)),
        partial: (f.amount_paid ?? 0) > 0,
        dueDate: f.due_date,
      }))
      .filter((p) => p.owed > 0)
      .sort((a, b) => (a.period < b.period ? -1 : 1));
    for (const p of owedPeriods) { owedTotal += p.owed; owedMonths += 1; }
    const monthlyFee = fees[0]?.amount_due ?? null;
    return { ledger: lines, owedTotal, owedMonths, owedPeriods, monthlyFee };
  }, [fees]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <NoAccessRedirect />;

  const receiptUrl = (feeId: string) =>
    `${import.meta.env.VITE_SUPABASE_URL ?? "https://ybrkbrrkcqpzpjnjdyib.supabase.co"}/functions/v1/make-server-f116e23f/school/orgs/${orgId}/fees/${feeId}/receipt`;

  const openPayment = () => {
    setPayTarget({
      studentId,
      name: student?.full_name ?? "Student",
      gr: student?.gr_number,
      total: owedTotal,
      owedPeriods,
      pinFee: owedPeriods.length === 0 && fees[0]
        ? { feeStatusId: fees[0].id, period: fees[0].period, owed: 0 }
        : null,
    });
  };

  const voidOne = async (p: FeePayment) => {
    if (!confirm(`Void the ${fmtRs(p.amount)} payment from ${p.paidOn}? The balance recalculates.`)) return;
    const reason = prompt("Reason (optional):") ?? "";
    try {
      await voidFeePayment(orgId, p.id, reason.trim() || undefined);
      toast.success("Payment voided");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteMonth = async (f: FeeStatus) => {
    if ((f.payments ?? []).some((p) => !p.voidedAt)) {
      toast.error("This month has payments — void them first if the charge itself is wrong.");
      return;
    }
    if (!confirm(`Delete the ${longPeriod(f.period)} charge?`)) return;
    try {
      await deleteFee(orgId, f.id);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const copyReminder = () => {
    const months = owedPeriods.map((p) => longPeriod(p.period)).join(", ");
    const text = `Assalam o Alaikum! ${student?.full_name ?? ""} (GR# ${student?.gr_number ?? "—"}) ki school fees ${fmtRs(owedTotal)} baqaya hai (${months}). Barah-e-karam jald ada karein ya office se rabta karein. Shukriya — Iqra Islamic Foundation School`;
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Reminder copied — paste into WhatsApp"))
      .catch(() => toast.error("Could not copy"));
  };

  const submitAdd = async () => {
    const period = `${form.year}-${form.month}`;
    try {
      await createFee(orgId, studentId, {
        period,
        amountDue: form.amountDue ? parseFloat(form.amountDue) : undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      setAddOpen(false);
      refresh();
      toast.success(`${longPeriod(period)} charge added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const openAdd = () => {
    const latest = fees[0]?.period;
    let year = new Date().getUTCFullYear();
    let month = new Date().getUTCMonth() + 1;
    if (latest) {
      const m = /^(\d{4})-(\d{2})$/.exec(latest);
      if (m) {
        year = Number(m[1]);
        month = Number(m[2]) + 1;
        if (month === 13) { month = 1; year += 1; }
      }
    }
    setForm({
      year: String(year),
      month: String(month).padStart(2, "0"),
      amountDue: fees[0]?.amount_due ? String(fees[0].amount_due) : "",
      dueDate: "",
      notes: "",
    });
    setAddOpen(true);
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title={`${student?.full_name ?? "Student"} · fee ledger`}
        subtitle={[
          student ? `GR# ${student.gr_number}` : "",
          monthlyFee != null ? `Monthly ${fmtRs(monthlyFee)}` : "",
        ].filter(Boolean).join(" · ")}
        rightSlot={
          <div className="flex items-center gap-2">
            {owedTotal > 0 ? (
              <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                Owes {fmtRs(owedTotal)} · {owedMonths} month{owedMonths === 1 ? "" : "s"}
              </span>
            ) : fees.length > 0 ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                All settled
              </span>
            ) : null}
            <Link to={`/school/orgs/${orgId}/admin/students/${studentId}`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Student</Button>
            </Link>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto px-5 pt-2">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10.5px] font-extrabold uppercase tracking-wide text-slate-400">
                <th className="w-24 py-2.5 pr-3">Date</th>
                <th className="py-2.5 pr-3">Entry</th>
                <th className="w-24 py-2.5 pr-3 text-right">Charge</th>
                <th className="w-24 py-2.5 pr-3 text-right">Paid</th>
                <th className="w-24 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.key} className={`border-b border-slate-100 ${l.kind === "payment" ? "bg-emerald-50/40" : ""} ${l.kind === "void" ? "opacity-60" : ""}`}>
                  <td className="py-2 pr-3 text-[11.5px] text-slate-400 tabular-nums">{l.date}</td>
                  <td className="py-2 pr-3 text-xs text-slate-700">
                    <span className={l.kind === "void" ? "line-through" : ""}>{l.entry}</span>
                    {l.kind === "payment" && l.receiptFeeId && (
                      <a href={receiptUrl(l.receiptFeeId)} target="_blank" rel="noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-indigo-600 underline">
                        <FileText className="h-3 w-3" /> receipt
                      </a>
                    )}
                    {l.kind === "payment" && l.payment && (
                      <button type="button" onClick={() => void voidOne(l.payment!)}
                        className="ml-2 text-[11px] text-rose-500 underline">
                        void
                      </button>
                    )}
                    {l.kind === "charge" && l.fee && (
                      <button type="button" onClick={() => void deleteMonth(l.fee!)}
                        title="Delete this month's charge"
                        className="ml-2 align-middle text-slate-300 hover:text-rose-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-xs tabular-nums text-rose-700">
                    {l.charge != null && l.charge !== 0 ? (l.charge < 0 ? `−${Math.abs(l.charge).toLocaleString()}` : l.charge.toLocaleString()) : ""}
                  </td>
                  <td className="py-2 pr-3 text-right text-xs font-semibold tabular-nums text-emerald-700">
                    {l.paid != null ? l.paid.toLocaleString() : ""}
                  </td>
                  <td className="py-2 text-right text-xs font-bold tabular-nums text-slate-900">
                    {l.balance.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              No fee records yet — add the first month's charge below.
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={openPayment} disabled={fees.length === 0}>
            Record payment
          </Button>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add month
          </Button>
          {owedTotal > 0 && (
            <button type="button" onClick={copyReminder}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              <MessageSquare className="h-3.5 w-3.5" /> Remind guardian
            </button>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add month's charge</DialogTitle>
            <p className="text-xs text-slate-500">
              Adds a tuition charge for {student?.full_name ?? "this student"} — prefilled with the next month and the same amount.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Month *</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Select value={form.month} onValueChange={(v) => setForm({ ...form, month: v })}>
                  <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    {["01","02","03","04","05","06","07","08","09","10","11","12"].map((v) => (
                      <SelectItem key={v} value={v}>{longPeriod(`2000-${v}`).replace(" 2000", "")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.year} onValueChange={(v) => setForm({ ...form, year: v })}>
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const now = new Date().getUTCFullYear();
                      const years: number[] = [];
                      for (let y = now - 1; y <= now + 2; y++) years.push(y);
                      return years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>);
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Amount due (Rs.)</Label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="e.g. 5000"
                value={form.amountDue} onChange={(e) => setForm({ ...form, amountDue: e.target.value })} />
            </div>
            <div>
              <Label>Due date <span className="font-normal text-slate-400">(optional)</span></Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>Notes <span className="font-normal text-slate-400">(optional)</span></Label>
              <Textarea placeholder="e.g. Includes uniform fee" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AllocatePaymentDialog target={payTarget} onClose={() => setPayTarget(null)} onSaved={refresh} orgId={orgId} />
    </div>
  );
}
