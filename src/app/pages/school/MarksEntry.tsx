// MarksEntry — gradebook-style sheet for one exam, one section.
//
// Rows: students. Columns: class subjects. Each cell holds two
// numbers: obtained (editable) and max (default from sheet-wide
// "Max marks" input, overridable per cell via the small field
// beneath obtained — rare but happens, e.g. Islamiat = 50 when
// most subjects are 100). An "A" checkbox marks the student absent
// for that subject (clears the marks).
//
// Save sends the whole sheet in one POST. Empty cells without max
// override clear any prior score row server-side.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft, Save, ClipboardList } from "lucide-react";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, examId, sectionId]);

  // ⚠️ Hooks (useMemo etc) MUST run on every render — they live above
  // the early returns so the hook count is stable. React error #310
  // was the symptom when this was below the guards.
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
  };

  const handleSave = async () => {
    if (!sheet) return;
    setSaving(true); setError(null);
    try {
      const rows: any[] = [];
      for (const stu of sheet.students) {
        for (const subj of sheet.subjects) {
          const key = `${stu.id}:${subj.id}`;
          const c = cells.get(key) ?? { obtained: "", maxOverride: "", absent: false };
          rows.push({
            studentId: stu.id,
            classSubjectId: subj.id,
            maxMarks: c.maxOverride || null,
            obtainedMarks: c.absent ? null : (c.obtained || null),
            absent: c.absent,
          });
        }
      }
      const def = Number(defaultMax);
      const r = await saveMarksSheet(orgId, examId, {
        sectionId,
        defaults: Number.isFinite(def) && def > 0 ? { maxMarks: def } : undefined,
        rows,
      });
      setSavedAt(new Date().toLocaleTimeString());
      void r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Per-student row total + percentage (informational; uses only filled cells).
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
      m.set(stu.id, {
        obtained: obt, max,
        pct: any && max > 0 ? (obt / max) * 100 : null,
      });
    }
    return m;
  }, [sheet, cells, defaultMax]);

  // Now safe to early-return — every hook has executed.
  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-emerald-700">Saved at {savedAt}</span>}
          <Button size="sm" onClick={handleSave} disabled={saving || !sheet}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save sheet"}
          </Button>
        </div>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Marks entry</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pick a section to load its students. Default Max applies to any cell
          without an override. Absent toggles clear obtained marks.
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
            onChange={(e) => setDefaultMax(e.target.value)} className="h-9 text-sm w-24" />
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
              {sheet.students.map((stu) => {
                const t = studentTotals.get(stu.id);
                return (
                  <tr key={stu.id} className="border-t border-slate-100">
                    <td className="px-2 py-2 sticky left-0 bg-white z-10">
                      <div className="font-medium text-slate-900">{stu.fullName}</div>
                      <div className="text-[10px] text-slate-500">
                        {stu.rollNumber ? `Roll ${stu.rollNumber} · ` : ""}{stu.grNumber}
                      </div>
                    </td>
                    {sheet.subjects.map((subj) => {
                      const key = `${stu.id}:${subj.id}`;
                      const c = cells.get(key) ?? { obtained: "", maxOverride: "", absent: false };
                      const mx = Number(c.maxOverride || defaultMax);
                      const ob = c.obtained ? Number(c.obtained) : null;
                      const cellPct = !c.absent ? pct(ob, mx) : null;
                      return (
                        <td key={subj.id} className="px-1 py-1 align-top">
                          <div className="flex items-center gap-1">
                            <Input
                              value={c.obtained}
                              onChange={(e) => setCell(key, { obtained: e.target.value })}
                              disabled={c.absent}
                              placeholder="—"
                              className="h-7 w-14 text-center text-xs"
                              type="number" inputMode="numeric"
                            />
                            <span className="text-[10px] text-slate-400">/</span>
                            <Input
                              value={c.maxOverride}
                              onChange={(e) => setCell(key, { maxOverride: e.target.value })}
                              placeholder={defaultMax}
                              className="h-7 w-12 text-center text-xs text-slate-500"
                              type="number" inputMode="numeric"
                            />
                          </div>
                          <div className="flex items-center justify-between mt-0.5 px-0.5">
                            <label className="text-[10px] text-slate-500 inline-flex items-center gap-0.5">
                              <input type="checkbox" checked={c.absent}
                                onChange={(e) => setCell(key, { absent: e.target.checked, obtained: e.target.checked ? "" : c.obtained })} />
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
