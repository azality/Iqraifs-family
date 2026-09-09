// MyAnnouncements — portal feed (student or parent) of announcements
// targeted at the current subject.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  listMyAnnouncements,
  type Announcement,
  type AnnouncementAudienceKind,
} from "../../../utils/schoolPortalApi";

const AUDIENCE_LABEL_KEY: Record<AnnouncementAudienceKind, string> = {
  whole_school: "portal.ann.audWholeSchool",
  class_section: "portal.ann.audClassSection",
  parents_only: "portal.ann.audParents",
  students_only: "portal.ann.audStudents",
  specific_students: "portal.ann.audPersonal",
  class: "portal.ann.audClass",
  teachers: "portal.ann.audTeachers",
  staff: "portal.ann.audStaff",
  program: "portal.ann.audProgram",
  subject: "portal.ann.audSubject",
};

type TFn = (k: string, o?: Record<string, unknown>) => string;

function timeAgo(iso: string, t: TFn, lang: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return t("portal.ann.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("behavior.minsAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("behavior.hoursAgo", { n: hr });
  const d = Math.floor(hr / 24);
  if (d < 30) return t("behavior.daysAgo", { n: d });
  return new Date(iso).toLocaleDateString(lang.startsWith("ur") ? "ur-PK" : undefined);
}

export function MyAnnouncements() {
  const { t, i18n } = useTranslation();
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
      <HeroCard title={t("portal.ann.title")} subtitle={t("portal.ann.subtitle")} />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!items && !error && <div className="text-slate-500 text-sm">{t("common.loading")}</div>}

      {items && items.length === 0 && (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-500 text-center`}>
          {t("portal.ann.empty")}
        </div>
      )}

      <div className="space-y-3">
        {items?.map((a) => (
          <article key={a.id} className={`${cardBase} ${cardElev} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">{a.title}</h3>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                {t(AUDIENCE_LABEL_KEY[a.audienceKind])}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {a.authorName ? `${a.authorName} · ` : ""}
              {t("portal.ann.postedAgo", { ago: timeAgo(a.publishedAt, t, i18n.language ?? "en") })}
            </p>
            {/* dir="auto" so an Urdu announcement aligns right and its
                numbers land correctly, without tagging the language. */}
            <p dir="auto" className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{a.body}</p>
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
