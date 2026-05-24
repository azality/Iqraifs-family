// BehaviorLogEntry — modal for logging a positive or concern behavior note
// against a single student. Used from ManageStudents (per-row "Log behavior")
// and from SectionBehaviorFeed (the "+ Add note" button, in which case the
// caller picks the student first and passes studentId/studentName here).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { postBehaviorNote, type BehaviorNoteKind } from "../../../utils/schoolApi";

interface Props {
  orgId: string;
  studentId: string;
  studentName: string;
  defaultSectionId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const POSITIVE_CATEGORIES = [
  "Respect",
  "Effort",
  "Helpfulness",
  "Quran Recitation",
  "Punctuality",
];
const CONCERN_CATEGORIES = [
  "Disruption",
  "Late Assignment",
  "Attendance",
  "Behavior Toward Peers",
  "Property Damage",
];

// datetime-local strings are local-time without timezone. We use this to
// compute defaults and the "max 14 days back" floor.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BehaviorLogEntry({
  orgId,
  studentId,
  studentName,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [kind, setKind] = useState<BehaviorNoteKind>("positive");
  const [category, setCategory] = useState("");
  const [points, setPoints] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [observedAt, setObservedAt] = useState<string>(() => toLocalInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whenever the modal opens, reset to a clean positive +1 default.
  useEffect(() => {
    if (open) {
      setKind("positive");
      setCategory("");
      setPoints(1);
      setNotes("");
      setObservedAt(toLocalInput(new Date()));
      setError(null);
    }
  }, [open]);

  // Flip the default sign when kind changes — positives default +1, concerns -1.
  useEffect(() => {
    setPoints((p) => {
      if (kind === "positive" && p <= 0) return 1;
      if (kind === "concern" && p >= 0) return -1;
      return p;
    });
    setCategory("");
  }, [kind]);

  const categories = kind === "positive" ? POSITIVE_CATEGORIES : CONCERN_CATEGORIES;
  const minObserved = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toLocalInput(d);
  })();
  const maxObserved = toLocalInput(new Date());

  const submit = async () => {
    setError(null);
    if (!notes.trim()) {
      setError("Notes are required.");
      return;
    }
    if (kind === "positive" && points < 0) {
      setError("Positive notes must have non-negative points.");
      return;
    }
    if (kind === "concern" && points > 0) {
      setError("Concern notes must have non-positive points.");
      return;
    }
    setSubmitting(true);
    try {
      await postBehaviorNote(orgId, {
        studentId,
        kind,
        category: category || undefined,
        points,
        notes: notes.trim(),
        // Convert local-time input to ISO so the server stores UTC.
        observedAt: observedAt ? new Date(observedAt).toISOString() : undefined,
      });
      toast.success(`Behavior note saved for ${studentName}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log behavior — {studentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind toggle (radio-like) */}
          <div>
            <Label className="mb-1.5 block">Kind</Label>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setKind("positive")}
                className={
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                  (kind === "positive"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900")
                }
              >
                Positive
              </button>
              <button
                type="button"
                onClick={() => setKind("concern")}
                className={
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                  (kind === "concern"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900")
                }
              >
                Concern
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bh-cat">Category</Label>
              {/* Free-text + datalist for cheap autocomplete. */}
              <Input
                id="bh-cat"
                list="bh-cat-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={categories[0]}
              />
              <datalist id="bh-cat-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="bh-pts">Points</Label>
              <Input
                id="bh-pts"
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="bh-notes">Notes*</Label>
            <Textarea
              id="bh-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What happened? Be specific so reviewers can verify."
            />
          </div>

          <div>
            <Label htmlFor="bh-when">Observed at</Label>
            <Input
              id="bh-when"
              type="datetime-local"
              value={observedAt}
              min={minObserved}
              max={maxObserved}
              onChange={(e) => setObservedAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Up to 14 days back. Defaults to now.
            </p>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : "Save note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
