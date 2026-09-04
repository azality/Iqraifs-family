// Hifz Round Mode (design 6a/6b) — the focused screen a hifz teacher
// lives in during the daily round. Replaces walking the per-student
// modal: one screen per student with sabaq / sabqi / manzil as three
// one-line rows, portions prefilled as continuations of yesterday,
// quality as tap chips, a mistakes stepper, and an auto-written parent
// note. Leaving a kind untouched logs nothing for it. Saving the sabaq
// auto-assigns the next lesson (advance on excellent/good, repeat on
// weak/repeat) — the old checkbox is now default behavior.
//
// The queue rail (desktop) shows done ✓ / now / next; students can be
// dragged to reorder and "Absent / missed today" records the miss for
// the parent's 14-day grid and moves on. Students already heard today
// (summary `today` flags) start pre-checked, so re-entering the round
// after a pause resumes where it left off.
//
// The existing HifzLogEntry modal remains for one-off logging from the
// list's Log button.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  getStudentHifz,
  postHifzEntry,
  type HifzEntry,
  type HifzEntryInput,
  type HifzQuality,
  type SectionHifzSummaryRow,
} from "../../../utils/schoolApi";
import { SURAHS, getSurah } from "../../../utils/quranSurahs";

interface Props {
  orgId: string;
  sectionLabel: string;
  roster: SectionHifzSummaryRow[];
  onExit: () => void;
  /** Fired after any entries are written — parent bumps its reloadKey. */
  onSaved: () => void;
}

type KindKey = "sabaq" | "sabqi" | "manzil";
type StudentStatus = "pending" | "heard" | "absent";

// Same juz-start convention as HifzLogEntry — the stored position marker
// for para-mode entries (display-only; totals only count memorized+sabaq).
const JUZ_STARTS: ReadonlyArray<{ surah: number; ayah: number }> = [
  { surah: 1, ayah: 1 }, { surah: 2, ayah: 142 }, { surah: 2, ayah: 253 },
  { surah: 3, ayah: 93 }, { surah: 4, ayah: 24 }, { surah: 4, ayah: 148 },
  { surah: 5, ayah: 82 }, { surah: 6, ayah: 111 }, { surah: 7, ayah: 88 },
  { surah: 8, ayah: 41 }, { surah: 9, ayah: 93 }, { surah: 11, ayah: 6 },
  { surah: 12, ayah: 53 }, { surah: 15, ayah: 1 }, { surah: 17, ayah: 1 },
  { surah: 18, ayah: 75 }, { surah: 21, ayah: 1 }, { surah: 23, ayah: 1 },
  { surah: 25, ayah: 21 }, { surah: 27, ayah: 56 }, { surah: 29, ayah: 46 },
  { surah: 33, ayah: 31 }, { surah: 36, ayah: 28 }, { surah: 39, ayah: 32 },
  { surah: 41, ayah: 47 }, { surah: 46, ayah: 1 }, { surah: 51, ayah: 31 },
  { surah: 58, ayah: 1 }, { surah: 67, ayah: 1 }, { surah: 78, ayah: 1 },
];

function serializeNextSabaq(surahNumber: number, from: number, to: number): string {
  const s = getSurah(surahNumber);
  return `Sabaq: ${s?.nameTransliterated ?? surahNumber} ${from}–${to}`;
}
function parseNextSabaq(text: string): { surahNumber: number; from: number; to: number } | null {
  const m = /^Sabaq:\s*(.+?)\s+(\d+)\s*[–-]\s*(\d+)\s*$/.exec(text.trim());
  if (!m) return null;
  const name = m[1].toLowerCase();
  const surah = SURAHS.find((s) => s.nameTransliterated.toLowerCase() === name);
  if (!surah) return null;
  return { surahNumber: surah.number, from: Number(m[2]), to: Number(m[3]) };
}

const EXTENT_LABEL: Record<string, string> = {
  quarter: "¼",
  half: "½",
  three_quarters: "¾",
  full: "full",
};

interface PortionState {
  mode: "surah" | "para";
  surah: number;
  from: number;
  to: number;
  juz: number;
  extent: string; // 'full' | 'quarter' | 'half' | 'three_quarters' | 'to_surah'
  toSurah: number;
}
interface KindState {
  portion: PortionState;
  /** Empty = untouched → this kind logs nothing. "repeat" maps to the
   *  stored needs_practice quality. */
  quality: "" | "excellent" | "good" | "weak" | "repeat";
  mistakes: number;
  editorOpen: boolean;
}

const emptyPortion = (): PortionState => ({
  mode: "surah", surah: 1, from: 1, to: 1, juz: 1, extent: "full", toSurah: 1,
});
const emptyKind = (mode: "surah" | "para" = "surah"): KindState => ({
  portion: { ...emptyPortion(), mode },
  quality: "",
  mistakes: 0,
  editorOpen: false,
});

function portionLabel(p: PortionState): string {
  if (p.mode === "para") {
    const ext = p.extent === "to_surah"
      ? `to ${getSurah(p.toSurah)?.nameTransliterated ?? p.toSurah}`
      : EXTENT_LABEL[p.extent] ?? p.extent;
    return `Juz ${p.juz}${ext === "full" ? "" : ` (${ext})`}`;
  }
  const s = getSurah(p.surah);
  return `${s?.nameTransliterated ?? p.surah} ${p.from}–${p.to}`;
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w.charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

const QUALITY_CHIPS: Array<{ key: KindState["quality"]; label: string }> = [
  { key: "excellent", label: "Excellent" },
  { key: "good", label: "Good" },
  { key: "weak", label: "Weak" },
  { key: "repeat", label: "Repeat" },
];
const STORED_QUALITY: Record<string, HifzQuality> = {
  excellent: "excellent",
  good: "good",
  weak: "weak",
  repeat: "needs_practice",
};

const KIND_META: Array<{ key: KindKey; label: string; sub: string }> = [
  { key: "sabaq", label: "Sabaq", sub: "new lesson" },
  { key: "sabqi", label: "Sabqi", sub: "recent revision" },
  { key: "manzil", label: "Manzil", sub: "old revision" },
];

export function HifzRoundMode({ orgId, sectionLabel, roster, onExit, onSaved }: Props) {
  // Queue order + status. Students already heard today resume as done.
  const [queue, setQueue] = useState<string[]>(() => roster.map((r) => r.studentId));
  const [status, setStatus] = useState<Record<string, StudentStatus>>(() => {
    const m: Record<string, StudentStatus> = {};
    for (const r of roster) {
      const t = r.today;
      m[r.studentId] = t && (t.sabaq || t.sabqi || t.manzil) ? "heard" : "pending";
    }
    return m;
  });
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const first = roster.find((r) => {
      const t = r.today;
      return !(t && (t.sabaq || t.sabqi || t.manzil));
    });
    return first?.studentId ?? null;
  });
  const startedAt = useRef(new Date());
  const rosterById = useMemo(() => {
    const m = new Map<string, SectionHifzSummaryRow>();
    for (const r of roster) m.set(r.studentId, r);
    return m;
  }, [roster]);

  // ── Per-student form state ────────────────────────────────────────────
  const [kinds, setKinds] = useState<Record<KindKey, KindState>>({
    sabaq: emptyKind("surah"), sabqi: emptyKind("surah"), manzil: emptyKind("para"),
  });
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [parentNote, setParentNote] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adv, setAdv] = useState({ tajweed: "", fluency: "", internal: "", target: "", page: "" as number | "" });
  const [prefilling, setPrefilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const current = currentId ? rosterById.get(currentId) ?? null : null;

  // ── Prefill on student change: sabaq = assigned next lesson, sabqi =
  //    last 7 days' sabaq, manzil = rotation juz (last manzil + 1). ─────
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    setKinds({ sabaq: emptyKind("surah"), sabqi: emptyKind("surah"), manzil: emptyKind("para") });
    setParentNote("");
    setNoteTouched(false);
    setAdvancedOpen(false);
    setAdv({ tajweed: "", fluency: "", internal: "", target: "", page: "" });
    setLastLine(null);
    setPrefilling(true);
    getStudentHifz(orgId, currentId, { limit: 40 })
      .then(({ entries }) => {
        if (cancelled) return;
        const next: Record<KindKey, KindState> = {
          sabaq: emptyKind("surah"), sabqi: emptyKind("surah"), manzil: emptyKind("para"),
        };
        // Sabaq: standing assignment from the most recent entry that has one.
        const withTarget = entries.find((e) => (e.nextTarget ?? "").trim().length > 0);
        const parsed = withTarget?.nextTarget ? parseNextSabaq(withTarget.nextTarget) : null;
        const lastSabaq = entries.find((e) => e.kind === "sabaq" && !e.missed);
        if (parsed) {
          next.sabaq.portion = { ...next.sabaq.portion, surah: parsed.surahNumber, from: parsed.from, to: parsed.to };
        } else if (lastSabaq) {
          // No assignment on file — start from the last heard sabaq.
          next.sabaq.portion = {
            ...next.sabaq.portion,
            surah: lastSabaq.surahNumber, from: lastSabaq.ayahFrom, to: lastSabaq.ayahTo,
          };
        }
        // Sabqi: union of the last 7 days' sabaq in the most recent surah.
        const weekAgo = Date.now() - 7 * 86400000;
        const recentSabaq = entries.filter(
          (e) => e.kind === "sabaq" && !e.missed && new Date(e.recordedAt).getTime() >= weekAgo,
        );
        if (recentSabaq.length > 0) {
          const surah = recentSabaq[0].surahNumber;
          const inSurah = recentSabaq.filter((e) => e.surahNumber === surah);
          next.sabqi.portion = {
            ...next.sabqi.portion,
            surah,
            from: Math.min(...inSurah.map((e) => e.ayahFrom)),
            to: Math.max(...inSurah.map((e) => e.ayahTo)),
          };
        } else if (lastSabaq) {
          next.sabqi.portion = {
            ...next.sabqi.portion,
            surah: lastSabaq.surahNumber, from: lastSabaq.ayahFrom, to: lastSabaq.ayahTo,
          };
        }
        // Manzil: rotation — last manzil's juz + 1 (wrap after 30).
        const lastManzil = entries.find((e) => e.kind === "manzil");
        const lastJuz = lastManzil?.juzNumber ?? null;
        next.manzil.portion = {
          ...next.manzil.portion,
          juz: lastJuz ? (lastJuz % 30) + 1 : 1,
        };
        setKinds(next);
        // "Yesterday: sabaq Al-Fatiha 1–7 · good" header line.
        const latest = entries.find((e) => !e.missed) ?? entries[0] ?? null;
        if (latest) {
          const day = new Date(latest.recordedAt);
          const today = new Date();
          const dayDiff = Math.round(
            (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
              new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) / 86400000,
          );
          const when = dayDiff <= 0 ? "Today" : dayDiff === 1 ? "Yesterday" : day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const s = getSurah(latest.surahNumber);
          setLastLine(
            `${when}: ${latest.kind} ${s?.nameTransliterated ?? latest.surahNumber} ${latest.ayahFrom}–${latest.ayahTo}` +
            (latest.quality ? ` · ${latest.quality.replace("_", " ")}` : ""),
          );
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPrefilling(false); });
    return () => { cancelled = true; };
  }, [orgId, currentId]);

  // ── Auto-written parent note (regenerates until the teacher edits). ──
  const composedNote = useMemo(() => {
    const parts: string[] = [];
    for (const meta of KIND_META) {
      const k = kinds[meta.key];
      if (!k.quality) continue;
      let piece = `${meta.key} ${portionLabel(k.portion)}`;
      const q = k.quality === "repeat" ? "needs repeat" : k.quality;
      piece += ` (${q}${k.mistakes > 0 ? `, ${k.mistakes} mistake${k.mistakes === 1 ? "" : "s"}` : ""})`;
      parts.push(piece);
    }
    if (parts.length === 0) return "";
    return `Heard ${parts.join(" and ")}.`;
  }, [kinds]);
  useEffect(() => {
    if (!noteTouched) setParentNote(composedNote);
  }, [composedNote, noteTouched]);

  // ── Queue helpers ────────────────────────────────────────────────────
  const orderedPending = queue.filter((id) => status[id] === "pending");
  const heardCount = queue.filter((id) => status[id] !== "pending").length;
  const nextId = orderedPending.find((id) => id !== currentId) ?? null;
  const nextName = nextId ? rosterById.get(nextId)?.studentName ?? null : null;

  const advance = (mark: StudentStatus) => {
    if (!currentId) return;
    setStatus((s) => ({ ...s, [currentId]: mark }));
    setCurrentId(nextId);
  };

  const skipForNow = () => {
    if (!currentId) return;
    // Move to the end of the queue, stay pending — the round comes back.
    setQueue((q) => [...q.filter((id) => id !== currentId), currentId]);
    setCurrentId(nextId);
  };

  const markAbsent = async () => {
    if (!currentId || !current) return;
    setSaving(true);
    try {
      const p = kinds.sabaq.portion;
      await postHifzEntry(orgId, {
        studentId: currentId,
        surahNumber: p.mode === "surah" ? p.surah : 1,
        ayahFrom: p.mode === "surah" ? p.from : 1,
        ayahTo: p.mode === "surah" ? p.to : 1,
        kind: "sabaq",
        missed: true,
      });
      toast.success(`${current.studentName} marked absent / missed`);
      onSaved();
      advance("absent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record miss");
    } finally {
      setSaving(false);
    }
  };

  const saveAndNext = async () => {
    if (!currentId || !current) return;
    const touched = KIND_META.filter((m) => kinds[m.key].quality !== "");
    if (touched.length === 0) {
      toast.error("Tap a quality on at least one kind — or Skip for now.");
      return;
    }
    setSaving(true);
    try {
      let first = true;
      for (const meta of touched) {
        const k = kinds[meta.key];
        const p = k.portion;
        const para = p.mode === "para";
        const start = para ? JUZ_STARTS[p.juz - 1] : null;
        const input: HifzEntryInput = {
          studentId: currentId,
          surahNumber: para ? start!.surah : p.surah,
          ayahFrom: para ? start!.ayah : p.from,
          ayahTo: para ? start!.ayah : p.to,
          kind: meta.key,
          quality: STORED_QUALITY[k.quality],
          mistakesCount: k.mistakes > 0 ? k.mistakes : undefined,
          juzNumber: para ? p.juz : undefined,
          juzExtent: para ? (p.extent === "to_surah" ? `to_surah:${p.toSurah}` : p.extent) : undefined,
        };
        if (meta.key === "sabaq") {
          // Auto-assign the next sabaq (default behavior in Round Mode):
          // advance on excellent/good, repeat on weak/repeat. At a surah
          // boundary we assign nothing — memorization order past a
          // finished surah is a school decision.
          if (p.mode === "surah") {
            const maxAyah = getSurah(p.surah)?.ayahCount ?? p.to;
            if (k.quality === "weak" || k.quality === "repeat") {
              input.nextTarget = serializeNextSabaq(p.surah, p.from, p.to);
            } else if (p.to < maxAyah) {
              const len = Math.max(1, p.to - p.from + 1);
              input.nextTarget = serializeNextSabaq(p.surah, p.to + 1, Math.min(p.to + len, maxAyah));
            }
          }
        }
        if (first) {
          // Note + advanced fields ride on the first saved entry.
          input.teacherRemarks = parentNote.trim() || undefined;
          input.tajweedNotes = adv.tajweed.trim() || undefined;
          input.fluencyNotes = adv.fluency.trim() || undefined;
          input.notes = adv.internal.trim() || undefined;
          input.dailyTarget = adv.target.trim() || undefined;
          input.pageNumber = typeof adv.page === "number" ? adv.page : undefined;
          first = false;
        }
        await postHifzEntry(orgId, input);
      }
      toast.success(`${current.studentName} saved${nextName ? ` — next: ${nextName}` : ""}`);
      onSaved();
      advance("heard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setKind = (key: KindKey, patch: Partial<KindState>) =>
    setKinds((ks) => ({ ...ks, [key]: { ...ks[key], ...patch } }));
  const setPortion = (key: KindKey, patch: Partial<PortionState>) =>
    setKinds((ks) => ({ ...ks, [key]: { ...ks[key], portion: { ...ks[key].portion, ...patch } } }));

  const startedLabel = startedAt.current.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const pct = queue.length > 0 ? Math.round((heardCount / queue.length) * 100) : 0;

  // ── Round complete ───────────────────────────────────────────────────
  if (!current) {
    const absent = queue.filter((id) => status[id] === "absent").length;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-2xl font-extrabold text-emerald-900">Round complete</div>
        <p className="mt-2 text-sm text-emerald-800">
          {heardCount - absent} heard · {absent} absent / missed
          {queue.length - heardCount > 0 ? ` · ${queue.length - heardCount} not heard` : ""}
        </p>
        <Button className="mt-4 bg-emerald-700 hover:bg-emerald-800" onClick={onExit}>
          Back to the class list
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg">
      {/* Header — progress + pause. Compact variant on phones (6b). */}
      <div className="bg-slate-900 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold text-white">
            <span className="hidden sm:inline">Today's round · {sectionLabel}</span>
            <span className="sm:hidden">Round · {heardCount}/{queue.length}</span>
          </span>
          <div className="hidden min-w-0 flex-1 overflow-hidden rounded-full bg-white/15 sm:block" style={{ height: 6 }}>
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
          <span className="hidden whitespace-nowrap text-xs text-slate-400 sm:inline">
            {heardCount} of {queue.length} heard · started {startedLabel}
          </span>
          <span className="ml-auto text-[11px] text-slate-400 sm:hidden">{sectionLabel}</span>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Pause round
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15 sm:hidden">
          <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Queue rail — desktop only (6b hides it). */}
        <div className="hidden border-r border-slate-100 p-3 lg:flex lg:flex-col lg:gap-0.5">
          <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Queue</div>
          <div className="max-h-[540px] space-y-0.5 overflow-y-auto">
            {queue.map((id) => {
              const r = rosterById.get(id);
              if (!r) return null;
              const st = status[id];
              const isNow = id === currentId;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragId(id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragId || dragId === id) return;
                    setQueue((q) => {
                      const without = q.filter((x) => x !== dragId);
                      const at = without.indexOf(id);
                      return [...without.slice(0, at), dragId, ...without.slice(at)];
                    });
                    setDragId(null);
                  }}
                  onClick={() => { if (st === "pending" && !saving) setCurrentId(id); }}
                  className={
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 " +
                    (isNow ? "bg-emerald-50 ring-1 ring-emerald-200" : st !== "pending" ? "opacity-60" : "hover:bg-slate-50")
                  }
                >
                  <span
                    className={
                      "flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10px] font-extrabold " +
                      (st === "heard"
                        ? "bg-emerald-500 text-white"
                        : st === "absent"
                        ? "bg-amber-400 text-white"
                        : isNow
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-500")
                    }
                  >
                    {st === "heard" ? "✓" : st === "absent" ? "–" : initials(r.studentName).charAt(0)}
                  </span>
                  <span className={"min-w-0 flex-1 truncate text-[12.5px] " + (isNow ? "font-bold text-slate-900" : "text-slate-700")}>
                    {r.studentName}
                  </span>
                  <span className="text-[10.5px] text-slate-400">
                    {st === "heard" ? "done" : st === "absent" ? "absent" : isNow ? "now" : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-auto px-2 pt-2 text-[11px] leading-relaxed text-slate-400">
            Drag to reorder · "Skip for now" drops a student to the end.
          </div>
        </div>

        {/* Current student */}
        <div className="p-4 pb-24 sm:p-5 lg:pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-500 text-[13px] font-extrabold text-white">
              {initials(current.studentName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-extrabold text-slate-900">{current.studentName}</span>
              <span className="block truncate text-xs text-slate-500">
                {prefilling ? "Loading last entries…" : lastLine ?? "No previous entries"}
              </span>
            </span>
            <button
              type="button"
              onClick={markAbsent}
              disabled={saving}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <span className="hidden sm:inline">Absent / missed today</span>
              <span className="sm:hidden">Absent?</span>
            </button>
          </div>

          {/* Three kind rows */}
          <div className="mt-4 flex flex-col gap-2.5">
            {KIND_META.map((meta) => {
              const k = kinds[meta.key];
              const active = k.quality !== "";
              return (
                <div
                  key={meta.key}
                  className={
                    "rounded-xl border p-3 " +
                    (active ? "border-indigo-200 bg-indigo-50/40" : "border-slate-100 bg-white")
                  }
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="w-16 flex-none">
                      <span className="block text-[12.5px] font-extrabold text-slate-900">{meta.label}</span>
                      <span className="text-[10px] text-slate-400">{meta.sub}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKind(meta.key, { editorOpen: !k.editorOpen })}
                      className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[13px] font-semibold text-slate-900 hover:border-indigo-300"
                      title="Tap to change the portion"
                    >
                      {portionLabel(k.portion)} <span className="text-slate-400">▾</span>
                    </button>
                    <span className="flex w-full gap-1.5 sm:w-auto">
                      {QUALITY_CHIPS.map((q) => (
                        <button
                          key={q.key}
                          type="button"
                          onClick={() => setKind(meta.key, { quality: k.quality === q.key ? "" : q.key })}
                          className={
                            "flex-1 rounded-full border px-3 py-1.5 text-[11.5px] font-bold sm:flex-none " +
                            (k.quality === q.key
                              ? "border-emerald-700 bg-emerald-700 text-white"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")
                          }
                        >
                          {q.label}
                        </button>
                      ))}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      mistakes
                      <button
                        type="button"
                        onClick={() => setKind(meta.key, { mistakes: Math.max(0, k.mistakes - 1) })}
                        className="h-6 w-6 rounded-md border border-slate-200 text-sm leading-none text-slate-600 hover:bg-slate-50"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs font-bold tabular-nums text-slate-900">{k.mistakes}</span>
                      <button
                        type="button"
                        onClick={() => setKind(meta.key, { mistakes: k.mistakes + 1 })}
                        className="h-6 w-6 rounded-md border border-slate-200 text-sm leading-none text-slate-600 hover:bg-slate-50"
                      >
                        +
                      </button>
                    </span>
                  </div>

                  {/* Portion editor — by surah or by para. */}
                  {k.editorOpen && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Position</span>
                        <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                          {(["surah", "para"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPortion(meta.key, { mode: m })}
                              className={
                                "px-3 py-1 text-xs font-medium " +
                                (k.portion.mode === m ? "bg-indigo-600 text-white" : "bg-white text-slate-600")
                              }
                            >
                              {m === "surah" ? "By surah" : "By para"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {k.portion.mode === "surah" ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="col-span-2">
                            <Select
                              value={String(k.portion.surah)}
                              onValueChange={(v) => {
                                const n = Number(v);
                                const max = getSurah(n)?.ayahCount ?? 1;
                                setPortion(meta.key, {
                                  surah: n,
                                  from: Math.min(k.portion.from, max),
                                  to: Math.min(k.portion.to, max),
                                });
                              }}
                            >
                              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-64">
                                {SURAHS.map((s) => (
                                  <SelectItem key={s.number} value={String(s.number)}>
                                    {s.number}. {s.nameTransliterated} ({s.ayahCount})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            type="number"
                            inputMode="numeric"
                            className="bg-white"
                            value={k.portion.from}
                            min={1}
                            max={getSurah(k.portion.surah)?.ayahCount ?? 1}
                            onChange={(e) => setPortion(meta.key, { from: Math.max(1, Number(e.target.value) || 1) })}
                            aria-label="Ayah from"
                          />
                          <Input
                            type="number"
                            inputMode="numeric"
                            className="bg-white"
                            value={k.portion.to}
                            min={k.portion.from}
                            max={getSurah(k.portion.surah)?.ayahCount ?? 1}
                            onChange={(e) => setPortion(meta.key, { to: Math.max(1, Number(e.target.value) || 1) })}
                            onBlur={() => {
                              const max = getSurah(k.portion.surah)?.ayahCount ?? 1;
                              setPortion(meta.key, {
                                from: Math.min(Math.max(1, k.portion.from), max),
                                to: Math.min(Math.max(k.portion.from, k.portion.to), max),
                              });
                            }}
                            aria-label="Ayah to"
                          />
                        </div>
                      ) : (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Select
                            value={String(k.portion.juz)}
                            onValueChange={(v) => setPortion(meta.key, { juz: Number(v) })}
                          >
                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                                <SelectItem key={j} value={String(j)}>Juz {j}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={k.portion.extent}
                            onValueChange={(v) => setPortion(meta.key, { extent: v })}
                          >
                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Full para</SelectItem>
                              <SelectItem value="quarter">Quarter</SelectItem>
                              <SelectItem value="half">Half</SelectItem>
                              <SelectItem value="three_quarters">Three quarters</SelectItem>
                              <SelectItem value="to_surah">Up to a surah…</SelectItem>
                            </SelectContent>
                          </Select>
                          {k.portion.extent === "to_surah" && (
                            <div className="col-span-2">
                              <Select
                                value={String(k.portion.toSurah)}
                                onValueChange={(v) => setPortion(meta.key, { toSurah: Number(v) })}
                              >
                                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {SURAHS.map((su) => (
                                    <SelectItem key={su.number} value={String(su.number)}>
                                      {su.number}. {su.nameTransliterated}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-right">
                        <button
                          type="button"
                          onClick={() => setKind(meta.key, { editorOpen: false })}
                          className="text-xs font-semibold text-indigo-700 hover:underline"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            Leaving a kind untouched logs nothing for it. Saving the sabaq
            auto-assigns the next lesson (advance on excellent/good, repeat
            on weak/repeat).
          </p>

          {/* Auto-written parent note */}
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Parent note</span>
              {!noteTouched && parentNote && (
                <span className="text-[10.5px] text-emerald-600/70">auto-written · edit freely</span>
              )}
            </div>
            <Textarea
              value={parentNote}
              onChange={(e) => { setNoteTouched(true); setParentNote(e.target.value); }}
              rows={2}
              placeholder="Tap a quality above and the note writes itself — or type your own."
              className="mt-1.5 border-emerald-200 bg-white text-[13px]"
            />
          </div>

          {/* Advanced fields behind one "+" */}
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 text-xs font-semibold text-indigo-700 hover:underline"
          >
            {advancedOpen ? "− hide advanced fields" : "+ tajweed / fluency / target / internal note"}
          </button>
          {advancedOpen && (
            <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Tajweed note</Label>
                <Input value={adv.tajweed} onChange={(e) => setAdv({ ...adv, tajweed: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fluency note</Label>
                <Input value={adv.fluency} onChange={(e) => setAdv({ ...adv, fluency: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Today's target</Label>
                <Input value={adv.target} onChange={(e) => setAdv({ ...adv, target: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mushaf page</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={adv.page}
                  onChange={(e) => setAdv({ ...adv, page: e.target.value === "" ? "" : Math.max(1, Number(e.target.value) || 1) })}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Internal note (staff only)</Label>
                <Textarea value={adv.internal} onChange={(e) => setAdv({ ...adv, internal: e.target.value })} rows={2} className="bg-white" />
              </div>
            </div>
          )}

          {/* Actions — inline on desktop, sticky footer on phones (6b). */}
          <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white p-3 lg:static lg:mt-4 lg:justify-end lg:border-0 lg:p-0">
            <Button variant="outline" onClick={skipForNow} disabled={saving} className="flex-none">
              Skip for now
            </Button>
            <Button
              onClick={saveAndNext}
              disabled={saving}
              className="min-w-0 flex-1 bg-emerald-700 font-bold hover:bg-emerald-800 lg:flex-none"
            >
              <span className="truncate">
                {saving
                  ? "Saving…"
                  : nextName
                  ? `Save · next: ${nextName} →`
                  : "Save · finish round"}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HifzRoundMode;
