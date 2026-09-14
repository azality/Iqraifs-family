// QaidaTakhtiCard — one Noorani Qaida hearing: pick the takhti, rate
// it, save. A hifz-intake class must have exactly TWO ways in — "Log
// hifz" and "Start today's round" (Muneeb, 14 Sep: "it will be too
// hard to manage 3 systems for the same thing") — so the SAME card
// serves both: HifzRoundMode drops it in for a qaida-track child, and
// the section page opens it as the child's log dialog.
//
// Mirrors the qaida card inside QuranRoundMode, which remains the
// round for ACADEMIC Quran/Nazra groups only.

import { useEffect, useState } from "react";
import { ArrowUpCircle, Check, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  postHifzEntry,
  type HifzQuality,
  type SectionHifzSummaryRow,
} from "../../../utils/schoolApi";

const QUALITIES: Array<{ v: HifzQuality; label: string; tone: string }> = [
  { v: "excellent", label: "Excellent", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { v: "good", label: "Good", tone: "bg-sky-100 text-sky-800 border-sky-200" },
  { v: "needs_practice", label: "Needs practice", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { v: "weak", label: "Weak", tone: "bg-rose-100 text-rose-800 border-rose-200" },
];

const NEEDS_REPEAT = (q: HifzQuality | null | undefined) =>
  q === "weak" || q === "needs_practice" || q === "not_learned";

export interface QaidaTakhtiCardProps {
  orgId: string;
  student: SectionHifzSummaryRow;
  /** Takhtis in the school's Qaida (settings.qaida_lesson_count). */
  lessonCount: number;
  /** An entry was written — refresh the roster behind. */
  onSaved: () => void;
  /** This hearing is fully dealt with — advance / close. */
  onDone: () => void;
  /** Round only: push the child to the end of the queue. */
  onSkip?: () => void;
  /** The teacher confirms the move to Nazra after the last takhti. */
  onMoveTrack?: (row: SectionHifzSummaryRow, track: "nazra") => Promise<void> | void;
}

export function QaidaTakhtiCard({
  orgId, student, lessonCount, onSaved, onDone, onSkip, onMoveTrack,
}: QaidaTakhtiCardProps) {
  const count = Math.max(1, lessonCount);
  const [lesson, setLesson] = useState(1);
  const [quality, setQuality] = useState<HifzQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The hearing that just finished the last takhti — hold the child on
  // screen and ask, rather than walking the teacher past the moment.
  const [finishedPrompt, setFinishedPrompt] = useState(false);

  useEffect(() => {
    // The next takhti, or the same one again after a weak hearing.
    const q = student.qaidaPosition;
    setQuality(null); setErr(null); setFinishedPrompt(false);
    setLesson(q ? Math.min(NEEDS_REPEAT(q.quality) ? q.lesson : q.lesson + 1, count) : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.studentId, count]);

  const save = async (mode: "heard" | "repeat") => {
    setBusy(true); setErr(null);
    try {
      await postHifzEntry(orgId, {
        studentId: student.studentId,
        kind: "qaida",
        qaidaLesson: lesson,
        quality: quality ?? undefined,
        nextTarget: mode === "repeat" || NEEDS_REPEAT(quality)
          ? `Qaida: repeat takhti ${lesson}`
          : lesson >= count
          ? "Qaida: finished"
          : `Qaida: takhti ${lesson + 1}`,
      } as any);
      onSaved();
      const finished = mode === "heard" && lesson >= count && !NEEDS_REPEAT(quality);
      if (finished && onMoveTrack) { setFinishedPrompt(true); return; }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  };

  if (finishedPrompt) {
    return (
      <div className="rounded-xl border border-sky-300 bg-sky-50 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900">
          <ArrowUpCircle className="h-4 w-4" />
          {student.studentName} has finished Noorani Qaida.
        </p>
        <p className="mt-0.5 text-[12px] text-sky-800">
          Move them to Nazra when you're satisfied with their Qaida —
          tomorrow's card will be reading the Quran.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm" disabled={busy}
            className="bg-sky-700 hover:bg-sky-800"
            onClick={async () => {
              setBusy(true);
              try { await onMoveTrack?.(student, "nazra"); onDone(); } finally { setBusy(false); }
            }}
          >
            Move to Nazra
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={onDone}>
            Not yet — keep on Qaida
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-orange-700">
        Noorani Qaida
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Takhti</Label>
          <Select value={String(lesson)} onValueChange={(v) => setLesson(Number(v))}>
            <SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>Takhti {n} of {count}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-slate-500 sm:pt-6">
          {student.qaidaPosition
            ? `Last heard: takhti ${student.qaidaPosition.lesson}`
            : "First takhti for this child."}
        </div>
      </div>
      <div className="mt-2">
        <Label className="text-xs">How did they read? (optional)</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {QUALITIES.map((q) => (
            <button
              key={q.v}
              type="button"
              onClick={() => setQuality((cur) => (cur === q.v ? null : q.v))}
              className={
                "rounded-full border px-2.5 py-1 text-xs font-semibold " +
                (quality === q.v ? q.tone : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="mt-2 text-xs font-medium text-rose-700">{err}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          className="bg-emerald-700 font-bold hover:bg-emerald-800"
          onClick={() => save("heard")}
        >
          <Check className="mr-1 h-4 w-4" /> Heard · next
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => save("repeat")}>
          <RotateCcw className="mr-1 h-4 w-4" /> Heard · repeat tomorrow
        </Button>
        {onSkip && (
          <Button variant="ghost" disabled={busy} onClick={onSkip} className="ml-auto text-slate-500">
            Skip
          </Button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {NEEDS_REPEAT(quality)
          ? "Tomorrow will start them on this same takhti again."
          : lesson >= count
          ? "The last takhti — hearing it well finishes the Qaida."
          : `Tomorrow will prefill takhti ${lesson + 1}.`}
      </p>
    </div>
  );
}
