// StudentFeeOverrides — embedded in StudentDetail.
//
// Shows the effective fee plans for one student (inherited from their
// class), with per-plan override controls: set a custom amount, mark
// the plan waived, or remove an override entirely.
//
// Effective amount logic mirrors the server:
//   waived → 0; else override_amount ?? plan.amount

import { useEffect, useState } from "react";
import { Pencil, RotateCcw, Trash2, Calendar } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import {
  listStudentFeeOverrides,
  upsertStudentFeeOverride,
  deleteStudentFeeOverride,
  type EffectiveStudentPlan,
} from "../../../utils/schoolApi";

interface Props {
  orgId: string;
  studentId: string;
  canManage: boolean;
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency", currency: "PKR", maximumFractionDigits: 0,
  }).format(n);
}

export function StudentFeeOverrides({ orgId, studentId, canManage }: Props) {
  const [rows, setRows] = useState<EffectiveStudentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogPlan, setDialogPlan] = useState<EffectiveStudentPlan | null>(null);
  const [waived, setWaived] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    setLoading(true);
    listStudentFeeOverrides(orgId, studentId)
      .then((r) => { setRows(r.plans); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [orgId, studentId]);

  const openDialog = (row: EffectiveStudentPlan) => {
    setDialogPlan(row);
    setWaived(row.override?.waived ?? false);
    setOverrideAmount(
      row.override?.overrideAmount !== null && row.override?.overrideAmount !== undefined
        ? String(row.override.overrideAmount) : "",
    );
    setNotes(row.override?.notes ?? "");
  };

  const closeDialog = () => setDialogPlan(null);

  const handleSave = async () => {
    if (!dialogPlan) return;
    setSaving(true);
    try {
      const amt = overrideAmount.trim() ? Number(overrideAmount) : null;
      if (!waived && amt !== null && (!Number.isFinite(amt) || amt < 0)) {
        setError("Override amount invalid"); setSaving(false); return;
      }
      await upsertStudentFeeOverride(orgId, studentId, dialogPlan.plan.id, {
        waived,
        overrideAmount: waived ? null : amt,
        notes: notes.trim() || null,
      });
      closeDialog();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async (row: EffectiveStudentPlan) => {
    if (!row.override) return;
    if (!confirm(`Reset "${row.plan.name}" to the class default?`)) return;
    try {
      await deleteStudentFeeOverride(orgId, studentId, row.plan.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div className="text-xs text-slate-500">Loading fee plans…</div>;
  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
        {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic flex items-center gap-2">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        No class plans defined yet. Set them up under Admin → Fees → Plans.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const hasOverride = !!row.override;
        const diff = row.effectiveAmount !== row.plan.amount;
        return (
          <div
            key={row.plan.id}
            className={
              "rounded-md border px-3 py-2 flex items-center flex-wrap gap-2 " +
              (hasOverride ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white")
            }
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">{row.plan.name}</div>
              <div className="text-[11px] text-slate-500">
                {row.plan.frequency === "monthly" ? "Monthly" : "One-off"}
                {" · class default "}
                <span className={diff ? "line-through opacity-60" : ""}>
                  {formatAmount(row.plan.amount)}
                </span>
              </div>
              {row.override?.notes && (
                <div className="text-[11px] italic text-slate-500 mt-0.5">{row.override.notes}</div>
              )}
            </div>
            <div className="text-sm font-semibold text-slate-800">
              {row.override?.waived
                ? <span className="text-emerald-700">Waived</span>
                : formatAmount(row.effectiveAmount)}
            </div>
            {canManage && (
              <>
                <Button size="sm" variant="ghost" onClick={() => openDialog(row)} title="Override">
                  <Pencil className="h-3.5 w-3.5 text-slate-600" />
                </Button>
                {hasOverride && (
                  <Button size="sm" variant="ghost" onClick={() => handleClearOverride(row)} title="Reset">
                    <RotateCcw className="h-3.5 w-3.5 text-slate-600" />
                  </Button>
                )}
              </>
            )}
          </div>
        );
      })}

      <Dialog open={!!dialogPlan} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Override · {dialogPlan?.plan.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-slate-600">
              Class default: <strong>{dialogPlan ? formatAmount(dialogPlan.plan.amount) : ""}</strong>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={waived}
                onChange={(e) => setWaived(e.target.checked)}
              />
              Waived (charge 0)
            </label>
            {!waived && (
              <div>
                <Label className="text-xs">Override amount (PKR, blank = class default)</Label>
                <Input
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  type="number" inputMode="numeric"
                  className="h-9 text-sm"
                  placeholder={String(dialogPlan?.plan.amount ?? "")}
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Scholarship Q3, sibling discount, etc."
                className="h-9 text-sm"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StudentFeeOverrides;
