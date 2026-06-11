// Week-template editor — the "build my school day in one place" view.
//
// Replaces the previous 30-rows-of-slot-typing flow. The admin picks
// school days, lists periods (name + duration + gap-before + kind),
// previews the resulting times, and clicks Apply. Backend explodes
// the template into one timetable_slot per (day, period) and
// preserves any slot that already has a teacher assignment.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Calendar, Plus, Save, Trash2, GripVertical, AlertCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  applyTimetableTemplate,
  getTimetableTemplate,
  type TimetableTemplatePeriod,
} from "../../../utils/schoolApi";

const DAYS = [
  { num: 1, short: "Mon" }, { num: 2, short: "Tue" }, { num: 3, short: "Wed" },
  { num: 4, short: "Thu" }, { num: 5, short: "Fri" }, { num: 6, short: "Sat" },
  { num: 7, short: "Sun" },
];

const KIND_OPTIONS: Array<{ value: TimetableTemplatePeriod["kind"]; label: string; color: string }> = [
  { value: "academic", label: "Academic", color: "bg-indigo-100 text-indigo-800" },
  { value: "break", label: "Break", color: "bg-amber-100 text-amber-800" },
  { value: "prayer", label: "Prayer", color: "bg-emerald-100 text-emerald-800" },
  { value: "other", label: "Other", color: "bg-slate-100 text-slate-700" },
];

function toHM(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function newPeriod(kind: TimetableTemplatePeriod["kind"], i: number): TimetableTemplatePeriod {
  return {
    name: kind === "break" ? "Break" : kind === "prayer" ? "Prayer" : `Period ${i + 1}`,
    durationMinutes: kind === "break" ? 20 : kind === "prayer" ? 25 : 45,
    gapBefore: 0,
    kind,
  };
}

export function TimetableWeekTemplate() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("08:00");
  const [periods, setPeriods] = useState<TimetableTemplatePeriod[]>([
    newPeriod("academic", 0),
    newPeriod("academic", 1),
    { name: "Break", durationMinutes: 20, gapBefore: 0, kind: "break" },
    newPeriod("academic", 2),
    newPeriod("academic", 3),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; preserved: number; deleted: number } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    getTimetableTemplate(orgId)
      .then((r) => {
        if (r.template) {
          setDays(r.template.days);
          setStartTime(r.template.startTime);
          setPeriods(r.template.periods);
        }
      })
      .catch(() => { /* fresh school — keep defaults */ });
  }, [orgId]);

  // Compute the actual start/end for each period from the cumulative
  // durations, so the admin sees what the slot rows will become.
  const previewRows = useMemo(() => {
    const [h0, m0] = startTime.split(":").map((s) => parseInt(s, 10) || 0);
    let cursor = h0 * 60 + m0;
    return periods.map((p) => {
      cursor += p.gapBefore ?? 0;
      const start = toHM(cursor);
      cursor += p.durationMinutes;
      const end = toHM(cursor);
      return { name: p.name, kind: p.kind, start, end };
    });
  }, [periods, startTime]);

  const totalHours = useMemo(() => {
    const totalMin = periods.reduce((sum, p) => sum + p.durationMinutes + (p.gapBefore ?? 0), 0);
    return (totalMin / 60).toFixed(1);
  }, [periods]);

  function toggleDay(d: number) {
    setDays((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b));
  }

  function addPeriod(kind: TimetableTemplatePeriod["kind"]) {
    setPeriods((s) => [...s, newPeriod(kind, s.filter((p) => p.kind === "academic").length)]);
  }

  function updatePeriod(i: number, patch: Partial<TimetableTemplatePeriod>) {
    setPeriods((s) => s.map((p, j) => j === i ? { ...p, ...patch } : p));
  }

  function removePeriod(i: number) {
    setPeriods((s) => s.filter((_, j) => j !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setPeriods((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function apply() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const r = await applyTimetableTemplate(orgId, { days, periods, startTime });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" /> School week template
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 max-w-lg">
              Define the periods of a typical day once. We'll create the time slots for every
              school day you've enabled. Edits to a fresh template replace empty slots; slots that
              already have a teacher assignment are preserved.
            </p>
          </div>
          <Button onClick={apply} disabled={saving || periods.length === 0 || days.length === 0}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Applying…" : "Apply template"}
          </Button>
        </div>

        {/* School days */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">School days</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const on = days.includes(d.num);
              return (
                <button
                  key={d.num} type="button" onClick={() => toggleDay(d.num)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium border transition-colors " +
                    (on
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                  }
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day start */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-center">
          <div className="space-y-1">
            <Label className="text-xs">School day starts at</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="text-xs text-slate-500">
            Total scheduled time per day: <strong className="text-slate-700">{totalHours}h</strong>
            {previewRows.length > 0 && (
              <> — ends around <strong className="text-slate-700">{previewRows[previewRows.length - 1].end}</strong></>
            )}
          </div>
        </div>

        {/* Periods */}
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">Periods</Label>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => addPeriod("academic")}>
                <Plus className="h-3 w-3 mr-1" /> Period
              </Button>
              <Button size="sm" variant="outline" onClick={() => addPeriod("break")}>
                <Plus className="h-3 w-3 mr-1" /> Break
              </Button>
              <Button size="sm" variant="outline" onClick={() => addPeriod("prayer")}>
                <Plus className="h-3 w-3 mr-1" /> Prayer
              </Button>
            </div>
          </div>

          {periods.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No periods yet — add your first above.
            </div>
          ) : (
            <ul className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
              {periods.map((p, i) => {
                const kind = KIND_OPTIONS.find((k) => k.value === p.kind) ?? KIND_OPTIONS[0];
                const preview = previewRows[i];
                return (
                  <li key={i} className="grid grid-cols-[auto_1fr_120px_120px_140px_auto] gap-2 items-center px-2 py-2 text-sm hover:bg-slate-50/50">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            aria-label="Move up">
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <Input value={p.name} className="h-8 text-sm"
                           onChange={(e) => updatePeriod(i, { name: e.target.value })} />
                    <div className="flex items-center gap-1">
                      <Input type="number" min={1} max={240} value={p.durationMinutes} className="h-8 text-sm"
                             onChange={(e) => updatePeriod(i, { durationMinutes: parseInt(e.target.value, 10) || 0 })} />
                      <span className="text-[10px] text-slate-500 shrink-0">min</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={0} max={120} value={p.gapBefore ?? 0} className="h-8 text-sm"
                             onChange={(e) => updatePeriod(i, { gapBefore: parseInt(e.target.value, 10) || 0 })}
                             title="Gap before this period (minutes)" />
                      <span className="text-[10px] text-slate-500 shrink-0">gap</span>
                    </div>
                    <select value={p.kind}
                            onChange={(e) => updatePeriod(i, { kind: e.target.value as any })}
                            className="h-8 text-xs rounded-md border border-slate-200 px-2 bg-white">
                      {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removePeriod(i)}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                            aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {preview && (
                      <div className="col-span-6 -mt-1 ml-7 text-[11px] text-slate-500">
                        <span className={"inline-block rounded px-1.5 py-0.5 mr-2 " + kind.color}>{kind.label}</span>
                        {preview.start} – {preview.end}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Preview summary */}
        {periods.length > 0 && days.length > 0 && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900">
            <strong>{days.length} days</strong> × <strong>{periods.length} periods</strong> ={" "}
            <strong>{days.length * periods.length} time slots</strong> will be generated when you apply.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Applied — created {result.created} new slot{result.created === 1 ? "" : "s"}
            {result.preserved > 0 && `, preserved ${result.preserved} that already had teachers assigned`}
            {result.deleted > 0 && `, removed ${result.deleted} unused old slot${result.deleted === 1 ? "" : "s"}`}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TimetableWeekTemplate;
