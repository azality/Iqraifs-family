// Phase C.1: Hifz progress timeline + summary, embedded under StudentDetail.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { BookMarked, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteHifzEntry,
  getStudentHifz,
  getStudentHifzSummary,
  getSchoolMe,
  isOrgAdmin,
  type HifzEntry,
  type HifzKind,
  type SchoolMeResponse,
  type StudentHifzSummary,
} from "../../../utils/schoolApi";
import { getSurah } from "../../../utils/quranSurahs";

interface Props {
  orgId: string;
  studentId: string;
  /** Reload trigger — bump to force a refresh after logging. */
  reloadKey?: number;
  allowDelete?: boolean;
}

const KIND_LABEL: Record<HifzKind, string> = {
  sabaq: "Sabaq",
  sabqi: "Sabqi",
  manzil: "Manzil",
  memorized: "Memorized",
  revised: "Revised",
  tested: "Tested",
};

const KIND_CLASSES: Record<HifzKind, string> = {
  sabaq: "bg-blue-100 text-blue-800 border-blue-200",
  sabqi: "bg-indigo-100 text-indigo-800 border-indigo-200",
  manzil: "bg-violet-100 text-violet-800 border-violet-200",
  memorized: "bg-emerald-100 text-emerald-800 border-emerald-200",
  revised: "bg-cyan-100 text-cyan-800 border-cyan-200",
  tested: "bg-amber-100 text-amber-800 border-amber-200",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

export function HifzProgressFeed({
  orgId,
  studentId,
  reloadKey = 0,
  allowDelete = true,
}: Props) {
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [summary, setSummary] = useState<StudentHifzSummary | null>(null);
  const [entries, setEntries] = useState<HifzEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null));
  }, []);

  const refresh = () => {
    if (!orgId || !studentId) return;
    setLoading(true);
    Promise.all([
      getStudentHifzSummary(orgId, studentId),
      getStudentHifz(orgId, studentId, { limit: 100 }),
    ])
      .then(([sum, list]) => {
        setSummary(sum);
        setEntries(list.entries);
      })
      .catch((e) => setError(e?.message || "Failed to load hifz"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, studentId, reloadKey]);

  const canDelete = (entry: HifzEntry) =>
    allowDelete &&
    me &&
    (isOrgAdmin(me, orgId) || entry.recorded_by === me.userId);

  const handleDelete = async (entry: HifzEntry) => {
    if (!confirm("Delete this hifz entry?")) return;
    try {
      await deleteHifzEntry(orgId, entry.id);
      toast.success("Entry deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-indigo-600" /> Hifz progress
        </CardTitle>
        {summary && (
          <p className="text-xs text-muted-foreground">
            {summary.ayahsMemorized} ayahs memorized
            {" · "}
            {summary.surahsCompleted} surah{summary.surahsCompleted === 1 ? "" : "s"}
            {" · "}
            {summary.lastEntry
              ? `Last entry ${formatRelative(summary.lastEntry)}`
              : "No entries yet"}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hifz entries yet. Use "Log Hifz" to record sabaq.
          </p>
        )}
        {entries.map((e) => {
          const surah = getSurah(e.surah_number);
          return (
            <div
              key={e.id}
              className="flex items-start gap-2 p-2 border rounded"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-xs ${KIND_CLASSES[e.kind]}`}
                  >
                    {KIND_LABEL[e.kind]}
                  </Badge>
                  <span className="text-sm font-medium">
                    {surah
                      ? `${surah.number}. ${surah.nameTransliterated}`
                      : `Surah ${e.surah_number}`}
                    {" · ayah "}
                    {e.ayah_from}
                    {e.ayah_to !== e.ayah_from && `–${e.ayah_to}`}
                  </span>
                  {e.quality && (
                    <Badge variant="secondary" className="text-xs">
                      {e.quality.replace("_", " ")}
                    </Badge>
                  )}
                </div>
                {e.notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {e.notes}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {e.recorded_by_name || "—"} · {formatRelative(e.recorded_at)}
                </p>
              </div>
              {canDelete(e) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(e)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
