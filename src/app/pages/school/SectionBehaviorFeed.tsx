// SectionBehaviorFeed — section-wide behavior log timeline.
//
// Routed at /school/orgs/:orgId/sections/:sectionId/behavior. Includes a
// date-range picker (default last 30 days), a kind filter, and an
// "+ Add note" button that opens BehaviorLogEntry with a student picker
// drawn from listStudents for this section.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
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
import {
  getSectionBehaviorNotes,
  listStudents,
  type AdminStudent,
  type BehaviorNote,
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

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function SectionBehaviorFeed() {
  const { orgId = "", sectionId = "" } = useParams();
  const [startDate, setStartDate] = useState<string>(isoDaysAgo(30));
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [filter, setFilter] = useState<Filter>("all");
  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Add-note modal state: which student is being logged against.
  const [picker, setPicker] = useState<{ id: string; name: string } | null>(null);
  const [pickerSel, setPickerSel] = useState("");

  useEffect(() => {
    if (!orgId || !sectionId) return;
    listStudents(orgId, { classSectionId: sectionId }).then(setStudents).catch(() => {});
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
      .catch((e) => setError(e?.message || "Failed to load notes"))
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
    { key: "all", label: "All" },
    { key: "positive", label: "Positive" },
    { key: "concern", label: "Concern" },
  ];

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
        title="Behavior log"
        subtitle="Positive and concern notes for this section"
        rightSlot={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="sb-start" className="text-[10px] uppercase tracking-wide text-indigo-200">From</Label>
              <Input
                id="sb-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <div>
              <Label htmlFor="sb-end" className="text-[10px] uppercase tracking-wide text-indigo-200">To</Label>
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
                <ChevronLeft className="h-4 w-4 mr-1" /> Classes
              </Button>
            </Link>
            <Button size="sm" onClick={openPicker} className="bg-white text-slate-900 hover:bg-slate-100">
              <Plus className="h-4 w-4 mr-1" /> Add note
            </Button>
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card className={`${cardBase} ${cardElev}`}>
        <CardContent className="p-4">
          {loading && notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No behavior notes in this range.</p>
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
                                  {n.kind}
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
                              </div>
                              <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                                {n.notes}
                              </p>
                              <div className="mt-1 text-xs text-slate-500">
                                {relTime(n.observedAt)}
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
            <h2 className="text-lg font-semibold mb-2">Pick a student</h2>
            <Select value={pickerSel} onValueChange={setPickerSel}>
              <SelectTrigger>
                <SelectValue placeholder="Select student…" />
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
                Cancel
              </Button>
              <Button onClick={confirmPicker} disabled={!pickerSel}>
                Next
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
