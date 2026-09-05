// NazraRoundMode — the daily hearing round for a NAZRA (reading) group.
//
// Nazra is not hifz. A nazra child reads the Quran rather than
// memorizing it, so there is no sabaq / sabqi / manzil trio and
// "ayahs memorized" is meaningless — every child in the group showed 0.
// What a nazra teacher actually holds in her head is one moving
// position per child ("Abdul Moiz is on para 29, we did ayah 12 to 40"),
// and her round is: hear this portion, mark it heard, set where they
// start tomorrow, next child.
//
// So this screen is that loop and nothing else:
//   • the child's current position, in the unit the teacher thinks in
//     (by para or by surah — she picks, it sticks for the round)
//   • the portion being heard, pre-filled to continue from last time
//   • Heard → advance, or Repeat → they read the same portion again
//   • next child
//
// Class IV+ nazra groups can also contain a hafiz child who is revising
// rather than progressing. The Revision toggle logs `nazra_revision`
// for that child without disturbing anyone else's position.
//
// Reported by Uroosa Basit (Nazra, Class II A + Junior/Senior), Sep 2026.

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, RotateCcw, ChevronRight, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { postHifzEntry, type HifzQuality, type SectionHifzSummaryRow } from "../../../utils/schoolApi";
import { SURAHS, getSurah } from "../../../utils/quranSurahs";

type Unit = "para" | "surah";

/** Juz 1-30. Nazra teachers count in paras far more often than surahs,
 *  so this is the default unit. */
const PARAS = Array.from({ length: 30 }, (_, i) => i + 1);

const QUALITIES: Array<{ v: HifzQuality; label: string; tone: string }> = [
  { v: "excellent", label: "Excellent", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { v: "good", label: "Good", tone: "bg-sky-100 text-sky-800 border-sky-200" },
  { v: "needs_practice", label: "Needs practice", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { v: "weak", label: "Weak", tone: "bg-rose-100 text-rose-800 border-rose-200" },
];

export interface NazraRoundModeProps {
  orgId: string;
  groupLabel: string;
  roster: SectionHifzSummaryRow[];
  onClose: () => void;
  /** Called after each successful save so the roster behind refreshes. */
  onSaved: () => void;
}

export function NazraRoundMode({ orgId, groupLabel, roster, onClose, onSaved }: NazraRoundModeProps) {
  // The roster is snapshotted by the caller so re-sorting mid-round
  // doesn't shuffle the queue under the teacher's hand.
  const [idx, setIdx] = useState(0);
  const [unit, setUnit] = useState<Unit>("para");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [heardIds, setHeardIds] = useState<Set<string>>(
    () => new Set(roster.filter((s) => s.today?.nazra).map((s) => s.studentId)),
  );

  const student = roster[idx];

  // Portion being heard now.
  const [para, setPara] = useState<number>(1);
  const [surah, setSurah] = useState<number>(1);
  const [from, setFrom] = useState<string>("1");
  const [to, setTo] = useState<string>("");
  const [quality, setQuality] = useState<HifzQuality | null>(null);
  const [revision, setRevision] = useState(false);

  // Pre-fill from where this child left off. Continuing is the common
  // case, so the form opens on "the next bit" rather than blank — but
  // every field stays editable because real classes skip and repeat.
  useEffect(() => {
    if (!student) return;
    const p = student.nazraPosition;
    setErr(null);
    setQuality(null);
    setRevision(!!p?.isRevision);
    if (!p) {
      setPara(1); setSurah(1); setFrom("1"); setTo("");
      return;
    }
    setPara(p.juzNumber ?? 1);
    setSurah(p.surahNumber ?? 1);
    // A weak reading means they read the SAME portion again, which is
    // what a nazra teacher does in practice.
    const weak = p.quality === "weak" || p.quality === "needs_practice";
    if (weak && p.ayahFrom != null) {
      setFrom(String(p.ayahFrom));
      setTo(p.ayahTo != null ? String(p.ayahTo) : "");
    } else {
      setFrom(p.ayahTo != null ? String(p.ayahTo + 1) : "1");
      setTo("");
    }
  }, [student?.studentId]);

  const surahInfo = getSurah(surah);
  const maxAyah = unit === "surah" ? surahInfo?.ayahCount ?? 286 : 286;

  const positionLabel = (row: SectionHifzSummaryRow): string => {
    const p = row.nazraPosition;
    if (!p) return "Not started";
    const where = p.juzNumber
      ? `Para ${p.juzNumber}`
      : p.surahNumber
      ? getSurah(p.surahNumber)?.nameTransliterated ?? `Surah ${p.surahNumber}`
      : "—";
    const range = p.ayahFrom != null && p.ayahTo != null ? ` · ayah ${p.ayahFrom}–${p.ayahTo}` : "";
    return `${where}${range}${p.isRevision ? " · revision" : ""}`;
  };

  const goNext = () => {
    setIdx((i) => Math.min(i + 1, roster.length - 1));
  };

  const save = async (mode: "heard" | "repeat") => {
    if (!student) return;
    const f = Number(from);
    const t = Number(to);
    if (!Number.isFinite(f) || f < 1) { setErr("Enter the ayah they started from."); return; }
    if (!Number.isFinite(t) || t < f) { setErr("Enter the ayah they read up to."); return; }
    setBusy(true); setErr(null);
    try {
      await postHifzEntry(orgId, {
        studentId: student.studentId,
        kind: revision ? "nazra_revision" : "nazra",
        // Both units are stored: the surah keeps the entry readable in
        // the child's history, the juz is what the teacher navigates by.
        surahNumber: unit === "surah" ? surah : (student.nazraPosition?.surahNumber ?? 1),
        ayahFrom: f,
        ayahTo: t,
        juzNumber: unit === "para" ? para : undefined,
        quality: quality ?? undefined,
        // "Repeat" means tomorrow starts where today started.
        nextTarget: mode === "repeat"
          ? `Repeat ${unit === "para" ? `para ${para}` : surahInfo?.nameTransliterated ?? ""} ayah ${f}–${t}`
          : `Continue from ayah ${t + 1}`,
      } as any);
      setHeardIds((prev) => new Set(prev).add(student.studentId));
      onSaved();
      if (idx < roster.length - 1) goNext();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const doneCount = heardIds.size;

  if (!student) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-600">No students in this group yet.</p>
        <Button className="mt-3" variant="outline" onClick={onClose}>Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header — who, where in the round, and a way out. */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-700 to-emerald-900 px-4 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-emerald-200">
              <BookOpen className="h-3.5 w-3.5" /> Nazra round · {groupLabel}
            </div>
            <h2 className="truncate text-lg font-bold">{student.studentName}</h2>
            <p className="text-[12px] text-emerald-100">
              {positionLabel(student)}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold tabular-nums">
              {doneCount}/{roster.length} heard
            </span>
            <button type="button" onClick={onClose} aria-label="Close round"
              className="rounded-md p-1 text-emerald-100 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        {/* Unit — teachers think in paras; some think in surahs. */}
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-slate-500">Track by</Label>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {(["para", "surah"] as Unit[]).map((u) => (
              <button
                key={u} type="button" onClick={() => setUnit(u)}
                className={
                  "px-3 py-1.5 text-xs font-semibold capitalize " +
                  (unit === u ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {u}
              </button>
            ))}
          </div>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox" checked={revision}
              onChange={(e) => setRevision(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Revision (hafiz child)
          </label>
        </div>

        {/* Where */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">{unit === "para" ? "Para" : "Surah"}</Label>
            {unit === "para" ? (
              <Select value={String(para)} onValueChange={(v) => setPara(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARAS.map((p) => <SelectItem key={p} value={String(p)}>Para {p}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Select value={String(surah)} onValueChange={(v) => setSurah(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SURAHS.map((s) => (
                    <SelectItem key={s.number} value={String(s.number)}>
                      {s.number}. {s.nameTransliterated}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From ayah</Label>
            <Input inputMode="numeric" value={from}
              onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              To ayah{unit === "surah" && surahInfo ? <span className="font-normal text-slate-400"> (max {maxAyah})</span> : null}
            </Label>
            <Input inputMode="numeric" value={to} placeholder="…"
              onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        {/* How it went — optional, but it drives tomorrow's prefill. */}
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">How did they read? <span className="font-normal text-slate-400">(optional)</span></Label>
          <div className="flex flex-wrap gap-1.5">
            {QUALITIES.map((q) => (
              <button
                key={q.v} type="button"
                onClick={() => setQuality(quality === q.v ? null : q.v)}
                className={
                  "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors " +
                  (quality === q.v ? q.tone : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {q.label}
              </button>
            ))}
          </div>
          {(quality === "weak" || quality === "needs_practice") && (
            <p className="text-[11px] text-amber-700">
              Tomorrow will start them on this same portion again.
            </p>
          )}
        </div>

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save("heard")} disabled={busy} className="bg-emerald-700 hover:bg-emerald-800">
            <Check className="mr-1.5 h-4 w-4" />
            {busy ? "Saving…" : "Heard · next child"}
          </Button>
          <Button variant="outline" onClick={() => save("repeat")} disabled={busy}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Heard · repeat tomorrow
          </Button>
          <Button variant="ghost" onClick={goNext} disabled={busy || idx >= roster.length - 1}
            className="ml-auto text-slate-600">
            Skip <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* The rest of the group, so she can jump rather than only walk. */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Group
        </div>
        <ul className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
          {roster.map((s, i) => (
            <li key={s.studentId}>
              <button
                type="button" onClick={() => setIdx(i)}
                className={
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 " +
                  (i === idx ? "bg-emerald-50/60" : "")
                }
              >
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{s.studentName}</span>
                <span className="truncate text-[11px] text-slate-500">{positionLabel(s)}</span>
                {heardIds.has(s.studentId) && (
                  <Check className="h-3.5 w-3.5 flex-none text-emerald-600" aria-label="heard today" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default NazraRoundMode;
