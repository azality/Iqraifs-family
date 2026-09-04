// Hifz Round Mode (design 6a/6b, corrected semantics per the pilot's
// hifz-method review) — the focused screen a hifz teacher lives in
// during the daily round. Replaces walking the per-student modal: one
// screen per student with sabaq / sabqi / manzil as three one-line
// rows, quality as tap chips, a mistakes stepper, and an auto-written
// parent note. Leaving a kind untouched logs nothing for it.
//
// Prefills follow the method:
//   sabaq  — the assigned next lesson, continuing yesterday (small and
//            solid beats large and shaky).
//   sabqi  — the CURRENT PARA from its start up to today's sabaq (the
//            bridge that locks the last ~7–15 days in); the teacher
//            trims it in the picker if less was heard.
//   manzil — the daily cycle through all older memorized juz: one juz
//            per day, logged per juz with NO ayah typing. Untouched
//            today = not heard; the rotation re-suggests it tomorrow.
//
// Saving the sabaq auto-assigns the next lesson (advance on
// excellent/good within the surah, repeat on weak/repeat) — the old
// checkbox is now default behavior.
//
// Kind-scoped rounds: sabaq is heard first thing in the morning while
// sabqi/manzil come later in the day, so the header's "Hearing" scope
// runs a sabaq-only round or a sabqi+manzil round; students already
// heard for the scoped kind(s) (the summary's S/Sq/M flags) are
// skipped automatically, which also makes pause/resume work.
//
// The existing HifzLogEntry modal remains for one-off logging from the
// list's Log button.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
type RoundScope = "all" | "sabaq" | "revision";

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

/** Which juz a (surah, ayah) position falls in. */
function juzOfPosition(surah: number, ayah: number): number {
  let j = 1;
  for (let i = 0; i < JUZ_STARTS.length; i++) {
    const st = JUZ_STARTS[i];
    if (surah > st.surah || (surah === st.surah && ayah >= st.ayah)) j = i + 1;
    else break;
  }
  return j;
}

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

// Extent → hifzTeach.extShort* key (full appends nothing).
const EXTENT_KEY: Record<string, string> = {
  quarter: "hifzTeach.extShortQuarter",
  half: "hifzTeach.extShortHalf",
  three_quarters: "hifzTeach.extShortThreeQuarters",
};

type TFn = (key: string, opts?: Record<string, unknown>) => string;

interface PortionState {
  mode: "surah" | "para";
  surah: number;
  from: number;
  to: number;
  juz: number;
  extent: string; // 'full' | 'quarter' | 'half' | 'three_quarters' | 'to_surah'
  toSurah: number;
  /** Method-derived display label ("Juz 30 · start → today's sabaq").
   *  Cleared the moment the teacher edits the portion. */
  pretty?: string;
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

function portionLabel(p: PortionState, t: TFn): string {
  if (p.pretty) return p.pretty;
  if (p.mode === "para") {
    const juz = t("hifzTeach.juzN", { n: p.juz });
    if (p.extent === "full") return juz;
    if (p.extent === "to_surah") {
      return `${juz} · ${t("hifzTeach.extShortToSurah", { name: getSurah(p.toSurah)?.nameTransliterated ?? p.toSurah })}`;
    }
    return `${juz} · ${t(EXTENT_KEY[p.extent] ?? "hifzTeach.extShortFull")}`;
  }
  const s = getSurah(p.surah);
  return `${s?.nameTransliterated ?? p.surah} ${p.from}–${p.to}`;
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w.charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function fmtElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60 ? `${sec % 60}s` : ""}`.trim();
}

const QUALITY_CHIPS: Array<{ key: KindState["quality"]; labelKey: string }> = [
  { key: "excellent", labelKey: "hifzTeach.qExcellent" },
  { key: "good", labelKey: "hifzTeach.qGood" },
  { key: "weak", labelKey: "hifzTeach.qWeak" },
  { key: "repeat", labelKey: "hifzRound.qRepeat" },
];
const STORED_QUALITY: Record<string, HifzQuality> = {
  excellent: "excellent",
  good: "good",
  weak: "weak",
  repeat: "needs_practice",
};

const KIND_META: Array<{ key: KindKey; labelKey: string; subKey: string; noteKey: string }> = [
  { key: "sabaq", labelKey: "hifzTeach.sabaq", subKey: "hifzRound.sabaqSub", noteKey: "hifzRound.sabaqNote" },
  { key: "sabqi", labelKey: "hifzTeach.sabqi", subKey: "hifzRound.sabqiSub", noteKey: "hifzRound.sabqiNote" },
  { key: "manzil", labelKey: "hifzTeach.manzil", subKey: "hifzRound.manzilSub", noteKey: "hifzRound.manzilRowNote" },
];

const SCOPE_KINDS: Record<RoundScope, KindKey[]> = {
  all: ["sabaq", "sabqi", "manzil"],
  sabaq: ["sabaq"],
  revision: ["sabqi", "manzil"],
};

type HeardFlags = { sabaq: boolean; sabqi: boolean; manzil: boolean };

export function HifzRoundMode({ orgId, sectionLabel, roster, onExit, onSaved }: Props) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<string[]>(() => roster.map((r) => r.studentId));
  // What each student has already been heard for today — seeded from the
  // summary's S/Sq/M flags, updated locally on save (so scope switches
  // and resume don't wait for the server round-trip).
  const [heardToday, setHeardToday] = useState<Record<string, HeardFlags>>(() => {
    const m: Record<string, HeardFlags> = {};
    for (const r of roster) {
      m[r.studentId] = {
        sabaq: !!r.today?.sabaq, sabqi: !!r.today?.sabqi, manzil: !!r.today?.manzil,
      };
    }
    return m;
  });
  const [absentSet, setAbsentSet] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState<Record<string, number>>({});
  // Kind-scoped rounds: morning sabaq-only, afternoon sabqi/manzil.
  const [scope, setScope] = useState<RoundScope>("all");
  // Manual jump from the queue rail; falls back to first not-done.
  const [currentOverride, setCurrentOverride] = useState<string | null>(null);
  const startedAt = useRef(new Date());
  const studentStartedAt = useRef(Date.now());
  const rosterById = useMemo(() => {
    const m = new Map<string, SectionHifzSummaryRow>();
    for (const r of roster) m.set(r.studentId, r);
    return m;
  }, [roster]);

  // Server refreshes (after saves elsewhere) only ever ADD flags.
  useEffect(() => {
    setHeardToday((prev) => {
      const next = { ...prev };
      for (const r of roster) {
        const p = next[r.studentId] ?? { sabaq: false, sabqi: false, manzil: false };
        next[r.studentId] = {
          sabaq: p.sabaq || !!r.today?.sabaq,
          sabqi: p.sabqi || !!r.today?.sabqi,
          manzil: p.manzil || !!r.today?.manzil,
        };
      }
      return next;
    });
  }, [roster]);

  // "Done for this round" — absent, or already heard for the scoped
  // kind(s). Revision uses OR: a deliberately-untouched manzil shouldn't
  // drag the student back into the queue.
  const doneForScope = (id: string): boolean => {
    if (absentSet.has(id)) return true;
    const h = heardToday[id];
    if (!h) return false;
    if (scope === "sabaq") return h.sabaq;
    if (scope === "revision") return h.sabqi || h.manzil;
    return h.sabaq || h.sabqi || h.manzil;
  };

  const currentId =
    currentOverride && !doneForScope(currentOverride)
      ? currentOverride
      : queue.find((id) => !doneForScope(id)) ?? null;
  const current = currentId ? rosterById.get(currentId) ?? null : null;

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

  // ── Prefill on student change (hifz-method continuations). ───────────
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    studentStartedAt.current = Date.now();
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
        // Sabaq: standing assignment from the most recent entry that has
        // one; else continue at the last heard sabaq.
        const withTarget = entries.find((e) => (e.nextTarget ?? "").trim().length > 0);
        const parsed = withTarget?.nextTarget ? parseNextSabaq(withTarget.nextTarget) : null;
        const lastSabaq = entries.find((e) => e.kind === "sabaq" && !e.missed);
        const sabaqPos = parsed
          ? { surah: parsed.surahNumber, from: parsed.from, to: parsed.to }
          : lastSabaq
          ? { surah: lastSabaq.surahNumber, from: lastSabaq.ayahFrom, to: lastSabaq.ayahTo }
          : null;
        if (sabaqPos) {
          next.sabaq.portion = {
            ...next.sabaq.portion,
            surah: sabaqPos.surah, from: sabaqPos.from, to: sabaqPos.to,
            pretty: parsed
              ? t("hifzRound.prettySabaq", {
                  portion: `${getSurah(sabaqPos.surah)?.nameTransliterated ?? sabaqPos.surah} ${sabaqPos.from}–${sabaqPos.to}`,
                })
              : undefined,
          };
          // Sabqi: the current para from its start up to today's sabaq —
          // the bridge that locks the last ~7–15 days in. Stored by para
          // with extent "up to the sabaq's surah"; the teacher trims in
          // the picker if less was heard.
          const j = juzOfPosition(sabaqPos.surah, sabaqPos.from);
          next.sabqi.portion = {
            ...next.sabqi.portion,
            mode: "para",
            juz: j,
            extent: "to_surah",
            toSurah: sabaqPos.surah,
            pretty: t("hifzRound.prettySabqi", { juz: j }),
          };
        }
        // Manzil: the daily cycle over older memorized juz — last
        // manzil's juz + 1, wrapping after 30. Logged per juz.
        const lastManzil = entries.find((e) => e.kind === "manzil");
        const lastJuz = lastManzil?.juzNumber ?? null;
        const rotJuz = lastJuz ? (lastJuz % 30) + 1 : 1;
        next.manzil.portion = {
          ...next.manzil.portion,
          juz: rotJuz,
          pretty: lastJuz ? t("hifzRound.prettyManzil", { juz: rotJuz }) : undefined,
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
          const when = dayDiff <= 0
            ? t("hifzRound.today")
            : dayDiff === 1
            ? t("hifzRound.yesterday")
            : day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const s = getSurah(latest.surahNumber);
          const kindWord = ["sabaq", "sabqi", "manzil"].includes(latest.kind)
            ? t(`hifzTeach.${latest.kind}`)
            : latest.kind;
          const qualityWord = latest.quality
            ? {
                excellent: t("hifzTeach.qExcellent"), good: t("hifzTeach.qGood"),
                weak: t("hifzTeach.qWeak"), needs_practice: t("hifzTeach.qNeedsPractice"),
                not_learned: t("hifzTeach.qNotLearned"),
              }[latest.quality] ?? latest.quality
            : null;
          setLastLine(
            `${when}: ${kindWord} ${s?.nameTransliterated ?? latest.surahNumber} ${latest.ayahFrom}–${latest.ayahTo}` +
            (qualityWord ? ` · ${qualityWord}` : ""),
          );
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPrefilling(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, currentId, t]);

  // ── Auto-written parent note (regenerates until the teacher edits). ──
  const composedNote = useMemo(() => {
    const qualityWord: Record<string, string> = {
      excellent: t("hifzTeach.qExcellent"),
      good: t("hifzTeach.qGood"),
      weak: t("hifzTeach.qWeak"),
      repeat: t("hifzRound.noteNeedsRepeat"),
    };
    const parts: string[] = [];
    for (const meta of KIND_META) {
      if (!SCOPE_KINDS[scope].includes(meta.key)) continue;
      const k = kinds[meta.key];
      if (!k.quality) continue;
      const label = meta.key === "sabqi" && k.portion.pretty
        ? t("hifzRound.noteSabqiPortion", { juz: k.portion.juz })
        : portionLabel(k.portion, t);
      const mistakes = k.mistakes === 1
        ? t("hifzRound.noteMistake")
        : k.mistakes > 1
        ? t("hifzRound.noteMistakes", { count: k.mistakes })
        : "";
      parts.push(`${t(meta.labelKey)} ${label} (${qualityWord[k.quality]}${mistakes})`);
    }
    if (parts.length === 0) return "";
    return t("hifzRound.noteHeard", { parts: parts.join(t("hifzRound.noteAnd")) });
  }, [kinds, scope, t]);
  useEffect(() => {
    if (!noteTouched) setParentNote(composedNote);
  }, [composedNote, noteTouched]);

  // ── Progress / queue derived values ──────────────────────────────────
  const heardCount = queue.filter((id) => doneForScope(id)).length;
  const nextId = queue.find((id) => id !== currentId && !doneForScope(id)) ?? null;
  const nextName = nextId ? rosterById.get(nextId)?.studentName ?? null : null;

  const recordElapsed = (id: string) =>
    setElapsed((e) => ({ ...e, [id]: Math.round((Date.now() - studentStartedAt.current) / 1000) }));

  const skipForNow = () => {
    if (!currentId) return;
    // Move to the end of the queue, stay pending — the round comes back.
    setQueue((q) => [...q.filter((id) => id !== currentId), currentId]);
    setCurrentOverride(null);
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
      toast.success(t("hifzRound.absentToast", { name: current.studentName }));
      recordElapsed(currentId);
      setAbsentSet((s) => new Set(s).add(currentId));
      setCurrentOverride(null);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hifzRound.absentFailed"));
    } finally {
      setSaving(false);
    }
  };

  const saveAndNext = async () => {
    if (!currentId || !current) return;
    const scoped = KIND_META.filter((m) => SCOPE_KINDS[scope].includes(m.key));
    const touched = scoped.filter((m) => kinds[m.key].quality !== "");
    if (touched.length === 0) {
      toast.error(t("hifzRound.tapQualityFirst"));
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
          // Auto-assign the next sabaq (default in Round Mode): advance
          // on excellent/good (same length, within the surah), repeat on
          // weak/repeat. At a surah boundary we assign nothing —
          // memorization order past a finished surah is a school call.
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
      toast.success(
        nextName
          ? t("hifzRound.savedToastNext", { name: current.studentName, next: nextName })
          : t("hifzRound.savedToast", { name: current.studentName }),
      );
      recordElapsed(currentId);
      setHeardToday((m) => ({
        ...m,
        [currentId]: {
          sabaq: m[currentId]?.sabaq || touched.some((t) => t.key === "sabaq"),
          sabqi: m[currentId]?.sabqi || touched.some((t) => t.key === "sabqi"),
          manzil: m[currentId]?.manzil || touched.some((t) => t.key === "manzil"),
        },
      }));
      setCurrentOverride(null);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hifzRound.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const setKind = (key: KindKey, patch: Partial<KindState>) =>
    setKinds((ks) => ({ ...ks, [key]: { ...ks[key], ...patch } }));
  // Any edit through the picker clears the method-derived pretty label.
  const setPortion = (key: KindKey, patch: Partial<PortionState>) =>
    setKinds((ks) => ({
      ...ks,
      [key]: { ...ks[key], portion: { ...ks[key].portion, ...patch, pretty: undefined } },
    }));

  const startedLabel = startedAt.current.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const pct = queue.length > 0 ? Math.round((heardCount / queue.length) * 100) : 0;

  const scopeSelect = (
    <select
      value={scope}
      onChange={(e) => { setScope(e.target.value as RoundScope); setCurrentOverride(null); }}
      className="rounded-lg border border-slate-600 bg-transparent px-2 py-1.5 text-xs font-semibold text-slate-200 [&>option]:text-slate-900"
      aria-label={t("hifzRound.scopeAria")}
    >
      <option value="all">{t("hifzRound.scopeAll")}</option>
      <option value="sabaq">{t("hifzRound.scopeSabaq")}</option>
      <option value="revision">{t("hifzRound.scopeRevision")}</option>
    </select>
  );

  // ── Round complete (for this scope) ──────────────────────────────────
  if (!current) {
    const absent = queue.filter((id) => absentSet.has(id)).length;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-2xl font-extrabold text-emerald-900">
          {scope === "sabaq"
            ? t("hifzRound.completeSabaq")
            : scope === "revision"
            ? t("hifzRound.completeRevision")
            : t("hifzRound.completeAll")}
        </div>
        <p className="mt-2 text-sm text-emerald-800">
          {t("hifzRound.completeStats", { heard: heardCount - absent, absent })}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {scope !== "all" && (
            <Button
              variant="outline"
              className="border-emerald-300 text-emerald-900"
              onClick={() => setScope(scope === "sabaq" ? "revision" : "sabaq")}
            >
              {scope === "sabaq" ? t("hifzRound.hearRevision") : t("hifzRound.hearSabaq")}
            </Button>
          )}
          <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={onExit}>
            {t("hifzRound.backToList")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg">
      {/* Header — progress + scope + pause. Compact variant on phones. */}
      <div className="bg-slate-900 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold text-white">
            <span className="hidden sm:inline">{t("hifzRound.title", { label: sectionLabel })}</span>
            <span className="sm:hidden">{t("hifzRound.roundShort", { done: heardCount, total: queue.length })}</span>
          </span>
          <div className="hidden min-w-0 flex-1 overflow-hidden rounded-full bg-white/15 sm:block" style={{ height: 6 }}>
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
          <span className="hidden whitespace-nowrap text-xs text-slate-400 sm:inline">
            {t("hifzRound.heardOf", { done: heardCount, total: queue.length, time: startedLabel })}
          </span>
          <span className="hidden sm:block">{scopeSelect}</span>
          <span className="ml-auto text-[11px] text-slate-400 sm:hidden">{sectionLabel}</span>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 sm:ml-0"
          >
            {t("hifzRound.pause")}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3 sm:hidden">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
          </div>
          {scopeSelect}
        </div>
      </div>

      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Queue rail — desktop only. */}
        <div className="hidden border-r border-slate-100 p-3 lg:flex lg:flex-col lg:gap-0.5">
          <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">{t("hifzRound.queue")}</div>
          <div className="max-h-[540px] space-y-0.5 overflow-y-auto">
            {queue.map((id) => {
              const r = rosterById.get(id);
              if (!r) return null;
              const done = doneForScope(id);
              const isAbsent = absentSet.has(id);
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
                  onClick={() => { if (!done && !saving) setCurrentOverride(id); }}
                  className={
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 " +
                    (isNow ? "bg-emerald-50 ring-1 ring-emerald-200" : done ? "opacity-60" : "hover:bg-slate-50")
                  }
                >
                  <span
                    className={
                      "flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10px] font-extrabold " +
                      (isAbsent
                        ? "bg-amber-400 text-white"
                        : done
                        ? "bg-emerald-500 text-white"
                        : isNow
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-500")
                    }
                  >
                    {isAbsent ? "–" : done ? "✓" : initials(r.studentName).charAt(0)}
                  </span>
                  <span className={"min-w-0 flex-1 truncate text-[12.5px] " + (isNow ? "font-bold text-slate-900" : "text-slate-700")}>
                    {r.studentName}
                  </span>
                  <span className="text-[10.5px] text-slate-400">
                    {isAbsent
                      ? t("hifzRound.absentTag")
                      : done
                      ? elapsed[id] != null ? fmtElapsed(elapsed[id]) : t("hifzRound.done")
                      : isNow
                      ? t("hifzRound.now")
                      : id === nextId
                      ? t("hifzRound.next")
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-auto px-2 pt-2 text-[11px] leading-relaxed text-slate-400">
            {t("hifzRound.queueHint")}
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
                {prefilling ? t("hifzRound.loadingLast") : lastLine ?? t("hifzRound.noPrevious")}
              </span>
            </span>
            <button
              type="button"
              onClick={markAbsent}
              disabled={saving}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <span className="hidden sm:inline">{t("hifzRound.absentBtn")}</span>
              <span className="sm:hidden">{t("hifzRound.absentShort")}</span>
            </button>
          </div>

          {/* Kind rows — filtered by the round's Hearing scope. */}
          <div className="mt-4 flex flex-col gap-2.5">
            {KIND_META.filter((m) => SCOPE_KINDS[scope].includes(m.key)).map((meta) => {
              const k = kinds[meta.key];
              const active = k.quality !== "";
              const alreadyHeard = heardToday[currentId]?.[meta.key];
              return (
                <div
                  key={meta.key}
                  className={
                    "rounded-xl border p-3 " +
                    (active ? "border-indigo-200 bg-indigo-50/40" : "border-slate-100 bg-white")
                  }
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="w-20 flex-none">
                      <span className="block text-[12.5px] font-extrabold text-slate-900">{t(meta.labelKey)}</span>
                      <span className="text-[10px] text-slate-400">{t(meta.subKey)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKind(meta.key, { editorOpen: !k.editorOpen })}
                      className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[13px] font-semibold text-slate-900 hover:border-indigo-300"
                      title={t("hifzRound.tapPortion")}
                    >
                      {portionLabel(k.portion, t)} <span className="text-slate-400">▾</span>
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
                          {t(q.labelKey)}
                        </button>
                      ))}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      {t("hifzRound.mistakes")}
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
                  <div className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">
                    {alreadyHeard ? t("hifzRound.alreadyLogged") : t(meta.noteKey)}
                  </div>

                  {/* Portion editor — by surah or by para. */}
                  {k.editorOpen && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{t("hifzTeach.sabqiHow")}</span>
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
                              {m === "surah" ? t("hifzTeach.bySurah") : t("hifzTeach.byPara")}
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
                            aria-label={t("hifzTeach.ayahFrom")}
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
                            aria-label={t("hifzTeach.ayahTo")}
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
                                <SelectItem key={j} value={String(j)}>{t("hifzTeach.juzN", { n: j })}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={k.portion.extent}
                            onValueChange={(v) => setPortion(meta.key, { extent: v })}
                          >
                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">{t("hifzTeach.extFull")}</SelectItem>
                              <SelectItem value="quarter">{t("hifzTeach.extQuarter")}</SelectItem>
                              <SelectItem value="half">{t("hifzTeach.extHalf")}</SelectItem>
                              <SelectItem value="three_quarters">{t("hifzTeach.extThreeQuarters")}</SelectItem>
                              <SelectItem value="to_surah">{t("hifzTeach.extToSurah")}</SelectItem>
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
                          {t("hifzRound.editorDone")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            {t("hifzRound.untouchedHint")}
          </p>

          {/* Auto-written parent note */}
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{t("hifzRound.parentNote")}</span>
              {!noteTouched && parentNote && (
                <span className="text-[10.5px] text-emerald-600/70">{t("hifzRound.autoWritten")}</span>
              )}
            </div>
            <Textarea
              value={parentNote}
              onChange={(e) => { setNoteTouched(true); setParentNote(e.target.value); }}
              rows={2}
              placeholder={t("hifzRound.notePh")}
              className="mt-1.5 border-emerald-200 bg-white text-[13px]"
            />
          </div>

          {/* Advanced fields behind one "+" */}
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 text-xs font-semibold text-indigo-700 hover:underline"
          >
            {advancedOpen ? t("hifzRound.advancedHide") : t("hifzRound.advancedShow")}
          </button>
          {advancedOpen && (
            <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("hifzTeach.tajweedNote")}</Label>
                <Input value={adv.tajweed} onChange={(e) => setAdv({ ...adv, tajweed: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("hifzTeach.fluencyNote")}</Label>
                <Input value={adv.fluency} onChange={(e) => setAdv({ ...adv, fluency: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("hifzTeach.todaysTarget")}</Label>
                <Input value={adv.target} onChange={(e) => setAdv({ ...adv, target: e.target.value })} className="bg-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("hifzTeach.mushafPage")}</Label>
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
                <Label className="text-xs">{t("hifzTeach.internalNote")}</Label>
                <Textarea value={adv.internal} onChange={(e) => setAdv({ ...adv, internal: e.target.value })} rows={2} className="bg-white" />
              </div>
            </div>
          )}

          {/* Actions — inline on desktop, sticky footer on phones. */}
          <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white p-3 lg:static lg:mt-4 lg:justify-end lg:border-0 lg:p-0">
            <Button variant="outline" onClick={skipForNow} disabled={saving} className="flex-none">
              {t("hifzRound.skip")}
            </Button>
            <Button
              onClick={saveAndNext}
              disabled={saving}
              className="min-w-0 flex-1 bg-emerald-700 font-bold hover:bg-emerald-800 lg:flex-none"
            >
              <span className="truncate">
                {saving
                  ? t("hifzTeach.saving")
                  : nextName
                  ? t("hifzRound.saveNext", { name: nextName })
                  : t("hifzRound.saveFinish")}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HifzRoundMode;
