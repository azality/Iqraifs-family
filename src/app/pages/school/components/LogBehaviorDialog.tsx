// Log a behavior item against a single student.
//
// Loads the school's behavior catalog (trackable_items owned by the org).
// Catalog is empty for fresh schools — render an inline note + link the
// principal to add items. (Teachers can't create catalog items in v1.)

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { toast } from "sonner";
import { getBehaviorCatalog, logBehavior, type BehaviorCatalogItem } from "../../../../utils/schoolApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  childId: string;
  childName: string;
  onLogged: () => void;
}

export function LogBehaviorDialog({ open, onOpenChange, orgId, childId, childName, onLogged }: Props) {
  const [catalog, setCatalog] = useState<BehaviorCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BehaviorCatalogItem | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getBehaviorCatalog(orgId)
      .then(setCatalog)
      .catch((e) => toast.error(e?.message || "Could not load behavior catalog"))
      .finally(() => setLoading(false));
  }, [open, orgId]);

  const reset = () => {
    setSelected(null);
    setNotes("");
  };

  const close = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await logBehavior(childId, { trackableItemId: selected.id, notes: notes || undefined });
      const sign = selected.points >= 0 ? "+" : "";
      toast.success(`${selected.name} logged for ${childName} (${sign}${selected.points} pts)`);
      onLogged();
      close(false);
    } catch (e: any) {
      // Backend returns 409 on dedupe window — surface the message
      toast.error(e?.message || "Could not log behavior");
    } finally {
      setSubmitting(false);
    }
  };

  const positives = catalog.filter((i) => i.kind === "positive" && i.active);
  const negatives = catalog.filter((i) => i.kind === "negative" && i.active);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log behavior for {childName}</DialogTitle>
          <DialogDescription>Pick a behavior. Notes optional.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : catalog.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground space-y-2">
            <p>The school's behavior catalog is empty.</p>
            <p>Your principal needs to add behaviors before teachers can log them. (In v1 only principals can author the catalog.)</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {positives.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1.5">Positive</p>
                <div className="flex flex-wrap gap-1.5">
                  {positives.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        selected?.id === item.id
                          ? "bg-green-100 border-green-400 text-green-900"
                          : "border-gray-200 hover:border-green-300"
                      }`}
                    >
                      {item.name} <span className="text-xs text-green-700">+{item.points}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {negatives.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1.5">Concerns</p>
                <div className="flex flex-wrap gap-1.5">
                  {negatives.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        selected?.id === item.id
                          ? "bg-red-100 border-red-400 text-red-900"
                          : "border-gray-200 hover:border-red-300"
                      }`}
                    >
                      {item.name} <span className="text-xs text-red-700">{item.points}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="b-notes">Notes (optional)</Label>
                  {selected.dedupe_window_min !== null && (
                    <Badge variant="secondary" className="text-xs">
                      {selected.dedupe_window_min}m duplicate guard
                    </Badge>
                  )}
                </div>
                <Textarea id="b-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context (optional)" />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !selected}>
            {submitting ? "Logging…" : selected ? `Log ${selected.name}` : "Pick a behavior"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
