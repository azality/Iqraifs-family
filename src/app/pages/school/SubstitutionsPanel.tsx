// SubstitutionsPanel — embedded inside ManageTimetable.
//
// One-off, per-date coverage of a slot by a different teacher. Multi-day
// subs are intentionally not supported: if a teacher is out for the
// week, the admin creates one sub per day (cheap, explicit, no fragile
// recurring rules to debug at 7am).
//
// Date picker -> server returns existing subs for that date. "Add" opens
// a dialog: pick a teacher (filters the entry list to that teacher's
// entries on the matching day-of-week), then pick the substitute.

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Calendar } from "lucide-react";
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
  listTimetableSubstitutions,
  createTimetableSubstitution,
  deleteTimetableSubstitution,
  listTeacherEntries,
  type AdminTeacher,
  type TimetableSubstitution,
  type TeacherEntrySummary,
} from "../../../utils/schoolApi";

interface Props {
  orgId: string;
  teachers: AdminTeacher[];
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayIso(): string {
  // Use local-tz date so the picker shows today.
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isoDow(yyyymmdd: string): number {
  // Mon=1..Sun=7
  const d = new Date(yyyymmdd + "T00:00:00");
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function SubstitutionsPanel({ orgId, teachers }: Props) {
  const [date, setDate] = useState<string>(todayIso());
  const [subs, setSubs] = useState<TimetableSubstitution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state.
  const [originalTeacherId, setOriginalTeacherId] = useState<string>("");
  const [entryOptions, setEntryOptions] = useState<TeacherEntrySummary[]>([]);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryId, setEntryId] = useState<string>("");
  const [substituteId, setSubstituteId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    setLoading(true);
    listTimetableSubstitutions(orgId, { date })
      .then((r) => { setSubs(r.substitutions); setError(null); })
      .catch((e) => setError(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId, date]);

  const dow = useMemo(() => isoDow(date), [date]);

  // When admin picks a teacher, pull that teacher's entries (all DOWs)
  // via the admin helper. Filtered to today's DOW in the dropdown render.
  useEffect(() => {
    setEntryId("");
    setEntryOptions([]);
    if (!originalTeacherId) return;
    setEntryLoading(true);
    listTeacherEntries(orgId, originalTeacherId)
      .then((r) => setEntryOptions(r.entries))
      .catch(() => setEntryOptions([]))
      .finally(() => setEntryLoading(false));
  }, [orgId, originalTeacherId]);

  const openDialog = () => {
    setOriginalTeacherId("");
    setEntryId("");
    setSubstituteId("");
    setReason("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!entryId || !substituteId) {
      setError("Pick an entry and a substitute teacher.");
      return;
    }
    setSaving(true);
    try {
      await createTimetableSubstitution(orgId, {
        entryId,
        date,
        substituteTeacherUserId: substituteId,
        reason: reason || undefined,
      });
      setDialogOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sub: TimetableSubstitution) => {
    if (!confirm(`Remove substitution for ${sub.entry?.subjectName ?? "this slot"}?`)) return;
    try {
      await deleteTimetableSubstitution(orgId, sub.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Substitutions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            One-off coverage for a slot on a specific date. {DAY_NAMES[dow - 1]}.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-xs w-40"
            />
          </div>
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4 mr-1" /> Add substitution
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : subs.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-slate-500 italic flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            No substitutions on {date}. Add one if a teacher is out.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {subs.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm flex items-center gap-3 flex-wrap"
            >
              <div className="text-xs font-semibold w-32 shrink-0">
                {s.entry?.slot
                  ? `${DAY_NAMES[s.entry.slot.dayOfWeek - 1]} ${s.entry.slot.startTime}`
                  : "—"}
                <div className="text-[10px] opacity-70">{s.entry?.scopeLabel ?? "—"}</div>
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-medium text-slate-800">
                  {s.entry?.subjectName ?? "Slot"}
                </div>
                <div className="text-slate-600">
                  <span className="line-through opacity-60">
                    {s.entry?.originalTeacherName ?? "—"}
                  </span>
                  {" → "}
                  <span className="font-medium text-emerald-800">
                    {s.substituteTeacherName ?? "Substitute"}
                  </span>
                </div>
                {s.reason && (
                  <div className="text-[11px] italic text-slate-500 mt-0.5">{s.reason}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(s)}
                className="opacity-50 hover:opacity-100 text-rose-700 shrink-0"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add substitution — {date}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Original teacher (who's out)</Label>
              <Select value={originalTeacherId} onValueChange={setOriginalTeacherId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick teacher…" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.full_name || t.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                Slot ({DAY_NAMES[dow - 1]} entries only)
              </Label>
              {originalTeacherId && entryLoading && (
                <div className="text-[11px] text-slate-500 italic mt-1">Loading…</div>
              )}
              {originalTeacherId && !entryLoading && (() => {
                const todays = entryOptions.filter((e) => e.slot.dayOfWeek === dow);
                if (todays.length === 0) {
                  return (
                    <div className="text-[11px] text-amber-700 italic mt-1">
                      This teacher has no slots on {DAY_NAMES[dow - 1]}. Pick a different date or teacher.
                    </div>
                  );
                }
                return (
                  <Select value={entryId} onValueChange={setEntryId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick slot…" /></SelectTrigger>
                    <SelectContent>
                      {todays.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.slot.name} {e.slot.startTime} · {e.subjectName ?? "Slot"} · {e.scopeLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
            <div>
              <Label className="text-xs">Substitute teacher</Label>
              <Select value={substituteId} onValueChange={setSubstituteId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick substitute…" /></SelectTrigger>
                <SelectContent>
                  {teachers
                    .filter((t) => t.user_id !== originalTeacherId)
                    .map((t) => (
                      <SelectItem key={t.user_id} value={t.user_id}>
                        {t.full_name || t.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Sick leave"
                className="h-9 text-sm"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !entryId || !substituteId}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default SubstitutionsPanel;
