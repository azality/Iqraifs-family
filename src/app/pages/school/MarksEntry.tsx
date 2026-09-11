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
import { Link, useParams, useSearchParams } from "react-router";
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
  getMarksSheet, saveMarksSheet, setMarksConfirmation,
  subjectMaxForPaper, paperOfExamName,
  type AdminClass, type AssessmentWeight,
  type MarksSheetResponse, type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses, NoAccessRedirect } from "../../components/school-ui";

type CellState = {
  obtained: string;     // string for input control
  maxOverride: string;  // empty = use sheet-default
  absent: boolean;
};

function pct(obt: number | null, max: number | null): number | null {
  if (obt === null || max === null || max === 0) return null;
  return (obt / max) * 100;
}

/** The max for one cell. A subject's own total for THIS paper wins over
 *  the sheet-wide default — Class I oral is English 15, Maths 20,
 *  Islamiat 25, so one number for the whole sheet cannot be right
 *  (Ambreen's marks distribution, 10 Sep). A per-cell override still
 *  beats everything, for the odd student who sat a shorter paper. */
function cellMax(
  override: string,
  subjectTotal: number | null,
  sheetDefault: string,
): number {
  if (override) return Number(override);
  if (subjectTotal !== null) return subjectTotal;
  return Number(sheetDefault);
}

const AUTOSAVE_DELAY_MS = 1500;
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** The bulk-save payload for one cells map. Stores the max the teacher
 *  actually saw — their own override, else the school's total for this
 *  paper — but only on cells that HOLD something: stamping a max onto
 *  every empty cell is what froze old defaults into the sheet and
 *  buried the school's distribution when it arrived later. Subjects
 *  hidden on this paper are not sent at all, so their rows are never
 *  disturbed. Shared by save and by "discard this session" (which
 *  saves the opening snapshot instead of the edits). */
function buildSheetRows(
  s: MarksSheetResponse,
  subs: MarksSheetResponse["subjects"],
  cs: Map<string, CellState>,
  paper: "oral" | "written" | null,
): any[] {
  const rows: any[] = [];
  for (const stu of s.students) {
    for (const subj of subs) {
      const c = cs.get(`${stu.id}:${subj.id}`) ?? { obtained: "", maxOverride: "", absent: false };
      const subjTotal = subjectMaxForPaper(subj.assessmentWeights, paper);
      const holds = c.absent || c.obtained !== "" || c.maxOverride !== "";
      rows.push({
        studentId: stu.id,
        classSubjectId: subj.id,
        maxMarks: holds
          ? c.maxOverride || (subjTotal !== null ? String(subjTotal) : null)
          : null,
        obtainedMarks: c.absent ? null : (c.obtained || null),
        absent: c.absent,
      });
    }
  }
  return rows;
}

export function MarksEntry() {
  const { orgId = "", examId = "" } = useParams<{ orgId: string; examId: string }>();
  // ?sectionId= — the teacher-facing front door: the Homework & tests
  // page links each report-card exam straight to its sheet, section
  // preset. Teachers land here without the admin pickers; the save
  // endpoint enforces per-section/subject rights server-side.
  const [searchParams] = useSearchParams();
  const presetSectionId = searchParams.get("sectionId") ?? "";
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [sectionId, setSectionId] = useState<string>(presetSectionId);
  const [sheet, setSheet] = useState<MarksSheetResponse | null>(null);
  const [defaultMax, setDefaultMax] = useState<string>("100");
  // subjectId → total marks the school gives this subject on THIS paper.
  // Empty when the school hasn't entered a distribution, in which case
  // the sheet-wide default applies exactly as before.
  const subjectMax = useMemo(() => {
    const m = new Map<string, number | null>();
    const paper = paperOfExamName(sheet?.exam?.name);
    for (const s of sheet?.subjects ?? []) {
      m.set(s.id, subjectMaxForPaper(s.assessmentWeights, paper));
    }
    return m;
  }, [sheet]);
  // Only subjects EXAMINED on this paper get a column. Quran carries 50
  // oral marks and nothing written; Science IV–V is written-only — their
  // columns on the other paper invited marks the school never set
  // ("I see Quran in written", Ambreen, 11 Sep). An EMPTY weights array
  // is the school saying "this subject sits no paper at all" (Senior's
  // Material Activity and Islamic Studies / English Core readers) — no
  // column on either sheet. A subject with NULL weights (no distribution
  // entered yet) keeps its column on both papers, exactly as before;
  // hidden subjects' saved rows are never touched.
  // …EXCEPT a subject that already HOLDS marks on this paper. Hiding a
  // column hides the marks inside it, and the report card still counts
  // them — so a mark entered before the school corrected its
  // distribution would be both invisible and uncorrectable (Muneeb,
  // 11 Sep: the teachers own their marks; the system must never put one
  // beyond their reach). Such a column is shown, flagged, so a teacher
  // can clear it; it disappears on the next load once emptied.
  //
  // Deliberately derived from the SERVER's rows, not local edits, so the
  // column does not vanish under the teacher the instant they clear it.
  const subjectsHoldingMarks = useMemo(() => {
    const held = new Set<string>();
    for (const stu of sheet?.students ?? []) {
      for (const sc of stu.scores) {
        if (sc.obtainedMarks !== null || sc.absent) held.add(sc.classSubjectId);
      }
    }
    return held;
  }, [sheet]);
  const isOnThisPaper = useCallback((s: { assessmentWeights?: AssessmentWeight[] | null }) => {
    const paper = paperOfExamName(sheet?.exam?.name);
    const other = paper === "oral" ? "written" : "oral";
    if (Array.isArray(s.assessmentWeights) && s.assessmentWeights.length === 0) return false;
    if (!paper) return true;
    return (
      subjectMaxForPaper(s.assessmentWeights, paper) !== null ||
      subjectMaxForPaper(s.assessmentWeights, other) === null
    );
  }, [sheet]);
  const visibleSubjects = useMemo(
    () => (sheet?.subjects ?? []).filter(
      (s) => isOnThisPaper(s) || subjectsHoldingMarks.has(s.id),
    ),
    [sheet, isOnThisPaper, subjectsHoldingMarks],
  );
  // Per-subject "my column is complete" sign-off for this exam's term.
  // Local mirror of sheet.confirmations so the check flips instantly.
  const [confirmations, setConfirmations] = useState<Record<string, { by: string; byName: string; at: string }>>({});
  const [confirmBusy, setConfirmBusy] = useState<string | null>(null);
  const toggleConfirm = async (subjectId: string) => {
    if (!sheet?.exam?.termId || !sectionId) return;
    setConfirmBusy(subjectId);
    try {
      const r = await setMarksConfirmation(orgId, sectionId, subjectId, {
        termId: sheet.exam.termId,
        confirmed: !confirmations[subjectId],
      });
      setConfirmations(r.confirmations);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmBusy(null);
    }
  };
  // Map of `${studentId}:${classSubjectId}` → cell.
  const [cells, setCells] = useState<Map<string, CellState>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // The sheet as it looked when opened, and whether anything has been
  // written to the server since. Together they power "Discard this
  // session": auto-save means closing the page discards nothing, so a
  // trial run (Ambreen, 10 Sep) needs an explicit way back.
  const baselineRef = useRef<{ cells: Map<string, CellState>; defaultMax: string } | null>(null);
  const [savedThisSession, setSavedThisSession] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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
        // Saved rows snapshot the max the teacher saw, and echoing that
        // snapshot back into the little override box made EVERY saved
        // cell look hand-overridden ("why is there two boxes" — Ambreen,
        // 11 Sep). When the stored max simply agrees with the school's
        // distribution for this paper, keep the box empty; a number in
        // it now always means "this cell differs from the distribution"
        // — a real per-student override, or a mark saved before the
        // distribution was loaded, which the teacher can clear.
        const paper = paperOfExamName(r.exam?.name);
        const autoMax = new Map<string, number | null>();
        for (const s of r.subjects) {
          autoMax.set(s.id, subjectMaxForPaper(s.assessmentWeights, paper));
        }
        const next = new Map<string, CellState>();
        for (const stu of r.students) {
          for (const sc of stu.scores) {
            const key = `${stu.id}:${sc.classSubjectId}`;
            const auto = autoMax.get(sc.classSubjectId) ?? null;
            const isAuto = sc.maxMarks !== null && auto !== null && Number(sc.maxMarks) === auto;
            // An EMPTY cell's stored max measured nothing — it is the
            // stamp of a whole-sheet save, and letting it linger would
            // cap future marks at whatever the default was back then.
            const isStaleStamp = sc.obtainedMarks === null && !sc.absent;
            next.set(key, {
              obtained: sc.obtainedMarks === null ? "" : String(sc.obtainedMarks),
              maxOverride: sc.maxMarks === null || isAuto || isStaleStamp ? "" : String(sc.maxMarks),
              absent: sc.absent,
            });
          }
        }
        setCells(next);
        setConfirmations(r.confirmations ?? {});
        // Snapshot of the sheet AS OPENED — "Discard this session" puts
        // the server back to exactly this, undoing anything auto-save
        // already wrote (Ambreen's trial 20s were auto-saved within
        // seconds; closing the tab discarded nothing).
        baselineRef.current = { cells: new Map(next), defaultMax: stateRef.current.defaultMax };
        setSavedThisSession(false);
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
  const stateRef = useRef({ sheet, cells, defaultMax, sectionId, visibleSubjects });
  stateRef.current = { sheet, cells, defaultMax, sectionId, visibleSubjects };

  const doSave = useCallback(async () => {
    const { sheet: s, cells: cs, defaultMax: dm, sectionId: sid, visibleSubjects: subs } = stateRef.current;
    if (!s || !sid) return;
    setSaveStatus("saving");
    setError(null);
    try {
      const rows: any[] = [];
      const paper = paperOfExamName(s.exam?.name);
      // One bad cell fails the whole bulk save server-side, with a
      // message that names ids rather than people ("save nahi horahey",
      // Ambreen, 11 Sep — a stray value in one Science cell blocked the
      // sheet). Catch it here and point at the actual cell.
      for (const stu of s.students) {
        for (const subj of subs) {
          const c = cs.get(`${stu.id}:${subj.id}`);
          if (!c) continue;
          const cellName = `${stu.fullName} — ${subj.name}`;
          const mo = c.maxOverride === "" ? null : Number(c.maxOverride);
          if (mo !== null && (!Number.isFinite(mo) || mo <= 0)) {
            throw new Error(`${cellName}: the max (the small box) must be a positive number, got "${c.maxOverride}". Clear it to use the paper's own total.`);
          }
          if (!c.absent && c.obtained !== "") {
            const ob = Number(c.obtained);
            if (!Number.isFinite(ob) || ob < 0) {
              throw new Error(`${cellName}: marks must be 0 or more, got "${c.obtained}".`);
            }
            const mx = cellMax(c.maxOverride, subjectMaxForPaper(subj.assessmentWeights, paper), dm);
            if (Number.isFinite(mx) && mx > 0 && ob > mx) {
              throw new Error(`${cellName}: ${ob} is more than this paper's /${mx}.`);
            }
          }
        }
      }
      rows.push(...buildSheetRows(s, subs, cs, paper));
      const def = Number(dm);
      await saveMarksSheet(orgId, examId, {
        sectionId: sid,
        defaults: Number.isFinite(def) && def > 0 ? { maxMarks: def } : undefined,
        rows,
      });
      setSavedAt(new Date().toLocaleTimeString());
      setSavedThisSession(true);
      setSaveStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveStatus("error");
    }
  }, [orgId, examId]);

  // "Discard this session": write the OPENING snapshot back to the
  // server, undoing everything typed (and auto-saved) since the sheet
  // loaded. Nothing that was already on the sheet when it opened is
  // touched — this is an undo of the visit, not a wipe.
  const discardSession = useCallback(async () => {
    const base = baselineRef.current;
    const { sheet: s, sectionId: sid, visibleSubjects: subs } = stateRef.current;
    if (!base || !s || !sid) return;
    setConfirmDiscard(false);
    setSaveStatus("saving");
    setError(null);
    try {
      const paper = paperOfExamName(s.exam?.name);
      const def = Number(base.defaultMax);
      await saveMarksSheet(orgId, examId, {
        sectionId: sid,
        defaults: Number.isFinite(def) && def > 0 ? { maxMarks: def } : undefined,
        rows: buildSheetRows(s, subs, base.cells, paper),
      });
      setCells(new Map(base.cells));
      setDefaultMax(base.defaultMax);
      setSavedThisSession(false);
      setSavedAt(null);
      setSaveStatus("idle");
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
    const c = Math.max(0, Math.min(visibleSubjects.length - 1, colIdx));
    const el = inputRefs.current.get(`${r}:${c}`);
    if (el) { el.focus(); el.select(); }
  };
  const onCellKeyDown = (rowIdx: number, colIdx: number) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!sheet) return;
      const lastCol = visibleSubjects.length - 1;
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
            if (targetCol > visibleSubjects.length - 1) continue;
            const stuId = sheet.students[targetRow].id;
            const subjId = visibleSubjects[targetCol].id;
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
      for (const subj of visibleSubjects) {
        const c = cells.get(`${stu.id}:${subj.id}`);
        if (!c || c.absent || !c.obtained) continue;
        const o = Number(c.obtained);
        const mx = cellMax(c.maxOverride, subjectMax.get(subj.id) ?? null, defaultMax);
        if (!Number.isFinite(o) || !Number.isFinite(mx) || mx <= 0) continue;
        obt += o; max += mx; any = true;
      }
      m.set(stu.id, { obtained: obt, max, pct: any && max > 0 ? (obt / max) * 100 : null });
    }
    return m;
  }, [sheet, cells, defaultMax, subjectMax, visibleSubjects]);

  if (meLoading) return null;
  // Admins browse any section; teachers arrive via the section deep
  // link (the marks-sheet write endpoint checks their rights).
  if (!isOrgAdmin(me, orgId) && !presetSectionId) {
    return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;
  }

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
          {/* Auto-save means closing the page keeps everything, so a
              trial run needs an explicit way back: restore the sheet to
              how it looked when opened. Two clicks — the first only
              arms the red confirm — because this rewinds saved data. */}
          {(savedThisSession || saveStatus === "dirty" || saveStatus === "saving") && sheet && (
            confirmDiscard ? (
              <>
                <Button
                  size="sm" variant="destructive"
                  onClick={() => void discardSession()}
                  disabled={saveStatus === "saving"}
                >
                  Yes — undo everything from this visit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button
                size="sm" variant="outline"
                className="text-rose-700 border-rose-200 hover:bg-rose-50"
                onClick={() => setConfirmDiscard(true)}
              >
                Discard this session
              </Button>
            )
          )}
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
      ) : visibleSubjects.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">
          No subjects defined for this class — add them under class settings first.
        </CardContent></Card>
      ) : (
        <>
        {sheet.editableSubjectIds && (
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
            Showing only the subjects you teach in this section — other columns are entered by their own teachers.
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-2 py-2 sticky left-0 bg-slate-50 z-10">Student</th>
                {visibleSubjects.map((s) => {
                  // A column only still here because it holds marks the
                  // school's distribution says belong on the other paper.
                  const stray = !isOnThisPaper(s);
                  return (
                  <th
                    key={s.id}
                    className={
                      "text-center px-2 py-2 min-w-[120px] " +
                      (stray ? "bg-amber-50" : "")
                    }
                  >
                    {s.name}
                    {/* The green check: "my column for this term is
                        complete". Shown on every column the caller may
                        edit (the server enforces the same rule) — the
                        sign-off covers BOTH papers of the term at once,
                        and the tabulation sheet displays who signed. */}
                    {!stray && sheet.exam?.termId && (
                      confirmations[s.id] ? (
                        <button
                          type="button"
                          disabled={confirmBusy === s.id}
                          onClick={() => void toggleConfirm(s.id)}
                          className="mt-0.5 block mx-auto text-[10px] font-semibold normal-case text-emerald-700 hover:underline"
                          title={`Confirmed by ${confirmations[s.id].byName || "a teacher"} — click to undo`}
                        >
                          ✓ Confirmed
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={confirmBusy === s.id}
                          onClick={() => void toggleConfirm(s.id)}
                          className="mt-0.5 block mx-auto text-[10px] font-normal normal-case text-slate-400 hover:text-emerald-700 hover:underline"
                          title="Sign off this column for the term (covers oral + written)"
                        >
                          Mark column complete
                        </button>
                      )
                    )}
                    {stray ? (
                      <div className="mt-0.5 text-[10px] font-normal normal-case text-amber-700">
                        Not on this paper — clear these to remove the column
                      </div>
                    ) : (() => {
                      // Column header shows this paper's components and the
                      // total the school gives them, so the teacher can see
                      // what the /max means: "Written 50 · Dictation 10 — /60".
                      const paper = paperOfExamName(sheet.exam?.name);
                      const mine = (s.assessmentWeights ?? []).filter(
                        (w) => !paper || !w.paper || w.paper === paper,
                      );
                      if (mine.length === 0) return null;
                      const total = subjectMax.get(s.id) ?? null;
                      return (
                        <div className="mt-0.5 text-[10px] font-normal normal-case text-slate-400">
                          {mine
                            .map((w) => `${w.label} ${w.marks ?? `${w.pct}%`}`)
                            .join(" · ")}
                          {total !== null ? ` — /${total}` : ""}
                        </div>
                      );
                    })()}
                  </th>
                  );
                })}
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
                    {visibleSubjects.map((subj, colIdx) => {
                      const key = `${stu.id}:${subj.id}`;
                      const c = cells.get(key) ?? { obtained: "", maxOverride: "", absent: false };
                      const mx = cellMax(c.maxOverride, subjectMax.get(subj.id) ?? null, defaultMax);
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
                              // Over-max or negative marks turn the cell red
                              // BEFORE save — the server would refuse the
                              // whole sheet over one such cell.
                              className={
                                "h-7 w-14 text-center text-xs rounded-md border focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 " +
                                (ob !== null && (ob < 0 || (Number.isFinite(mx) && mx > 0 && ob > mx))
                                  ? "border-rose-400 text-rose-700 focus:ring-rose-400"
                                  : "border-slate-200 focus:ring-indigo-400")
                              }
                              // type="text" (numeric keypad on mobile), NOT
                              // type="number": the number spinner let arrow
                              // keys and stray clicks walk a cell to values
                              // like -2 ("the up and down arrow are not
                              // behaving", Ambreen, 11 Sep).
                              type="text" inputMode="numeric"
                              // Block default Tab order from reaching the
                              // max-override + absent checkbox so the
                              // sheet feels Excel-like.
                              tabIndex={0}
                            />
                            <span className="text-[10px] text-slate-400">/</span>
                            <Input
                              value={c.maxOverride}
                              onChange={(e) => setCell(key, { maxOverride: e.target.value })}
                              // The empty box hints at the max that actually
                              // applies: the school's total for this subject
                              // on this paper, not the sheet-wide default.
                              placeholder={String(subjectMax.get(subj.id) ?? defaultMax)}
                              // px-1 + md:text-xs: the base Input's px-3 and
                              // md:text-sm left ~22px of text room, so a
                              // two-digit max clipped to one digit — "25"
                              // read as "2" (Ambreen's photo, 11 Sep).
                              className="h-7 w-12 px-1 text-center text-xs md:text-xs text-slate-500"
                              type="text" inputMode="numeric"
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
        </>
      )}
    </div>
  );
}

export default MarksEntry;
