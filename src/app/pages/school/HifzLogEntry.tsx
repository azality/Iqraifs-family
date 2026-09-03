// Phase C.1: Hifz logger modal.
//
// Used from StudentDetail ("Log Hifz" button) and SectionHifzOverview
// (clicking a student row). Records a single hifz entry for a student.
//
// Redesigned per pilot feedback (Muneeb, 2026-09-02): the KIND drives
// the form, so it sits at the top and each kind shows only its own
// fields — sabaq (new lesson + assign tomorrow's), sabqi (recent
// revision portion), manzil (which JUZ was revised, no ayah typing).
// For hifz classes (hifzOnly) the kinds are ONLY sabaq/sabqi/manzil;
// academic Quran/Nazra tracks keep the full six.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../components/ui/radio-group";
import { toast } from "sonner";
import {
  getStudentHifz,
  postHifzEntry,
  type HifzKind,
  type HifzQuality,
} from "../../../utils/schoolApi";
import { SURAHS, getSurah } from "../../../utils/quranSurahs";

interface Props {
  orgId: string;
  studentId: string;
  studentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Hifz classes log only the daily trio — sabaq / sabqi / manzil. */
  hifzOnly?: boolean;
  /** Classroom flow (pilot): students come to the teacher one by one, so
   *  after saving the teacher moves to the NEXT student without closing
   *  the dialog. The parent swaps studentId/studentName; state resets on
   *  the id change. Null/undefined on the last student (or when the
   *  caller has no roster, e.g. StudentDetail). */
  onNextStudent?: (() => void) | null;
  /** e.g. "Student 3 of 19" — shown under the title when roster-driven. */
  positionLabel?: string | null;
}

const TRIO: Array<{ value: HifzKind; labelKey: string; hintKey: string }> = [
  { value: "sabaq", labelKey: "hifzTeach.sabaq", hintKey: "hifzTeach.sabaqHint" },
  { value: "sabqi", labelKey: "hifzTeach.sabqi", hintKey: "hifzTeach.sabqiHint" },
  { value: "manzil", labelKey: "hifzTeach.manzil", hintKey: "hifzTeach.manzilHint" },
];
// Academic Quran tracks only — plain strings pass through untranslated.
const EXTRA_KINDS: Array<{ value: HifzKind; labelKey: string; hintKey: string }> = [
  { value: "memorized", labelKey: "Memorized", hintKey: "Newly memorized" },
  { value: "revised", labelKey: "Revised", hintKey: "General revision" },
  { value: "tested", labelKey: "Tested", hintKey: "Formal test" },
];

const QUALITY_OPTIONS: Array<{ value: HifzQuality; labelKey: string }> = [
  { value: "excellent", labelKey: "hifzTeach.qExcellent" },
  { value: "good", labelKey: "hifzTeach.qGood" },
  { value: "needs_practice", labelKey: "hifzTeach.qNeedsPractice" },
  { value: "weak", labelKey: "hifzTeach.qWeak" },
  { value: "not_learned", labelKey: "hifzTeach.qNotLearned" },
];

// Standard (hafs) juz start positions — used as the stored position
// marker for manzil entries so teachers pick a juz instead of typing
// ayah ranges. Manzil never counts toward memorized totals, so the
// marker ayah is display-only.
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

// next_target round-trip format: "Sabaq: <Transliterated name> <from>–<to>".
// Human-readable (parents see it) AND parseable for next-day prefill.
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

export function HifzLogEntry({
  orgId,
  studentId,
  studentName,
  open,
  onOpenChange,
  onSuccess,
  hifzOnly = false,
  onNextStudent = null,
  positionLabel = null,
}: Props) {
  const { t } = useTranslation();
  const [surahNumber, setSurahNumber] = useState<number>(1);
  const [ayahFrom, setAyahFrom] = useState<number | "">(1);
  const [ayahTo, setAyahTo] = useState<number | "">(1);
  const [kind, setKind] = useState<HifzKind>("sabaq");
  const [quality, setQuality] = useState<HifzQuality | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Manzil is revised per JUZ, not per ayah range.
  const [manzilJuz, setManzilJuz] = useState<number | "">("");

  // Sabqi by para (pilot: Qari Waqar) — hifz teachers reference sabqi
  // as "para 26 until nisf/ruba/salasa" or "para 30 up to Surah X",
  // not surah+ayah. Stored as juz_number + juz_extent; surah/ayah keep
  // the juz-start marker (manzil's display-only convention).
  const [sabqiMode, setSabqiMode] = useState<"surah" | "para">("surah");
  const [sabqiJuz, setSabqiJuz] = useState<number | "">("");
  const [sabqiExtent, setSabqiExtent] = useState<string>("full");
  const [sabqiToSurah, setSabqiToSurah] = useState<number>(1);

  // "Assign next sabaq" — the teacher gives the student their next
  // lesson while hearing today's. Stored in next_target; the standing
  // assignment prefills the next sabaq log for this student.
  const [assignOn, setAssignOn] = useState(false);
  const [assignSurah, setAssignSurah] = useState<number>(1);
  const [assignFrom, setAssignFrom] = useState<number | "">(1);
  const [assignTo, setAssignTo] = useState<number | "">(1);
  const [lastAssigned, setLastAssigned] = useState<string | null>(null);
  // Smart next-sabaq suggestion (pilot: "system khud samajh jaye ke ayah
  // 11 se shuru hona chahiye"). Once the teacher touches any assign field
  // (or the toggle) the suggestion never overwrites their input.
  const [assignTouched, setAssignTouched] = useState(false);
  const [suggestion, setSuggestion] = useState<"none" | "advance" | "repeat">("none");

  // PR feat/hifz-trends-missed-teacher — explicit miss toggle. When
  // checked we send missed=true; the form's other fields stay
  // optional but the parent grid sees a red square for that day.
  const [missed, setMissed] = useState(false);
  // Full-module fields (PR feat/hifz-full-module). All optional —
  // teachers don't have to fill every one for a single sabaq entry, but
  // they're available when they want to capture richer context.
  const [juzNumber, setJuzNumber] = useState<number | "">("");
  const [pageNumber, setPageNumber] = useState<number | "">("");
  const [mistakesCount, setMistakesCount] = useState<number | "">("");
  const [tajweedNotes, setTajweedNotes] = useState("");
  const [fluencyNotes, setFluencyNotes] = useState("");
  const [teacherRemarks, setTeacherRemarks] = useState("");
  const [parentComments, setParentComments] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [nextTarget, setNextTarget] = useState("");
  const [missedTargetReason, setMissedTargetReason] = useState("");
  const [parentAction, setParentAction] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // "" while editing -> 0 for arithmetic/validation.
  const num = (v: number | ""): number => (v === "" ? 0 : v);
  // Free typing: parse but never clamp mid-edit; clamping happens onBlur.
  const typed = (raw: string): number | "" =>
    raw === "" ? "" : Math.max(0, Math.floor(Number(raw) || 0));

  const surah = getSurah(surahNumber);
  const maxAyah = surah?.ayahCount ?? 1;
  const assignMaxAyah = getSurah(assignSurah)?.ayahCount ?? 1;

  const kindOptions = hifzOnly ? TRIO : [...TRIO, ...EXTRA_KINDS];

  // Reset on open + pull the standing assignment so today's sabaq is
  // prefilled with what the teacher assigned last time.
  useEffect(() => {
    if (!open) return;
    setSurahNumber(1);
    setAyahFrom(1);
    setAyahTo(1);
    setKind("sabaq");
    setQuality("");
    setNotes("");
    setManzilJuz("");
    setSabqiJuz("");
    setSabqiExtent("full");
    setSabqiToSurah(1);
    setAssignOn(false);
    setAssignSurah(1);
    setAssignFrom(1);
    setAssignTo(1);
    setLastAssigned(null);
    setAssignTouched(false);
    setSuggestion("none");
    setJuzNumber("");
    setPageNumber("");
    setMistakesCount("");
    setTajweedNotes("");
    setFluencyNotes("");
    setTeacherRemarks("");
    setParentComments("");
    setDailyTarget("");
    setNextTarget("");
    setMissedTargetReason("");
    setParentAction("");
    setAdvancedOpen(false);
    setMissed(false);

    getStudentHifz(orgId, studentId, { limit: 10 })
      .then((r) => {
        const withTarget = r.entries.find((e) => (e.nextTarget ?? "").trim().length > 0);
        if (!withTarget?.nextTarget) return;
        setLastAssigned(withTarget.nextTarget);
        const parsed = parseNextSabaq(withTarget.nextTarget);
        if (parsed) {
          setSurahNumber(parsed.surahNumber);
          setAyahFrom(parsed.from);
          setAyahTo(parsed.to);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId, studentId]);

  // Clamp ayah range when surah changes
  useEffect(() => {
    if (num(ayahFrom) > maxAyah) setAyahFrom(1);
    if (num(ayahTo) > maxAyah) setAyahTo(maxAyah);
    if (ayahFrom !== "" && ayahTo !== "" && ayahTo < ayahFrom) setAyahTo(ayahFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahNumber]);
  useEffect(() => {
    if (num(assignFrom) > assignMaxAyah) setAssignFrom(1);
    if (num(assignTo) > assignMaxAyah) setAssignTo(assignMaxAyah);
    if (assignFrom !== "" && assignTo !== "" && assignTo < assignFrom) setAssignTo(assignFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignSurah]);

  // Smart next-sabaq suggestion. Fires on the sabaq entry once a quality
  // is picked (or missed is checked), and only while the teacher hasn't
  // touched the assign fields themselves:
  //   good recitation  → continue: next portion of the same length,
  //                      within the same surah (11–20 after 1–10).
  //   weak / not learned / missed → repeat the same sabaq tomorrow.
  // Surah-boundary advance is left to the teacher — memorization order
  // past a finished surah is a school decision (forward vs juz-30-back),
  // so we suggest nothing there rather than guess wrong.
  useEffect(() => {
    if (kind !== "sabaq" || assignTouched) return;
    if (ayahFrom === "" || ayahTo === "" || ayahTo < ayahFrom) return;
    const repeat = missed ||
      quality === "needs_practice" || quality === "weak" || quality === "not_learned";
    const advance = !missed && (quality === "excellent" || quality === "good");
    if (repeat) {
      setAssignSurah(surahNumber);
      setAssignFrom(ayahFrom);
      setAssignTo(ayahTo);
      setAssignOn(true);
      setSuggestion("repeat");
    } else if (advance) {
      if (ayahTo >= maxAyah) {
        // Surah finished — no safe within-surah continuation.
        setAssignOn(false);
        setSuggestion("none");
        return;
      }
      const len = Math.max(1, ayahTo - ayahFrom + 1);
      setAssignSurah(surahNumber);
      setAssignFrom(ayahTo + 1);
      setAssignTo(Math.min(ayahTo + len, maxAyah));
      setAssignOn(true);
      setSuggestion("advance");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, quality, missed, surahNumber, ayahFrom, ayahTo, maxAyah, assignTouched]);

  const isManzil = kind === "manzil";
  const isSabaq = kind === "sabaq";
  const isParaSabqi = kind === "sabqi" && sabqiMode === "para";

  // after="kind": the daily trio (sabaq → sabqi → manzil) is three
  // entries per child; the dialog stays open and advances Kind.
  // after="student": classroom flow — save this child and swap to the
  // next one in the roster (the parent changes studentId; state resets).
  const KIND_SEQUENCE: string[] = ["sabaq", "sabqi", "manzil"];
  const handleSubmit = async (after: "close" | "kind" | "student" = "close") => {
    let sendSurah = surahNumber;
    let sendFrom = num(ayahFrom);
    let sendTo = num(ayahTo);
    if (isManzil) {
      if (typeof manzilJuz !== "number") {
        toast.error("Pick which juz was revised");
        return;
      }
      const start = JUZ_STARTS[manzilJuz - 1];
      sendSurah = start.surah;
      sendFrom = start.ayah;
      sendTo = start.ayah;
    } else if (isParaSabqi) {
      if (typeof sabqiJuz !== "number") {
        toast.error(t("hifzTeach.pickParaFirst"));
        return;
      }
      const start = JUZ_STARTS[sabqiJuz - 1];
      sendSurah = start.surah;
      sendFrom = start.ayah;
      sendTo = start.ayah;
    } else if (!missed) {
      if (sendFrom < 1 || sendFrom > maxAyah) {
        toast.error(`Ayah from must be 1–${maxAyah}`);
        return;
      }
      if (sendTo < sendFrom || sendTo > maxAyah) {
        toast.error(`Ayah to must be ${sendFrom}–${maxAyah}`);
        return;
      }
    }
    // Assign fields tolerate mid-edit values: clamp them into range
    // instead of failing the whole save.
    const aFrom = Math.min(Math.max(num(assignFrom), 1), assignMaxAyah);
    const aTo = Math.min(Math.max(num(assignTo), aFrom), assignMaxAyah);
    const structuredNext = assignOn
      ? serializeNextSabaq(assignSurah, aFrom, aTo)
      : undefined;
    setSubmitting(true);
    try {
      await postHifzEntry(orgId, {
        studentId,
        surahNumber: sendSurah,
        ayahFrom: sendFrom,
        ayahTo: sendTo,
        kind,
        quality: quality || undefined,
        notes: notes.trim() || undefined,
        juzNumber: isManzil
          ? (manzilJuz as number)
          : isParaSabqi
          ? (sabqiJuz as number)
          : typeof juzNumber === "number" ? juzNumber : undefined,
        juzExtent: isParaSabqi
          ? (sabqiExtent === "to_surah" ? `to_surah:${sabqiToSurah}` : sabqiExtent)
          : undefined,
        pageNumber: typeof pageNumber === "number" ? pageNumber : undefined,
        mistakesCount: typeof mistakesCount === "number" ? mistakesCount : undefined,
        tajweedNotes: tajweedNotes.trim() || undefined,
        fluencyNotes: fluencyNotes.trim() || undefined,
        teacherRemarks: teacherRemarks.trim() || undefined,
        parentComments: parentComments.trim() || undefined,
        dailyTarget: dailyTarget.trim() || undefined,
        nextTarget: structuredNext ?? (nextTarget.trim() || undefined),
        missedTargetReason: missedTargetReason.trim() || undefined,
        parentAction: parentAction.trim() || undefined,
        missed: missed || undefined,
      });
      onSuccess?.();
      if (after === "kind") {
        const idx = KIND_SEQUENCE.indexOf(kind);
        const next = idx >= 0 && idx < KIND_SEQUENCE.length - 1 ? KIND_SEQUENCE[idx + 1] : null;
        toast.success(
          `${kind.charAt(0).toUpperCase() + kind.slice(1)} logged` +
            (next ? ` — now ${next}` : ""),
        );
        // Per-entry fields reset; surah/ayah stay (teacher adjusts them
        // for the next portion anyway, keeping them beats retyping).
        setQuality("");
        setNotes("");
        setMissed(false);
        setAssignOn(false);
        setAssignTouched(false);
        setSuggestion("none");
        if (next) setKind(next as typeof kind);
      } else if (after === "student" && onNextStudent) {
        toast.success(`${studentName} saved — next student`);
        onNextStudent(); // parent swaps studentId; the reset effect refreshes the form
      } else {
        toast.success("Hifz entry logged");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Log failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("hifzTeach.dialogTitle", { name: studentName })}</DialogTitle>
          <DialogDescription>
            {positionLabel ? `${positionLabel} · ` : ""}
            {hifzOnly
              ? t("hifzTeach.dialogHintHifz")
              : "Record sabaq, sabqi, manzil, or any hifz progress."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind FIRST — it decides which fields make sense below. */}
          <div className="space-y-2">
            <Label>{t("hifzTeach.kind")}</Label>
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as HifzKind)}
              className={hifzOnly ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}
            >
              {kindOptions.map((k) => (
                <label
                  key={k.value}
                  className={
                    "flex items-start gap-2 border rounded p-2 cursor-pointer hover:bg-muted/40 " +
                    (kind === k.value ? "border-indigo-400 bg-indigo-50/50" : "")
                  }
                >
                  <RadioGroupItem value={k.value} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{k.labelKey.startsWith("hifzTeach.") ? t(k.labelKey) : k.labelKey}</p>
                    <p className="text-xs text-muted-foreground">{k.hintKey.startsWith("hifzTeach.") ? t(k.hintKey) : k.hintKey}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Missed-sabaq quick switch — only meaningful on sabaq. */}
          {isSabaq && (
            <label className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={missed}
                onChange={(e) => setMissed(e.target.checked)}
              />
              <span className="text-sm text-rose-900">
                <span className="font-medium">{t("hifzTeach.missedToday")}</span>
                <span className="ml-1 text-xs text-rose-700">
                  {t("hifzTeach.missedHint")}
                </span>
              </span>
            </label>
          )}

          {/* Standing assignment (from the previous sabaq log). */}
          {isSabaq && lastAssigned && !missed && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900">
              {t("hifzTeach.assignedLastTime")} <span className="font-medium">{lastAssigned}</span>
              {parseNextSabaq(lastAssigned) ? ` ${t("hifzTeach.prefilledBelow")}` : ""}
            </div>
          )}

          {/* Sabqi position mode — by surah (default) or by para. */}
          {kind === "sabqi" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("hifzTeach.sabqiHow")}</span>
              <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSabqiMode("surah")}
                  className={
                    "px-3 py-1 text-xs font-medium " +
                    (sabqiMode === "surah" ? "bg-indigo-600 text-white" : "bg-white text-slate-600")
                  }
                >
                  {t("hifzTeach.bySurah")}
                </button>
                <button
                  type="button"
                  onClick={() => setSabqiMode("para")}
                  className={
                    "px-3 py-1 text-xs font-medium " +
                    (sabqiMode === "para" ? "bg-indigo-600 text-white" : "bg-white text-slate-600")
                  }
                >
                  {t("hifzTeach.byPara")}
                </button>
              </div>
            </div>
          )}

          {isParaSabqi ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>{t("hifzTeach.whichPara")}</Label>
                <Select
                  value={sabqiJuz === "" ? "" : String(sabqiJuz)}
                  onValueChange={(v) => setSabqiJuz(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("hifzTeach.pickJuz")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                      <SelectItem key={j} value={String(j)}>
                        {t("hifzTeach.juzN", { n: j })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("hifzTeach.howMuchPara")}</Label>
                <Select value={sabqiExtent} onValueChange={setSabqiExtent}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">{t("hifzTeach.extFull")}</SelectItem>
                    <SelectItem value="quarter">{t("hifzTeach.extQuarter")}</SelectItem>
                    <SelectItem value="half">{t("hifzTeach.extHalf")}</SelectItem>
                    <SelectItem value="three_quarters">{t("hifzTeach.extThreeQuarters")}</SelectItem>
                    <SelectItem value="to_surah">{t("hifzTeach.extToSurah")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sabqiExtent === "to_surah" && (
                <div className="space-y-1">
                  <Label>{t("hifzTeach.whichSurahTo")}</Label>
                  <Select
                    value={String(sabqiToSurah)}
                    onValueChange={(v) => setSabqiToSurah(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                {t("hifzTeach.paraSabqiNote")}
              </p>
            </div>
          ) : isManzil ? (
            <div className="space-y-1">
              <Label>{t("hifzTeach.whichJuz")}</Label>
              <Select
                value={manzilJuz === "" ? "" : String(manzilJuz)}
                onValueChange={(v) => setManzilJuz(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("hifzTeach.pickJuz")} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                    <SelectItem key={j} value={String(j)}>
                      {t("hifzTeach.juzN", { n: j })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("hifzTeach.manzilNote")}
              </p>
            </div>
          ) : (
            !(isSabaq && missed) && (
              <>
                <div className="space-y-1">
                  <Label>
                    {isSabaq ? t("hifzTeach.sabaqSurah") : kind === "sabqi" ? t("hifzTeach.sabqiSurah") : t("hifzTeach.surah")}
                  </Label>
                  <Select
                    value={String(surahNumber)}
                    onValueChange={(v) => setSurahNumber(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {SURAHS.map((s) => (
                        <SelectItem key={s.number} value={String(s.number)}>
                          {s.number}. {s.nameTransliterated} ({s.ayahCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {surah && (
                    <p className="text-xs text-muted-foreground">
                      {surah.nameArabic} · {t("hifzTeach.ayahsCount", { count: surah.ayahCount })}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("hifzTeach.ayahFrom")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={maxAyah}
                      value={ayahFrom}
                      onChange={(e) => setAyahFrom(typed(e.target.value))}
                      onBlur={() =>
                        setAyahFrom(Math.max(1, Math.min(maxAyah, num(ayahFrom) || 1)))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("hifzTeach.ayahTo")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={num(ayahFrom) || 1}
                      max={maxAyah}
                      value={ayahTo}
                      onChange={(e) => setAyahTo(typed(e.target.value))}
                      onBlur={() =>
                        setAyahTo(
                          Math.max(num(ayahFrom) || 1, Math.min(maxAyah, num(ayahTo) || num(ayahFrom) || 1)),
                        )
                      }
                    />
                  </div>
                </div>
              </>
            )
          )}

          <div className="space-y-1">
            <Label>{t("hifzTeach.quality")}</Label>
            <Select
              value={quality || "__none__"}
              onValueChange={(v) =>
                setQuality(v === "__none__" ? "" : (v as HifzQuality))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("hifzTeach.notRated")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("hifzTeach.notRated")}</SelectItem>
                {QUALITY_OPTIONS.map((q) => (
                  <SelectItem key={q.value} value={q.value}>
                    {t(q.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assign the NEXT lesson while hearing today's — the core of
              "give lesson to an individual student". Always available in
              hifz classes (pilot: Muneeb looked for it on the sabqi form
              and couldn't find it); sabaq-only elsewhere. */}
          {(isSabaq || hifzOnly) && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignOn}
                  onChange={(e) => {
                    setAssignTouched(true);
                    setAssignOn(e.target.checked);
                  }}
                />
                <span className="text-sm font-medium text-indigo-900">
                  {t("hifzTeach.assignNext")}
                </span>
              </label>
              {assignOn && (
                <div className="space-y-2">
                  <Select
                    value={String(assignSurah)}
                    onValueChange={(v) => {
                      setAssignTouched(true);
                      setAssignSurah(Number(v));
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {SURAHS.map((s) => (
                        <SelectItem key={s.number} value={String(s.number)}>
                          {s.number}. {s.nameTransliterated} ({s.ayahCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("hifzTeach.ayahFrom")}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={assignMaxAyah}
                        value={assignFrom}
                        onChange={(e) => {
                          setAssignTouched(true);
                          setAssignFrom(typed(e.target.value));
                        }}
                        onBlur={() =>
                          setAssignFrom(Math.max(1, Math.min(assignMaxAyah, num(assignFrom) || 1)))
                        }
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("hifzTeach.ayahTo")}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={num(assignFrom) || 1}
                        max={assignMaxAyah}
                        value={assignTo}
                        onChange={(e) => {
                          setAssignTouched(true);
                          setAssignTo(typed(e.target.value));
                        }}
                        onBlur={() =>
                          setAssignTo(
                            Math.max(num(assignFrom) || 1, Math.min(assignMaxAyah, num(assignTo) || num(assignFrom) || 1)),
                          )
                        }
                        className="bg-white"
                      />
                    </div>
                  </div>
                  {!assignTouched && suggestion !== "none" && (
                    <p className="text-[11px] font-medium text-emerald-700">
                      {suggestion === "repeat"
                        ? t("hifzTeach.suggestedRepeat")
                        : t("hifzTeach.suggestedAdvance")}
                    </p>
                  )}
                  <p className="text-[11px] text-indigo-800">
                    {t("hifzTeach.assignHint")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* PR feat/hifz-collapse-fields:
              Default form collapsed to one main remark + one optional action.
              Power-user fields (mistakes, tajweed/fluency, juz/page, internal
              note, targets, missed reason, parent_comments) live in Advanced.
              All previous fields still send — backend/storage unchanged. */}
          <div className="space-y-1">
            <Label>{t("hifzTeach.parentNote")}</Label>
            <Textarea
              value={teacherRemarks}
              onChange={(e) => setTeacherRemarks(e.target.value)}
              rows={3}
              placeholder={t("hifzTeach.parentNotePh")}
            />
          </div>

          <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <Label className="text-emerald-900">{t("hifzTeach.parentTonight")}</Label>
            <Input
              value={parentAction}
              onChange={(e) => setParentAction(e.target.value)}
              placeholder={t("hifzTeach.parentTonightPh")}
              className="bg-white"
            />
            <p className="text-[11px] text-emerald-800">
              {t("hifzTeach.parentTonightHint")}
            </p>
          </div>

          {/* Advanced — collapsed by default. Holds the longer-form
              fields most teachers don't need every day. */}
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full text-left text-xs font-medium text-indigo-700 hover:underline"
          >
            {advancedOpen ? t("hifzTeach.advancedHide") : t("hifzTeach.advancedShow")}
          </button>

          {advancedOpen && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("hifzTeach.mistakesToday")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={mistakesCount === "" ? "" : mistakesCount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMistakesCount(v === "" ? "" : Math.max(0, Number(v) || 0));
                    }}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("hifzTeach.tajweedNote")}</Label>
                  <Input
                    value={tajweedNotes}
                    onChange={(e) => setTajweedNotes(e.target.value)}
                    placeholder={t("hifzTeach.tajweedNotePh")}
                  />
                </div>
              </div>
              {!isManzil && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("hifzTeach.juzPara")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={30}
                      value={juzNumber === "" ? "" : juzNumber}
                      onChange={(e) => {
                        const v = e.target.value;
                        setJuzNumber(
                          v === "" ? "" : Math.max(1, Math.min(30, Number(v) || 1)),
                        );
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("hifzTeach.mushafPage")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={pageNumber === "" ? "" : pageNumber}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPageNumber(v === "" ? "" : Math.max(1, Number(v) || 1));
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>{t("hifzTeach.fluencyNote")}</Label>
                <Input
                  value={fluencyNotes}
                  onChange={(e) => setFluencyNotes(e.target.value)}
                  placeholder={t("hifzTeach.fluencyNotePh")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hifzTeach.internalNote")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t("hifzTeach.internalNotePh")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("hifzTeach.parentExtra")}</Label>
                <Textarea
                  value={parentComments}
                  onChange={(e) => setParentComments(e.target.value)}
                  rows={2}
                  placeholder={t("hifzTeach.parentExtraPh")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("hifzTeach.todaysTarget")}</Label>
                  <Input
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(e.target.value)}
                    placeholder={t("hifzTeach.todaysTargetPh")}
                  />
                </div>
                {!(isSabaq || hifzOnly) && (
                  <div className="space-y-1">
                    <Label>Tomorrow's target</Label>
                    <Input
                      value={nextTarget}
                      onChange={(e) => setNextTarget(e.target.value)}
                      placeholder="e.g. Sabqi Al-Mulk 1-10"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t("hifzTeach.missedReason")}</Label>
                <Input
                  value={missedTargetReason}
                  onChange={(e) => setMissedTargetReason(e.target.value)}
                  placeholder={t("hifzTeach.missedReasonPh")}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("hifzTeach.cancel")}
          </Button>
          <Button variant="outline" onClick={() => void handleSubmit("kind")} disabled={submitting}>
            {submitting ? t("hifzTeach.saving") : t("hifzTeach.saveNextKind")}
          </Button>
          <Button
            variant={onNextStudent ? "outline" : "default"}
            onClick={() => void handleSubmit("close")}
            disabled={submitting}
          >
            {submitting ? t("hifzTeach.saving") : t("hifzTeach.saveClose")}
          </Button>
          {onNextStudent && (
            <Button onClick={() => void handleSubmit("student")} disabled={submitting}>
              {submitting ? t("hifzTeach.saving") : t("hifzTeach.saveNextStudent")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
