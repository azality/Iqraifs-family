// ReadmitDialog — the smart re-admission flow (pilot version).
//
// Re-admission is two events wearing one button:
//   - UNDO: left days ago → old class is still right; we prefill it.
//   - RETURNING STUDENT: left in a past school year → the old class is
//     probably wrong (peers moved up, fee register changed). We frame
//     the time away, leave the class unselected, and ask the human.
//
// Placement questions: class & section, program (hifz/conventional),
// monthly fee (today's register; blank = class standard), and a
// re-admission note stored on the record. left_at/left_reason are kept
// by the backend so the profile reads as a timeline.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  listClasses,
  listClassFeePlans,
  readmitStudent,
  upsertStudentFeeOverride,
  deleteStudentFeeOverride,
  type AdminStudent,
  type ClassFeePlan,
} from "../../../../utils/schoolApi";

const UNDO_WINDOW_DAYS = 30;

interface Props {
  orgId: string;
  /** The withdrawn student. Needs id, full_name, gr_number, left_at,
   *  left_reason, left_from_section_id, program. */
  student: AdminStudent;
  open: boolean;
  onClose: () => void;
  /** Called after a successful re-admission so the caller can refresh. */
  onDone: () => void;
}

export function ReadmitDialog({ orgId, student, open, onClose, onDone }: Props) {
  const daysAway = useMemo(() => {
    if (!student.left_at) return null;
    return Math.max(0, Math.round((Date.now() - new Date(student.left_at).getTime()) / 86400000));
  }, [student.left_at]);
  const isUndo = daysAway !== null && daysAway <= UNDO_WINDOW_DAYS;

  const [sections, setSections] = useState<
    Array<{ id: string; label: string; classId: string }>
  >([]);
  const [sectionId, setSectionId] = useState("");
  const [program, setProgram] = useState<string>(student.program ?? "");
  const [fee, setFee] = useState("");
  const [feePlan, setFeePlan] = useState<ClassFeePlan | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Load class/section options once the dialog opens.
  useEffect(() => {
    if (!open) return;
    listClasses(orgId)
      .then((classes) => {
        const opts = classes.flatMap((c) =>
          (c.sections ?? []).map((s) => ({
            id: s.id,
            label: `${c.name} – ${s.name}`,
            classId: c.id,
          })),
        );
        setSections(opts);
        // Undo case: prefill the class they left from. Returning case:
        // deliberately unselected — the human decides placement.
        setSectionId(isUndo && student.left_from_section_id ? student.left_from_section_id : "");
      })
      .catch(() => setSections([]));
    setProgram(student.program ?? "");
    setFee("");
    setNote("");
  }, [open, orgId, isUndo, student.left_from_section_id, student.program]);

  // Class standard for the chosen class (fee hint).
  useEffect(() => {
    const classId = sections.find((o) => o.id === sectionId)?.classId;
    if (!classId) { setFeePlan(null); return; }
    let cancelled = false;
    listClassFeePlans(orgId, classId)
      .then((r) => {
        if (cancelled) return;
        const monthly = r.plans.filter((p) => p.frequency === "monthly" && !p.archivedAt);
        setFeePlan(monthly.find((p) => p.name === "Monthly Tuition") ?? monthly[0] ?? null);
      })
      .catch(() => { if (!cancelled) setFeePlan(null); });
    return () => { cancelled = true; };
  }, [sectionId, sections, orgId]);

  const timeAwayLabel = useMemo(() => {
    if (daysAway === null) return null;
    if (daysAway < 60) return `${daysAway} day${daysAway === 1 ? "" : "s"}`;
    const months = Math.round(daysAway / 30.44);
    if (months < 18) return `${months} months`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ${months % 12} months`;
  }, [daysAway]);

  const submit = async () => {
    if (!sectionId) { toast.error("Pick the class & section to re-admit into."); return; }
    setBusy(true);
    try {
      await readmitStudent(orgId, student.id, {
        classSectionId: sectionId,
        program: program || null,
        note: note.trim() || undefined,
      });
      // Fee: blank = class standard (any stale override from the old
      // class no longer matches the new class's plan, so nothing to do).
      const raw = fee.trim();
      if (raw && feePlan) {
        const amount = Number(raw);
        if (Number.isFinite(amount) && amount >= 0) {
          if (amount === feePlan.amount) {
            await deleteStudentFeeOverride(orgId, student.id, feePlan.id).catch(() => {});
          } else {
            await upsertStudentFeeOverride(orgId, student.id, feePlan.id, {
              overrideAmount: amount,
              notes: "Set at re-admission",
            });
          }
        }
      }
      toast.success(`${student.full_name} re-admitted.`);
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not re-admit the student.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-admit student</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div
            className={
              "rounded-lg px-3 py-2.5 text-sm " +
              (isUndo
                ? "bg-slate-50 text-slate-700"
                : "border border-amber-200 bg-amber-50 text-amber-900")
            }
          >
            <strong>{student.full_name}</strong> (GR# {student.gr_number}) left
            {timeAwayLabel ? <> <strong>{timeAwayLabel} ago</strong></> : null}
            {student.left_reason ? <> — "{student.left_reason}"</> : null}.
            {isUndo ? (
              <> Their previous class is pre-selected below.</>
            ) : (
              <>
                {" "}That's some time — their old batch has likely moved up and
                fees may have changed, so please choose today's correct
                placement rather than the old class.
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Class & section *</Label>
            <Select value={sectionId || "__none__"} onValueChange={(v) => setSectionId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Choose placement" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose placement…</SelectItem>
                {sections.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                    {o.id === student.left_from_section_id ? " (previous class)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Program</Label>
              <Select value={program || "__none__"} onValueChange={(v) => setProgram(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="hifz">Hifz</SelectItem>
                  <SelectItem value="conventional">Conventional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly fee (Rs.)</Label>
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder={feePlan ? String(feePlan.amount) : ""}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                disabled={!sectionId}
              />
              <p className="text-xs text-slate-500">
                {feePlan
                  ? `Blank = class standard (Rs. ${feePlan.amount}, today's register).`
                  : "Blank = class standard."}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Re-admission note</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. returned after 2 years, was at XYZ School; placement assessed by incharge"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void submit()} disabled={busy}>
              {busy ? "Saving…" : "Re-admit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
