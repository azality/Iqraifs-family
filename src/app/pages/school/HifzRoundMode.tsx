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
  getOrganization,
  getStudentHifz,
  postHifzEntry,
  type HifzEntryInput,
  type HifzQuality,
  type SectionHifzSummaryRow,
} from "../../../utils/schoolApi";
import { SURAHS, getSurah, surahDisplayName } from "../../../utils/quranSurahs";
import { PARA_EXTENT_OPTIONS, juzExtentShortKey, formatJuzExtent } from "../../../utils/hifzExtent";
import {
  serializeNextSabaq,
  parseNextSabaq,
  paraFinishedBySabaq,
  serializeSabaqParaRevision,
  parseSabaqParaRevision,
  parseNextSabqiPara,
  parseNextManzilParts,
  serializeNextManzilParts,
  nextManzilAfter,
  isRepeatRating,
  type ManzilPart,
  JUZ_STARTS,
  juzOfPosition,
  nextSabaqAfter,
  serializeNextSabqiSurahs,
  serializeNextSabqiPara,
  serializeNextManzil,
  type AssignExtent,
  type SabqiPart,
} from "../../../utils/hifzTargets";

interface Props {
  orgId: string;
  sectionLabel: string;
  roster: SectionHifzSummaryRow[];
  onExit: () => void;
  /** Fired after any entries are written — parent bumps its reloadKey. */
  onSaved: () => void;
}

type KindKey = "sabaq" | "sabqi" | "manzil";
type RoundScope = "all" | "sabaq" | "revision" | "sabqi" | "manzil";

// Same juz-start convention as HifzLogEntry — the stored position marker

// Extent → short display key lives in utils/hifzExtent (shared with
// the feeds and the parent portal).

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

function portionLabel(p: PortionState, t: TFn, lang: string): string {
  if (p.pretty) return p.pretty;
  if (p.mode === "para") {
    const juz = t("hifzTeach.juzN", { n: p.juz });
    if (p.extent === "full") return juz;
    if (p.extent === "to_surah") {
      return `${juz} · ${t("hifzTeach.extShortToSurah", { name: surahDisplayName(p.toSurah, lang) })}`;
    }
    return `${juz} · ${t(juzExtentShortKey(p.extent) ?? "hifzTeach.extShortFull")}`;
  }
  return `${surahDisplayName(p.surah, lang)} ${p.from}–${p.to}`;
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
  sabqi: ["sabqi"],
  manzil: ["manzil"],
};

type HeardFlags = { sabaq: boolean; sabqi: boolean; manzil: boolean };

export function HifzRoundMode({ orgId, sectionLabel, roster, onExit, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
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
    if (scope === "sabqi") return h.sabqi;
    if (scope === "manzil") return h.manzil;
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
  // "Tomorrow" overrides — the round derives every next lesson by
  // default (sabaq advances by quality, sabqi follows the sabaq, manzil
  // rotates), but a teacher must be able to say otherwise WITHOUT
  // leaving the round: "sabqi kal Surah Nas tak", "manzil para 30, half".
  // Null = automatic. Reset per student.
  const [ovSabaq, setOvSabaq] = useState<{ surah: number; from: number; to: number } | null>(null);
  const [ovSabqi, setOvSabqi] = useState<{ unit: "surah" | "para"; parts: SabqiPart[]; juz: number } | null>(null);
  const [ovManzil, setOvManzil] = useState<{ juz: number; extent: AssignExtent } | null>(null);
  // Second manzil slice — a sitting that straddles paras ("second half
  // of 16 + first half of 17", Muneeb 10 Sep). Saved as its own entry;
  // null = single-para sitting like before.
  const [manzilPart2, setManzilPart2] = useState<ManzilPart | null>(null);
  // Consolidation-day resume point: when the sabaq slot holds a full-
  // para revision, this is where normal sabaq continues once it's rated
  // good. Parsed out of the stored revision target.
  const [sabaqResume, setSabaqResume] = useState<{ surahNumber: number; from: number; to: number } | null>(null);
  // Manzil opt-out (teacher feedback, 11 Sep): skip today's manzil for
  // this student WITH a reason. Saves a missed-manzil marker; prefill
  // ignores missed rows, so tomorrow re-suggests the same juz.
  const [manzilSkipOpen, setManzilSkipOpen] = useState(false);
  const [manzilSkipReason, setManzilSkipReason] = useState<string | null>(null);
  const [manzilSkipDraft, setManzilSkipDraft] = useState("");
  // Org setting (default ON): end-of-para consolidation break. Gates
  // only NEW derivations - already-stored revision targets are honored
  // regardless, so flipping the setting never strands a student.
  const [paraBreak, setParaBreak] = useState(true);
  useEffect(() => {
    getOrganization(orgId)
      .then((o: any) => setParaBreak(((o?.organization?.settings as any)?.sabaq_para_break) !== false))
      .catch(() => {});
  }, [orgId]);
  const [nextOpen, setNextOpen] = useState<KindKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // ── Prefill on student change (hifz-method continuations). ───────────
  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    studentStartedAt.current = Date.now();
    setKinds({ sabaq: emptyKind("surah"), sabqi: emptyKind("surah"), manzil: emptyKind("para") });
    setOvSabaq(null);
    setOvSabqi(null);
    setOvManzil(null);
    setManzilPart2(null);
    setSabaqResume(null);
    setManzilSkipOpen(false);
    setManzilSkipReason(null);
    setManzilSkipDraft("");
    setNextOpen(null);
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
        // Sabaq: standing assignment from the most recent SABAQ target
        // ("Sabaq: …"); else continue at the last heard sabaq. Targets
        // are kind-prefixed — grabbing the newest of ANY kind meant a
        // sabqi assignment hijacked the sabaq slot and the real sabaq
        // target was silently dropped (Muneeb, 9 Sep — Abdullah Rafiq
        // showed a 3-day-old 32–40 instead of the assigned 51–57).
        const withTarget = entries.find((e) => {
          const txt = (e.nextTarget ?? "").trim();
          return parseSabaqParaRevision(txt) !== null || parseNextSabaq(txt) !== null;
        });
        const targetTxt = (withTarget?.nextTarget ?? "").trim();
        // An end-of-para consolidation target opens the sabaq slot on the
        // full-para revision; the stashed continuation resumes after a
        // good rating.
        const revParsed = targetTxt ? parseSabaqParaRevision(targetTxt) : null;
        setSabaqResume(revParsed?.then ?? null);
        if (revParsed) {
          next.sabaq.portion = {
            ...emptyPortion(), mode: "para", juz: revParsed.juz, extent: "full",
            pretty: t("hifzRound.paraRevisionLabel", { n: revParsed.juz }),
          };
        }
        const parsed = revParsed ? null : (targetTxt ? parseNextSabaq(targetTxt) : null);
        const lastSabaq = entries.find((e) => e.kind === "sabaq" && !e.missed);
        const sabaqPos = parsed
          ? { surah: parsed.surahNumber, from: parsed.from, to: parsed.to }
          : lastSabaq
          ? { surah: lastSabaq.surahNumber, from: lastSabaq.ayahFrom, to: lastSabaq.ayahTo }
          : null;
        if (!revParsed && sabaqPos) {
          next.sabaq.portion = {
            ...next.sabaq.portion,
            surah: sabaqPos.surah, from: sabaqPos.from, to: sabaqPos.to,
            pretty: parsed
              ? t("hifzRound.prettySabaq", {
                  portion: `${surahDisplayName(sabaqPos.surah, lang)} ${sabaqPos.from}–${sabaqPos.to}`,
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
        // A stored sabqi override ("Sabqi: Para N") beats the derived
        // bridge — but only until it's consumed: a sabqi entry NEWER
        // than the one carrying the target means the override was for
        // a day that already happened. (Entries are newest-first, so
        // "newer" = smaller index.)
        const sabqiTargetIdx = entries.findIndex(
          (e) => parseNextSabqiPara((e.nextTarget ?? "").trim()) !== null,
        );
        const lastSabqiIdx = entries.findIndex((e) => e.kind === "sabqi" && !e.missed);
        if (sabqiTargetIdx >= 0 && (lastSabqiIdx === -1 || lastSabqiIdx >= sabqiTargetIdx)) {
          const j = parseNextSabqiPara(entries[sabqiTargetIdx].nextTarget!.trim())!;
          next.sabqi.portion = {
            ...emptyPortion(), mode: "para", juz: j, extent: "full",
          };
        }
        // Manzil: the daily cycle over older memorized juz — last
        // manzil's juz + 1, wrapping after 30. Logged per juz. A stored
        // manzil override ("Manzil: Para N (…)") beats the rotation,
        // consumed the same way as the sabqi one.
        const manzilTargetIdx = entries.findIndex(
          (e) => parseNextManzilParts((e.nextTarget ?? "").trim()) !== null,
        );
        const lastManzilIdx = entries.findIndex((e) => e.kind === "manzil" && !e.missed);
        const lastManzil = lastManzilIdx >= 0 ? entries[lastManzilIdx] : null;
        if (manzilTargetIdx >= 0 && (lastManzilIdx === -1 || lastManzilIdx >= manzilTargetIdx)) {
          const mvParts = parseNextManzilParts(entries[manzilTargetIdx].nextTarget!.trim())!;
          next.manzil.portion = {
            ...emptyPortion(), mode: "para", juz: mvParts[0].juz, extent: mvParts[0].extent,
          };
          setManzilPart2(mvParts[1] ?? null);
        } else {
          const lastJuz = lastManzil?.juzNumber ?? null;
          const rotJuz = lastJuz ? (lastJuz % 30) + 1 : 1;
          next.manzil.portion = {
            ...next.manzil.portion,
            juz: rotJuz,
            pretty: lastJuz ? t("hifzRound.prettyManzil", { juz: rotJuz }) : undefined,
          };
        }
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
          // Para-mode entries carry the juz-start marker in surah/ayah —
          // rendering that read as a one-ayah recitation ("Sabqi
          // Al-Mu'minun 1–1"; Muneeb, 10 Sep). Show the juz instead.
          const portionText = latest.juzNumber
            ? `${t("hifzTeach.juzN", { n: latest.juzNumber })}${formatJuzExtent(latest.juzExtent, latest.juzNumber)}`
            : `${surahDisplayName(latest.surahNumber, lang)} ${latest.ayahFrom}–${latest.ayahTo}`;
          setLastLine(
            `${when}: ${kindWord} ${portionText}` +
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
        : portionLabel(k.portion, t, lang);
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

  // What will be assigned for tomorrow, as the teacher will read it.
  // Mirrors the save logic exactly — if these two ever disagree, the
  // line is lying, so keep them in lockstep.
  const tomorrowText = (key: KindKey): { text: string; auto: boolean; hint?: boolean } | null => {
    const k = kinds[key];
    // Untouched kinds log nothing, so no assignment can ride on them —
    // but an invisible line read as a missing feature (pilot, Sep 6).
    // Show WHERE tomorrow will appear, muted, without the change button
    // (an override on an unsaved kind would be silently dropped).
    if (key === "manzil" && manzilSkipReason !== null) {
      return {
        text: t("hifzRound.manzilSkipTomorrow", { n: k.portion.juz }),
        auto: true,
        hint: true,
      };
    }
    if (k.quality === "" && !(key === "sabaq" ? ovSabaq : key === "sabqi" ? ovSabqi : ovManzil)) {
      return { text: t("hifzRound.tomorrowAfterRate"), auto: true, hint: true };
    }
    if (key === "sabaq") {
      if (ovSabaq) {
        return { text: serializeNextSabaq(ovSabaq.surah, ovSabaq.from, ovSabaq.to), auto: false };
      }
      if (k.quality === "") return null;
      const pn = k.portion;
      if (pn.mode !== "surah") {
        // Consolidation day - the ratings run the break: weak/repeat
        // hears the para again tomorrow, good resumes the stashed sabaq.
        if (isRepeatRating(k.quality)) {
          return {
            text: t("hifzRound.tomorrowManzilRepeat", {
              portion: t("hifzRound.paraRevisionLabel", { n: pn.juz }),
            }),
            auto: true,
          };
        }
        return sabaqResume
          ? { text: serializeNextSabaq(sabaqResume.surahNumber, sabaqResume.from, sabaqResume.to), auto: true }
          : { text: t("hifzRound.tomorrowPick"), auto: true };
      }
      if (isRepeatRating(k.quality)) {
        return { text: serializeNextSabaq(pn.surah, pn.from, pn.to), auto: true };
      }
      const nxt = nextSabaqAfter(pn.surah, pn.from, pn.to);
      if (nxt) {
        const doneJuz = paraBreak ? paraFinishedBySabaq(pn.surah, pn.from, pn.to) : null;
        if (doneJuz) {
          return {
            text: `${t("hifzRound.paraRevisionLabel", { n: doneJuz })} — ${t("hifzRound.thenResume", {
              portion: `${surahDisplayName(nxt.surahNumber, lang)} ${nxt.from}–${nxt.to}`,
            })}`,
            auto: true,
          };
        }
        return { text: serializeNextSabaq(nxt.surahNumber, nxt.from, nxt.to), auto: true };
      }
      // Only reachable after An-Nas — nothing left to assign.
      return { text: t("hifzRound.tomorrowBoundary"), auto: true };
    }
    if (key === "sabqi") {
      if (ovSabqi) {
        const txt = ovSabqi.unit === "para"
          ? serializeNextSabqiPara(ovSabqi.juz)
          : serializeNextSabqiSurahs(ovSabqi.parts);
        if (txt) return { text: txt, auto: false };
      }
      if (k.quality === "") return null;
      return { text: t("hifzRound.tomorrowSabqiAuto"), auto: true };
    }
    if (ovManzil) {
      return { text: serializeNextManzil(ovManzil.juz, ovManzil.extent), auto: false };
    }
    if (k.quality === "") return null;
    // Manzil follows the rating like the sabaq does (Muneeb, 10 Sep):
    // weak/repeat repeats the same portion; good/excellent moves to the
    // next segment of the SAME juz until it's finished, then rotates.
    const mp = k.portion;
    if (mp.mode !== "para" || mp.extent === "to_surah") {
      const nextJuz = (mp.juz % 30) + 1;
      return { text: t("hifzRound.tomorrowManzilAuto", { n: nextJuz }), auto: true };
    }
    const mRepeat = isRepeatRating(k.quality);
    // A two-slice sitting is a sliding window: repeat keeps both slices,
    // advance moves each slice one juz forward (16 second-half + 17
    // first-half → 17 second-half + 18 first-half).
    if (manzilPart2) {
      const parts: ManzilPart[] = [
        { juz: mp.juz, extent: mp.extent as AssignExtent },
        manzilPart2,
      ];
      const nextParts = mRepeat
        ? parts
        : parts.map((x) => ({ juz: (x.juz % 30) + 1, extent: x.extent }));
      const portion = nextParts
        .map((x) => `${t("hifzTeach.juzN", { n: x.juz })}${formatJuzExtent(x.extent)}`)
        .join(" + ");
      return {
        text: t(mRepeat ? "hifzRound.tomorrowManzilRepeat" : "hifzRound.tomorrowManzilRotate", { portion }),
        auto: true,
      };
    }
    const d = nextManzilAfter(mp.juz, mp.extent as AssignExtent, mRepeat);
    const portion = `${t("hifzTeach.juzN", { n: d.juz })}${formatJuzExtent(d.extent)}`;
    if (mRepeat) return { text: t("hifzRound.tomorrowManzilRepeat", { portion }), auto: true };
    if (d.juz === mp.juz) return { text: t("hifzRound.tomorrowManzilNext", { portion }), auto: true };
    return d.extent === "full"
      ? { text: t("hifzRound.tomorrowManzilAuto", { n: d.juz }), auto: true }
      : { text: t("hifzRound.tomorrowManzilRotate", { portion }), auto: true };
  };

  const saveAndNext = async () => {
    if (!currentId || !current) return;
    const scoped = KIND_META.filter((m) => SCOPE_KINDS[scope].includes(m.key));
    const skipActive = manzilSkipReason !== null && scoped.some((m) => m.key === "manzil");
    // A skipped manzil overrides any quality accidentally tapped on it.
    const touched = scoped.filter(
      (m) => kinds[m.key].quality !== "" && !(m.key === "manzil" && skipActive),
    );
    if (touched.length === 0 && !skipActive) {
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
          if (ovSabaq) {
            // The teacher named tomorrow's sabaq herself.
            input.nextTarget = serializeNextSabaq(ovSabaq.surah, ovSabaq.from, ovSabaq.to);
          } else if (p.mode === "surah") {
            // Auto-assign the next sabaq (default in Round Mode): advance
            // on excellent/good (same length; rolls into the next surah
            // at a boundary — principal's call, 7 Sep), repeat on
            // weak/repeat. When the advance finishes a para and the
            // school keeps the para break on, tomorrow is the full-para
            // consolidation with the continuation stashed inside.
            if (isRepeatRating(k.quality)) {
              input.nextTarget = serializeNextSabaq(p.surah, p.from, p.to);
            } else {
              const nxt = nextSabaqAfter(p.surah, p.from, p.to);
              if (nxt) {
                const doneJuz = paraBreak ? paraFinishedBySabaq(p.surah, p.from, p.to) : null;
                input.nextTarget = doneJuz
                  ? serializeSabaqParaRevision(doneJuz, nxt)
                  : serializeNextSabaq(nxt.surahNumber, nxt.from, nxt.to);
              }
            }
          } else {
            // Consolidation-day para-mode sabaq: mirror of tomorrowText.
            if (isRepeatRating(k.quality)) {
              input.nextTarget = serializeSabaqParaRevision(p.juz, sabaqResume);
            } else if (sabaqResume) {
              input.nextTarget = serializeNextSabaq(sabaqResume.surahNumber, sabaqResume.from, sabaqResume.to);
            }
          }
        }
        // Sabqi and manzil normally need no assignment at all — sabqi
        // follows the sabaq and manzil rotates. An override is the
        // teacher departing from the method on purpose, so it is stored
        // and will win over the derived suggestion at prefill.
        if (meta.key === "sabqi" && ovSabqi) {
          const target = ovSabqi.unit === "para"
            ? serializeNextSabqiPara(ovSabqi.juz)
            : serializeNextSabqiSurahs(ovSabqi.parts);
          if (target) input.nextTarget = target;
        }
        // Manzil target — mirror of tomorrowText's derivation. With a
        // two-slice sitting the target must ride the LAST-saved manzil
        // entry (prefill reads the newest one), so it's held back here
        // and attached to the part-2 insert below.
        let manzilTarget: string | undefined;
        const manzilTwoSlices = meta.key === "manzil" && manzilPart2 !== null &&
          p.mode === "para" && p.extent !== "to_surah";
        if (meta.key === "manzil") {
          if (ovManzil) {
            manzilTarget = serializeNextManzil(ovManzil.juz, ovManzil.extent);
          } else if (manzilTwoSlices) {
            const mRepeat = isRepeatRating(k.quality);
            const parts: ManzilPart[] = [
              { juz: p.juz, extent: p.extent as AssignExtent },
              manzilPart2!,
            ];
            manzilTarget = serializeNextManzilParts(
              mRepeat ? parts : parts.map((x) => ({ juz: (x.juz % 30) + 1, extent: x.extent })),
            );
          } else if (p.mode === "para" && p.extent !== "to_surah") {
            const mRepeat = isRepeatRating(k.quality);
            const d = nextManzilAfter(p.juz, p.extent as AssignExtent, mRepeat);
            manzilTarget = serializeNextManzil(d.juz, d.extent);
          }
          if (!manzilTwoSlices) input.nextTarget = manzilTarget;
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
        if (manzilTwoSlices) {
          // The second slice is its own entry; it carries the derived
          // target so it sits on the newest manzil row for prefill.
          const start2 = JUZ_STARTS[manzilPart2!.juz - 1];
          await postHifzEntry(orgId, {
            studentId: currentId,
            surahNumber: start2.surah,
            ayahFrom: start2.ayah,
            ayahTo: start2.ayah,
            kind: "manzil",
            quality: STORED_QUALITY[k.quality],
            juzNumber: manzilPart2!.juz,
            juzExtent: manzilPart2!.extent,
            nextTarget: manzilTarget,
          });
        }
      }
      if (skipActive) {
        // The opt-out marker: a missed manzil entry carrying the reason.
        // Prefill ignores missed rows, so the rotation re-suggests the
        // same juz tomorrow, and the parent grid never paints the day
        // red for it (server keeps red squares sabaq-only).
        const mp = kinds.manzil.portion;
        const para = mp.mode === "para" && mp.juz >= 1 && mp.juz <= 30;
        const start = para ? JUZ_STARTS[mp.juz - 1] : null;
        await postHifzEntry(orgId, {
          studentId: currentId,
          surahNumber: para ? start!.surah : mp.surah,
          ayahFrom: para ? start!.ayah : 1,
          ayahTo: para ? start!.ayah : 1,
          kind: "manzil",
          juzNumber: para ? mp.juz : undefined,
          missed: true,
          missedTargetReason: manzilSkipReason!.trim() || undefined,
        });
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
          manzil: m[currentId]?.manzil || skipActive || touched.some((t) => t.key === "manzil"),
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
      <option value="sabqi">{t("hifzRound.scopeSabqi")}</option>
      <option value="manzil">{t("hifzRound.scopeManzil")}</option>
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
                      {portionLabel(k.portion, t, lang)} <span className="text-slate-400">▾</span>
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
                  {/* Manzil opt-out with a reason (teacher feedback, 11 Sep). */}
                  {meta.key === "manzil" && (
                    manzilSkipReason !== null ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                        <span className="text-[11.5px] font-medium text-amber-900">
                          {t("hifzRound.manzilSkippedChip", { reason: manzilSkipReason })}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setManzilSkipReason(null); setManzilSkipDraft(""); }}
                          className="text-[11px] text-amber-700 underline hover:text-amber-900"
                        >
                          {t("hifzRound.manzilSkipUndo")}
                        </button>
                      </div>
                    ) : manzilSkipOpen ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                          value={manzilSkipDraft}
                          onChange={(e) => setManzilSkipDraft(e.target.value)}
                          placeholder={t("hifzRound.manzilSkipReasonPh")}
                          className="h-8 w-72 bg-white text-[12px]"
                          maxLength={200}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-amber-300 text-amber-900"
                          disabled={!manzilSkipDraft.trim()}
                          onClick={() => { setManzilSkipReason(manzilSkipDraft.trim()); setManzilSkipOpen(false); }}
                        >
                          {t("hifzRound.manzilSkipConfirm")}
                        </Button>
                        <button
                          type="button"
                          onClick={() => { setManzilSkipOpen(false); setManzilSkipDraft(""); }}
                          className="text-[11px] text-slate-400 underline hover:text-slate-600"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setManzilSkipOpen(true)}
                        className="mt-1.5 mr-3 text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        {t("hifzRound.manzilSkipLink")}
                      </button>
                    )
                  )}
                  {/* Straddling sitting — a second manzil slice in another
                      para ("second half of 16 + first half of 17"). */}
                  {meta.key === "manzil" && manzilSkipReason === null && (
                    manzilPart2 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">{t("hifzRound.plusPara")}</span>
                        <Select
                          value={String(manzilPart2.juz)}
                          onValueChange={(v) => setManzilPart2({ ...manzilPart2, juz: Number(v) })}
                        >
                          <SelectTrigger className="h-8 w-28 bg-white text-[12px]"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                              <SelectItem key={j} value={String(j)}>{t("hifzTeach.juzN", { n: j })}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={manzilPart2.extent}
                          onValueChange={(v) => setManzilPart2({ ...manzilPart2, extent: v as AssignExtent })}
                        >
                          <SelectTrigger className="h-8 w-56 bg-white text-[12px]"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {PARA_EXTENT_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() => setManzilPart2(null)}
                          className="text-[11px] text-slate-400 underline hover:text-slate-600"
                        >
                          {t("hifzRound.removePara")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setManzilPart2({ juz: (k.portion.juz % 30) + 1, extent: "half" })}
                        className="mt-1.5 text-[11px] font-semibold text-indigo-600 hover:underline"
                      >
                        + {t("hifzRound.addSecondPara")}
                      </button>
                    )
                  )}
                  <div className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">
                    {alreadyHeard ? t("hifzRound.alreadyLogged") : t(meta.noteKey)}
                  </div>

                  {/* Tomorrow, in place. The round derives every next
                      lesson by default; this line shows what will be
                      assigned and lets the teacher say otherwise without
                      leaving the round — "sabqi kal Surah Nas tak". */}
                  {(() => {
                    const tm = tomorrowText(meta.key);
                    if (!tm) return null;
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
                        <span className={tm.hint ? "text-slate-400 italic" : tm.auto ? "text-slate-500" : "font-semibold text-indigo-700"}>
                          {tm.hint ? tm.text : `${t("hifzRound.tomorrowLabel")} ${tm.text}`}
                        </span>
                        {!tm.hint && <button
                          type="button"
                          onClick={() => setNextOpen(nextOpen === meta.key ? null : meta.key)}
                          className="rounded border border-slate-200 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          {nextOpen === meta.key ? t("common.close") : t("hifzRound.change")}
                        </button>}
                        {!tm.auto && (
                          <button
                            type="button"
                            onClick={() => {
                              if (meta.key === "sabaq") setOvSabaq(null);
                              else if (meta.key === "sabqi") setOvSabqi(null);
                              else setOvManzil(null);
                              setNextOpen(null);
                            }}
                            className="text-[10.5px] text-slate-400 underline hover:text-slate-600"
                          >
                            {t("hifzRound.useAuto")}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {nextOpen === meta.key && meta.key === "sabaq" && (() => {
                    const cur = ovSabaq ?? (() => {
                      const pn = kinds.sabaq.portion;
                      const nxt = nextSabaqAfter(pn.surah, pn.from, pn.to);
                      return nxt
                        ? { surah: nxt.surahNumber, from: nxt.from, to: nxt.to }
                        : { surah: pn.surah, from: pn.from, to: pn.to };
                    })();
                    const set = (patch: Partial<typeof cur>) => setOvSabaq({ ...cur, ...patch });
                    const maxA = getSurah(cur.surah)?.ayahCount ?? 286;
                    return (
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2 sm:grid-cols-4">
                        <Select value={String(cur.surah)} onValueChange={(v) => set({ surah: Number(v) })}>
                          <SelectTrigger className="col-span-2 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {SURAHS.map((sx) => (
                              <SelectItem key={sx.number} value={String(sx.number)}>
                                {sx.number}. {surahDisplayName(sx, lang)} ({sx.ayahCount})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" inputMode="numeric" min={1} max={maxA} value={cur.from}
                          onChange={(e) => set({ from: Number(e.target.value) || 1 })} className="bg-white" />
                        <Input type="number" inputMode="numeric" min={cur.from} max={maxA} value={cur.to}
                          onChange={(e) => set({ to: Number(e.target.value) || cur.from })} className="bg-white" />
                      </div>
                    );
                  })()}

                  {nextOpen === meta.key && meta.key === "sabqi" && (() => {
                    const cur = ovSabqi ?? {
                      unit: "surah" as const,
                      parts: [{ surah: kinds.sabaq.portion.surah, from: null, to: null }],
                      juz: kinds.sabqi.portion.juz,
                    };
                    const set = (patch: Partial<typeof cur>) => setOvSabqi({ ...cur, ...patch });
                    return (
                      <div className="mt-2 space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                        <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                          {(["surah", "para"] as const).map((u) => (
                            <button key={u} type="button" onClick={() => set({ unit: u })}
                              className={"px-3 py-1 text-xs font-medium " +
                                (cur.unit === u ? "bg-indigo-600 text-white" : "bg-white text-slate-600")}>
                              {u === "surah" ? t("hifzTeach.bySurah") : t("hifzTeach.byPara")}
                            </button>
                          ))}
                        </div>
                        {cur.unit === "para" ? (
                          <Select value={String(cur.juz)} onValueChange={(v) => set({ juz: Number(v) })}>
                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                                <SelectItem key={j} value={String(j)}>{t("hifzTeach.juzN", { n: j })}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="space-y-1.5">
                            {cur.parts.map((part, i) => {
                              const info = getSurah(part.surah);
                              const whole = part.from == null;
                              const setPart = (patch: Partial<SabqiPart>) =>
                                set({ parts: cur.parts.map((x, xi) => (xi === i ? { ...x, ...patch } : x)) });
                              return (
                                <div key={i} className="flex flex-wrap items-center gap-1.5">
                                  <Select value={String(part.surah)} onValueChange={(v) => setPart({ surah: Number(v) })}>
                                    <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="max-h-64">
                                      {SURAHS.map((sx) => (
                                        <SelectItem key={sx.number} value={String(sx.number)}>
                                          {sx.number}. {surahDisplayName(sx, lang)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <label className="flex items-center gap-1 text-[11px] text-slate-600">
                                    <input type="checkbox" checked={whole}
                                      onChange={(e) => setPart(e.target.checked
                                        ? { from: null, to: null }
                                        : { from: 1, to: info?.ayahCount ?? 1 })} />
                                    {t("hifzTeach.assignFullSurah")}
                                  </label>
                                  {!whole && (
                                    <>
                                      <Input type="number" inputMode="numeric" min={1} max={info?.ayahCount ?? 999}
                                        value={part.from ?? 1}
                                        onChange={(e) => setPart({ from: Number(e.target.value) || 1 })}
                                        className="w-16 bg-white" />
                                      <Input type="number" inputMode="numeric" min={part.from ?? 1} max={info?.ayahCount ?? 999}
                                        value={part.to ?? 1}
                                        onChange={(e) => setPart({ to: Number(e.target.value) || 1 })}
                                        className="w-16 bg-white" />
                                    </>
                                  )}
                                  {cur.parts.length > 1 && (
                                    <button type="button" aria-label={t("common.delete")}
                                      onClick={() => set({ parts: cur.parts.filter((_, xi) => xi !== i) })}
                                      className="px-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">
                                      &times;
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {cur.parts.length < 4 && (
                              <button type="button"
                                onClick={() => set({ parts: [...cur.parts, { surah: 1, from: null, to: null }] })}
                                className="rounded border border-indigo-200 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50">
                                {t("hifzTeach.assignAddSurah")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {nextOpen === meta.key && meta.key === "manzil" && (() => {
                    const cur = ovManzil ?? { juz: (kinds.manzil.portion.juz % 30) + 1, extent: "full" as AssignExtent };
                    const set = (patch: Partial<typeof cur>) => setOvManzil({ ...cur, ...patch });
                    return (
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                        <Select value={String(cur.juz)} onValueChange={(v) => set({ juz: Number(v) })}>
                          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                              <SelectItem key={j} value={String(j)}>{t("hifzTeach.juzN", { n: j })}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={cur.extent} onValueChange={(v) => set({ extent: v as AssignExtent })}>
                          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PARA_EXTENT_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}

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
                                    {s.number}. {surahDisplayName(s, lang)} ({s.ayahCount})
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
                              {PARA_EXTENT_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                              ))}
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
                                      {su.number}. {surahDisplayName(su, lang)}
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
