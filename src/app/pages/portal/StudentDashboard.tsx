// StudentDashboard — overview of a single student for the portal.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CalendarCheck, Award, BookOpen, Sparkles, ClipboardList, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DataTable, HeroCard, KpiTile } from "../../components/school-ui";
import {
  getStudentDashboard,
  getMyStudentDiary,
  type StudentDashboardResponse,
  type DashboardActivityItem,
  type MyStudentDiaryResponse,
} from "../../../utils/schoolPortalApi";

// Friendly Surah name lookup for the Hifz line. Same compact list the
// StudentHifz card uses; falls back to "Surah N" for entries outside it.
const SURAH_NAMES: Record<number, string> = {
  1: "Al-Fatihah", 2: "Al-Baqarah", 3: "Al-Imran", 78: "An-Naba",
  79: "An-Nazi'at", 80: "Abasa", 111: "Al-Masad", 112: "Al-Ikhlas",
  113: "Al-Falaq", 114: "An-Nas",
};
const surahLabel = (n: number) =>
  SURAH_NAMES[n] ? `Surah ${SURAH_NAMES[n]}` : `Surah ${n}`;

/** "Today" diary card — the headline of the parent portal home. Mirrors
 *  the spec's example output line-by-line:
 *    English: Worksheet completed
 *    Math: Homework page 15
 *    Hifz: Revise Surah ___
 *    Reminder: Bring notebook tomorrow
 *  Each row is a single line keyed to a subject (or "Hifz") so a parent
 *  glancing on a phone gets the whole picture in 5 seconds. */
function DiaryCard({ diary }: { diary: MyStudentDiaryResponse }) {
  const dateLabel = new Date(diary.date + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Group lessons by subject — first lesson title wins per subject so
  // the row reads as "English: <today's lesson>".
  const lessonsBySubject = new Map<string, string>();
  for (const l of diary.lessons) {
    const key = l.subject ?? "Lessons";
    if (!lessonsBySubject.has(key)) lessonsBySubject.set(key, l.title);
  }

  const hifzLine = (() => {
    if (!diary.hifz) return null;
    const { sabaq, revision } = diary.hifz;
    if (sabaq) {
      return `Today's sabaq — ${surahLabel(sabaq.surahNumber)}, ayah ${sabaq.ayahFrom}${
        sabaq.ayahTo !== sabaq.ayahFrom ? ` to ${sabaq.ayahTo}` : ""
      }`;
    }
    if (revision) {
      return `Revision (${revision.kind}) — ${surahLabel(revision.surahNumber)}, ayah ${revision.ayahFrom}${
        revision.ayahTo !== revision.ayahFrom ? ` to ${revision.ayahTo}` : ""
      }`;
    }
    return null;
  })();

  // Anything to render at all? If nothing happened today, the card
  // shows a friendly empty state — better than disappearing silently.
  const isEmpty =
    lessonsBySubject.size === 0 &&
    diary.assignments.length === 0 &&
    !hifzLine &&
    diary.reminders.length === 0;

  return (
    <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-50 to-white px-5 py-3 border-b border-indigo-100">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">
          Today's Diary
        </div>
        <div className="text-sm text-slate-700">{dateLabel}</div>
      </div>
      <div className="p-5 space-y-2.5 text-sm">
        {isEmpty && (
          <div className="text-slate-500 italic text-center py-2">
            Nothing logged for today yet. The teacher will post updates as the day
            progresses.
          </div>
        )}

        {/* One row per subject — "English: Worksheet completed" */}
        {Array.from(lessonsBySubject.entries()).map(([subject, title]) => (
          <div key={subject} className="flex gap-2 items-start">
            <BookOpen className="h-4 w-4 mt-0.5 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-slate-900">{subject}:</span>{" "}
              <span className="text-slate-700">{title}</span>
            </div>
          </div>
        ))}

        {/* Today + tomorrow's assignments — "Math: Homework page 15" */}
        {diary.assignments.map((a) => {
          const today = diary.date;
          const dueLabel = a.dueDate === today ? "due today" : "due tomorrow";
          return (
            <div key={a.id} className="flex gap-2 items-start">
              <ClipboardList className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <span className="font-medium text-slate-900">
                  {a.subject ?? a.kind.replace(/_/g, " ")}:
                </span>{" "}
                <span className="text-slate-700">{a.title}</span>{" "}
                <span className="text-[11px] text-amber-700 italic">({dueLabel})</span>
              </div>
            </div>
          );
        })}

        {/* Hifz line — single highlight row */}
        {hifzLine && (
          <div className="flex gap-2 items-start">
            <Award className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-slate-900">Hifz:</span>{" "}
              <span className="text-slate-700">{hifzLine}</span>
            </div>
          </div>
        )}

        {/* Parent action — emerald CTA */}
        {diary.hifz?.parentAction && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              What to do tonight
            </div>
            <div className="mt-1 text-sm text-emerald-900">{diary.hifz.parentAction}</div>
          </div>
        )}

        {/* Reminders — extracted from lesson notes */}
        {diary.reminders.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1">
              <Bell className="h-3 w-3" /> Reminders
            </div>
            <ul className="mt-1 space-y-0.5 text-sm text-amber-900 list-disc list-inside">
              {diary.reminders.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StudentDashboard() {
  const { t } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [diary, setDiary] = useState<MyStudentDiaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Parallel — diary is independent of dashboard. If diary fails
        // we still want to render the rest, so don't await both
        // together: fire diary fetch separately and only log on
        // failure (no need to surface as user error).
        const res = await getStudentDashboard(studentId);
        if (!cancelled) setData(res);
        getMyStudentDiary(studentId)
          .then((d) => { if (!cancelled) setDiary(d); })
          .catch(() => { /* silent fail — dashboard still renders */ });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;
  }

  const { student, tiles, recentActivity } = data;
  const sectionSubtitle = [student.sectionName, student.className].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <HeroCard
        title={student.fullName}
        subtitle={sectionSubtitle || `GR # ${student.grNumber}`}
        asOf={`As of ${new Date().toLocaleDateString()}`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-tour="portal-dashboard-tiles">
          <KpiTile
            icon={CalendarCheck}
            label={t("portal.tiles.attendance")}
            value={
              tiles.attendancePct?.value !== null && tiles.attendancePct?.value !== undefined
                ? `${tiles.attendancePct.value}%`
                : null
            }
            hint={tiles.attendancePct?.hint ?? undefined}
            variant="light"
          />
          <KpiTile
            icon={Award}
            label={t("portal.tiles.averageGrade")}
            value={
              tiles.averageGrade?.value !== null && tiles.averageGrade?.value !== undefined
                ? `${tiles.averageGrade.value}%`
                : null
            }
            hint={tiles.averageGrade?.hint ?? undefined}
            variant="light"
          />
          <KpiTile
            icon={BookOpen}
            label={t("portal.tiles.ayahsMemorized")}
            value={tiles.hifzAyahsMemorized?.value ?? null}
            hint={tiles.hifzAyahsMemorized?.hint ?? undefined}
            variant="light"
          />
          <KpiTile
            icon={Sparkles}
            label={t("portal.tiles.behaviorScore")}
            value={tiles.behaviorScore?.value ?? null}
            hint={tiles.behaviorScore?.hint ?? undefined}
            variant="light"
          />
        </div>
      </HeroCard>

      {/* Today's diary — highest-signal panel above recent activity */}
      {diary && <DiaryCard diary={diary} />}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            {t("portal.recentActivity")}
          </h3>
        </div>
        <DataTable<DashboardActivityItem>
          rows={recentActivity}
          rowKey={(r) => r.id}
          emptyMessage="No recent activity."
          columns={[
            {
              key: "at",
              header: "When",
              width: "w-32",
              cell: (r) => <span className="text-slate-500">{relativeTime(r.at)}</span>,
            },
            {
              key: "kind",
              header: "Kind",
              width: "w-32",
              cell: (r) => (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 capitalize">
                  {r.kind.replace(/_/g, " ")}
                </span>
              ),
            },
            { key: "summary", header: "Summary", cell: (r) => r.summary },
          ]}
        />
      </div>
    </div>
  );
}
