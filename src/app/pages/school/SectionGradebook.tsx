// SectionGradebook — spreadsheet grid of (students × assignments) with
// inline editable score cells, weighted student average column, and a
// per-assignment average row. Dirty cells batched on save.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { AlertCircle, Save, X } from "lucide-react";
import { HeroCard, StatusPill, cardBase, cardElev } from "../../components/school-ui";
import {
  getSectionGradebook,
  listSectionSubjects,
  type SectionSubject,
  postGradesBatch,
  type Assignment,
  type GradebookResponse,
  type GradeBatchEntry,
  type GradeEntry,
  listTerms,
  type AcademicTerm,
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
  // ?studentId= — arriving from a student profile focuses the grid on
  // that one student (pilot: the section-wide grid gave no clue which
  // row you came for). "Show all" clears it.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusStudentId = searchParams.get("studentId") ?? "";
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(todayIso());
  // Design 5a: click-to-grade panel + assessment-period picker.
  const [activeCell, setActiveCell] = useState<{ studentId: string; assignmentId: string } | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [periodKey, setPeriodKey] = useState<string>("last30");
  useEffect(() => {
    if (!orgId) return;
    listTerms(orgId).then((r) => setTerms(r.terms.filter((t) => !t.archivedAt))).catch(() => {});
  }, [orgId]);
  const pickPeriod = (key: string) => {
    setPeriodKey(key);
    if (key === "last30") {
      setStartDate(defaultStartDate());
      setEndDate(todayIso());
      return;
    }
    if (key === "custom") return;
    const t = terms.find((x) => x.id === key);
    if (t) {
      setStartDate(t.startDate);
      setEndDate(t.endDate < todayIso() ? t.endDate : todayIso());
    }
  };
  const [data, setData] = useState<GradebookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // cells[studentId][assignmentId] → state
  const [cells, setCells] = useState<Record<string, Record<string, CellState>>>({});
  // Phase 3: subject filter chip row.
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);

  const load = async () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await getSectionGradebook(orgId, sectionId, {
        startDate,
        endDate,
        subjectId: subjectFilter || undefined,
      });
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
  }, [orgId, sectionId, subjectFilter]);

  // Phase 3: subjects for filter chips.
  useEffect(() => {
    if (!sectionId) return;
    listSectionSubjects(sectionId)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [sectionId]);

  const setCell = (studentId: string, assignmentId: string, patch: Partial<CellState>) => {
    setCells((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [assignmentId]: { ...prev[studentId][assignmentId], ...patch, dirty: true },
      },
    }));
  };

  const focusStudent = useMemo(
    () => data?.students.find((s) => s.id === focusStudentId) ?? null,
    [data, focusStudentId],
  );
  const visibleStudents = focusStudent ? [focusStudent] : data?.students ?? [];

  const studentAverage = useMemo(() => {
    const out: Record<string, { pct: number | null; graded: number }> = {};
    if (!data) return out;
    for (const s of data.students) {
      let weightedSum = 0;
      let weightTotal = 0;
      let graded = 0;
      for (const a of data.assignments) {
        const c = cells[s.id]?.[a.id];
        if (!c || c.status !== "graded" || c.score === "") continue;
        const n = Number(c.score);
        if (Number.isNaN(n)) continue;
        const pct = (n / a.max_score) * 100;
        weightedSum += pct * a.weight;
        weightTotal += a.weight;
        graded += 1;
      }
      out[s.id] = { pct: weightTotal > 0 ? weightedSum / weightTotal : null, graded };
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
        title={focusStudent ? `Gradebook — ${focusStudent.full_name}` : "Gradebook"}
        subtitle={
          focusStudent
            ? `${focusStudent.gr_number ? `GR ${focusStudent.gr_number} · ` : ""}showing only this student's row`
            : "Type marks into the cells, then Save All — empty cells are not graded yet"
        }
        rightSlot={
          <div className="flex flex-wrap items-end gap-2">
            {/* Assessment-period picker (design 5a) — the raw date pair
                becomes the picker used everywhere else; Custom keeps it. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => pickPeriod("last30")}
                className={
                  "min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold " +
                  (periodKey === "last30" ? "bg-white text-slate-900" : "border border-white/30 bg-white/10 text-white hover:bg-white/20")
                }
              >
                Last 30 days
              </button>
              {terms.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickPeriod(t.id)}
                  className={
                    "min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold " +
                    (periodKey === t.id ? "bg-white text-slate-900" : "border border-white/30 bg-white/10 text-white hover:bg-white/20")
                  }
                >
                  {t.name}{t.isCurrent ? " ·" : ""}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pickPeriod("custom")}
                className={
                  "min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold " +
                  (periodKey === "custom" ? "bg-white text-slate-900" : "border border-white/30 bg-white/10 text-white hover:bg-white/20")
                }
              >
                Custom
              </button>
            </div>
            {periodKey === "custom" && (
            <div title="Shows assignments ASSIGNED between these dates">
              <Label className="text-[10px] uppercase tracking-wide text-indigo-200">From (assigned)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            )}
            {periodKey === "custom" && (
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-indigo-200">To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            )}
            <Button size="sm" variant="outline" onClick={load} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              Apply
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0} className="bg-white text-slate-900 hover:bg-slate-100">
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save All"}
            </Button>
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}/assignments${focusStudent ? `?studentId=${focusStudent.id}` : ""}`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">Assignments</Button>
            </Link>
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Class page</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Phase 3: subject filter chips. Restricts which columns appear. */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Subject:</span>
          <button
            type="button"
            onClick={() => setSubjectFilter("")}
            className={
              "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
              (subjectFilter === ""
                ? "bg-indigo-600 text-white ring-indigo-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
            }
          >
            All
          </button>
          {subjects.map((s) => {
            const active = subjectFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSubjectFilter(s.id)}
                className={
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
                  (active
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
                }
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {focusStudent && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          Showing only <span className="font-semibold">{focusStudent.full_name}</span>
          {focusStudent.gr_number ? ` (GR ${focusStudent.gr_number})` : ""}
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("studentId");
              setSearchParams(next, { replace: true });
            }}
            className="ml-1 rounded-md border border-indigo-300 bg-white px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Show all students
          </button>
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
          <table className="w-full text-sm border-collapse">
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
                      to={`/school/orgs/${orgId}/assignments/${a.id}${focusStudent ? `?studentId=${focusStudent.id}` : ""}`}
                      className="block max-w-[140px] whitespace-normal hover:underline normal-case font-medium leading-tight text-slate-700"
                    >
                      {a.title}
                    </Link>
                    <div className="text-[10px] text-slate-500 normal-case font-normal tracking-normal">
                      {a.kind} · /{a.max_score}
                      {(a as any).due_date ? ` · ${new Date(`${(a as any).due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                      {assignmentAverage[a.id] == null ? " · not graded yet" : ""}
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 z-30 bg-slate-50 px-3 py-2 border-b border-l border-slate-200 text-right min-w-[80px] text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Avg
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((s) => (
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
                      <td
                        key={a.id}
                        className={"border-b border-r p-1 " + (activeCell?.studentId === s.id && activeCell?.assignmentId === a.id ? "ring-2 ring-inset ring-indigo-400" : "")}
                        style={{ minWidth: 80 }}
                        onClick={() => setActiveCell({ studentId: s.id, assignmentId: a.id })}
                      >
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
                    {(() => {
                      const avg = studentAverage[s.id];
                      if (!avg || avg.pct == null) return <span className="text-xs text-slate-400">—</span>;
                      // Honest averages (design 5a): a percentage from one
                      // or two marks reads as verdict, not signal — stay
                      // neutral until 3+ assignments are graded.
                      if (avg.graded < 3)
                        return <span className="text-xs text-slate-400">{avg.graded} graded</span>;
                      const status: "compliant" | "watch" | "flagged" =
                        avg.pct >= 80 ? "compliant" : avg.pct >= 60 ? "watch" : "flagged";
                      return <StatusPill status={status} label={`${avg.pct.toFixed(0)}%`} />;
                    })()}
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
            Click a cell to grade it — score plus Graded / Missing / Excused /
            Late buttons. Enter saves and moves down; Tab moves right.
          </p>
        </div>
      )}

      {/* Click-to-grade panel (design 5a): statuses become visible
          buttons — right-click cycling doesn't exist on touch. */}
      {activeCell && data && (() => {
        const st = data.students.find((x) => x.id === activeCell.studentId);
        const asg = data.assignments.find((x) => x.id === activeCell.assignmentId);
        const c = st && asg ? cells[st.id]?.[asg.id] : null;
        if (!st || !asg || !c) return null;
        const advance = () => {
          const idx = data.students.findIndex((x) => x.id === st.id);
          const next = data.students[idx + 1];
          if (next) setActiveCell({ studentId: next.id, assignmentId: asg.id });
          else setActiveCell(null);
        };
        return (
          <div className="fixed bottom-20 right-4 z-40 w-72 rounded-xl border border-indigo-200 bg-white p-3.5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {st.full_name} · {asg.title}
              </div>
              <button type="button" onClick={() => setActiveCell(null)} aria-label="Close">
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                max={asg.max_score}
                value={c.score}
                autoFocus
                disabled={c.status !== "graded"}
                onChange={(e) => setCell(st.id, asg.id, { score: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") advance(); }}
                className="h-9 w-24 text-base font-bold"
              />
              <span className="text-sm text-slate-500">/ {asg.max_score}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {([
                { v: "graded", label: "Graded", on: "bg-slate-900 text-white", off: "border border-slate-200 text-slate-600" },
                { v: "missing", label: "Missing", on: "bg-amber-500 text-white", off: "border border-amber-200 text-amber-800" },
                { v: "excused", label: "Excused", on: "bg-sky-600 text-white", off: "border border-sky-200 text-sky-700" },
                { v: "late", label: "Late", on: "bg-pink-600 text-white", off: "border border-pink-200 text-pink-700" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setCell(st.id, asg.id, { status: opt.v })}
                  className={
                    "min-h-[32px] rounded-full px-3 py-1 text-[11.5px] font-semibold " +
                    (c.status === opt.v ? opt.on : opt.off + " bg-white hover:bg-slate-50")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-[10.5px] text-slate-400">Enter ↵ saves and moves down · Tab moves right</div>
          </div>
        );
      })()}

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
