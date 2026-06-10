// StudentDashboard — single-child landing page in the portal.
//
// PR feat/parent-portal-home: leads with plain-language status cards
// from the today-snapshot endpoint. Today's Diary (from feat/daily-diary)
// sits between status pills and recent activity. Recent activity from
// the existing dashboard endpoint still appears at the bottom.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Award, BookOpen, ClipboardList, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DataTable, HeroCard, TimeOffModal } from "../../components/school-ui";
import { UpNextCard } from "../../components/school-ui/UpNextCard";
import {
  getStudentDashboard,
  getStudentUpcoming,
  getTodaySnapshot,
  getMyStudentDiary,
  createStudentTimeOff,
  type StudentDashboardResponse,
  type DashboardActivityItem,
  type TodaySnapshot,
  type MyStudentDiaryResponse,
} from "../../../utils/schoolPortalApi";
import { TodayStatusPills } from "./TodayStatusPills";

// Friendly Surah name lookup for the Hifz line. Compact list; falls
// back to "Surah N" for entries outside it.
const SURAH_NAMES: Record<number, string> = {
  1: "Al-Fatihah", 2: "Al-Baqarah", 3: "Al-Imran", 78: "An-Naba",
  79: "An-Nazi'at", 80: "Abasa", 111: "Al-Masad", 112: "Al-Ikhlas",
  113: "Al-Falaq", 114: "An-Nas",
};
const surahLabel = (n: number) =>
  SURAH_NAMES[n] ? `Surah ${SURAH_NAMES[n]}` : `Surah ${n}`;

/** "Today's Diary" card. Spec-shaped:
 *    English: Worksheet completed
 *    Math: Homework page 15 (due today)
 *    Hifz: Today's sabaq — Surah Al-Mulk, ayah 1–10
 *    What to do tonight: Revise Surah Al-Mulk after Maghrib
 *    Reminders: Bring notebook tomorrow
 */
function DiaryCard({ diary }: { diary: MyStudentDiaryResponse }) {
  // Parse YYYY-MM-DD as LOCAL midnight, not UTC — appending "T00:00:00Z"
  // anchors to UTC, which `toLocaleDateString` then shifts back into the
  // browser TZ, causing "Today" to render as the previous day for any
  // browser west of UTC (e.g. North America). Constructing with
  // (year, month-1, day) sidesteps the round-trip.
  const [_y, _m, _d] = diary.date.split("-").map((x) => Number(x));
  const dateLabel = new Date(_y, _m - 1, _d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
            Nothing logged for today yet. The teacher will post updates as the day progresses.
          </div>
        )}

        {Array.from(lessonsBySubject.entries()).map(([subject, title]) => (
          <div key={subject} className="flex gap-2 items-start">
            <BookOpen className="h-4 w-4 mt-0.5 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-slate-900">{subject}:</span>{" "}
              <span className="text-slate-700">{title}</span>
            </div>
          </div>
        ))}

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

        {hifzLine && (
          <div className="flex gap-2 items-start">
            <Award className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-slate-900">Hifz:</span>{" "}
              <span className="text-slate-700">{hifzLine}</span>
            </div>
          </div>
        )}

        {diary.hifz?.parentAction && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              What to do tonight
            </div>
            <div className="mt-1 text-sm text-emerald-900">{diary.hifz.parentAction}</div>
          </div>
        )}

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

const KIND_LABEL: Record<string, string> = {
  lesson: "Lesson",
  grade: "Grade",
  hifz: "Hifz",
  attendance: "Attendance",
  behavior: "Teacher note",
};

export function StudentDashboard() {
  const { t } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [diary, setDiary] = useState<MyStudentDiaryResponse | null>(null);
  const [upcoming, setUpcoming] = useState<import("../../../utils/schoolApi").LessonPrepItem[] | null>(null);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodaySnapshot(studentId)
      .then((r) => { if (!cancelled) setSnapshot(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    getStudentDashboard(studentId)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { /* recent activity is non-fatal */ });
    getMyStudentDiary(studentId)
      .then((d) => { if (!cancelled) setDiary(d); })
      .catch(() => { /* diary is non-fatal — card silently hidden */ });
    getStudentUpcoming(studentId, 3)
      .then((r) => { if (!cancelled) setUpcoming(r.upcoming); })
      .catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [studentId]);

  if (error && !snapshot) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!snapshot) {
    return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;
  }

  const sectionSubtitle = [snapshot.student.sectionName, snapshot.student.className]
    .filter(Boolean).join(" · ");

  return (
    <div className="space-y-5 pb-12">
      <HeroCard
        title={snapshot.student.fullName}
        subtitle={sectionSubtitle || `GR # ${snapshot.student.grNumber}`}
        asOf={`As of ${new Date().toLocaleDateString()}`}
      />

      <div className="flex justify-end">
        <button
          onClick={() => setShowTimeOff(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          Report absence / vacation
        </button>
      </div>
      {showTimeOff && (
        <TimeOffModal
          audience="student"
          onClose={() => setShowTimeOff(false)}
          onSubmit={(body) => createStudentTimeOff(studentId, body)}
        />
      )}

      {/* Today's plain-language status cards. */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
          Today
        </h2>
        <TodayStatusPills
          studentId={studentId}
          snapshot={snapshot}
          variant="expanded"
        />
      </section>

      {/* Up next — smart per-period preview with the topic + resources
          available so students can prepare ahead. Same component the
          teacher dashboard uses, just in "student" mode. */}
      {upcoming !== null && (
        <UpNextCard items={upcoming} audience="student" studentId={studentId} />
      )}

      {/* Today's Diary — narrative for today (what we did, what to do tonight). */}
      {diary && <DiaryCard diary={diary} />}

      {/* Recent activity timeline — still useful for "what happened last week". */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              Recent activity
            </h3>
          </div>
          <DataTable<DashboardActivityItem>
            rows={data.recentActivity}
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
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
                    {KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, " ")}
                  </span>
                ),
              },
              { key: "summary", header: "What happened", cell: (r) => r.summary },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default StudentDashboard;
