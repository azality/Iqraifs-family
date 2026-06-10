// MarksEntry — gradebook-style sheet for one exam, one section.
//
// Rows: students. Columns: class subjects. Each cell holds two
// numbers: obtained (editable) and max (default from sheet-wide
// "Max marks" input, overridable per cell via the small field
// beneath obtained — rare but happens, e.g. Islamiat = 50 when
// most subjects are 100). An "A" checkbox marks the student absent
// for that subject (clears the marks).
//
// Ergonomics (PR feat/marks-entry-ergonomics):
//   - Tab / Shift-Tab moves between obtained-marks inputs in row-major
//     order. Enter moves down a row, Shift-Enter moves up. Arrows give
//     2D navigation. Skips max-override and absent checkbox — those
//     are still reachable by mouse / explicit tabindex when needed.
//   - Paste from Excel: copy a (rows × cols) block from a spreadsheet,
//     focus the top-left target cell, paste — values fill into the
//     range. Newlines split rows; tabs split columns. Cells past the
//     edge are ignored.
//   - Auto-save: 1500 ms after the last edit; visible status pill.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft, Save, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin,
  listClasses,
  getMarksSheet, saveMarksSheet,
  type AdminClass, type MarksSheetResponse, type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

type CellState = {
  obtained: string;     // string for input control
  maxOverride: string;  // empty = use sheet-default
  absent: boolean;
};

function pct(obt: number | null, max: number | null): number | null {
  if (obt === null || max === null || max === 0) return null;
  return (obt / max) * 100;
}

const AUTOSAVE_DELAY_MS = 1500;
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function MarksEntry() {
  const { orgId = "", examId = "" } = useParams<{ orgId: string; examId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [sectionId, setSectionId] = useState<string>("");
  const [sheet, setSheet] = useState<MarksSheetResponse | null>(null);
  const [defaultMax, setDefaultMax] = useState<string>("100");
  // Map of `${studentId}:${classSubjectId}` → cell.
  const [cells, setCells] = useState<Map<string, CellState>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !examId || !sectionId) { setSheet(null); return; }
    setLoading(true);
    getMarksSheet(orgId, examId, sectionId)
      .then((r) => {
        setSheet(r);
        const next = new Map<string, CellState>();
        for (const stu of r.students) {
          for (const sc of stu.scores) {
            const key = `${stu.id}:${sc.classSubjectId}`;
            next.set(key, {
              obtained: sc.obtainedMarks === null ? "" : String(sc.obtainedMarks),
              maxOverride: sc.maxMarks === null ? "" : String(sc.maxMarks),
              absent: sc.absent,
            });
          }
        }
        setCells(next);
        setError(null);
        setSaveStatus("idle");
        setSavedAt(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, examId, sectionId]);

  // ⚠️ Hooks MUST run on every render — they live above the early returns
  // so the hook count is stable. React error #310 was the symptom when
  // this was below the guards.
  const sectionOptions = classes.flatMap((c) =>
    (c.sections ?? []).map((s) => ({ id: s.id, label: `${c.name} — ${s.name}` })),
  );

  const setCell = (key: string, patch: Partial<CellState>) => {
    setCells((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { obtained: "", maxOverride: "", absent: false };
      next.set(key, { ...cur, ...patch });
      return next;
    });
    setSaveStatus((s) => (s === "saving" ? s : "dirty"));
  };

  // ─── Save (manual + debounced auto-save) ─────────────────────────
  // Latest-state ref so the debounced callback sees the freshest data
  // without re-creating itself every keystroke.
  const stateRef = useRef({ sheet, cells, defaultMax, sectionId });
  stateRef.current = { sheet, cells, defaultMax, sectionId };

  const doSave = useCallback(async () => {
    const { sheet: s, cells: cs, defaultMax: dm, sectionId: sid } = stateRef.current;
    if (!s || !sid) return;
    setSaveStatus("saving");
    setError(null);
    try {
      const rows: any[] = [];
      for (const stu of s.students) {
        for (const subj of s.subjects) {
          const key = `${stu.id}:${subj.id}`;
          const c = cs.get(key) ?? { obtained: "", maxOverride: "", absent: false };
          rows.push({
            studentId: stu.id,
            classSubjectId: subj.id,
            maxMarks: c.maxOverride || null,
            obtainedMarks: c.absent ? null : (c.obtained || null),
            absent: c.absent,
          });
        }
      }
      const def = Number(dm);
      await saveMarksSheet(orgId, examId, {
        sectionId: sid,
        defaults: Number.isFinite(def) && def > 0 ? { maxMarks: def } : undefined,
        rows,
      });
      setSavedAt(new Date().toLocaleTimeString());
      setSaveStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveStatus("error");
    }
  }, [orgId, examId]);

  // Debounced auto-save. Fires AUTOSAVE_DELAY_MS after the last edit
  // when saveStatus is "dirty".
  useEffect(() => {
    if (saveStatus !== "dirty") return;
    const handle = setTimeout(() => { void doSave(); }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [saveStatus, doSave, cells, defaultMax]);

  // ─── Grid navigation (Tab / arrows / Enter) ──────────────────────
  // We register every obtained-input via a ref keyed by (rowIdx, colIdx),
  // then a single keyDown handler does the focus math.
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const setInputRef = (rowIdx: number, colIdx: number) => (el: HTMLInputElement | null) => {
    const k = `${rowIdx}:${colIdx}`;
    if (el) inputRefs.current.set(k, el); else inputRefs.current.delete(k);
  };
  const focusCell = (rowIdx: number, colIdx: number) => {
    if (!sheet) return;
    const r = Math.max(0, Math.min(sheet.students.length - 1, rowIdx));
    const c = Math.max(0, Math.min(sheet.subjects.length - 1, colIdx));
    const el = inputRefs.current.get(`${r}:${c}`);
    if (el) { el.focus(); el.select(); }
  };
  const onCellKeyDown = (rowIdx: number, colIdx: number) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!sheet) return;
      const lastCol = sheet.subjects.length - 1;
      const lastRow = sheet.students.length - 1;
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          if (colIdx > 0) focusCell(rowIdx, colIdx - 1);
          else if (rowIdx > 0) focusCell(rowIdx - 1, lastCol);
        } else {
          if (colIdx < lastCol) focusCell(rowIdx, colIdx + 1);
          else if (rowIdx < lastRow) focusCell(rowIdx + 1, 0);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) { if (rowIdx > 0) focusCell(rowIdx - 1, colIdx); }
        else            { if (rowIdx < lastRow) focusCell(rowIdx + 1, colIdx); }
      } else if (e.key === "ArrowDown") {
        e.preventDefault(); focusCell(rowIdx + 1, colIdx);
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); focusCell(rowIdx - 1, colIdx);
      } else if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
        e.preventDefault(); focusCell(rowIdx, colIdx - 1);
      } else if (e.key === "ArrowRight" && (e.currentTarget.selectionEnd ?? 0) === e.currentTarget.value.length) {
        e.preventDefault(); focusCell(rowIdx, colIdx + 1);
      }
    };

  // ─── Paste from Excel ───────────────────────────────────────────
  // If clipboard text is a single value, fall through to default browser
  // paste behavior (so a single-cell paste behaves normally). If it's
  // multi-cell, fill the rectangle starting at the focused cell.
  const onCellPaste = (rowIdx: number, colIdx: number) =>
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (!sheet) return;
      const text = e.clipboardData.getData("text");
      // Quick reject: no tabs and no newlines → single cell.
      if (!/\t|\n/.test(text)) return;
      e.preventDefault();
      const rows = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
      const grid = rows.map((r) => r.split("\t"));
      setCells((prev) => {
        const next = new Map(prev);
        for (let ri = 0; ri < grid.length; ri++) {
          for (let ci = 0; ci < grid[ri].length; ci++) {
            const targetRow = rowIdx + ri;
            const targetCol = colIdx + ci;
            if (targetRow > sheet.students.length - 1) continue;
            if (targetCol > sheet.subjects.length - 1) continue;
            const stuId = sheet.students[targetRow].id;
            const subjId = sheet.subjects[targetCol].id;
            const k = `${stuId}:${subjId}`;
            const cur = next.get(k) ?? { obtained: "", maxOverride: "", absent: false };
            const raw = grid[ri][ci].trim();
            // Recognise an "A" / "absent" cell — flip the absent flag.
            if (/^a(bsent)?$/i.test(raw)) {
              next.set(k, { ...cur, absent: true, obtained: "" });
            } else {
              next.set(k, { ...cur, obtained: raw, absent: false });
            }
          }
        }
        return next;
      });
      setSaveStatus("dirty");
    };

  // Per-student row total + percentage.
  const studentTotals = useMemo(() => {
    if (!sheet) return new Map<string, { obtained: number; max: number; pct: number | null }>();
    const m = new Map<string, { obtained: number; max: number; pct: number | null }>();
    for (const stu of sheet.students) {
      let obt = 0, max = 0, any = false;
      for (const subj of sheet.subjects) {
        const c = cells.get(`${stu.id}:${subj.id}`);
        if (!c || c.absent || !c.obtained) continue;
        const o = Number(c.obtained);
        const mx = Number(c.maxOverride || defaultMax);
        if (!Number.isFinite(o) || !Number.isFinite(mx) || mx <= 0) continue;
        obt += o; max += mx; any = true;
      }
      m.set(stu.id, { obtained: obt, max, pct: any && max > 0 ? (obt / max) * 100 : null });
    }
    return m;
  }, [sheet, cells, defaultMax]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  const statusPill = () => {
    if (saveStatus === "saving") {
      return <span className="text-xs inline-flex items-center gap-1 text-slate-600">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>;
    }
    if (saveStatus === "dirty") {
      return <span className="text-xs text-amber-700">Unsaved changes</span>;
    }
    if (saveStatus === "saved" && savedAt) {
      return <span className="text-xs text-emerald-700">Saved at {savedAt}</span>;
    }
    if (saveStatus === "error") {
      return <span className="text-xs text-rose-700">Save failed — try again</span>;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {statusPill()}
          <Button size="sm" onClick={() => void doSave()} disabled={saveStatus === "saving" || !sheet}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save now
          </Button>
        </div>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Marks entry</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tab / arrow-keys move between cells. Paste a block from Excel to fill
          a rectangle. Sheet auto-saves {AUTOSAVE_DELAY_MS / 1000}s after the last edit.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Section</Label>
          <Select value={sectionId || "__none__"} onValueChange={(v) => setSectionId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-9 text-sm w-64"><SelectValue placeholder="Pick a section…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Pick —</SelectItem>
              {sectionOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Default Max</Label>
          <Input type="number" inputMode="numeric" value={defaultMax}
            onChange={(e) => { setDefaultMax(e.target.value); setSaveStatus("dirty"); }}
            className="h-9 text-sm w-24" />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!sectionId ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-slate-400" />
          Pick a section above to load the marks sheet.
        </CardContent></Card>
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading sheet…</div>
      ) : !sheet ? null : sheet.students.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">
          No students in this section.
        </CardContent></Card>
      ) : sheet.subjects.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">
          No subjects defined for this class — add them under class settings first.
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-2 py-2 sticky left-0 bg-slate-50 z-10">Student</th>
                {sheet.subjects.map((s) => (
                  <th key={s.id} className="text-center px-2 py-2 min-w-[120px]">{s.name}</th>
                ))}
                <th className="text-right px-2 py-2 bg-slate-100">Total · %</th>
              </tr>
            </thead>
            <tbody>
              {sheet.students.map((stu, rowIdx) => {
                const t = studentTotals.get(stu.id);
                return (
                  <tr key={stu.id} className="border-t border-slate-100">
                    <td className="px-2 py-2 sticky left-0 bg-white z-10">
                      <div className="font-medium text-slate-900">{stu.fullName}</div>
                      <div className="text-[10px] text-slate-500">
                        {stu.rollNumber ? `Roll ${stu.rollNumber} · ` : ""}{stu.grNumber}
                      </div>
                    </td>
                    {sheet.subjects.map((subj, colIdx) => {
                      const key = `${stu.id}:${subj.id}`;
                      const c = cells.get(key) ?? { obtained: "", maxOverride: "", absent: false };
                      const mx = Number(c.maxOverride || defaultMax);
                      const ob = c.obtained ? Number(c.obtained) : null;
                      const cellPct = !c.absent ? pct(ob, mx) : null;
                      return (
                        <td key={subj.id} className="px-1 py-1 align-top">
                          <div className="flex items-center gap-1">
                            {/* Raw <input> instead of <Input> so we get a stable ref handler. */}
                            <input
                              ref={setInputRef(rowIdx, colIdx)}
                              value={c.obtained}
                              onChange={(e) => setCell(key, { obtained: e.target.value })}
                              onKeyDown={onCellKeyDown(rowIdx, colIdx)}
                              onPaste={onCellPaste(rowIdx, colIdx)}
                              disabled={c.absent}
                              placeholder="—"
                              className="h-7 w-14 text-center text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
                              type="number" inputMode="numeric"
                              // Block default Tab order from reaching the
                              // max-override + absent checkbox so the
                              // sheet feels Excel-like.
                              tabIndex={0}
                            />
                            <span className="text-[10px] text-slate-400">/</span>
                            <Input
                              value={c.maxOverride}
                              onChange={(e) => setCell(key, { maxOverride: e.target.value })}
                              placeholder={defaultMax}
                              className="h-7 w-12 text-center text-xs text-slate-500"
                              type="number" inputMode="numeric"
                              tabIndex={-1}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-0.5 px-0.5">
                            <label className="text-[10px] text-slate-500 inline-flex items-center gap-0.5">
                              <input
                                type="checkbox" checked={c.absent}
                                tabIndex={-1}
                                onChange={(e) => setCell(key, { absent: e.target.checked, obtained: e.target.checked ? "" : c.obtained })}
                              />
                              A
                            </label>
                            <span className="text-[10px] text-slate-500">
                              {cellPct !== null ? `${cellPct.toFixed(0)}%` : ""}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right bg-slate-50/60 font-medium">
                      {t && t.max > 0
                        ? <>
                            <div>{t.obtained}/{t.max}</div>
                            <div className="text-[10px] text-slate-500">
                              {t.pct !== null ? `${t.pct.toFixed(1)}%` : "—"}
                            </div>
                          </>
                        : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default MarksEntry;
