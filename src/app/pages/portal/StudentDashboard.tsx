// StudentDashboard — single-child landing page in the portal.
//
// PR feat/parent-portal-home: leads with plain-language status cards
// from the today-snapshot endpoint. Today's Diary (from feat/daily-diary)
// sits between status pills and recent activity. Recent activity from
// the existing dashboard endpoint still appears at the bottom.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Award, BookOpen, ClipboardList, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeroCard, TimeOffModal } from "../../components/school-ui";
import { UpNextCard } from "../../components/school-ui/UpNextCard";
import { useExamSchedule } from "./ExamDatesheetCard";
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
                {(((a as any).videoUrl || (a as any).audioUrl || ((a as any).attachments ?? []).length > 0)) && (
                  <div className="mt-0.5 flex flex-wrap gap-2">
                    {(a as any).videoUrl && (
                      <a href={(a as any).videoUrl} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 underline">▶ Video</a>
                    )}
                    {(a as any).audioUrl && (
                      <a href={(a as any).audioUrl} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 underline">🎧 Audio</a>
                    )}
                    {(((a as any).attachments ?? []) as Array<{ label: string; url: string }>).map((att, i) => (
                      <a key={i} href={att.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 underline">📎 {att.label || "Attachment"}</a>
                    ))}
                  </div>
                )}
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
  // Date-only values (lesson_date etc.) carry no clock — "Xh ago" math on
  // them is meaningless (UTC-midnight parsing made same-day events read
  // as many hours old). Show the day instead.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    if (iso === todayStr) return "today";
    return new Date(`${iso}T00:00:00`).toLocaleDateString();
  }
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
  // Assessment weeks dominate a parent's month — surface the next paper
  // on Today, with the full datesheet one tap away under Timetable.
  const examSchedule = useExamSchedule(studentId);

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

  // ── 10b: three status chips + a human "This week" digest. ────────────
  const att = snapshot.attendanceToday;
  const fmtTime = (iso: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  };
  const chips: Array<{ label: string; value: string; cls: string }> = [
    att === null
      ? { label: t("portal.nav.attendance"), value: t("portal.home.rollNotTaken"), cls: "border-slate-200 bg-white text-slate-600" }
      : att.status === "present"
      ? { label: t("portal.nav.attendance"), value: `${t("portal.home.present")} ${fmtTime(att.takenAt)}`.trim(), cls: "border-emerald-200 bg-emerald-50 text-emerald-800" }
      : att.status === "late"
      ? { label: t("portal.nav.attendance"), value: `${t("portal.home.late")} ${fmtTime(att.takenAt)}`.trim(), cls: "border-amber-200 bg-amber-50 text-amber-800" }
      : att.status === "excused"
      ? { label: t("portal.nav.attendance"), value: t("portal.home.excused"), cls: "border-sky-200 bg-sky-50 text-sky-800" }
      : { label: t("portal.nav.attendance"), value: t("portal.home.absent"), cls: "border-rose-200 bg-rose-50 text-rose-800" },
    snapshot.homeworkPending.count > 0
      ? { label: t("portal.nav.homework"), value: t("portal.child.dueCount", { count: snapshot.homeworkPending.count }), cls: "border-amber-200 bg-amber-50 text-amber-800" }
      : { label: t("portal.nav.homework"), value: t("portal.child.allIn"), cls: "border-slate-200 bg-white text-slate-600" },
    snapshot.feesDueNow
      ? { label: t("portal.nav.fees"), value: t("portal.child.feeDueShort", { amount: snapshot.feesDueNow.amount.toLocaleString() }), cls: "border-rose-200 bg-rose-50 text-rose-800" }
      : { label: t("portal.nav.fees"), value: t("portal.child.upToDate"), cls: "border-slate-200 bg-white text-slate-600" },
  ];

  // Human week digest: attendance rows collapse to ONE line; everything
  // else keeps a weekday prefix. Replaces the 11-identical-row table.
  const digest: Array<{ day: string; text: string }> = [];
  if (data) {
    const rows = data.recentActivity ?? [];
    const attRows = rows.filter((r) => r.kind === "attendance");
    const others = rows.filter((r) => r.kind !== "attendance").slice(0, 5);
    for (const r of others) {
      const d = new Date(r.at);
      digest.push({
        day: Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { weekday: "short" }) : "",
        text: `${KIND_LABEL[r.kind] ?? r.kind}: ${r.summary}`,
      });
    }
    if (attRows.length > 0) {
      const lates = attRows.filter((r) => /late/i.test(r.summary)).length;
      const absents = attRows.filter((r) => /absent/i.test(r.summary)).length;
      const text =
        lates === 0 && absents === 0
          ? t("portal.child.attAllPresent", { count: attRows.length })
          : t("portal.child.attSummary", { count: attRows.length, late: lates, absent: absents });
      digest.push({ day: "", text });
    }
  }

  return (
    <div className="space-y-4 pb-12">
      <HeroCard
        title={snapshot.student.fullName}
        subtitle={sectionSubtitle || `GR # ${snapshot.student.grNumber}`}
        rightSlot={
          <button
            onClick={() => setShowTimeOff(true)}
            className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            {t("portal.child.reportAbsence")}
          </button>
        }
      />
      {showTimeOff && (
        <TimeOffModal
          audience="student"
          onClose={() => setShowTimeOff(false)}
          onSubmit={(body) => createStudentTimeOff(studentId, body)}
        />
      )}

      {/* Next assessment paper — only while the datesheet is live. */}
      {(() => {
        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        const next = (examSchedule?.papers ?? [])
          .filter((p) => p.examDate >= iso)
          .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
        if (!next) return null;
        const away = Math.round(
          (new Date(`${next.examDate}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86400e3,
        );
        const when = away === 0 ? t("portal.exam.today") : away === 1 ? t("portal.exam.tomorrow") : t("portal.exam.inDays", { count: away });
        return (
          <Link
            to={`/school-portal/students/${studentId}/timetable`}
            className="flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5"
          >
            <span className="flex-none text-[10.5px] font-extrabold uppercase tracking-wide text-indigo-700">
              {t("portal.exam.next")}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-indigo-900">
              {next.subjectLabel} · {when}
              {next.startTime ? ` · ${next.startTime}` : ""}
            </span>
            <span className="flex-none text-[11px] font-bold text-indigo-500">
              {t("portal.exam.seeDatesheet")}
            </span>
          </Link>
        );
      })()}

      {/* 10b status chips: attendance / homework / fees at a glance. */}
      <div className="grid grid-cols-3 gap-2">
        {chips.map((c) => (
          <div key={c.label} className={`rounded-xl border px-3 py-2 ${c.cls}`}>
            <div className="text-[10px] font-extrabold uppercase tracking-wide opacity-70">{c.label}</div>
            <div className="truncate text-[12.5px] font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Rest of today — per-period preview with topic + resources. */}
      {upcoming !== null && (
        <UpNextCard items={upcoming} audience="student" studentId={studentId} />
      )}

      {/* Today's Diary — narrative for today (what we did, what to do tonight). */}
      {diary && <DiaryCard diary={diary} />}

      {/* This week — the human digest that replaced the activity table. */}
      {data && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
            {t("portal.child.thisWeek")}
          </h3>
          {digest.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("portal.child.quietWeek")}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] text-slate-700">
              {digest.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-12 flex-none text-slate-400">{l.day}</span>
                  <span className="min-w-0 flex-1">{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StudentDashboard;
