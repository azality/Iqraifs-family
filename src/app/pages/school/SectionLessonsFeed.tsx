// Phase C.1: Per-section daily lessons (sabaq) feed.
//
// Class teacher posts the day's lesson here; parents and students read it.
// Newest first, grouped by date. Edit/delete is restricted to the original
// teacher or to org admin/principal.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Plus, Pencil, Trash2, Video, Music, Paperclip } from "lucide-react";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
} from "../../components/school-ui";
import { toast } from "sonner";
import {
  getSchoolMe,
  isOrgAdmin,
  getSectionLessons,
  deleteLesson,
  type Lesson,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

function VideoPreview({ url }: { url: string }) {
  const yt = extractYouTubeId(url);
  if (yt) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-block">
        <img
          src={`https://img.youtube.com/vi/${yt}/mqdefault.jpg`}
          alt="Video thumbnail"
          className="rounded border max-w-[240px]"
        />
      </a>
    );
  }
  const vimeo = extractVimeoId(url);
  if (vimeo) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
      >
        <Video className="h-4 w-4" /> Vimeo video
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
    >
      <Video className="h-4 w-4" /> Video link
    </a>
  );
}

export function SectionLessonsFeed() {
  const { orgId = "", sectionId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [startDate, setStartDate] = useState(daysAgoIso(30));
  const [endDate, setEndDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    getSectionLessons(orgId, sectionId, { startDate, endDate, limit: 50 })
      .then((r) => setLessons(r.lessons))
      .catch((e) => setError(e?.message || "Failed to load lessons"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId, startDate, endDate]);

  const grouped = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const arr = map.get(l.lesson_date) || [];
      arr.push(l);
      map.set(l.lesson_date, arr);
    }
    // sort dates desc
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [lessons]);

  if (meLoading) return null;
  // Require some school role to view. Admin & principal pass via isOrgAdmin.
  // Teachers may not be admin but still need access — we let the backend gate
  // and only block obvious non-school users. If me is null, redirect.
  if (!me) return <Navigate to="/school" replace />;

  const canEdit = (l: Lesson) =>
    isOrgAdmin(me, orgId) || (me.userId && l.taught_by === me.userId);

  const handleDelete = async (l: Lesson) => {
    if (!confirm(`Delete lesson "${l.title}"?`)) return;
    try {
      await deleteLesson(orgId, l.id);
      toast.success("Lesson deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title="Daily Sabaq"
        subtitle="Lessons posted for this section"
        rightSlot={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-indigo-200">From</Label>
              <Input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-indigo-200">To</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                max={todayIso()}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-36 bg-white/10 border-white/20 text-white"
              />
            </div>
            <Link to={`/school/orgs/${orgId}/admin/classes`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Classes</Button>
            </Link>
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}/lessons/new`}>
              <Button size="sm" className="bg-white text-slate-900 hover:bg-slate-100">
                <Plus className="h-4 w-4 mr-1" /> New Lesson
              </Button>
            </Link>
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && grouped.length === 0 && (
        <div className={`${cardBase} ${cardElev} py-8 text-center text-sm text-slate-500`}>
          No lessons in this range yet.
        </div>
      )}

      {grouped.map(([date, list]) => (
        <div key={date} className="space-y-2">
          <h2 className={`${sectionTitleClasses} border-b border-slate-200 pb-1`}>
            {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h2>
          {list.map((l) => (
            <Card key={l.id} className={`${cardBase} ${cardElev}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-semibold">{l.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Taught by {l.taught_by_name || "—"}
                    </p>
                  </div>
                  {canEdit(l) && (
                    <div className="flex gap-1">
                      <Link to={`/school/orgs/${orgId}/lessons/${l.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(l)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
                {l.body && (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {l.body}
                  </p>
                )}
                {l.video_url && (
                  <div className="pt-1">
                    <VideoPreview url={l.video_url} />
                  </div>
                )}
                {l.audio_url && (
                  <a
                    href={l.audio_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
                  >
                    <Music className="h-4 w-4" /> Audio
                  </a>
                )}
                {l.attachments && l.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {l.attachments.map((a, i) => (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Badge
                          variant="secondary"
                          className="cursor-pointer hover:bg-indigo-100"
                        >
                          <Paperclip className="h-3 w-3 mr-1" />
                          {a.label}
                        </Badge>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
