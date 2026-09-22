// FeesOverview — the school-wide fees page, rebuilt around AGING
// (design handoff redesign-13-fees, 13a/13b, 17 Sep):
//
//   ONE ROW PER STUDENT, ranked by months behind — not one row per
//   month, where a family three months behind appeared three times.
//   Aging buckets (paid / due this month / 2 months / defaulters 3+)
//   double as filters; arrears render as month chips; concessions show
//   on the row so the office never chases a zakat case for the full
//   amount; "Record payment" takes ONE amount and settles owed months
//   oldest-first (the counter flow — partial payments are the norm).
//
// No fake features: late fines and SMS don't exist in the product, so
// reminders are the established copy-a-WhatsApp-message pattern.

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
import { FileText, MessageSquare, Search } from "lucide-react";
import { HeroCard, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  listOrgFees,
  bulkGenerateFees,
  type BulkFeeGenerateResult,
  allocateStudentFeePayment,
  openFeeReceipt,
  type AdminClass,
  type FeeStatus,
  type FeeStatusValue,
  type StudentOutstanding,
  type OwedPeriod,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { useOrgPermissionState } from "./useOrgPermission";

export const fmtRs = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;

const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortPeriod = (period: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? MONTH_SHORT[Number(m[2])] || period : period;
};
export const longPeriod = (period: string): string => {
  try {
    return new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch { return period; }
};

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

// ─── Status badge (kept for the ledger page) ─────────────────────────
const STATUS_LABEL: Record<FeeStatusValue, string> = {
  unpaid: "Unpaid", paid: "Paid", partial: "Partial", waived: "Waived",
};
const STATUS_BADGE: Record<FeeStatusValue, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  waived: "bg-indigo-100 text-indigo-700",
};
export function isOverdue(f: FeeStatus): boolean {
  if (f.status === "paid" || f.status === "waived") return false;
  if (!f.due_date) return false;
  return f.due_date < new Date().toISOString().slice(0, 10);
}
export function FeeStatusBadge({ fee }: { fee: FeeStatus }) {
  if (isOverdue(fee)) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700">
        Overdue{fee.status === "partial" ? " · partial" : ""}
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

// ─── 13b: Record payment — one amount, applied oldest month first ─────
export interface AllocateTarget {
  studentId: string;
  name: string;
  gr?: string | null;
  owedPeriods: OwedPeriod[];
  total: number;
  /** Pin the whole amount to one month (ledger-row entry point). */
  pinFee?: { feeStatusId: string; period: string; owed: number } | null;
}

const METHODS: Array<{ v: string; l: string }> = [
  { v: "cash", l: "Cash" }, { v: "bank", l: "Bank" }, { v: "online", l: "Online" }, { v: "other", l: "Other" },
];

export function AllocatePaymentDialog({
  target,
  onClose,
  onSaved,
  orgId,
}: {
  target: AllocateTarget | null;
  onClose: () => void;
  onSaved: () => void;
  orgId: string;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const prefill = target.pinFee ? target.pinFee.owed : target.total;
    setAmount(prefill > 0 ? String(prefill) : "");
    setPaidOn(new Date().toISOString().slice(0, 10));
    setMethod("cash");
    setReference("");
    setNotes("");
  }, [target]);

  if (!target) return null;
  const amt = parseFloat(amount) || 0;

  // Live mirror of the server's oldest-first split, so the office sees
  // exactly what settles and what stays pending before saving.
  const preview = (() => {
    if (target.pinFee) {
      return [{
        period: target.pinFee.period,
        applied: Math.min(amt, target.pinFee.owed || amt),
        owed: target.pinFee.owed,
        advance: Math.max(0, amt - target.pinFee.owed),
      }];
    }
    let left = amt;
    return target.owedPeriods.map((p, i) => {
      const last = i === target.owedPeriods.length - 1;
      const applied = Math.min(left, last ? Number.POSITIVE_INFINITY : p.owed);
      left -= applied;
      return {
        period: p.period,
        applied: Math.min(applied, p.owed),
        owed: p.owed,
        advance: last ? Math.max(0, applied - p.owed) : 0,
      };
    });
  })();

  const submit = async () => {
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter the amount received.");
      return;
    }
    setSaving(true);
    try {
      const r = await allocateStudentFeePayment(orgId, target.studentId, {
        amount: amt,
        paidOn: paidOn || undefined,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(target.pinFee ? { feeStatusId: target.pinFee.feeStatusId } : {}),
      });
      const settled = r.allocations.length;
      toast.success(`Recorded ${fmtRs(amt)} across ${settled} month${settled === 1 ? "" : "s"} for ${target.name}`);
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment · {target.name}</DialogTitle></DialogHeader>
        <p className="-mt-1 text-xs text-slate-500">
          {target.gr ? `GR# ${target.gr} · ` : ""}
          {target.pinFee
            ? `${longPeriod(target.pinFee.period)} · ${fmtRs(target.pinFee.owed)} owed this month`
            : `outstanding ${fmtRs(target.total)} · ${target.owedPeriods.length} month${target.owedPeriods.length === 1 ? "" : "s"}`}
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Amount received</Label>
            <Input type="number" step="0.01" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} autoFocus className="text-lg font-bold" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Method</Label>
            <div className="flex gap-1">
              {METHODS.map((m) => (
                <button key={m.v} type="button" onClick={() => setMethod(m.v)}
                  className={"h-9 flex-1 rounded-lg text-xs font-bold " +
                    (method === m.v ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Date</Label>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Slip / reference #</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
          </div>
        </div>
        {preview.length > 0 && amt > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              Applied oldest first
            </div>
            <div className="space-y-1.5">
              {preview.map((p) => {
                const pct = p.owed > 0 ? Math.min(100, Math.round((p.applied / p.owed) * 100)) : 100;
                const settled = p.owed > 0 && p.applied >= p.owed;
                return (
                  <div key={p.period} className="flex items-center gap-2.5">
                    <span className="w-28 text-xs text-slate-600">{longPeriod(p.period)}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <span className={`block h-full ${settled ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`w-40 text-right text-xs font-bold tabular-nums ${settled ? "text-emerald-700" : p.applied > 0 ? "text-amber-800" : "text-slate-400"}`}>
                      {p.applied <= 0
                        ? `${fmtRs(p.owed)} pending`
                        : settled
                        ? `${fmtRs(p.applied)} · settled`
                        : `${fmtRs(p.applied)} of ${fmtRs(p.owed)}`}
                      {p.advance > 0 ? ` +${fmtRs(p.advance)} advance` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 13a: the aging page ──────────────────────────────────────────────
type Bucket = "all" | "paid" | "dueMonth" | "two" | "defaulters" | "concessions";

interface StudentRow {
  studentId: string;
  name: string;
  gr: string | null;
  parents: string | null;
  phone: string | null;
  cls: string;
  sec: string;
  monthlyFee: number | null;
  current: FeeStatus | null;
  out: StudentOutstanding | null;
  concession: string | null;
}

export function FeesOverview() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [period, setPeriod] = useState(currentPeriod());
  const [sectionFilter, setSectionFilter] = useState("__all__");
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [fees, setFees] = useState<FeeStatus[]>([]);
  const [outstanding, setOutstanding] = useState<Record<string, StudentOutstanding>>({});
  const [concessions, setConcessions] = useState<Record<string, string>>({});
  const [feesLoaded, setFeesLoaded] = useState(false);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [payTarget, setPayTarget] = useState<AllocateTarget | null>(null);
  const [dryInfo, setDryInfo] = useState<BulkFeeGenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listOrgFees(orgId, {
      period,
      sectionId: sectionFilter !== "__all__" ? sectionFilter : undefined,
    })
      .then((r) => {
        setFees(r.fees);
        setOutstanding(r.outstandingByStudent ?? {});
        setConcessions(r.concessionByStudent ?? {});
        setFeesLoaded(true);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, period, sectionFilter]);

  // ONE control decides what you're looking at AND what you'd bill (22
  // Sep: the header's section filter and a second "Whole school" picker
  // beside Generate read as duplicates). Billing is per CLASS in the
  // backend, so a section filter widens to its class — the button says
  // so rather than quietly billing the sibling section too.
  const genScope = useMemo(() => {
    if (sectionFilter === "__all__") return null;
    for (const c of classes) {
      const sections = c.sections || [];
      if (sections.some((s) => s.id === sectionFilter)) {
        return { classId: c.id, className: c.name, sectionCount: sections.length };
      }
    }
    return null;
  }, [classes, sectionFilter]);

  const monthEmpty = feesLoaded && fees.length === 0;
  useEffect(() => {
    if (!orgId || !monthEmpty) { setDryInfo(null); return; }
    let cancelled = false;
    bulkGenerateFees(orgId, {
      period, dryRun: true,
      ...(genScope ? { classIds: [genScope.classId] } : {}),
    })
      .then((r) => { if (!cancelled) setDryInfo(r); })
      .catch(() => { if (!cancelled) setDryInfo(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, period, monthEmpty, genScope?.classId]);

  const runGenerate = async () => {
    setGenerating(true);
    try {
      const r = await bulkGenerateFees(orgId, {
        period,
        ...(genScope ? { classIds: [genScope.classId] } : {}),
      });
      const prot = (r as any).protected ?? 0;
      toast.success(
        `${r.created} voucher${r.created === 1 ? "" : "s"} created · ${r.updated} refreshed` +
          (prot > 0 ? ` · ${prot} kept as-is (payments recorded)` : "") +
          (r.waived > 0 ? ` · ${r.waived} waived` : ""),
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate vouchers.");
    } finally {
      setGenerating(false);
    }
  };

  const sectionOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const c of classes) for (const s of c.sections || []) out.push({ id: s.id, label: `${c.name} - ${s.name}` });
    return out;
  }, [classes]);

  // One row per STUDENT, from the month's vouchers enriched with the
  // all-months outstanding map. (A student owing earlier months but with
  // no voucher this month can't be named from this payload — surfaced
  // as a count below the table.)
  const rows = useMemo<StudentRow[]>(() => {
    const byStudent = new Map<string, StudentRow>();
    for (const f of fees) {
      byStudent.set(f.student_id, {
        studentId: f.student_id,
        name: f.student_name ?? f.student_id,
        gr: f.gr_number ?? null,
        parents: f.parent_names ?? null,
        phone: f.guardian_phone ?? null,
        cls: f.class_name ?? "—",
        sec: f.section_name ?? "",
        monthlyFee: f.amount_due,
        current: f,
        out: outstanding[f.student_id] ?? null,
        concession: concessions[f.student_id] ?? null,
      });
    }
    const list = [...byStudent.values()];
    list.sort((a, b) => {
      const am = a.out?.months ?? 0, bm = b.out?.months ?? 0;
      if (bm !== am) return bm - am;
      return (b.out?.total ?? 0) - (a.out?.total ?? 0);
    });
    return list;
  }, [fees, outstanding, concessions]);

  const offListCount = useMemo(() => {
    const inRows = new Set(fees.map((f) => f.student_id));
    return Object.keys(outstanding).filter((id) => !inRows.has(id)).length;
  }, [fees, outstanding]);

  const stats = useMemo(() => {
    let dueMonth = 0, paidMonth = 0, paidFullAmt = 0, partialAmt = 0;
    let paidN = 0, partialN = 0;
    const b = {
      paid: { n: 0, amt: 0 },
      dueMonth: { n: 0, amt: 0 },
      two: { n: 0, amt: 0 },
      defaulters: { n: 0, amt: 0 },
    };
    for (const r of rows) {
      if (r.current && r.current.status !== "waived") {
        dueMonth += r.current.amount_due ?? 0;
        paidMonth += r.current.amount_paid ?? 0;
        if (r.current.status === "paid") { paidFullAmt += r.current.amount_paid ?? 0; paidN++; }
        if (r.current.status === "partial") { partialAmt += r.current.amount_paid ?? 0; partialN++; }
      }
      const m = r.out?.months ?? 0;
      const owed = r.out?.total ?? 0;
      if (m === 0) { b.paid.n++; b.paid.amt += r.current?.amount_paid ?? 0; }
      else if (m === 1) { b.dueMonth.n++; b.dueMonth.amt += owed; }
      else if (m === 2) { b.two.n++; b.two.amt += owed; }
      else { b.defaulters.n++; b.defaulters.amt += owed; }
    }
    const pct = dueMonth > 0 ? Math.round((paidMonth / dueMonth) * 100) : 0;
    return { dueMonth, paidMonth, paidFullAmt, partialAmt, paidN, partialN, pct, b };
  }, [rows]);

  const filtered = useMemo(() => {
    const byBucket = (() => {
      switch (bucket) {
        case "paid": return rows.filter((r) => (r.out?.months ?? 0) === 0);
        case "dueMonth": return rows.filter((r) => (r.out?.months ?? 0) >= 1);
        case "two": return rows.filter((r) => (r.out?.months ?? 0) >= 2);
        case "defaulters": return rows.filter((r) => (r.out?.months ?? 0) >= 3);
        case "concessions": return rows.filter((r) => !!r.concession);
        default: return rows;
      }
    })();
    // The counter searches by whatever the family said first: the
    // child's name, the father's, the GR on the voucher, or the phone
    // they're calling from. Digits match the phone loosely so 0313…,
    // 313… and +92313… all find the same family.
    const q = query.trim().toLowerCase();
    if (!q) return byBucket;
    const digits = q.replace(/\D/g, "");
    return byBucket.filter((r) => {
      if (r.name.toLowerCase().includes(q)) return true;
      if (r.parents && r.parents.toLowerCase().includes(q)) return true;
      if (r.gr && r.gr.toLowerCase().includes(q)) return true;
      if (digits.length >= 3 && r.phone && r.phone.replace(/\D/g, "").includes(digits)) return true;
      return false;
    });
  }, [rows, bucket, query]);

  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "mark_fees_status");
  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }

  const openPayment = (r: StudentRow) => {
    const owedPeriods = r.out?.owedPeriods ?? [];
    if (owedPeriods.length === 0 && r.current) {
      // Nothing owed — allow an advance against this month's voucher.
      setPayTarget({
        studentId: r.studentId, name: r.name, gr: r.gr, total: 0, owedPeriods: [],
        pinFee: { feeStatusId: r.current.id, period: r.current.period, owed: 0 },
      });
      return;
    }
    setPayTarget({ studentId: r.studentId, name: r.name, gr: r.gr, total: r.out?.total ?? 0, owedPeriods });
  };

  const reminderText = (r: StudentRow): string => {
    const months = (r.out?.owedPeriods ?? []).map((p) => longPeriod(p.period)).join(", ");
    return `Assalam o Alaikum! ${r.name} (GR# ${r.gr ?? "—"}) ki school fees ${fmtRs(r.out?.total ?? 0)} baqaya hai (${months}). Barah-e-karam jald ada karein ya office se rabta karein. Shukriya — Iqra Islamic Foundation School`;
  };
  const copyReminder = (r: StudentRow) => {
    navigator.clipboard.writeText(reminderText(r))
      .then(() => toast.success(`Reminder copied for ${r.name} — paste into WhatsApp`))
      .catch(() => toast.error("Could not copy"));
  };
  const copyBulkReminders = () => {
    const list = rows.filter((r) => (r.out?.months ?? 0) >= 2);
    const text = list.map((r) =>
      `${r.name} (GR# ${r.gr ?? "—"}, ${r.cls} ${r.sec}) — ${fmtRs(r.out?.total ?? 0)} · ${r.out?.months} months`,
    ).join("\n");
    navigator.clipboard.writeText(`Fees follow-up list — ${longPeriod(period)}\n${text}`)
      .then(() => toast.success(`Follow-up list copied (${list.length} students)`))
      .catch(() => toast.error("Could not copy"));
  };

  const openVoucher = (feeId: string) =>
    openFeeReceipt(orgId, feeId).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));

  const dueDates = fees.map((f) => f.due_date).filter(Boolean) as string[];
  const dueDate = dueDates.length ? dueDates.sort()[0] : null;

  const monthChips = (r: StudentRow) => {
    const owed = r.out?.owedPeriods ?? [];
    if (owed.length === 0) {
      if (r.current?.status === "waived") {
        return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">waived</span>;
      }
      return (
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          paid{r.current?.paid_date ? ` ${r.current.paid_date.slice(5)}` : ""}
        </span>
      );
    }
    return owed.map((p) => {
      const isCurrent = p.period === period;
      const cls = isCurrent ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700";
      return (
        <span key={p.period} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${cls}`}
          title={`${longPeriod(p.period)} — ${fmtRs(p.owed)} owed`}>
          {shortPeriod(p.period)}{p.partial ? " ·p" : ""}
        </span>
      );
    });
  };

  const bucketCard = (key: Bucket, n: number, label: string, amt: number, tone: { bg: string; bd: string; fg: string }) => (
    <button type="button" onClick={() => setBucket(bucket === key ? "all" : key)}
      className={`flex min-w-[130px] flex-1 flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2 text-left transition-shadow ${tone.bg} ${tone.bd} ${bucket === key ? "ring-2 ring-indigo-400" : "hover:shadow-sm"}`}>
      <span className={`text-lg font-extrabold ${tone.fg}`}>{n} <span className="text-[11px] font-semibold text-slate-500">students</span></span>
      <span className={`text-xs font-bold ${tone.fg}`}>{label}</span>
      <span className="text-[11px] text-slate-500">{fmtRs(amt)}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <HeroCard
        title={`Fees · ${longPeriod(period)}`}
        subtitle={dueDate ? `Vouchers due ${dueDate}` : "Fee status across the school"}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => { setPeriod(v); setBucket("all"); }}>
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
            No vouchers generated for {longPeriod(period)}
            {genScope ? ` · ${genScope.className}` : ""} yet
          </div>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500">
            {dryInfo
              ? <>Generating creates vouchers for <strong className="text-slate-700">{dryInfo.total} student{dryInfo.total === 1 ? "" : "s"}</strong> from each class&apos;s fee plan{dryInfo.waived > 0 ? <>, honoring {dryInfo.waived} waiver{dryInfo.waived === 1 ? "" : "s"}</> : null}.</>
              : "Vouchers are created from each class's monthly fee plan, honoring per-student overrides."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={runGenerate} disabled={generating}>
              {generating
                ? "Generating…"
                : genScope
                  ? `Generate ${longPeriod(period)} vouchers · ${genScope.className}`
                  : `Generate ${longPeriod(period)} vouchers`}
            </Button>
            <Link to={`/school/orgs/${orgId}/admin/fees/plans`}>
              <Button variant="outline">Review fee plans first</Button>
            </Link>
          </div>
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Collection bar + aging buckets */}
        <div className="flex flex-wrap items-center gap-5 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-[300px] flex-[1.4] flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                {longPeriod(period)} collection
              </span>
              <span className="text-xs text-slate-600">
                <b className="text-base text-slate-900">{fmtRs(stats.paidMonth)}</b> of {fmtRs(stats.dueMonth)} · <b>{stats.pct}%</b>
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span className="bg-emerald-500" style={{ width: `${stats.dueMonth > 0 ? (stats.paidFullAmt / stats.dueMonth) * 100 : 0}%` }} />
              <span className="bg-emerald-300" style={{ width: `${stats.dueMonth > 0 ? (stats.partialAmt / stats.dueMonth) * 100 : 0}%` }} />
            </div>
            <span className="text-[11px] text-slate-400">
              Solid = paid in full ({stats.paidN}) · light = partial ({stats.partialN})
            </span>
          </div>
          {bucketCard("paid", stats.b.paid.n, `Paid · ${shortPeriod(period)}`, stats.b.paid.amt,
            { bg: "bg-emerald-50", bd: "border-emerald-200", fg: "text-emerald-800" })}
          {bucketCard("dueMonth", stats.b.dueMonth.n, "Due · this month only", stats.b.dueMonth.amt,
            { bg: "bg-slate-50", bd: "border-slate-200", fg: "text-slate-700" })}
          {bucketCard("two", stats.b.two.n, "2 months behind", stats.b.two.amt,
            { bg: "bg-amber-50", bd: "border-amber-200", fg: "text-amber-800" })}
          {bucketCard("defaulters", stats.b.defaulters.n, "Defaulters · 3+ months", stats.b.defaulters.amt,
            { bg: "bg-rose-50", bd: "border-rose-200", fg: "text-rose-700" })}
        </div>

        {/* Filter pills + actions */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5">
          {([
            ["all", `All ${rows.length}`],
            ["dueMonth", `Unpaid · ${rows.filter((r) => (r.out?.months ?? 0) >= 1).length}`],
            ["two", `2+ months · ${rows.filter((r) => (r.out?.months ?? 0) >= 2).length}`],
            ["defaulters", `Defaulters (3+) · ${stats.b.defaulters.n}`],
            ["concessions", `Concessions · ${rows.filter((r) => !!r.concession).length}`],
          ] as Array<[Bucket, string]>).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setBucket(k)}
              className={"rounded-full px-3 py-1 text-xs font-semibold " +
                (bucket === k ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
              {l}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search student, father, GR, phone"
                aria-label="Search students by name, father's name, GR number or phone"
                className="h-8 w-60 rounded-lg border border-slate-200 pl-8 pr-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              />
            </div>
            {rows.some((r) => (r.out?.months ?? 0) >= 2) && (
              <button type="button" onClick={copyBulkReminders}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                Copy follow-up list · 2+ months ({rows.filter((r) => (r.out?.months ?? 0) >= 2).length})
              </button>
            )}
            <Button variant="outline" size="sm" onClick={runGenerate} disabled={generating}
              title={genScope && genScope.sectionCount > 1
                ? `Bills all ${genScope.sectionCount} sections of ${genScope.className}`
                : undefined}>
              {generating
                ? "Generating…"
                : genScope
                  ? `Generate · ${genScope.className}${genScope.sectionCount > 1 ? " (all sections)" : ""}`
                  : "Generate vouchers"}
            </Button>
          </div>
        </div>

        {/* One row per student */}
        <div className="overflow-x-auto px-5 pb-3">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10.5px] font-extrabold uppercase tracking-wide text-slate-400">
                <th className="py-2.5 pr-3">Student</th>
                <th className="py-2.5 pr-3">Class</th>
                <th className="py-2.5 pr-3">Monthly fee</th>
                <th className="py-2.5 pr-3">Behind</th>
                <th className="py-2.5 pr-3 text-right">Outstanding</th>
                <th className="py-2.5 pr-3">Last payment</th>
                <th className="py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const months = r.out?.months ?? 0;
                const owedFg = months >= 3 ? "text-rose-600" : months === 2 ? "text-amber-700" : months === 1 ? "text-slate-700" : "text-slate-300";
                return (
                  <tr key={r.studentId} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => navigate(`/school/orgs/${orgId}/students/${r.studentId}/fees`)}>
                    <td className="py-2 pr-3">
                      <div className="text-[13px] font-semibold text-slate-900">{r.name}</div>
                      <div className="text-[11px] text-slate-400">
                        GR# {r.gr ?? "—"}
                        {r.parents ? <span className="text-slate-400"> · {r.parents}</span> : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{r.cls} {r.sec}</td>
                    <td className="py-2 pr-3">
                      <span className="text-xs text-slate-800 tabular-nums">{r.monthlyFee != null ? fmtRs(r.monthlyFee) : "—"}</span>
                      {r.concession && (
                        <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {r.concession}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3"><span className="flex flex-wrap items-center gap-1">{monthChips(r)}</span></td>
                    <td className={`py-2 pr-3 text-right text-[13px] font-bold tabular-nums ${owedFg}`}>
                      {months > 0 ? fmtRs(r.out!.total) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500 tabular-nums">
                      {r.out?.lastPayment
                        ? `${r.out.lastPayment.paidOn.slice(5)} · ${r.out.lastPayment.method ?? fmtRs(r.out.lastPayment.amount)}`
                        : r.current?.paid_date
                        ? `${r.current.paid_date.slice(5)} · ${fmtRs(r.current.amount_paid ?? 0)}`
                        : "—"}
                    </td>
                    <td className="py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => openPayment(r)}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-indigo-700">
                          Payment
                        </button>
                        {r.current && (
                          <button type="button" onClick={() => void openVoucher(r.current!.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50">
                            <FileText className="h-3 w-3" /> Voucher
                          </button>
                        )}
                        {months > 0 && (
                          <button type="button" onClick={() => copyReminder(r)} title="Copy WhatsApp reminder"
                            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              {query.trim()
                ? <>No one matching “{query.trim()}” in this view.{bucket !== "all" ? " Try the All filter." : ""}</>
                : "No students in this view."}
            </div>
          )}
          <div className="py-2.5 text-[11.5px] text-slate-400">
            Sorted by months behind, then amount — paid-up students sit at the bottom.
            {offListCount > 0 && (
              <span className="ml-1 text-amber-700">
                {offListCount} student{offListCount === 1 ? "" : "s"} owe from earlier months but have no {shortPeriod(period)} voucher — generate this month to bring them onto the list.
              </span>
            )}
          </div>
        </div>
      </div>
      )}

      <AllocatePaymentDialog target={payTarget} onClose={() => setPayTarget(null)} onSaved={refresh} orgId={orgId} />
    </div>
  );
}
