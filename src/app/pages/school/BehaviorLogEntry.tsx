// BehaviorLogEntry — modal for logging a positive or concern behavior note
// against a single student. Used from ManageStudents (per-row "Log behavior")
// and from SectionBehaviorFeed (the "+ Add note" button, in which case the
// caller picks the student first and passes studentId/studentName here).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  postBehaviorNote,
  listBehaviorCategories,
  viewerRoleForOrg,
  type BehaviorNoteKind,
  type BehaviorCategory,
} from "../../../utils/schoolApi";
import { useWorkspace } from "../../contexts/WorkspaceContext";

interface Props {
  orgId: string;
  studentId: string;
  studentName: string;
  defaultSectionId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

// Fallback list if the org's behavior_category fetch fails (rare). New
// orgs lazy-seed an Islamic-context default set on first read; admins can
// rename / archive via the catalog page.
const FALLBACK_POSITIVE = ["Adab", "Akhlaq", "Helpfulness", "Effort", "Quran etiquette"];
const FALLBACK_CONCERN = ["Disruption", "Late assignment", "Attendance", "Behaviour toward peers"];

// datetime-local strings are local-time without timezone. We use this to
// compute defaults and the "max 14 days back" floor.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BehaviorLogEntry({
  orgId,
  studentId,
  studentName,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<BehaviorNoteKind>("positive");
  const [category, setCategory] = useState("");
  const [isOther, setIsOther] = useState(false);
  const [points, setPoints] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [observedAt, setObservedAt] = useState<string>(() => toLocalInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgCategories, setOrgCategories] = useState<BehaviorCategory[] | null>(null);

  // Points policy: school-set per category. Teachers see the value but
  // can't change it (the backend enforces the same rule); admin/principal
  // can override. "Other" free-text entries are bounded to ±3.
  const { me: schoolMe } = useWorkspace();
  const viewerRole = viewerRoleForOrg(schoolMe, orgId);
  const isAdmin = viewerRole === "admin" || viewerRole === "principal";

  // Lazy-load the org's configured category list when the dialog opens.
  // Cached for subsequent opens via state retention.
  useEffect(() => {
    if (!open || orgCategories) return;
    listBehaviorCategories(orgId)
      .then((r) => setOrgCategories(r.categories))
      .catch(() => setOrgCategories([]));
  }, [open, orgId, orgCategories]);

  // Whenever the modal opens, reset to a clean positive +1 default.
  useEffect(() => {
    if (open) {
      setKind("positive");
      setCategory("");
      setIsOther(false);
      setPoints(1);
      setNotes("");
      setObservedAt(toLocalInput(new Date()));
      setError(null);
    }
  }, [open]);

  // Kind change resets the selection — a category's value differs by kind.
  useEffect(() => {
    setCategory("");
    setIsOther(false);
    setPoints(kind === "positive" ? 1 : -1);
  }, [kind]);

  // Catalog categories matching this kind ("both" matches either).
  const categories: BehaviorCategory[] = (() => {
    if (orgCategories && orgCategories.length > 0) {
      return orgCategories.filter((c) => c.kind === kind || c.kind === "both");
    }
    // Fetch not landed / failed — fall back to name-only entries at ±1.
    const names = kind === "positive" ? FALLBACK_POSITIVE : FALLBACK_CONCERN;
    return names.map((label, i) => ({
      id: `fallback-${i}`, orgId, key: label, label, kind,
      sortOrder: i, pointsPositive: 1, pointsConcern: 1, archivedAt: null,
    }));
  })();

  const categoryPoints = (c: BehaviorCategory): number =>
    kind === "positive" ? Math.abs(c.pointsPositive ?? 1) : -Math.abs(c.pointsConcern ?? 1);

  const pickCategory = (c: BehaviorCategory) => {
    setIsOther(false);
    setCategory(c.label);
    setPoints(categoryPoints(c));
  };
  const pickOther = () => {
    setIsOther(true);
    setCategory("");
    setPoints(kind === "positive" ? 1 : -1);
  };
  const minObserved = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return toLocalInput(d);
  })();
  const maxObserved = toLocalInput(new Date());

  const submit = async () => {
    setError(null);
    if (!category.trim()) {
      setError(t(isOther ? "behavior.errNameBehavior" : "behavior.errPickCategory"));
      return;
    }
    if (!notes.trim()) {
      setError(t("behavior.errNotes"));
      return;
    }
    if (kind === "positive" && points < 0) {
      setError(t("behavior.errPositivePoints"));
      return;
    }
    if (kind === "concern" && points > 0) {
      setError(t("behavior.errConcernPoints"));
      return;
    }
    setSubmitting(true);
    try {
      await postBehaviorNote(orgId, {
        studentId,
        kind,
        category: category || undefined,
        points,
        notes: notes.trim(),
        // Convert local-time input to ISO so the server stores UTC.
        observedAt: observedAt ? new Date(observedAt).toISOString() : undefined,
      });
      toast.success(t("behavior.saved", { name: studentName }));
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("behavior.logTitle", { name: studentName })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind toggle (radio-like) */}
          <div>
            <Label className="mb-1.5 block">{t("behavior.kind")}</Label>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setKind("positive")}
                className={
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                  (kind === "positive"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900")
                }
              >
                {t("behavior.positive")}
              </button>
              <button
                type="button"
                onClick={() => setKind("concern")}
                className={
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                  (kind === "concern"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900")
                }
              >
                {t("behavior.concern")}
              </button>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">{t("behavior.category")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const active = !isOther && category === c.label;
                const pts = categoryPoints(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickCategory(c)}
                    className={
                      "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? kind === "positive"
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                          : "border-rose-400 bg-rose-50 text-rose-900"
                        : "border-slate-200 text-slate-700 hover:border-slate-300")
                    }
                  >
                    {c.label}{" "}
                    <span className={kind === "positive" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
                      {pts > 0 ? `+${pts}` : pts}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={pickOther}
                className={
                  "rounded-full border border-dashed px-3 py-1.5 text-sm transition-colors " +
                  (isOther
                    ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                    : "border-slate-300 text-slate-500 hover:border-slate-400")
                }
              >
                {t("behavior.other")}
              </button>
            </div>

            {isOther && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t("behavior.otherPlaceholder")}
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("behavior.otherHint")}
                  </p>
                </div>
                <div>
                  <Input
                    type="number"
                    value={points}
                    min={kind === "positive" ? 1 : -3}
                    max={kind === "positive" ? 3 : -1}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    title={t("behavior.pointsLimitTitle")}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("behavior.otherMax", { max: kind === "positive" ? "+3" : "−3" })}
                  </p>
                </div>
              </div>
            )}

            {!isOther && category && (
              <p className="mt-2 text-xs text-muted-foreground">
                {isAdmin ? (
                  <>
                    {t("behavior.pointsLabel")}{" "}
                    <Input
                      type="number"
                      value={points}
                      onChange={(e) => setPoints(Number(e.target.value))}
                      className="ml-1 inline-block h-7 w-20 align-middle"
                    />{" "}
                    {t("behavior.pointsAdmin", {
                      value: points > 0 ? `+${points}` : points,
                    })}
                  </>
                ) : (
                  <>
                    {t("behavior.pointsLabel")}{" "}
                    <span className="font-semibold">{points > 0 ? `+${points}` : points}</span>{" "}
                    — {t("behavior.pointsTeacher")}
                  </>
                )}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="bh-notes">{t("behavior.notesLabel")}</Label>
            <Textarea
              id="bh-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={t("behavior.notesPlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="bh-when">{t("behavior.observedAt")}</Label>
            <Input
              id="bh-when"
              type="datetime-local"
              value={observedAt}
              min={minObserved}
              max={maxObserved}
              onChange={(e) => setObservedAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("behavior.observedHint")}
            </p>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("behavior.cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? t("behavior.saving") : t("behavior.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
