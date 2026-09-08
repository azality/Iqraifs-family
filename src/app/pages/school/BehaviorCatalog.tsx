// Behavior categories — the school-wide list teachers pick from when
// logging behavior notes (BehaviorLogEntry).
//
// REWRITTEN (smoke-test fix): this page used to manage the KV-era
// trackable_items catalog via the legacy /organizations/:orgId/
// behavior-catalog endpoints — principal-gated, so the toolbar's admin
// entry 403'd, and the pilot's actual logging flow never read that list
// anyway. It now manages the Postgres behavior_category table through
// the same API BehaviorLogEntry consumes (list/create/update/archive,
// admin+principal writes). The backend auto-seeds a sensible default
// set (Adab, Akhlaq, Salah punctuality, …) on first read.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Archive,
  ArrowUp,
  ArrowDown,
  Heart,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  listBehaviorCategories,
  createBehaviorCategory,
  updateBehaviorCategory,
  archiveBehaviorCategory,
  listBehaviorCategorySuggestions,
  dismissBehaviorSuggestion,
  adoptBehaviorSuggestion,
  type BehaviorCategory,
  type BehaviorCategorySuggestion,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const KINDS: Array<{ value: BehaviorCategory["kind"]; label: string }> = [
  { value: "both", label: "Positive & concern" },
  { value: "positive", label: "Positive only" },
  { value: "concern", label: "Concern only" },
];

function kindBadge(kind: BehaviorCategory["kind"]) {
  if (kind === "positive") {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
        <Heart className="h-3 w-3 mr-1" /> Positive
      </Badge>
    );
  }
  if (kind === "concern") {
    return (
      <Badge className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-50">
        <AlertTriangle className="h-3 w-3 mr-1" /> Concern
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-100">
      Both
    </Badge>
  );
}

export function BehaviorCatalog() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [items, setItems] = useState<BehaviorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add / edit dialog state. `editing` null = create mode.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BehaviorCategory | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<BehaviorCategory["kind"]>("both");
  const [ptsPos, setPtsPos] = useState(1);
  const [ptsCon, setPtsCon] = useState(1);
  const [suggestions, setSuggestions] = useState<BehaviorCategorySuggestion[]>([]);
  // Adopt dialog: turn a free-typed suggestion into a category — either
  // merged into an existing one or created under a proper name — and
  // relabel the notes that used the raw text.
  const [adopting, setAdopting] = useState<BehaviorCategorySuggestion | null>(null);
  const [adoptMode, setAdoptMode] = useState<"existing" | "new">("new");
  const [adoptCategoryId, setAdoptCategoryId] = useState("");
  const [adoptLabel, setAdoptLabel] = useState("");
  const [adoptKind, setAdoptKind] = useState<BehaviorCategory["kind"]>("both");

  const runAdopt = async () => {
    if (!adopting) return;
    setSubmitting(true);
    try {
      const r = await adoptBehaviorSuggestion(orgId, {
        label: adopting.label,
        ...(adoptMode === "existing"
          ? { categoryId: adoptCategoryId }
          : { newCategory: { label: adoptLabel.trim(), kind: adoptKind } }),
      });
      toast.success(
        `Adopted as “${r.category.label}”` +
          (r.relabeled > 0 ? ` — ${r.relabeled} past note${r.relabeled === 1 ? "" : "s"} now count under it.` : "."),
      );
      setAdopting(null);
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not adopt suggestion");
    } finally {
      setSubmitting(false);
    }
  };

  const runDismiss = async (sg: BehaviorCategorySuggestion) => {
    try {
      await dismissBehaviorSuggestion(orgId, sg.label);
      toast.success(`Dismissed “${sg.label}” — the notes that used it are unchanged.`);
      setSuggestions((prev) => prev.filter((s) => s.label !== sg.label));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not dismiss");
    }
  };

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const reload = async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await listBehaviorCategories(orgId);
      setItems([...r.categories].sort((a, b) => a.sortOrder - b.sortOrder));
      listBehaviorCategorySuggestions(orgId)
        .then((sg) => setSuggestions(sg.suggestions))
        .catch(() => setSuggestions([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (meLoading) return null;
  // Toolbar exposes this page in the Admin group (admin + principal).
  if (!isOrgAdmin(me, orgId)) return <NoAccessRedirect />;

  const openCreate = (prefillLabel?: string) => {
    setEditing(null);
    setLabel(prefillLabel ?? "");
    setKind("both");
    setPtsPos(1);
    setPtsCon(1);
    setDialogOpen(true);
  };

  const openEdit = (c: BehaviorCategory) => {
    setEditing(c);
    setLabel(c.label);
    setKind(c.kind);
    setPtsPos(c.pointsPositive ?? 1);
    setPtsCon(c.pointsConcern ?? 1);
    setDialogOpen(true);
  };

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Label required");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateBehaviorCategory(orgId, editing.id, { label: trimmed, kind, pointsPositive: ptsPos, pointsConcern: ptsCon });
        toast.success(`Updated "${trimmed}"`);
      } else {
        // New entries go to the end of the list.
        const maxOrder = items.reduce((m, c) => Math.max(m, c.sortOrder), 0);
        await createBehaviorCategory(orgId, { label: trimmed, kind, sortOrder: maxOrder + 10, pointsPositive: ptsPos, pointsConcern: ptsCon });
        toast.success(`Added "${trimmed}"`);
      }
      setDialogOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the category.");
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (c: BehaviorCategory) => {
    if (!confirm(`Archive "${c.label}"? Teachers will no longer see it when logging behavior. Existing notes keep it.`)) return;
    try {
      await archiveBehaviorCategory(orgId, c.id);
      toast.success(`Archived "${c.label}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not archive the category.");
    }
    await reload();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[idx];
    const b = items[j];
    // Swap sort orders; two small PATCHes. Optimistically reorder locally
    // so the row moves immediately.
    const next = items.slice();
    next[idx] = b;
    next[j] = a;
    setItems(next);
    try {
      await Promise.all([
        updateBehaviorCategory(orgId, a.id, { sortOrder: b.sortOrder }),
        updateBehaviorCategory(orgId, b.id, { sortOrder: a.sortOrder }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder.");
    }
    await reload();
  };

  return (
    <div className="space-y-6">
      <Link
        to={`/school/orgs/${orgId}/admin`}
        className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-3 w-3" />
        Admin
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Behavior categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The list teachers pick from when logging behavior notes. A
            starter set is seeded automatically — rename, reorder, or
            archive to match your school's language.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-2" />
          Add category
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-slate-500">
            No categories yet. Click "Add category" to create the first one.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {items.map((c, idx) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      aria-label={`Move ${c.label} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === items.length - 1}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      aria-label={`Move ${c.label} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-900">{c.label}</span>
                  <span className="text-xs tabular-nums text-slate-500 whitespace-nowrap">
                    {(c.kind === "positive" || c.kind === "both") && (
                      <span className="text-emerald-700 font-medium">+{c.pointsPositive ?? 1}</span>
                    )}
                    {c.kind === "both" && " / "}
                    {(c.kind === "concern" || c.kind === "both") && (
                      <span className="text-rose-700 font-medium">−{c.pointsConcern ?? 1}</span>
                    )}
                  </span>
                  {kindBadge(c.kind)}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => archive(c)} title="Archive">
                    <Archive className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Teacher suggestions — "Other" free-text entries not in the
          catalog. This is the school's feedback loop: recurring ones are
          categories worth adding. */}
      {suggestions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Suggested by teachers
              <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                {suggestions.length}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Behaviors teachers logged under "Other" (last 90 days). Add the
              recurring ones so everyone picks from the same list.
            </p>
            <ul className="mt-2 divide-y divide-slate-100">
              {suggestions.map((sg) => (
                <li key={sg.label} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {sg.label}
                      <span className="ml-2 text-[10px] text-slate-400">
                        used {sg.count} time{sg.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    {/* Who said it and where — the context the admin needs
                        to decide adopt-as vs dismiss. */}
                    {((sg.suggestedBy ?? []).length > 0 || (sg.usedIn ?? []).length > 0) && (
                      <div className="text-[11px] text-slate-500">
                        {(sg.suggestedBy ?? []).join(", ")}
                        {(sg.usedIn ?? []).length > 0 && <> · in {(sg.usedIn ?? []).join(", ")}</>}
                      </div>
                    )}
                    {sg.sampleNote && (
                      <div className="truncate text-[11px] text-slate-400">"{sg.sampleNote}"</div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAdopting(sg);
                        setAdoptMode("new");
                        setAdoptLabel(sg.label);
                        setAdoptKind(
                          sg.kinds.length === 1 ? (sg.kinds[0] as BehaviorCategory["kind"]) : "both",
                        );
                        setAdoptCategoryId(items.find((i) => !i.archivedAt)?.id ?? "");
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adopt…
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500"
                      onClick={() => runDismiss(sg)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Adopt dialog — a suggestion becomes a category under the name
          the SCHOOL means ("try to be regular" → Punctuality), and the
          past notes move with it. */}
      <Dialog open={!!adopting} onOpenChange={(v) => { if (!v) setAdopting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adopt “{adopting?.label}”</DialogTitle>
            <DialogDescription>
              The {adopting?.count ?? 0} note{(adopting?.count ?? 0) === 1 ? "" : "s"} logged with this
              text will be re-filed under the category you choose — the teacher who observed each one
              stays on the note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={adoptMode === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setAdoptMode("new")}
              >
                As a new category
              </Button>
              <Button
                type="button"
                variant={adoptMode === "existing" ? "default" : "outline"}
                size="sm"
                onClick={() => setAdoptMode("existing")}
              >
                Into an existing one
              </Button>
            </div>
            {adoptMode === "new" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="adopt-label">Category name</Label>
                  <Input
                    id="adopt-label"
                    value={adoptLabel}
                    onChange={(e) => setAdoptLabel(e.target.value)}
                    placeholder="e.g. Punctuality"
                  />
                  <p className="text-[11px] text-slate-500">
                    Rename it to what the school means — “try to be regular” is advice; the behavior is
                    punctuality.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Applies to</Label>
                  <Select value={adoptKind} onValueChange={(v) => setAdoptKind(v as BehaviorCategory["kind"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Merge into</Label>
                <Select value={adoptCategoryId} onValueChange={setAdoptCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Pick a category…" /></SelectTrigger>
                  <SelectContent>
                    {items.filter((i) => !i.archivedAt).map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdopting(null)}>Cancel</Button>
            <Button
              onClick={runAdopt}
              disabled={submitting || (adoptMode === "new" ? !adoptLabel.trim() : !adoptCategoryId)}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adopt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Renames apply going forward; existing notes keep their recorded label."
                : "Teachers see this label in the behavior log form."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-label">Label</Label>
              <Input
                id="cat-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Salah punctuality"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as BehaviorCategory["kind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(kind === "positive" || kind === "both") && (
                <div className="space-y-1.5">
                  <Label htmlFor="cat-pp">Points when positive</Label>
                  <Input
                    id="cat-pp"
                    type="number"
                    min={0}
                    max={10}
                    value={ptsPos}
                    onChange={(e) => setPtsPos(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                  />
                </div>
              )}
              {(kind === "concern" || kind === "both") && (
                <div className="space-y-1.5">
                  <Label htmlFor="cat-pc">Points deducted when concern</Label>
                  <Input
                    id="cat-pc"
                    type="number"
                    min={0}
                    max={10}
                    value={ptsCon}
                    onChange={(e) => setPtsCon(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              These values apply automatically whenever a teacher picks this
              category — the same act earns the same points in every class.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BehaviorCatalog;
