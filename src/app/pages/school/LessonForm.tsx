// Phase C.1: Create or edit a daily lesson (sabaq).
//
// Same component serves both /sections/:sectionId/lessons/new and
// /lessons/:lessonId/edit. We detect mode by which param is present.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import { toast } from "sonner";
import {
  getLesson,
  patchLesson,
  postLesson,
  type LessonInput,
} from "../../../utils/schoolApi";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Attachment {
  label: string;
  url: string;
}

export function LessonForm() {
  const { orgId = "", sectionId, lessonId } = useParams();
  const navigate = useNavigate();
  const editMode = !!lessonId;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [lessonDate, setLessonDate] = useState(todayIso());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(editMode);
  const [error, setError] = useState<string | null>(null);
  // Section is needed for the return-to-feed navigation in edit mode.
  const [resolvedSectionId, setResolvedSectionId] = useState<string | undefined>(
    sectionId,
  );

  useEffect(() => {
    if (!editMode || !lessonId || !orgId) return;
    setLoading(true);
    getLesson(orgId, lessonId)
      .then((l) => {
        setTitle(l.title);
        setBody(l.body || "");
        setVideoUrl(l.video_url || "");
        setAudioUrl(l.audio_url || "");
        setLessonDate(l.lesson_date);
        setAttachments(l.attachments || []);
        setResolvedSectionId(l.class_section_id);
      })
      .catch((e) => setError(e?.message || "Failed to load lesson"))
      .finally(() => setLoading(false));
  }, [editMode, lessonId, orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const payload: LessonInput = {
      lessonDate,
      title: title.trim(),
      body: body.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      audioUrl: audioUrl.trim() || undefined,
      attachments: attachments.filter((a) => a.label.trim() && a.url.trim()),
    };
    setSubmitting(true);
    try {
      if (editMode && lessonId) {
        await patchLesson(orgId, lessonId, payload);
        toast.success("Lesson updated");
      } else if (sectionId) {
        await postLesson(orgId, sectionId, payload);
        toast.success("Lesson posted");
      }
      const sid = sectionId || resolvedSectionId;
      if (sid) {
        navigate(`/school/orgs/${orgId}/sections/${sid}/lessons`);
      } else {
        navigate(`/school/orgs/${orgId}/admin/classes`);
      }
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const addAttachment = () =>
    setAttachments((a) => [...a, { label: "", url: "" }]);
  const removeAttachment = (i: number) =>
    setAttachments((a) => a.filter((_, idx) => idx !== i));
  const updateAttachment = (i: number, partial: Partial<Attachment>) =>
    setAttachments((a) =>
      a.map((x, idx) => (idx === i ? { ...x, ...partial } : x)),
    );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const backHref =
    sectionId || resolvedSectionId
      ? `/school/orgs/${orgId}/sections/${sectionId || resolvedSectionId}/lessons`
      : `/school/orgs/${orgId}/admin/classes`;

  return (
    <div className="space-y-4 max-w-2xl">
      <HeroCard
        title={editMode ? "Edit lesson" : "New lesson"}
        subtitle="Daily sabaq for parents and students"
        rightSlot={
          <Link to={backHref}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Back</Button>
          </Link>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <form onSubmit={handleSubmit}>
        <Card className={`${cardBase} ${cardElev}`}>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Surah Al-Baqarah, ayah 1–5"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="date">Lesson date</Label>
              <Input
                id="date"
                type="date"
                value={lessonDate}
                min={daysAgoIso(14)}
                max={todayIso()}
                onChange={(e) => setLessonDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Lesson notes for parents and students"
              />
              <p className="text-xs text-muted-foreground">Markdown allowed</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="video">Video URL</Label>
              <Input
                id="video"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="YouTube, Vimeo, or any link"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="audio">Audio URL</Label>
              <Input
                id="audio"
                type="url"
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="Recitation or recording link"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Attachments</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAttachment}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              {attachments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No attachments. Click "Add" to attach a worksheet or link.
                </p>
              )}
              {attachments.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Label"
                    value={a.label}
                    onChange={(e) =>
                      updateAttachment(i, { label: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="https://…"
                    value={a.url}
                    onChange={(e) =>
                      updateAttachment(i, { url: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAttachment(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-4">
          <Link to={backHref}>
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Saving…" : editMode ? "Save changes" : "Post lesson"}
          </Button>
        </div>
      </form>
    </div>
  );
}
