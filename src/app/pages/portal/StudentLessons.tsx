// StudentLessons — feed of daily lessons for a student.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Video, Headphones, Paperclip } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import { getMyStudentLessons, type Lesson } from "../../../utils/schoolPortalApi";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StudentLessons() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [startDate, setStartDate] = useState<string>(isoDaysAgo(30));
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => ({ startDate, endDate, limit: 100 }), [startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    setLessons(null);
    (async () => {
      try {
        const res = await getMyStudentLessons(studentId, range);
        if (!cancelled) setLessons(res.lessons);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, range]);

  return (
    <div className="space-y-5">
      <HeroCard
        title="Lessons"
        subtitle="Daily sabaq and class lessons"
        rightSlot={
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white/10 text-white border border-white/20 rounded px-2 py-1"
            />
            <span className="text-indigo-200">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white/10 text-white border border-white/20 rounded px-2 py-1"
            />
          </div>
        }
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!lessons && !error && <div className="text-slate-500 text-sm">Loading…</div>}

      {lessons && lessons.length === 0 && (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-500 text-center`}>
          No lessons in this range.
        </div>
      )}

      <div className="space-y-3">
        {lessons?.map((l) => (
          <article key={l.id} className={`${cardBase} ${cardElev} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{l.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(l.lesson_date).toLocaleDateString()}
                  {l.taught_by_name ? ` · by ${l.taught_by_name}` : ""}
                </p>
              </div>
            </div>
            {l.body && (
              <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{l.body}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {l.video_url && (
                <a
                  href={l.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1"
                >
                  <Video className="h-3.5 w-3.5" />
                  Video
                </a>
              )}
              {l.audio_url && (
                <a
                  href={l.audio_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1"
                >
                  <Headphones className="h-3.5 w-3.5" />
                  Audio
                </a>
              )}
              {l.attachments?.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2 py-1"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {a.label}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
