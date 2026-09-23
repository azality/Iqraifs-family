// TermSchedulePanel — the admin's clock on a term (23–24 Sep).
//
// "She gave all the teachers until 2pm to enter marks but there's no
// way we can lock it." Set ONCE for the whole school per term — not
// per class — and enforced server-side:
//
//   Marks deadline  — teachers' entry locks at this moment; setting a
//                     new time IS the extension, and a per-teacher
//                     exception grants one person their own later
//                     moment ("one-time access").
//   Results day     — finalized report cards reach parents at this
//                     moment, stamped on the next read after the time.
//
// Per-class overrides (24 Sep): primary's results one day, secondary's
// another, Hifz its own — and a class can be exempted from the
// deadline altogether. A class with no override follows the school.
//
// Mounted on the tabulation sheet for admins/principals only.

import { useEffect, useState } from "react";
import { AlarmClock, CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  patchTermSchedule, listMarksExceptions, grantMarksException, revokeMarksException,
  listAdminTeachers, putClassSchedule, deleteClassSchedule,
  type MarksException, type AdminTeacher, type TermSchedule, type AdminClass,
} from "../../../../utils/schoolApi";

interface Props {
  orgId: string;
  termId: string;
  schedule: TermSchedule;
  classes: AdminClass[];
  /** The class this tabulation sheet is showing, for the "this class
   *  follows…" line. */
  currentClassId?: string | null;
  onChanged: () => void;
}

/** ISO ⇄ the value a datetime-local input wants (local wall clock). */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

export function TermSchedulePanel({ orgId, termId, schedule, classes, currentClassId, onChanged }: Props) {
  const [deadline, setDeadline] = useState(toLocalInput(schedule.marksDeadlineAt));
  const [publishAt, setPublishAt] = useState(toLocalInput(schedule.resultsPublishAt));
  const [saving, setSaving] = useState(false);
  const [exceptions, setExceptions] = useState<MarksException[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [exTeacher, setExTeacher] = useState("");
  const [exUntil, setExUntil] = useState("");
  // Per-class override form.
  const [ovClass, setOvClass] = useState("");
  const [ovDeadline, setOvDeadline] = useState("");
  const [ovOff, setOvOff] = useState(false);
  const [ovPublish, setOvPublish] = useState("");

  useEffect(() => {
    setDeadline(toLocalInput(schedule.marksDeadlineAt));
    setPublishAt(toLocalInput(schedule.resultsPublishAt));
  }, [schedule.marksDeadlineAt, schedule.resultsPublishAt]);
  useEffect(() => {
    if (!orgId || !termId) return;
    listMarksExceptions(orgId, termId).then((r) => setExceptions(r.exceptions)).catch(() => {});
    listAdminTeachers(orgId).then(setTeachers).catch(() => {});
  }, [orgId, termId]);

  const save = async (body: { marksDeadlineAt?: string | null; resultsPublishAt?: string | null }, doneMsg: string) => {
    setSaving(true);
    try {
      await patchTermSchedule(orgId, termId, body);
      toast.success(doneMsg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const extend = (hours: number) => {
    const base = schedule.marksDeadlineAt ? new Date(schedule.marksDeadlineAt) : new Date();
    const next = new Date(Math.max(base.getTime(), Date.now()) + hours * 3_600_000);
    void save({ marksDeadlineAt: next.toISOString() }, `Deadline extended to ${next.toLocaleString()}`);
  };

  const grant = async () => {
    if (!exTeacher || !exUntil) { toast.error("Pick a teacher and a time."); return; }
    try {
      await grantMarksException(orgId, termId, { userId: exTeacher, untilAt: fromLocalInput(exUntil)! });
      toast.success("Access granted");
      setExTeacher(""); setExUntil("");
      const r = await listMarksExceptions(orgId, termId);
      setExceptions(r.exceptions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not grant");
    }
  };

  const overrides = schedule.overrides ?? [];
  const saveOverride = async () => {
    if (!ovClass) { toast.error("Pick a class."); return; }
    if (!ovOff && !ovDeadline && !ovPublish) { toast.error("Set a time, or tick no-deadline."); return; }
    try {
      await putClassSchedule(orgId, termId, ovClass, {
        marksDeadlineAt: fromLocalInput(ovDeadline),
        marksDeadlineOff: ovOff,
        resultsPublishAt: fromLocalInput(ovPublish),
      });
      toast.success("Class schedule saved");
      setOvClass(""); setOvDeadline(""); setOvOff(false); setOvPublish("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };
  const removeOverride = async (classId: string) => {
    try {
      await deleteClassSchedule(orgId, termId, classId);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  };
  /** Prefill the form from an existing override so edit = re-save. */
  const editOverride = (o: NonNullable<TermSchedule["overrides"]>[number]) => {
    setOvClass(o.classId);
    setOvDeadline(toLocalInput(o.marksDeadlineAt));
    setOvOff(o.marksDeadlineOff);
    setOvPublish(toLocalInput(o.resultsPublishAt));
  };

  const eff = schedule.effective;
  const currentClassName = classes.find((c) => c.id === currentClassId)?.name;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs print:hidden">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
        Whole school — set once per term (every class follows unless given its own row below)
      </div>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div>
          <div className="mb-0.5 flex items-center gap-1 font-bold uppercase tracking-wide text-slate-500">
            <AlarmClock className="h-3.5 w-3.5" /> Marks deadline
          </div>
          <div className="flex items-center gap-1.5">
            <input type="datetime-local" value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving}
              onClick={() => void save({ marksDeadlineAt: fromLocalInput(deadline) }, deadline ? "Deadline set for the whole school" : "Deadline cleared")}>
              Set
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => extend(1)}>+1 h</Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => extend(24)}>+1 day</Button>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Every teacher's marks entry locks at this moment. Setting a new time is the extension.
          </p>
        </div>
        <div>
          <div className="mb-0.5 flex items-center gap-1 font-bold uppercase tracking-wide text-slate-500">
            <CalendarClock className="h-3.5 w-3.5" /> Results day — publish to parents
          </div>
          <div className="flex items-center gap-1.5">
            <input type="datetime-local" value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving}
              onClick={() => void save({ resultsPublishAt: fromLocalInput(publishAt) }, publishAt ? "Results day scheduled" : "Schedule cleared")}>
              Schedule
            </Button>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            FINALIZED report cards become visible to parents at this moment — finalize sections below first.
          </p>
        </div>
        <div className="min-w-[260px]">
          <div className="mb-0.5 font-bold uppercase tracking-wide text-slate-500">Exception — one teacher, until</div>
          <div className="flex items-center gap-1.5">
            <Select value={exTeacher || "__none__"} onValueChange={(v) => setExTeacher(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Teacher" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Teacher…</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.user_id} value={t.user_id}>{t.full_name || t.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="datetime-local" value={exUntil}
              onChange={(e) => setExUntil(e.target.value)}
              className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void grant()}>Grant</Button>
          </div>
          {exceptions.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {exceptions.map((ex) => (
                <div key={ex.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span>{ex.userName ?? ex.userId} — until {new Date(ex.untilAt).toLocaleString()}</span>
                  <button type="button" className="text-rose-600 hover:underline"
                    onClick={async () => {
                      try {
                        await revokeMarksException(orgId, ex.id);
                        setExceptions((prev) => prev.filter((x) => x.id !== ex.id));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not revoke");
                      }
                    }}>
                    revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-class rows: primary one results day, secondary another,
          Hifz its own — or exempt a class from the deadline. */}
      <div className="mt-2.5 border-t border-slate-100 pt-2">
        <div className="mb-1 font-bold uppercase tracking-wide text-slate-500">
          Class differences (optional) — a class listed here uses its own times
        </div>
        {overrides.length > 0 && (
          <div className="mb-1.5 space-y-0.5">
            {overrides.map((o) => (
              <div key={o.classId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-700">
                <span className="font-medium">{o.className}</span>
                <span>
                  · deadline {o.marksDeadlineOff ? "none (exempt)" : o.marksDeadlineAt ? fmt(o.marksDeadlineAt) : "follows school"}
                  {" · results "}{o.resultsPublishAt ? fmt(o.resultsPublishAt) : "follow school"}
                </span>
                <button type="button" className="text-indigo-600 hover:underline" onClick={() => editOverride(o)}>edit</button>
                <button type="button" className="text-rose-600 hover:underline inline-flex items-center"
                  onClick={() => void removeOverride(o.classId)}>
                  <X className="h-3 w-3" /> remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={ovClass || "__none__"} onValueChange={(v) => setOvClass(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Class…</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            <input type="checkbox" checked={ovOff} onChange={(e) => setOvOff(e.target.checked)} />
            no deadline for this class
          </label>
          {!ovOff && (
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              deadline
              <input type="datetime-local" value={ovDeadline}
                onChange={(e) => setOvDeadline(e.target.value)}
                className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
            </label>
          )}
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            results day
            <input type="datetime-local" value={ovPublish}
              onChange={(e) => setOvPublish(e.target.value)}
              className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
          </label>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void saveOverride()}>Save class</Button>
        </div>
        {eff && currentClassName && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            <span className="font-medium text-slate-700">{currentClassName}</span> ends up with:
            deadline <span className="font-medium">{eff.marksDeadlineAt ? fmt(eff.marksDeadlineAt) : "none"}</span>
            {" · results day "}<span className="font-medium">{eff.resultsPublishAt ? fmt(eff.resultsPublishAt) : "not scheduled"}</span>
          </p>
        )}
      </div>
    </div>
  );
}
