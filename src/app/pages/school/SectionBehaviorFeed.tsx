// SectionBehaviorFeed — section-wide behavior log timeline.
//
// Routed at /school/orgs/:orgId/sections/:sectionId/behavior. Includes a
// date-range picker (default last 30 days), a kind filter, and an
// "+ Add note" button that opens BehaviorLogEntry with a student picker
// drawn from listStudents for this section.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ChevronLeft, Plus, Sparkles, AlertTriangle } from "lucide-react";
import { HeroCard, cardBase, cardElev, sectionTitleClasses } from "../../components/school-ui";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  getSectionBehaviorNotes,
  deleteBehaviorNote,
  listStudents,
  getSchoolMe,
  isOrgAdmin,
  type AdminStudent,
  type BehaviorNote,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { BehaviorLogEntry } from "./BehaviorLogEntry";

type Filter = "all" | "positive" | "concern";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayIso(): string {
  return isoDaysAgo(0);
}

type TFn = (k: string, o?: Record<string, unknown>) => string;

function relTime(iso: string, t: TFn): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return t("behavior.justNow");
  if (m < 60) return t("behavior.minsAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("behavior.hoursAgo", { n: h });
  const d = Math.round(h / 24);
  return t("behavior.daysAgo", { n: d });
}

export function SectionBehaviorFeed() {
  const { t } = useTranslation();
  const { orgId = "", sectionId = "" } = useParams();
  const [startDate, setStartDate] = useState<string>(isoDaysAgo(30));
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [filter, setFilter] = useState<Filter>("all");
  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why the roster could not be loaded, if it could not. Without this the
  // picker opened with an empty dropdown and a dead "Next" button, and
  // nothing on screen said why — which reads as "I am not allowed to add
  // notes" (pilot, 6 Sep).
  const [rosterError, setRosterError] = useState<string | null>(null);
  // Undo a mistaken note (Ambreen, 8 Sep) — the delete endpoint always
  // existed (author or admin/principal); no feed surfaced it. Points,
  // leaderboards and the parent's view all recompute live, so deleting
  // truly undoes it.
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null));
  }, []);
  const canDelete = (n: BehaviorNote) =>
    isOrgAdmin(me, orgId) || (!!me?.userId && n.recordedBy === me.userId);
  const removeNote = async (n: BehaviorNote) => {
    if (!confirm(t("behavior.deleteConfirm"))) return;
    try {
      await deleteBehaviorNote(orgId, n.id);
      toast.success(t("behavior.deleted"));
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("behavior.deleteFailed"));
    }
  };
  // Add-note modal state: which student is being logged against.
  const [picker, setPicker] = useState<{ id: string; name: string } | null>(null);
  const [pickerSel, setPickerSel] = useState("");

  useEffect(() => {
    if (!orgId || !sectionId) return;
    setRosterError(null);
    listStudents(orgId, { classSectionId: sectionId })
      .then((r) => {
        setStudents(r);
        if (r.length === 0) setRosterError(t("behavior.noRoster"));
      })
      .catch((e) => setRosterError(e?.message || t("behavior.rosterFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId]);

  const load = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    setError(null);
    getSectionBehaviorNotes(orgId, sectionId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
      .then((r) => setNotes(r.notes))
      .catch((e) => setError(e?.message || t("behavior.loadFailed")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId, startDate, endDate]);

  const filtered = useMemo(
    () => (filter === "all" ? notes : notes.filter((n) => n.kind === filter)),
    [notes, filter],
  );

  // Group by yyyy-mm-dd in local time.
  const grouped = useMemo(() => {
    const m = new Map<string, BehaviorNote[]>();
    for (const n of filtered) {
      const d = new Date(n.observedAt);
      const pad = (x: number) => String(x).padStart(2, "0");
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const list = m.get(key);
      if (list) list.push(n);
      else m.set(key, [n]);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "all", label: t("behavior.all") },
    { key: "positive", label: t("behavior.positive") },
    { key: "concern", label: t("behavior.concern") },
  ];

  // Logging needs a roster to pick from. Better to explain than to open a
  // dialog whose only control is empty.
  const canAdd = students.length > 0 && !rosterError;

  // One-tap ranges (Muneeb, 8 Sep): teachers reach for "today's notes"
  // far more often than a custom range. The From/To inputs stay for
  // everything else; editing them just un-highlights the presets.
  const PRESETS = [
    { key: "today", days: 0, label: t("behavior.rangeToday") },
    { key: "week", days: 7, label: t("behavior.rangeWeek") },
    { key: "month", days: 30, label: t("behavior.rangeMonth") },
  ] as const;
  const activePreset =
    endDate !== todayIso()
      ? null
      : PRESETS.find((p) => startDate === isoDaysAgo(p.days))?.key ?? null;
  const applyPreset = (days: number) => {
    setStartDate(isoDaysAgo(days));
    setEndDate(todayIso());
  };

  const openPicker = () => {
    setPickerSel("");
    setPicker({ id: "__PICK__", name: "" });
  };
  const confirmPicker = () => {
    const s = students.find((x) => x.id === pickerSel);
    if (!s) return;
    setPicker({ id: s.id, name: s.full_name });
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title={t("behavior.title")}
        subtitle={t("behavior.subtitle")}
        rightSlot={
          <div className="flex flex-wrap items-end gap-2">
            <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.days)}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                    (activePreset === p.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-indigo-100 hover:text-white")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="sb-start" className="text-[10px] uppercase tracking-wide text-indigo-200">{t("behavior.from")}</Label>
              <Input
                id="sb-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <div>
              <Label htmlFor="sb-end" className="text-[10px] uppercase tracking-wide text-indigo-200">{t("behavior.to")}</Label>
              <Input
                id="sb-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                    (filter === f.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-indigo-100 hover:text-white")
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Link to={`/school/orgs/${orgId}/admin/classes`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("behavior.classes")}
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={openPicker}
              disabled={!canAdd}
              title={rosterError ?? undefined}
              className="bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              <Plus className="h-4 w-4 mr-1" /> {t("behavior.addNote")}
            </Button>
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card className={`${cardBase} ${cardElev}`}>
        <CardContent className="p-4">
          {loading && notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("behavior.loading")}</p>
          ) : filtered.length === 0 ? (
            // "No behavior notes in this range." was the whole empty state:
            // a flat statement in the card where the content belongs, with
            // the only useful control a small pill up in the header. A
            // teacher read it as a refusal and reported that she could not
            // add notes (pilot, 6 Sep). Say what is true and offer the way
            // forward — and separate "nothing logged" from "the filter is
            // hiding it", which are different problems.
            <div className="flex flex-col items-start gap-3 py-3">
              {notes.length > 0 ? (
                <>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t("behavior.filterEmptyTitle", { kind: t(`behavior.${filter}`) })}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {notes.length === 1
                        ? t("behavior.filterEmptyOne")
                        : t("behavior.filterEmptyMany", { count: notes.length })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                    {t("behavior.showAll")}
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t("behavior.emptyTitle")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("behavior.emptyBody")}
                    </p>
                  </div>
                  <Button size="sm" onClick={openPicker} disabled={!canAdd}>
                    <Plus className="h-4 w-4 mr-1" /> {t("behavior.addANote")}
                  </Button>
                </>
              )}
              {rosterError && (
                <p className="text-xs text-amber-700">{rosterError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([day, dayNotes]) => (
                <div key={day}>
                  <div className={`mb-2 ${sectionTitleClasses}`}>
                    {day}
                  </div>
                  <ul className="space-y-2">
                    {dayNotes.map((n) => {
                      const positive = n.kind === "positive";
                      return (
                        <li
                          key={n.id}
                          className={
                            "rounded-lg border p-3 " +
                            (positive
                              ? "border-emerald-100 bg-emerald-50/40"
                              : "border-rose-100 bg-rose-50/40")
                          }
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">
                              {positive ? (
                                <Sparkles className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-rose-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">
                                  {n.studentName || n.studentId.slice(0, 8)}
                                </span>
                                {n.grNumber && (
                                  <span className="text-xs font-mono text-slate-500">
                                    GR# {n.grNumber}
                                  </span>
                                )}
                                <Badge
                                  variant="outline"
                                  className={
                                    "text-[10px] uppercase tracking-wide " +
                                    (positive
                                      ? "border-emerald-300 text-emerald-700"
                                      : "border-rose-300 text-rose-700")
                                  }
                                >
                                  {t(`behavior.${n.kind}`)}
                                </Badge>
                                {n.category && (
                                  <span className="text-xs text-slate-700">{n.category}</span>
                                )}
                                <span
                                  className={
                                    "ml-auto text-xs font-semibold tabular-nums " +
                                    (n.points >= 0 ? "text-emerald-700" : "text-rose-700")
                                  }
                                >
                                  {n.points > 0 ? `+${n.points}` : n.points}
                                </span>
                                {canDelete(n) && (
                                  <button
                                    type="button"
                                    onClick={() => removeNote(n)}
                                    title={t("common.delete")}
                                    className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                                {n.notes}
                              </p>
                              <div className="mt-1 text-xs text-slate-500">
                                {relTime(n.observedAt, t)}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 1 — student picker. We model this as a tiny inline dialog using
          the same Dialog primitive BehaviorLogEntry uses, so the UX feels
          consistent. */}
      {picker?.id === "__PICK__" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{t("behavior.pickStudent")}</h2>
            {students.length === 0 && (
              <p className="mb-2 text-sm text-amber-700">
                {rosterError ?? t("behavior.noStudents")}
              </p>
            )}
            <Select value={pickerSel} onValueChange={setPickerSel}>
              <SelectTrigger>
                <SelectValue placeholder={t("behavior.selectStudent")} />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} (GR# {s.gr_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPicker(null)}>
                {t("behavior.cancel")}
              </Button>
              <Button onClick={confirmPicker} disabled={!pickerSel}>
                {t("behavior.next")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — actual log dialog once a student is chosen. */}
      {picker && picker.id !== "__PICK__" && (
        <BehaviorLogEntry
          orgId={orgId}
          studentId={picker.id}
          studentName={picker.name}
          defaultSectionId={sectionId}
          open={true}
          onOpenChange={(v) => {
            if (!v) setPicker(null);
          }}
          onSuccess={load}
        />
      )}
    </div>
  );
}
