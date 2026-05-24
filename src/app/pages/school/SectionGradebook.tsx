// SectionGradebook — spreadsheet grid of (students × assignments) with
// inline editable score cells, weighted student average column, and a
// per-assignment average row. Dirty cells batched on save.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { AlertCircle, Save } from "lucide-react";
import { HeroCard, StatusPill, cardBase, cardElev } from "../../components/school-ui";
import {
  getSectionGradebook,
  postGradesBatch,
  type Assignment,
  type GradebookResponse,
  type GradeBatchEntry,
  type GradeEntry,
} from "../../../utils/schoolApi";

interface CellState {
  score: string;
  status: GradeEntry["status"];
  dirty: boolean;
}

function pctColor(pct: number | null): string {
  if (pct == null) return "";
  if (pct >= 80) return "bg-emerald-50 text-emerald-700";
  if (pct >= 60) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SectionGradebook() {
  const { orgId = "", sectionId = "" } = useParams();
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(todayIso());
  const [data, setData] = useState<GradebookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // cells[studentId][assignmentId] → state
  const [cells, setCells] = useState<Record<string, Record<string, CellState>>>({});

  const load = async () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await getSectionGradebook(orgId, sectionId, { startDate, endDate });
      setData(resp);
      const init: Record<string, Record<string, CellState>> = {};
      for (const s of resp.students) {
        init[s.id] = {};
        for (const a of resp.assignments) {
          const g = resp.grades?.[a.id]?.[s.id];
          init[s.id][a.id] = {
            score: g?.score != null ? String(g.score) : "",
            status: (g?.status ?? "graded"),
            dirty: false,
          };
        }
      }
      setCells(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId]);

  const setCell = (studentId: string, assignmentId: string, patch: Partial<CellState>) => {
    setCells((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [assignmentId]: { ...prev[studentId][assignmentId], ...patch, dirty: true },
      },
    }));
  };

  const studentAverage = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (!data) return out;
    for (const s of data.students) {
      let weightedSum = 0;
      let weightTotal = 0;
      for (const a of data.assignments) {
        const c = cells[s.id]?.[a.id];
        if (!c || c.status !== "graded" || c.score === "") continue;
        const n = Number(c.score);
        if (Number.isNaN(n)) continue;
        const pct = (n / a.max_score) * 100;
        weightedSum += pct * a.weight;
        weightTotal += a.weight;
      }
      out[s.id] = weightTotal > 0 ? weightedSum / weightTotal : null;
    }
    return out;
  }, [cells, data]);

  const assignmentAverage = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (!data) return out;
    for (const a of data.assignments) {
      const vals: number[] = [];
      for (const s of data.students) {
        const c = cells[s.id]?.[a.id];
        if (!c || c.status !== "graded" || c.score === "") continue;
        const n = Number(c.score);
        if (Number.isNaN(n)) continue;
        vals.push((n / a.max_score) * 100);
      }
      out[a.id] = vals.length > 0 ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
    }
    return out;
  }, [cells, data]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const sid in cells) {
      for (const aid in cells[sid]) {
        if (cells[sid][aid].dirty) n++;
      }
    }
    return n;
  }, [cells]);

  const handleSave = async () => {
    if (!data) return;
    // Group dirty cells by assignment.
    const byAssign: Record<string, GradeBatchEntry[]> = {};
    for (const s of data.students) {
      for (const a of data.assignments) {
        const c = cells[s.id]?.[a.id];
        if (!c?.dirty) continue;
        (byAssign[a.id] ||= []).push({
          studentId: s.id,
          score: c.status === "graded" && c.score !== "" ? Number(c.score) : null,
          status: c.status,
        });
      }
    }
    setSaving(true);
    try {
      let totalFailed = 0;
      let totalSaved = 0;
      for (const [aid, entries] of Object.entries(byAssign)) {
        const res = await postGradesBatch(orgId, aid, entries);
        totalFailed += res.failed;
        totalSaved += res.inserted + res.updated;
      }
      if (totalFailed > 0) toast.error(`Saved with ${totalFailed} failure${totalFailed === 1 ? "" : "s"}`);
      else toast.success(`Saved ${totalSaved} grade${totalSaved === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <HeroCard
        title="Gradebook"
        subtitle="Spreadsheet of students × assignments"
        rightSlot={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-indigo-200">From</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-indigo-200">To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <Button size="sm" variant="outline" onClick={load} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              Apply
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0} className="bg-white text-slate-900 hover:bg-slate-100">
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save All"}
            </Button>
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}/assignments`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">Assignments</Button>
            </Link>
            <Link to={`/school/orgs/${orgId}/admin/classes`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Classes</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading gradebook…</CardContent></Card>
      ) : !data || data.students.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No students in this section.</CardContent></Card>
      ) : data.assignments.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No assignments in this date range. Create one from the Assignments page.
        </CardContent></Card>
      ) : (
        <div className={`${cardBase} ${cardElev} overflow-auto max-h-[70vh]`}>
          <table className="text-sm border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr>
                <th className="sticky left-0 z-30 bg-slate-50 px-3 py-2 text-left border-b border-r border-slate-200 min-w-[180px] text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Student
                </th>
                {data.assignments.map((a: Assignment) => (
                  <th
                    key={a.id}
                    className="px-2 py-2 border-b border-r border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap"
                    style={{ minWidth: 80 }}
                    title={a.title}
                  >
                    <Link
                      to={`/school/orgs/${orgId}/assignments/${a.id}`}
                      className="block truncate max-w-[80px] hover:underline normal-case font-medium text-slate-700"
                    >
                      {a.title}
                    </Link>
                    <div className="text-[10px] text-slate-500 normal-case font-normal tracking-normal">
                      {a.kind} · /{a.max_score}
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 z-30 bg-slate-50 px-3 py-2 border-b border-l border-slate-200 text-right min-w-[80px] text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Avg
                </th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id}>
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-b border-r">
                    <p className="font-medium">{s.full_name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{s.gr_number}</p>
                  </td>
                  {data.assignments.map((a) => {
                    const c = cells[s.id]?.[a.id];
                    if (!c) return <td key={a.id} className="border-b border-r" />;
                    const cellPct =
                      c.status === "graded" && c.score !== ""
                        ? (Number(c.score) / a.max_score) * 100
                        : null;
                    let cls = "h-7 text-xs px-1 ";
                    if (c.status === "missing") cls += "bg-rose-50 border-rose-200 ";
                    else if (c.status === "excused") cls += "bg-slate-50 border-slate-200 ";
                    else if (c.status === "late") cls += "bg-amber-50 border-amber-200 ";
                    else cls += pctColor(cellPct) + " ";
                    if (c.dirty) cls += "ring-1 ring-amber-400 ";
                    return (
                      <td key={a.id} className="border-b border-r p-1" style={{ minWidth: 80 }}>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={a.max_score}
                          value={c.score}
                          disabled={c.status !== "graded"}
                          onChange={(e) => setCell(s.id, a.id, { score: e.target.value })}
                          className={cls}
                          title={c.status !== "graded" ? c.status : undefined}
                          placeholder={c.status !== "graded" ? c.status : ""}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            const next: GradeEntry["status"] =
                              c.status === "graded" ? "missing"
                              : c.status === "missing" ? "excused"
                              : c.status === "excused" ? "late"
                              : "graded";
                            setCell(s.id, a.id, { status: next });
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-white px-3 py-1.5 border-b border-l border-slate-200 text-right">
                    {studentAverage[s.id] != null ? (
                      (() => {
                        const pct = studentAverage[s.id]!;
                        const status: "compliant" | "watch" | "flagged" =
                          pct >= 80 ? "compliant" : pct >= 60 ? "watch" : "flagged";
                        return <StatusPill status={status} label={`${pct.toFixed(0)}%`} />;
                      })()
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="sticky bottom-0 z-20 bg-muted/70">
                <td className="sticky left-0 z-30 bg-muted/70 px-3 py-2 border-t border-r font-medium text-xs">
                  Assignment avg
                </td>
                {data.assignments.map((a) => (
                  <td key={a.id} className="border-t border-r px-2 py-1.5 text-xs text-center tabular-nums">
                    {assignmentAverage[a.id] != null ? `${assignmentAverage[a.id]!.toFixed(0)}%` : "—"}
                  </td>
                ))}
                <td className="sticky right-0 z-30 bg-muted/70 border-t border-l" />
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground p-2 border-t">
            Tip: right-click a cell to cycle through statuses (graded → missing → excused → late).
          </p>
        </div>
      )}

      {dirtyCount > 0 && (
        <div className="fixed bottom-4 right-4 z-30 bg-background border shadow-lg rounded-lg p-3 flex items-center gap-3">
          <span className="text-sm">
            {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save all"}
          </Button>
        </div>
      )}
    </div>
  );
}
