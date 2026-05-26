// MyAnnouncements — portal feed (student or parent) of announcements
// targeted at the current subject.

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  listMyAnnouncements,
  type Announcement,
  type AnnouncementAudienceKind,
} from "../../../utils/schoolPortalApi";

const AUDIENCE_LABEL: Record<AnnouncementAudienceKind, string> = {
  whole_school: "Whole school",
  class_section: "Class section",
  parents_only: "Parents",
  students_only: "Students",
  specific_students: "Personal",
};

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function MyAnnouncements() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyAnnouncements()
      .then((r) => {
        if (!cancelled) setItems(r.announcements);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <HeroCard title="Announcements" subtitle="News from your school" />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!items && !error && <div className="text-slate-500 text-sm">Loading…</div>}

      {items && items.length === 0 && (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-500 text-center`}>
          No announcements right now.
        </div>
      )}

      <div className="space-y-3">
        {items?.map((a) => (
          <article key={a.id} className={`${cardBase} ${cardElev} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{a.title}</h3>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                {AUDIENCE_LABEL[a.audience_kind]}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {a.author_name ? `${a.author_name} · ` : ""}posted {timeAgo(a.published_at)}
            </p>
            <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{a.body}</p>
            {a.attachments && a.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {a.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {att.label}
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
