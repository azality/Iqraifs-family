// Phase C.1: Hifz logger modal.
//
// Used from StudentDetail ("Log Hifz" button) and SectionHifzOverview
// (clicking a student row). Records a single hifz entry for a student.

import { useEffect, useState } from "react";
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
}

const KIND_OPTIONS: Array<{ value: HifzKind; label: string; hint: string }> = [
  { value: "sabaq", label: "Sabaq", hint: "New lesson today" },
  { value: "sabqi", label: "Sabqi", hint: "Recent revision" },
  { value: "manzil", label: "Manzil", hint: "Older revision (manzil)" },
  { value: "memorized", label: "Memorized", hint: "Newly memorized" },
  { value: "revised", label: "Revised", hint: "General revision" },
  { value: "tested", label: "Tested", hint: "Formal test" },
];

const QUALITY_OPTIONS: Array<{ value: HifzQuality; label: string }> = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "needs_practice", label: "Needs practice" },
  { value: "weak", label: "Weak" },
];

export function HifzLogEntry({
  orgId,
  studentId,
  studentName,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [surahNumber, setSurahNumber] = useState<number>(1);
  const [ayahFrom, setAyahFrom] = useState<number>(1);
  const [ayahTo, setAyahTo] = useState<number>(1);
  const [kind, setKind] = useState<HifzKind>("sabaq");
  const [quality, setQuality] = useState<HifzQuality | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const surah = getSurah(surahNumber);
  const maxAyah = surah?.ayahCount ?? 1;

  // Reset on open
  useEffect(() => {
    if (open) {
      setSurahNumber(1);
      setAyahFrom(1);
      setAyahTo(1);
      setKind("sabaq");
      setQuality("");
      setNotes("");
    }
  }, [open]);

  // Clamp ayah range when surah changes
  useEffect(() => {
    if (ayahFrom > maxAyah) setAyahFrom(1);
    if (ayahTo > maxAyah) setAyahTo(maxAyah);
    if (ayahTo < ayahFrom) setAyahTo(ayahFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahNumber]);

  const handleSubmit = async () => {
    if (ayahFrom < 1 || ayahFrom > maxAyah) {
      toast.error(`Ayah from must be 1–${maxAyah}`);
      return;
    }
    if (ayahTo < ayahFrom || ayahTo > maxAyah) {
      toast.error(`Ayah to must be ${ayahFrom}–${maxAyah}`);
      return;
    }
    setSubmitting(true);
    try {
      await postHifzEntry(orgId, {
        studentId,
        surahNumber,
        ayahFrom,
        ayahTo,
        kind,
        quality: quality || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Hifz entry logged");
      onOpenChange(false);
      onSuccess?.();
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
          <DialogTitle>Log hifz — {studentName}</DialogTitle>
          <DialogDescription>
            Record sabaq, sabqi, manzil, or any hifz progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Surah</Label>
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
                {surah.nameArabic} · {surah.ayahCount} ayahs
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ayah from</Label>
              <Input
                type="number"
                min={1}
                max={maxAyah}
                value={ayahFrom}
                onChange={(e) =>
                  setAyahFrom(Math.max(1, Math.min(maxAyah, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Ayah to</Label>
              <Input
                type="number"
                min={ayahFrom}
                max={maxAyah}
                value={ayahTo}
                onChange={(e) =>
                  setAyahTo(
                    Math.max(ayahFrom, Math.min(maxAyah, Number(e.target.value) || ayahFrom)),
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Kind</Label>
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as HifzKind)}
              className="grid grid-cols-2 gap-2"
            >
              {KIND_OPTIONS.map((k) => (
                <label
                  key={k.value}
                  className="flex items-start gap-2 border rounded p-2 cursor-pointer hover:bg-muted/40"
                >
                  <RadioGroupItem value={k.value} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{k.label}</p>
                    <p className="text-xs text-muted-foreground">{k.hint}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label>Quality (optional)</Label>
            <Select
              value={quality || "__none__"}
              onValueChange={(v) =>
                setQuality(v === "__none__" ? "" : (v as HifzQuality))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Not rated" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not rated</SelectItem>
                {QUALITY_OPTIONS.map((q) => (
                  <SelectItem key={q.value} value={q.value}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes for parents"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Log entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
