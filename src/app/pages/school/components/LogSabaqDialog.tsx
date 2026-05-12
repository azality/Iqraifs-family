// Log a sabaq for one student.
//
// The qari's per-student daily action. Surah dropdown (1..114 by number;
// the canonical English names are shown alongside), ayah range, tajweed
// rating, optional notes.

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { logSabaq } from "../../../../utils/schoolApi";

// 114 surah names in canonical order. Kept inline; no localization yet.
const SURAH_NAMES = [
  "Al-Fatihah", "Al-Baqarah", "Al-Imran", "An-Nisa", "Al-Ma'idah", "Al-An'am", "Al-A'raf",
  "Al-Anfal", "At-Tawbah", "Yunus", "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr", "An-Nahl",
  "Al-Isra", "Al-Kahf", "Maryam", "Ta-Ha", "Al-Anbiya", "Al-Hajj", "Al-Mu'minun", "An-Nur",
  "Al-Furqan", "Ash-Shu'ara", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum", "Luqman",
  "As-Sajdah", "Al-Ahzab", "Saba", "Fatir", "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar",
  "Ghafir", "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah", "Al-Ahqaf",
  "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf", "Adh-Dhariyat", "At-Tur", "An-Najm",
  "Al-Qamar", "Ar-Rahman", "Al-Waqi'ah", "Al-Hadid", "Al-Mujadilah", "Al-Hashr",
  "Al-Mumtahanah", "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq",
  "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij", "Nuh", "Al-Jinn",
  "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyamah", "Al-Insan", "Al-Mursalat", "An-Naba",
  "An-Nazi'at", "Abasa", "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq",
  "Al-Buruj", "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad", "Ash-Shams",
  "Al-Layl", "Ad-Duha", "Ash-Sharh", "At-Tin", "Al-Alaq", "Al-Qadr", "Al-Bayyinah",
  "Az-Zalzalah", "Al-Adiyat", "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah",
  "Al-Fil", "Quraysh", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr", "Al-Masad",
  "Al-Ikhlas", "Al-Falaq", "An-Nas",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
  childName: string;
  onLogged: () => void;
}

export function LogSabaqDialog({ open, onOpenChange, childId, childName, onLogged }: Props) {
  const [surahNumber, setSurahNumber] = useState("");
  const [ayahStart, setAyahStart] = useState("");
  const [ayahEnd, setAyahEnd] = useState("");
  const [tajweedRating, setTajweedRating] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSurahNumber("");
    setAyahStart("");
    setAyahEnd("");
    setTajweedRating(0);
    setNotes("");
  };

  const close = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  const submit = async () => {
    const surahNum = parseInt(surahNumber, 10);
    const ayahStartNum = ayahStart ? parseInt(ayahStart, 10) : undefined;
    const ayahEndNum = ayahEnd ? parseInt(ayahEnd, 10) : undefined;

    if (!surahNum || surahNum < 1 || surahNum > 114) {
      toast.error("Surah is required (1–114)");
      return;
    }

    setSubmitting(true);
    try {
      await logSabaq(childId, {
        surahNumber: surahNum,
        ayahStart: ayahStartNum,
        ayahEnd: ayahEndNum,
        tajweedRating: tajweedRating || undefined,
        notes: notes || undefined,
      });
      toast.success(`Sabaq logged for ${childName}`);
      onLogged();
      close(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not log sabaq");
    } finally {
      setSubmitting(false);
    }
  };

  const surahLabel = (() => {
    const n = parseInt(surahNumber, 10);
    if (!n || n < 1 || n > 114) return null;
    return SURAH_NAMES[n - 1];
  })();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log sabaq for {childName}</DialogTitle>
          <DialogDescription>
            Surah number and ayah range. Tajweed rating optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="surah">Surah number (1–114)</Label>
            <Select value={surahNumber} onValueChange={setSurahNumber}>
              <SelectTrigger><SelectValue placeholder="Choose a surah…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {SURAH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {i + 1}. {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {surahLabel && <p className="text-xs text-muted-foreground">Selected: {surahLabel}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ayah-start">Ayah from</Label>
              <Input id="ayah-start" type="number" min="1" value={ayahStart} onChange={(e) => setAyahStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ayah-end">to</Label>
              <Input id="ayah-end" type="number" min="1" value={ayahEnd} onChange={(e) => setAyahEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tajweed (optional)</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTajweedRating(tajweedRating === n ? 0 : n)}
                  className="p-1 hover:scale-110 transition-transform"
                  aria-label={`Rate ${n} stars`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      n <= tajweedRating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
              {tajweedRating > 0 && (
                <button
                  type="button"
                  onClick={() => setTajweedRating(0)}
                  className="text-xs text-muted-foreground ml-2 hover:underline"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mashallah, fluent today" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !surahNumber}>
            {submitting ? "Logging…" : "Log sabaq (+5 pts)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
