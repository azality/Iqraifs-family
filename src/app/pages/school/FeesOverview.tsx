// FeesOverview — admin surface listing fee statuses across the org for a period.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
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
import { Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { HeroCard, KpiTile, DataTable, type DataTableColumn } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  listClasses,
  listOrgFees,
  updateFee,
  deleteFee,
  type AdminClass,
  type FeeStatus,
  type FeeStatusValue,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

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
  pending: "Pending",
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
  waived: "Waived",
};

const STATUS_BADGE: Record<FeeStatusValue, string> = {
  pending: "bg-slate-100 text-slate-700",
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  overdue: "bg-rose-100 text-rose-700",
  waived: "bg-indigo-100 text-indigo-700",
};

export function FeeStatusBadge({ status }: { status: FeeStatusValue }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

interface MarkPaidState {
  fee: FeeStatus;
  amountPaid: string;
  paidDate: string;
  receiptUrl: string;
}

export function MarkPaidDialog({
  state,
  onClose,
  onSaved,
  orgId,
}: {
  state: MarkPaidState | null;
  onClose: () => void;
  onSaved: () => void;
  orgId: string;
}) {
  const [form, setForm] = useState<MarkPaidState | null>(state);
  useEffect(() => setForm(state), [state]);
  if (!form) return null;

  const submit = async () => {
    try {
      const amt = parseFloat(form.amountPaid);
      await updateFee(orgId, form.fee.id, {
        amountPaid: isNaN(amt) ? undefined : amt,
        paidDate: form.paidDate || undefined,
        receiptUrl: form.receiptUrl || undefined,
        status: "paid",
      });
      toast.success("Marked paid");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark fee paid</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{form.fee.student_name ?? form.fee.student_id} · {form.fee.period}</p>
          <div><Label>Amount paid</Label><Input type="number" step="0.01" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} /></div>
          <div><Label>Paid date</Label><Input type="date" value={form.paidDate} onChange={(e) => setForm({ ...form, paidDate: e.target.value })} /></div>
          <div><Label>Receipt URL</Label><Input value={form.receiptUrl} onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })} placeholder="https://…" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
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
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [markPaid, setMarkPaid] = useState<MarkPaidState | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listOrgFees(orgId, {
      period,
      status: statusFilter !== "__all__" ? (statusFilter as FeeStatusValue) : undefined,
      sectionId: sectionFilter !== "__all__" ? sectionFilter : undefined,
    })
      .then((r) => setFees(r.fees))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, period, sectionFilter, statusFilter]);

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
      if (f.status === "paid") paidCount++;
      else unpaidCount++;
    }
    return { due, paid, paidCount, unpaidCount };
  }, [fees]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const handleDelete = async (f: FeeStatus) => {
    if (!confirm(`Delete fee record for ${f.student_name ?? f.student_id} (${f.period})?`)) return;
    await deleteFee(orgId, f.id);
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
    { key: "status", header: "Status", width: "w-24", cell: (f) => <FeeStatusBadge status={f.status} /> },
    { key: "due", header: "Due", align: "right", width: "w-24", cell: (f) => <span className="tabular-nums">{f.amount_due ?? "—"}</span> },
    { key: "paid", header: "Paid", align: "right", width: "w-24", cell: (f) => <span className="tabular-nums">{f.amount_paid ?? "—"}</span> },
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
          {f.status !== "paid" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="Mark paid"
              onClick={() =>
                setMarkPaid({
                  fee: f,
                  amountPaid: String(f.amount_due ?? ""),
                  paidDate: new Date().toISOString().slice(0, 10),
                  receiptUrl: "",
                })
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
          )}
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
          <div className="flex items-center gap-2">
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
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile variant="light" label="Students" value={fees.length} hint="this period" />
        <KpiTile variant="light" label="Paid" value={totals.paidCount} hint={`${totals.unpaidCount} unpaid`} />
        <KpiTile variant="light" label="Total due" value={totals.due} hint="amount" />
        <KpiTile variant="light" label="Collected" value={totals.paid} hint="amount" />
      </div>

      <div className="flex gap-2 flex-wrap items-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
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

      <MarkPaidDialog state={markPaid} onClose={() => setMarkPaid(null)} onSaved={refresh} orgId={orgId} />
    </div>
  );
}
