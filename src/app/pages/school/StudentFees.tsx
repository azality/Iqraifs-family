// StudentFees — admin per-student fee history with add / mark paid / delete.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
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
import { Plus, CheckCircle2, Trash2, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { HeroCard, DataTable, type DataTableColumn } from "../../components/school-ui";
import {
  getSchoolMe,
  getStudent,
  isOrgAdmin,
  listStudentFees,
  createFee,
  deleteFee,
  type FeeStatus,
  type SchoolMeResponse,
  type StudentWithParents,
} from "../../../utils/schoolApi";
import { FeeStatusBadge, MarkPaidDialog } from "./FeesOverview";

export function StudentFees() {
  const { orgId = "", studentId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [student, setStudent] = useState<StudentWithParents | null>(null);
  const [fees, setFees] = useState<FeeStatus[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // Form defaults are set lazily when the dialog opens (see openAdd)
  // so we can suggest "next month after the latest existing period" +
  // pre-fill the same amount as last period (common convention).
  const [form, setForm] = useState<{
    year: string;
    month: string;
    amountDue: string;
    dueDate: string;
    notes: string;
  }>({
    year: String(new Date().getUTCFullYear()),
    month: String(new Date().getUTCMonth() + 1).padStart(2, "0"),
    amountDue: "",
    dueDate: "",
    notes: "",
  });
  const [markPaid, setMarkPaid] = useState<{
    fee: FeeStatus;
    amountPaid: string;
    paidDate: string;
    receiptUrl: string;
  } | null>(null);

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

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  // Human label for a YYYY-MM period string, e.g. "2026-06" → "June 2026".
  // Falls back to the raw string if it doesn't parse.
  const periodLabel = (period: string): string => {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return period;
    const [, y, mo] = m;
    const idx = Number(mo) - 1;
    const MONTHS = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    if (idx < 0 || idx > 11) return period;
    return `${MONTHS[idx]} ${y}`;
  };

  // Pretty currency. Schools using PKR; we don't store currency yet, so
  // hardcode for the pilot. TODO: org-level currency setting.
  const fmtAmount = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return "—";
    return `Rs. ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const openAdd = () => {
    // Default to the month AFTER the most recent existing period so the
    // admin clicking + Add Period gets the natural next month preselected.
    const latest = fees[0]?.period; // already sorted desc by period
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
    // Pre-fill amount with the most recent period's due (common case:
    // tuition is the same each month).
    const lastAmount = fees[0]?.amount_due ?? "";
    setForm({
      year: String(year),
      month: String(month).padStart(2, "0"),
      amountDue: lastAmount ? String(lastAmount) : "",
      dueDate: "",
      notes: "",
    });
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const period = `${form.year}-${form.month}`;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast.error("Pick a year and month");
      return;
    }
    try {
      await createFee(orgId, studentId, {
        period,
        amountDue: form.amountDue ? parseFloat(form.amountDue) : undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      setAddOpen(false);
      refresh();
      toast.success(`Fee period ${periodLabel(period)} added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (f: FeeStatus) => {
    if (!confirm(`Delete fee for ${f.period}?`)) return;
    await deleteFee(orgId, f.id);
    refresh();
  };

  const columns: Array<DataTableColumn<FeeStatus>> = [
    {
      key: "period",
      header: "Period",
      width: "w-32",
      cell: (f) => (
        <div>
          <div className="font-medium text-slate-800">{periodLabel(f.period)}</div>
          <div className="font-mono text-[10px] text-slate-400">{f.period}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", width: "w-24", cell: (f) => <FeeStatusBadge status={f.status} /> },
    {
      key: "due",
      header: "Due",
      align: "right",
      cell: (f) => <span className="tabular-nums text-sm">{fmtAmount(f.amount_due)}</span>,
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      cell: (f) => (
        <span className={"tabular-nums text-sm " + (f.status === "paid" ? "text-emerald-700 font-medium" : "")}>
          {fmtAmount(f.amount_paid)}
        </span>
      ),
    },
    {
      key: "dueDate",
      header: "Due date",
      cell: (f) => <span className="text-xs text-slate-600 tabular-nums">{f.due_date ?? "—"}</span>,
    },
    {
      key: "paidDate",
      header: "Paid date",
      cell: (f) => <span className="text-xs text-slate-600 tabular-nums">{f.paid_date ?? "—"}</span>,
    },
    {
      key: "receipt",
      header: "Receipt",
      cell: (f) => {
        // PR D #7 added a print-ready receipt endpoint. Always show a
        // link for paid fees (the endpoint generates the receipt
        // server-side from fee_status + org branding). Older rows with
        // an external receipt_url still take precedence.
        if (f.receipt_url) {
          return (
            <a href={f.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-indigo-600 text-xs underline">
              <FileText className="h-3 w-3" /> View
            </a>
          );
        }
        if (f.status === "paid") {
          // Backend endpoint at /school/orgs/:orgId/fees/:feeId/receipt
          const url = `${import.meta.env.VITE_SUPABASE_URL ?? "https://ybrkbrrkcqpzpjnjdyib.supabase.co"}/functions/v1/make-server-f116e23f/school/orgs/${orgId}/fees/${f.id}/receipt`;
          return (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-indigo-600 text-xs underline">
              <FileText className="h-3 w-3" /> Print
            </a>
          );
        }
        return <span className="text-xs text-slate-400">—</span>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
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
        title={student?.full_name ?? "Student fees"}
        subtitle={student ? `GR# ${student.gr_number}` : ""}
        rightSlot={
          <Link to={`/school/orgs/${orgId}/admin/students/${studentId}`}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Student</Button>
          </Link>
        }
      />

      <div className="flex justify-end">
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add fee period
        </Button>
      </div>

      <DataTable columns={columns} rows={fees} rowKey={(f) => f.id} emptyMessage="No fee records." />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add fee period</DialogTitle>
            <p className="text-xs text-slate-500">
              Creates a new monthly fee row for {student?.full_name ?? "this student"}. Pre-filled with the next month after the most recent period, and the same amount.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            {/* Month + Year dropdowns instead of YYYY-MM text entry */}
            <div>
              <Label>Month *</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Select value={form.month} onValueChange={(v) => setForm({ ...form, month: v })}>
                  <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    {[
                      { v: "01", l: "January" }, { v: "02", l: "February" },
                      { v: "03", l: "March" },   { v: "04", l: "April" },
                      { v: "05", l: "May" },     { v: "06", l: "June" },
                      { v: "07", l: "July" },    { v: "08", l: "August" },
                      { v: "09", l: "September" }, { v: "10", l: "October" },
                      { v: "11", l: "November" },  { v: "12", l: "December" },
                    ].map((m) => (
                      <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
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
                      return years.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Will create: <span className="font-medium">{periodLabel(`${form.year}-${form.month}`)}</span>
              </p>
            </div>

            <div>
              <Label>Amount due (Rs.)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="e.g. 5000"
                value={form.amountDue}
                onChange={(e) => setForm({ ...form, amountDue: e.target.value })}
              />
            </div>

            <div>
              <Label>Due date <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>

            <div>
              <Label>Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Textarea
                placeholder="e.g. Includes uniform fee"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkPaidDialog state={markPaid} onClose={() => setMarkPaid(null)} onSaved={refresh} orgId={orgId} />
    </div>
  );
}
