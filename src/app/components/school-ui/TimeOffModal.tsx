// Reusable time-off / absence request modal.
//
// Used in two places:
//   - Teacher (TeacherHome): self-service leave/short-break requests.
//   - Parent/Student (StudentDashboard): pre-notify a student absence.
//
// The caller wires `onSubmit` to either createMyTimeOff (JWT) or
// createStudentTimeOff (PIN); the modal itself is auth-agnostic.

import { useState } from "react";
import { X } from "lucide-react";
import type { TimeOffCreate, TimeOffKind } from "../../../utils/schoolApi";

const TEACHER_KINDS: { value: TimeOffKind; label: string }[] = [
  { value: "vacation", label: "Vacation / day off" },
  { value: "sick", label: "Sick leave" },
  { value: "personal", label: "Personal leave" },
  { value: "short_break", label: "Short break (e.g. 30 min)" },
  { value: "family_emergency", label: "Family emergency" },
  { value: "medical", label: "Medical appointment" },
  { value: "other", label: "Other" },
];

const STUDENT_KINDS: { value: TimeOffKind; label: string }[] = [
  { value: "vacation", label: "Vacation / family trip" },
  { value: "sick", label: "Sick / unwell" },
  { value: "medical", label: "Doctor's visit" },
  { value: "family_emergency", label: "Family emergency" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface TimeOffModalProps {
  audience: "teacher" | "student";
  onClose: () => void;
  onSubmit: (body: TimeOffCreate) => Promise<unknown>;
}

export function TimeOffModal({ audience, onClose, onSubmit }: TimeOffModalProps) {
  const today = todayIso();
  const kinds = audience === "teacher" ? TEACHER_KINDS : STUDENT_KINDS;
  const [kind, setKind] = useState<TimeOffKind>(kinds[0].value);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [partialDay, setPartialDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headline = audience === "teacher" ? "Request time off" : "Report absence / vacation";

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: TimeOffCreate = {
        kind, startDate, endDate,
        startTime: partialDay ? startTime : null,
        endTime: partialDay ? endTime : null,
        reason: reason.trim() || null,
      };
      await onSubmit(body);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{headline}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <label className="block text-xs font-medium text-slate-700">
            Type
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as TimeOffKind)}
            >
              {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              From
              <input type="date" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              To
              <input type="date" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={partialDay} onChange={(e) => setPartialDay(e.target.checked)} />
            Partial-day (specify hours)
          </label>
          {partialDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700">
                Start
                <input type="time" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                End
                <input type="time" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
          )}
          <label className="block text-xs font-medium text-slate-700">
            Reason / notes (optional)
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={audience === "teacher"
                ? "e.g. attending wedding, dentist appointment"
                : "e.g. family trip to Karachi, fever"}
            />
          </label>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={submit} disabled={submitting}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TimeOffModal;
