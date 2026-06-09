// ManageFeePlans — admin defines per-class fee templates.
//
// Layered ABOVE per-student fee_status. The bulk billing PR (next)
// uses these plans + student overrides to generate fee_status rows in
// one shot rather than entering them by hand.
//
// UX:
//   - Class picker (top): picks which class's plans to manage
//   - List of active plans for that class with edit/archive actions
//   - "Add plan" dialog: name, amount, frequency, due-day or due-date

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Plus, Trash2, Pencil, Calendar, RotateCw, Send, Eye,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  listClasses,
  listClassFeePlans,
  createClassFeePlan,
  updateClassFeePlan,
  archiveClassFeePlan,
  bulkGenerateFees,
  type AdminClass,
  type BulkFeeGenerateResult,
  type ClassFeePlan,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

type Freq = "monthly" | "one_off";
interface PlanForm {
  name: string;
  amount: string;
  frequency: Freq;
  defaultDueDay: string;
  oneOffDueDate: string;
}
const emptyForm: PlanForm = {
  name: "",
  amount: "",
  frequency: "monthly",
  defaultDueDay: "5",
  oneOffDueDate: "",
};

function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ManageFeePlans() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [search, setSearch] = useSearchParams();
  const classId = search.get("class") || "";
  const setClassId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("class", id);
    else next.delete("class");
    setSearch(next);
  };

  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [plans, setPlans] = useState<ClassFeePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ClassFeePlan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  // Bulk billing dialog state (FEAT #3).
  const [billOpen, setBillOpen] = useState(false);
  const todayISO = new Date();
  const defaultPeriod = `${todayISO.getFullYear()}-${String(todayISO.getMonth() + 1).padStart(2, "0")}`;
  const [billPeriod, setBillPeriod] = useState(defaultPeriod);
  const [billPreview, setBillPreview] = useState<BulkFeeGenerateResult | null>(null);
  const [billRunning, setBillRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
  }, [orgId]);

  const refresh = () => {
    if (!orgId || !classId) { setPlans([]); return; }
    setLoading(true);
    listClassFeePlans(orgId, classId)
      .then((r) => { setPlans(r.plans); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [orgId, classId]);

  const totalMonthly = useMemo(
    () => plans.filter((p) => p.frequency === "monthly").reduce((s, p) => s + p.amount, 0),
    [plans],
  );

  const openAdd = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (p: ClassFeePlan) => {
    setEditingPlan(p);
    setForm({
      name: p.name,
      amount: String(p.amount),
      frequency: p.frequency,
      defaultDueDay: p.defaultDueDay ? String(p.defaultDueDay) : "5",
      oneOffDueDate: p.oneOffDueDate ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!classId) return;
    const amount = Number(form.amount);
    if (!form.name.trim()) { setError("Name required"); return; }
    if (!Number.isFinite(amount) || amount < 0) { setError("Amount invalid"); return; }
    setSaving(true);
    try {
      if (editingPlan) {
        await updateClassFeePlan(orgId, editingPlan.id, {
          name: form.name.trim(),
          amount,
          defaultDueDay: form.frequency === "monthly"
            ? (form.defaultDueDay ? Number(form.defaultDueDay) : null)
            : null,
          oneOffDueDate: form.frequency === "one_off"
            ? (form.oneOffDueDate || null)
            : null,
        });
      } else {
        await createClassFeePlan(orgId, classId, {
          name: form.name.trim(),
          amount,
          frequency: form.frequency,
          defaultDueDay: form.frequency === "monthly" && form.defaultDueDay
            ? Number(form.defaultDueDay) : null,
          oneOffDueDate: form.frequency === "one_off" && form.oneOffDueDate
            ? form.oneOffDueDate : null,
        });
      }
      setDialogOpen(false);
      setError(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: ClassFeePlan) => {
    if (!confirm(`Archive "${p.name}"? Historical fees stay; new billing won't use this plan.`)) return;
    try {
      await archiveClassFeePlan(orgId, p.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/fees`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Fees
          </Button>
        </Link>
        <Button
          size="sm"
          onClick={() => { setBillPreview(null); setBillPeriod(defaultPeriod); setBillOpen(true); }}
        >
          <Send className="h-3.5 w-3.5 mr-1" /> Generate billing
        </Button>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Fee plans</h1>
        <p className="mt-1 text-sm text-slate-600">
          Per-class templates. Use <strong>Generate billing</strong> at the top
          to walk every active monthly plan × student × override and create
          fee_status rows in one shot. Re-running for the same period updates
          amounts in place.
        </p>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <Label className="text-xs">Class</Label>
          <Select value={classId || "__none__"} onValueChange={(v) => setClassId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-9 text-sm w-64">
              <SelectValue placeholder="Pick a class…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Pick class —</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {classId && (
          <>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" /> Add plan
            </Button>
            <Button size="sm" variant="outline" onClick={refresh}>
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!classId ? (
        <Card>
          <CardContent className="p-4 text-sm text-slate-500 italic">
            Pick a class above to see its fee plans.
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-slate-500">
            <Calendar className="mx-auto h-6 w-6 text-slate-300 mb-2" />
            No plans yet. Add tuition / books / transport / etc.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-slate-500">
            Monthly recurring total: <span className="font-semibold text-slate-800">{formatAmount(totalMonthly)}</span>
          </div>
          {plans.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-3 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {p.frequency === "monthly"
                    ? `Monthly${p.defaultDueDay ? ` · due ${p.defaultDueDay}th` : ""}`
                    : `One-off${p.oneOffDueDate ? ` · due ${p.oneOffDueDate}` : ""}`}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {formatAmount(p.amount)}
              </div>
              <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                <Pencil className="h-3.5 w-3.5 text-slate-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleArchive(p)}>
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate billing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Period (YYYY-MM)</Label>
              <Input
                value={billPeriod}
                onChange={(e) => { setBillPeriod(e.target.value); setBillPreview(null); }}
                placeholder="2026-09"
                className="h-9 text-sm font-mono"
                maxLength={7}
              />
              <p className="text-[11px] text-slate-500 mt-1 italic">
                Each student in a class with active monthly plans gets one
                fee_status row for this period. Waived overrides skip. Re-runs
                for the same period overwrite amounts.
              </p>
            </div>
            {billPreview && (
              <div className={
                "rounded-md border px-3 py-2 text-xs " +
                (billPreview.dryRun
                  ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900")
              }>
                <div className="font-semibold mb-1">
                  {billPreview.dryRun ? "Preview" : "Done"}
                </div>
                <div>
                  {billPreview.created} new · {billPreview.updated} updated · {billPreview.waived} waived · {billPreview.total} total
                </div>
                {billPreview.message && (
                  <div className="mt-1 italic">{billPreview.message}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBillOpen(false)}
              disabled={billRunning}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!/^\d{4}-\d{2}$/.test(billPeriod)) {
                  setError("Period must be YYYY-MM");
                  return;
                }
                setBillRunning(true);
                try {
                  const r = await bulkGenerateFees(orgId, { period: billPeriod, dryRun: true });
                  setBillPreview(r);
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally { setBillRunning(false); }
              }}
              disabled={billRunning || !billPeriod}
            >
              <Eye className="h-3.5 w-3.5 mr-1" /> Preview
            </Button>
            <Button
              onClick={async () => {
                if (!/^\d{4}-\d{2}$/.test(billPeriod)) {
                  setError("Period must be YYYY-MM");
                  return;
                }
                setBillRunning(true);
                try {
                  const r = await bulkGenerateFees(orgId, { period: billPeriod });
                  setBillPreview(r);
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally { setBillRunning(false); }
              }}
              disabled={billRunning || !billPeriod}
            >
              <Send className="h-3.5 w-3.5 mr-1" /> {billRunning ? "Running…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit plan" : "Add fee plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tuition" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Amount (PKR)</Label>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="8000" type="number" inputMode="numeric" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as Freq })}
                disabled={!!editingPlan}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="one_off">One-off</SelectItem>
                </SelectContent>
              </Select>
              {editingPlan && (
                <p className="text-[11px] text-slate-500 italic mt-1">
                  Frequency can't be changed on an existing plan — archive and create a new one.
                </p>
              )}
            </div>
            {form.frequency === "monthly" ? (
              <div>
                <Label className="text-xs">Default due day of month (1–28)</Label>
                <Input value={form.defaultDueDay}
                  onChange={(e) => setForm({ ...form, defaultDueDay: e.target.value })}
                  type="number" inputMode="numeric" className="h-9 text-sm" />
              </div>
            ) : (
              <div>
                <Label className="text-xs">Due date</Label>
                <Input value={form.oneOffDueDate}
                  onChange={(e) => setForm({ ...form, oneOffDueDate: e.target.value })}
                  type="date" className="h-9 text-sm" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingPlan ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManageFeePlans;
