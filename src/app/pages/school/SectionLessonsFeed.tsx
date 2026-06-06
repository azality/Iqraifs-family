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
  listSectionSubjects,
  deleteLesson,
  type Lesson,
  type SchoolMeResponse,
  type SectionSubject,
} from "../../../utils/schoolApi";
import { BookOpen, ListChecks } from "lucide-react";

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
  // Phase 2: subject filter chips. Empty string = "All subjects".
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    getSectionLessons(orgId, sectionId, {
      startDate,
      endDate,
      limit: 50,
      subjectId: subjectFilter || undefined,
    })
      .then((r) => setLessons(r.lessons))
      .catch((e) => setError(e?.message || "Failed to load lessons"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId, startDate, endDate, subjectFilter]);

  // Phase 2: subjects for the filter chip row.
  useEffect(() => {
    if (!sectionId) return;
    listSectionSubjects(sectionId)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [sectionId]);

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

      {/* Phase 2: subject filter chips. Hidden when no subjects exist
          (legacy sections without subjects defined yet). */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">
            Subject
          </span>
          <button
            type="button"
            onClick={() => setSubjectFilter("")}
            className={
              "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
              (subjectFilter === ""
                ? "bg-indigo-600 text-white ring-indigo-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
            }
          >
            All
          </button>
          {subjects.map((s) => {
            const active = subjectFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSubjectFilter(s.id)}
                className={
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
                  (active
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
                }
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

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
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {/* Phase 2: subject + topic badges */}
                      {l.subjectName && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                          <BookOpen className="h-2.5 w-2.5" />
                          {l.subjectName}
                        </span>
                      )}
                      {l.topicName && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
                          <ListChecks className="h-2.5 w-2.5" />
                          {l.topicName}
                        </span>
                      )}
                      {/* Phase 7: visibility badge — staff only see this. */}
                      {l.isVisibleToStudents === false && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                          {l.publishedAt && new Date(l.publishedAt).getTime() > new Date("2100-01-01").getTime()
                            ? "Hidden (draft)"
                            : `Scheduled · ${l.lesson_date}`}
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Taught by {l.taught_by_name || "—"}
                      </p>
                    </div>
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

                {/* Phase 4a: durable resources from the topic this lesson
                    is tagged to (admin-managed, available all year). Lets
                    parents click straight to the worksheet/video without
                    the teacher re-attaching it on every daily lesson. */}
                {l.topicResources && l.topicResources.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                      {l.topicName ? `${l.topicName} resources` : "Topic resources"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {l.topicResources.map((tr) => {
                        const tone =
                          tr.kind === "worksheet"
                            ? "bg-amber-50 text-amber-800 ring-amber-200"
                            : tr.kind === "video"
                            ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                            : tr.kind === "quiz"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : tr.kind === "pdf"
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200";
                        const kindLabel =
                          tr.kind === "pdf"
                            ? "PDF"
                            : tr.kind === "video"
                            ? "Video"
                            : tr.kind === "worksheet"
                            ? "Worksheet"
                            : tr.kind === "quiz"
                            ? "Quiz"
                            : "Link";
                        return (
                          <a
                            key={tr.id}
                            href={tr.url}
                            target="_blank"
                            rel="noreferrer"
                            className={
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 hover:underline " +
                              tone
                            }
                          >
                            <span className="font-semibold uppercase tracking-wider text-[9px]">
                              {kindLabel}
                            </span>
                            <span>·</span>
                            <span>{tr.label}</span>
                          </a>
                        );
                      })}
                    </div>
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
