// ManageGradeScales — admin defines letter-grade boundaries per org.
//
// Each scale is a list of bands (letter + min% + max% + remark). The
// scale flagged is_default drives the report-card endpoint's letter +
// remark output for every subject and the overall row.
//
// Bands must cover 0..100 with no gaps or overlaps — server enforces
// this; UI shows a contiguous-from-top inline preview so misalignments
// are obvious before save. We sort top-down (A+ first, F last).

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Plus, Trash2, Star, StarOff, Save, GripVertical, Award,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import {
  getSchoolMe, isOrgAdmin,
  listGradeScales, createGradeScale, updateGradeScale, archiveGradeScale,
  replaceGradeScaleBands,
  type GradeBand, type GradeScale, type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

const STARTER_BANDS: GradeBand[] = [
  { letter: "A+", minPct: 90, maxPct: 100, remark: "Excellent" },
  { letter: "A",  minPct: 80, maxPct: 90,  remark: "Very good" },
  { letter: "B",  minPct: 70, maxPct: 80,  remark: "Good" },
  { letter: "C",  minPct: 60, maxPct: 70,  remark: "Satisfactory" },
  { letter: "D",  minPct: 50, maxPct: 60,  remark: "Needs improvement" },
  { letter: "F",  minPct: 0,  maxPct: 50,  remark: "Unsatisfactory" },
];

export function ManageGradeScales() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [search, setSearch] = useSearchParams();
  const selectedScaleId = search.get("scale") || "";
  const setSelectedScaleId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("scale", id); else next.delete("scale");
    setSearch(next);
  };

  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [scales, setScales] = useState<GradeScale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState(true);

  const [draft, setDraft] = useState<GradeBand[]>([]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listGradeScales(orgId)
      .then((r) => {
        setScales(r.scales);
        if (!selectedScaleId && r.scales.length > 0) {
          const cur = r.scales.find((s) => s.isDefault) ?? r.scales[0];
          setSelectedScaleId(cur.id);
        }
      })
      .catch(() => {});
  };
  useEffect(refresh, [orgId]);

  const selected = useMemo(
    () => scales.find((s) => s.id === selectedScaleId) ?? null,
    [scales, selectedScaleId],
  );

  useEffect(() => {
    if (!selected) { setDraft([]); return; }
    // Sort top-down for editing.
    setDraft([...selected.bands].sort((a, b) => b.minPct - a.minPct));
  }, [selected?.id, selected?.bands]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const r = await createGradeScale(orgId, { name: newName.trim(), isDefault: newDefault });
      // Seed with starter bands so the admin has something to edit.
      await replaceGradeScaleBands(orgId, r.scale.id, STARTER_BANDS);
      setAddOpen(false);
      setNewName(""); setNewDefault(true);
      refresh();
      setSelectedScaleId(r.scale.id);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleMakeDefault = async (s: GradeScale) => {
    try { await updateGradeScale(orgId, s.id, { isDefault: true }); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const handleArchive = async (s: GradeScale) => {
    if (!confirm(`Archive "${s.name}"? Report cards will fall back to the org's other default (or the built-in scale).`)) return;
    try { await archiveGradeScale(orgId, s.id); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleSaveBands = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await replaceGradeScaleBands(orgId, selected.id, draft);
      setError(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  const setBand = (i: number, patch: Partial<GradeBand>) => {
    setDraft((prev) => prev.map((b, j) => j === i ? { ...b, ...patch } : b));
  };
  const addBand = () => {
    setDraft((prev) => [...prev, { letter: "?", minPct: 0, maxPct: 0, remark: null }]);
  };
  const removeBand = (i: number) => {
    setDraft((prev) => prev.filter((_, j) => j !== i));
  };

  // Inline coverage check — colours the row red if the next band's
  // max doesn't equal this band's min (sorted top-down).
  const sortedDraft = [...draft].sort((a, b) => b.minPct - a.minPct);
  const issues: Record<number, string> = {};
  for (let i = 0; i < sortedDraft.length; i++) {
    const b = sortedDraft[i];
    if (!(b.maxPct > b.minPct || (b.maxPct === 100 && b.minPct === 100))) {
      issues[i] = "max must be > min";
    }
    if (i < sortedDraft.length - 1 && b.minPct !== sortedDraft[i + 1].maxPct) {
      issues[i] = (issues[i] ? issues[i] + " · " : "") + "gap/overlap with band below";
    }
  }
  if (sortedDraft.length > 0 && sortedDraft[0].maxPct !== 100) {
    issues[0] = (issues[0] ? issues[0] + " · " : "") + "top band must reach 100";
  }
  if (sortedDraft.length > 0 && sortedDraft[sortedDraft.length - 1].minPct !== 0) {
    issues[sortedDraft.length - 1] =
      (issues[sortedDraft.length - 1] ? issues[sortedDraft.length - 1] + " · " : "")
      + "bottom band must reach 0";
  }
  const hasIssues = Object.keys(issues).length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
      </div>
      <div>
        <h1 className={sectionTitleClasses}>Grade scales</h1>
        <p className="mt-1 text-sm text-slate-600">
          Define letter-grade boundaries. The scale marked as <strong>default</strong>
          drives every report card's letters + remarks. Bands must cover 0–100
          with no gaps or overlaps.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Scales</h2>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add scale</Button>
        </div>
        {scales.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-slate-500 italic">
            No scales yet. Report cards fall back to a built-in A+/A/B/C/D/F scale until you add one.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {scales.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedScaleId(s.id)}
                className={
                  "text-left rounded-lg border p-3 transition " +
                  (s.id === selectedScaleId
                    ? "border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/50"
                    : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900 text-sm flex items-center gap-2">
                    <Award className="h-3.5 w-3.5 text-amber-500" />
                    {s.name}
                    {s.isDefault && (
                      <span className="inline-flex items-center rounded-full bg-emerald-600 text-white text-[10px] font-medium px-2 py-0.5">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {!s.isDefault && (
                      <button onClick={(e) => { e.stopPropagation(); handleMakeDefault(s); }}
                        className="opacity-50 hover:opacity-100 p-1" title="Make default">
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {s.isDefault && (
                      <span className="opacity-50 p-1" title="Already default">
                        <StarOff className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleArchive(s); }}
                      className="opacity-50 hover:opacity-100 p-1 text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {s.bands.length} band{s.bands.length === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Bands — {selected.name}
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={addBand}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add band
              </Button>
              <Button size="sm" onClick={handleSaveBands} disabled={saving || hasIssues}>
                <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save bands"}
              </Button>
            </div>
          </div>
          {hasIssues && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Fix the highlighted bands before saving — every percentage from 0 to 100 must map to exactly one band.
            </div>
          )}
          <div className="space-y-1.5">
            {sortedDraft.map((b, i) => {
              const realIndex = draft.indexOf(b);
              const bad = !!issues[i];
              return (
                <div
                  key={realIndex}
                  className={
                    "rounded-lg border px-2 py-1.5 flex items-center gap-2 flex-wrap " +
                    (bad ? "border-rose-300 bg-rose-50/60" : "border-slate-200 bg-white")
                  }
                >
                  <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  <div className="w-20">
                    <Input value={b.letter}
                      onChange={(e) => setBand(realIndex, { letter: e.target.value })}
                      className="h-8 text-sm text-center font-semibold" />
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <Input type="number" inputMode="decimal" step="0.1" min={0} max={100}
                      value={b.minPct} onChange={(e) => setBand(realIndex, { minPct: Number(e.target.value) })}
                      className="h-8 w-20 text-center" />
                    <span className="text-slate-400">≤ % &lt;</span>
                    <Input type="number" inputMode="decimal" step="0.1" min={0} max={100}
                      value={b.maxPct} onChange={(e) => setBand(realIndex, { maxPct: Number(e.target.value) })}
                      className="h-8 w-20 text-center" />
                  </div>
                  <Input value={b.remark ?? ""}
                    onChange={(e) => setBand(realIndex, { remark: e.target.value || null })}
                    placeholder="Remark" className="h-8 text-sm flex-1 min-w-[160px]" />
                  <button onClick={() => removeBand(realIndex)}
                    className="opacity-50 hover:opacity-100 text-rose-700 p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {bad && <div className="basis-full text-[11px] text-rose-700">{issues[i]}</div>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add grade scale</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Iqra Academy scale" className="h-9 text-sm" /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} />
              Mark as default
            </label>
            <p className="text-[11px] text-slate-500 italic">
              A starter A+/A/B/C/D/F set will be added — edit before reports go out.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManageGradeScales;
