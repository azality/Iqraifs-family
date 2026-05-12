// Per-student Hifz progress dashboard.
//
// Routed as /school/children/:childId/hifz. Visible to family members of
// the child (parent view) AND principal/teacher of the child's class
// (backend auth handles both).
//
// The killer visualization for the school pitch: at a glance, the qari
// (or parent) sees how the child is doing across the three Hifz dimensions:
//   - Sabaq:        recent daily lessons + tajweed quality
//   - Sabaq-para:   recent revision activity
//   - Manzil:       which of 7 manzils is overdue (the freshness alarm)
//   - Streak:       consecutive days with any sabaq logged
//
// Data: single GET /school/children/:id/hifz call. Backend returns
// everything pre-computed (manzilStatus[].daysSinceLastReview, streak),
// so this page is presentational.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  ChevronLeft, BookOpen, Flame, AlertCircle, Star, Calendar, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getChildHifz } from "../../../utils/schoolApi";

// Same surah list as LogSabaqDialog. (Could be extracted to a shared
// const, but two callsites doesn't justify it yet.)
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

function surahLabel(n: number | null) {
  if (!n || n < 1 || n > 114) return null;
  return SURAH_NAMES[n - 1];
}

interface ManzilStatus {
  manzilNumber: number;
  lastReviewedAt: string | null;
  daysSinceLastReview: number | null;
}

interface SabaqLog {
  id: string;
  surah_number: number | null;
  ayah_start: number | null;
  ayah_end: number | null;
  juz_number: number | null;
  page_number: number | null;
  tajweed_rating: number | null;
  notes: string | null;
  logged_at: string;
}

interface SabaqParaLog {
  id: string;
  quality_rating: number | null;
  notes: string | null;
  logged_at: string;
}

interface HifzResponse {
  child: {
    id: string;
    name: string;
    hifzProgress: {
      juzCompleted?: number[];
      currentJuz?: number;
    };
  };
  sabaqLogs: SabaqLog[];
  sabaqParaLogs: SabaqParaLog[];
  manzilLogs: any[];
  manzilStatus: ManzilStatus[];
  currentStreak: number;
}

function daysAgoText(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function HifzProgress() {
  const { childId = "" } = useParams();
  const [data, setData] = useState<HifzResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    getChildHifz(childId)
      .then(setData)
      .catch((e) => {
        const msg = e?.message || "Could not load Hifz progress";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [childId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            Couldn't load Hifz progress
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const juzCompleted = data.child.hifzProgress?.juzCompleted ?? [];
  const totalJuzCompleted = juzCompleted.length;

  // Manzil status: 7 cards, freshest on left, overdue (>7d) highlighted.
  // Threshold is opinionated — qaris want each manzil revised at least
  // once a week. Tweakable per-school later via org settings.
  const OVERDUE_DAYS = 7;

  return (
    <div className="space-y-6">
      <Link to=".." className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" />
        Back
      </Link>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-blue-600" />
          {data.child.name} · Hifz progress
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live snapshot from sabaq, sabaq-para, and manzil logs.
        </p>
      </div>

      {/* Top stats row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              Current streak
            </CardDescription>
            <CardTitle className="text-3xl">
              {data.currentStreak} <span className="text-base font-normal text-muted-foreground">day{data.currentStreak === 1 ? "" : "s"}</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Juz completed</CardDescription>
            <CardTitle className="text-3xl">{totalJuzCompleted} / 30</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last sabaq</CardDescription>
            <CardTitle className="text-base font-semibold">
              {data.sabaqLogs[0]
                ? <>
                    {surahLabel(data.sabaqLogs[0].surah_number) || `Juz ${data.sabaqLogs[0].juz_number}`}
                    <span className="text-xs font-normal text-muted-foreground block">{daysAgoText(data.sabaqLogs[0].logged_at)}</span>
                  </>
                : <span className="text-sm text-muted-foreground">No sabaq yet</span>}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Juz progress bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quran progress</CardTitle>
          <CardDescription>30-juz grid. Filled = completed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-10 gap-1.5">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((juzNum) => {
              const done = juzCompleted.includes(juzNum);
              return (
                <div
                  key={juzNum}
                  title={`Juz ${juzNum}${done ? " · completed" : ""}`}
                  className={`aspect-square rounded-md flex items-center justify-center text-xs font-mono ${
                    done
                      ? "bg-green-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-400 border border-gray-200"
                  }`}
                >
                  {juzNum}
                </div>
              );
            })}
          </div>
          {totalJuzCompleted === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Juz completion is tracked separately. The hifz_progress.juzCompleted field is updated
              when a juz is fully memorized — wire that into the qari's flow as a next step.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manzil status grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manzil revision</CardTitle>
          <CardDescription>
            The 7 manzils. Overdue (more than {OVERDUE_DAYS} days) shows in amber.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {data.manzilStatus.map((m) => {
              const overdue = m.daysSinceLastReview !== null && m.daysSinceLastReview > OVERDUE_DAYS;
              const never = m.lastReviewedAt === null;
              return (
                <div
                  key={m.manzilNumber}
                  className={`p-3 rounded-lg border text-center ${
                    never
                      ? "border-gray-200 bg-gray-50 text-gray-500"
                      : overdue
                      ? "border-amber-300 bg-amber-50"
                      : "border-green-200 bg-green-50"
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide opacity-70">Manzil</p>
                  <p className="text-2xl font-bold">{m.manzilNumber}</p>
                  <p className="text-xs mt-1">
                    {never
                      ? "Never"
                      : m.daysSinceLastReview === 0
                      ? "Today"
                      : `${m.daysSinceLastReview}d ago`}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent sabaq log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Recent sabaqs
          </CardTitle>
          <CardDescription>Newest first · last {data.sabaqLogs.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.sabaqLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No sabaqs yet.</p>
          ) : (
            <ul className="divide-y">
              {data.sabaqLogs.map((s) => {
                const name = surahLabel(s.surah_number);
                return (
                  <li key={s.id} className="py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {name
                          ? `${name}${s.ayah_start ? ` ${s.ayah_start}${s.ayah_end && s.ayah_end !== s.ayah_start ? `–${s.ayah_end}` : ""}` : ""}`
                          : s.juz_number
                          ? `Juz ${s.juz_number}${s.page_number ? `, page ${s.page_number}` : ""}`
                          : "Sabaq"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {daysAgoText(s.logged_at)} · {new Date(s.logged_at).toLocaleDateString()}
                      </p>
                      {s.notes && <p className="text-xs italic text-muted-foreground mt-1">{s.notes}</p>}
                    </div>
                    {s.tajweed_rating !== null && (
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-3.5 w-3.5 ${
                              n <= (s.tajweed_rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sabaq-para recent */}
      {data.sabaqParaLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent sabaq-para revisions</CardTitle>
            <CardDescription>Newest first · last {data.sabaqParaLogs.length}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.sabaqParaLogs.map((s) => (
                <li key={s.id} className="py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Sabaq-para</p>
                    <p className="text-xs text-muted-foreground">{daysAgoText(s.logged_at)}</p>
                    {s.notes && <p className="text-xs italic text-muted-foreground mt-1">{s.notes}</p>}
                  </div>
                  {s.quality_rating !== null && (
                    <Badge variant="secondary">Quality {s.quality_rating}/5</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
