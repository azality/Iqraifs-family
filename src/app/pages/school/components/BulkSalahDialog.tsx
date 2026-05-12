// Bulk Salah logging dialog — the teacher's daily killer feature.
//
// Walks to front of class after Zuhr → one tap → every student gets a
// "Salah · Zuhr (On time)" point event. Per-child override for the kid
// who came late or missed.

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { bulkLogSalah, type PrayerName, type SalahState } from "../../../../utils/schoolApi";

interface Student {
  child: { id: string; name: string; avatar: string | null };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  students: Student[];
  onLogged: () => void;
}

const PRAYERS: PrayerName[] = ["Fajr", "Zuhr", "Asr", "Maghrib", "Isha"];

export function BulkSalahDialog({ open, onOpenChange, classId, students, onLogged }: Props) {
  const [prayer, setPrayer] = useState<PrayerName>("Zuhr");
  const [defaultState, setDefaultState] = useState<SalahState>("ontime");
  const [overrides, setOverrides] = useState<Record<string, SalahState>>({});
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: number; skipped: number; failed: number } | null>(null);

  const reset = () => {
    setOverrides({});
    setOverridesOpen(false);
    setResult(null);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const r: any = await bulkLogSalah(classId, {
        prayer,
        defaultState,
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      });
      setResult({ ok: r.ok ?? 0, skipped: r.skipped ?? 0, failed: r.failed ?? 0 });
      onLogged();
    } catch (e: any) {
      toast.error(e?.message || "Could not log Salah");
    } finally {
      setSubmitting(false);
    }
  };

  const close = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result ? "Salah logged" : `Log ${prayer} for the whole class`}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "Here's the summary."
              : "Pick the prayer and how most of the class performed. Override individuals below if needed."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                <div className="font-semibold text-green-900">{result.ok}</div>
                <div className="text-xs text-green-700">logged</div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <div className="text-amber-700 font-semibold">{result.skipped}</div>
                <div className="text-xs text-amber-700 mt-1">already logged today</div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <AlertCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                <div className="font-semibold text-red-900">{result.failed}</div>
                <div className="text-xs text-red-700">failed</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Prayer</Label>
                <Select value={prayer} onValueChange={(v: any) => setPrayer(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRAYERS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Default for class</Label>
                <Select value={defaultState} onValueChange={(v: any) => setDefaultState(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ontime">On time (+2)</SelectItem>
                    <SelectItem value="qadha">Qadha (+1)</SelectItem>
                    <SelectItem value="missed">Missed (−1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Per-student overrides — collapsed by default */}
            <button
              type="button"
              onClick={() => setOverridesOpen((v) => !v)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              {overridesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Override individual students
              {Object.keys(overrides).length > 0 && (
                <Badge variant="secondary" className="ml-2">{Object.keys(overrides).length}</Badge>
              )}
            </button>

            {overridesOpen && (
              <div className="border rounded-lg max-h-56 overflow-y-auto">
                {students.map((s) => {
                  const override = overrides[s.child.id];
                  return (
                    <div key={s.child.id} className="flex items-center gap-2 p-2 border-b last:border-0 text-sm">
                      <span className="text-lg">{s.child.avatar || "👤"}</span>
                      <span className="flex-1 truncate">{s.child.name}</span>
                      <Select
                        value={override ?? "default"}
                        onValueChange={(v) => {
                          setOverrides((prev) => {
                            const next = { ...prev };
                            if (v === "default") delete next[s.child.id];
                            else next[s.child.id] = v as SalahState;
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">(default)</SelectItem>
                          <SelectItem value="ontime">On time</SelectItem>
                          <SelectItem value="qadha">Qadha</SelectItem>
                          <SelectItem value="missed">Missed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              About to log <strong>{prayer}</strong> for <strong>{students.length}</strong> student{students.length === 1 ? "" : "s"}.
              Students already logged today will be skipped.
            </p>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Logging…" : `Log ${prayer}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
