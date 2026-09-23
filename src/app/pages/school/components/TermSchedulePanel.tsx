// TermSchedulePanel — the admin's clock on a term (23 Sep).
//
// "She gave all the teachers until 2pm to enter marks but there's no
// way we can lock it." Two moments, set here and enforced server-side:
//
//   Marks deadline  — teachers' entry locks at this moment; setting a
//                     new time IS the extension, and a per-teacher
//                     exception grants one person their own later
//                     moment ("one-time access").
//   Results day     — finalized report cards reach parents at this
//                     moment, stamped on the next read after the time.
//
// Mounted on the tabulation sheet for admins/principals only.

import { useEffect, useState } from "react";
import { AlarmClock, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";
import {
  patchTermSchedule, listMarksExceptions, grantMarksException, revokeMarksException,
  listAdminTeachers,
  type MarksException, type AdminTeacher,
} from "../../../../utils/schoolApi";

interface Props {
  orgId: string;
  termId: string;
  schedule: { marksDeadlineAt: string | null; resultsPublishAt: string | null };
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

export function TermSchedulePanel({ orgId, termId, schedule, onChanged }: Props) {
  const [deadline, setDeadline] = useState(toLocalInput(schedule.marksDeadlineAt));
  const [publishAt, setPublishAt] = useState(toLocalInput(schedule.resultsPublishAt));
  const [saving, setSaving] = useState(false);
  const [exceptions, setExceptions] = useState<MarksException[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [exTeacher, setExTeacher] = useState("");
  const [exUntil, setExUntil] = useState("");

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

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs print:hidden">
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
              onClick={() => void save({ marksDeadlineAt: fromLocalInput(deadline) }, deadline ? "Deadline set" : "Deadline cleared")}>
              Set
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => extend(1)}>+1 h</Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => extend(24)}>+1 day</Button>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Teachers' marks entry locks at this moment. Setting a new time is the extension.
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
    </div>
  );
}
