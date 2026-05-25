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
import { Plus, CheckCircle2, Trash2 } from "lucide-react";
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
  const [form, setForm] = useState({ period: "", amountDue: "", dueDate: "", notes: "" });
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

  const submitAdd = async () => {
    if (!form.period.trim()) return;
    try {
      await createFee(orgId, studentId, {
        period: form.period.trim(),
        amountDue: form.amountDue ? parseFloat(form.amountDue) : undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      setAddOpen(false);
      setForm({ period: "", amountDue: "", dueDate: "", notes: "" });
      refresh();
      toast.success("Fee period added");
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
    { key: "period", header: "Period", width: "w-28", cell: (f) => <span className="font-mono text-xs">{f.period}</span> },
    { key: "status", header: "Status", width: "w-24", cell: (f) => <FeeStatusBadge status={f.status} /> },
    { key: "due", header: "Due", align: "right", cell: (f) => <span className="tabular-nums">{f.amount_due ?? "—"}</span> },
    { key: "paid", header: "Paid", align: "right", cell: (f) => <span className="tabular-nums">{f.amount_paid ?? "—"}</span> },
    { key: "dueDate", header: "Due date", cell: (f) => <span className="text-xs text-slate-600 tabular-nums">{f.due_date ?? "—"}</span> },
    { key: "paidDate", header: "Paid date", cell: (f) => <span className="text-xs text-slate-600 tabular-nums">{f.paid_date ?? "—"}</span> },
    {
      key: "receipt",
      header: "Receipt",
      cell: (f) =>
        f.receipt_url ? (
          <a href={f.receipt_url} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs underline">View</a>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
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
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add period
        </Button>
      </div>

      <DataTable columns={columns} rows={fees} rowKey={(f) => f.id} emptyMessage="No fee records." />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add fee period</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Period * (e.g. 2026-05)</Label><Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="YYYY-MM" /></div>
            <div><Label>Amount due</Label><Input type="number" step="0.01" value={form.amountDue} onChange={(e) => setForm({ ...form, amountDue: e.target.value })} /></div>
            <div><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
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
