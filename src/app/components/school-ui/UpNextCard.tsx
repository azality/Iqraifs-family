// UpNextCard — "What's coming up + what to prepare" panel.
//
// Same component for teacher dashboard and student portal — the only
// thing that changes is the lookup hook and the copy ("teach" vs "have").
// The backend returns the same shape for both audiences.

import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import {
  Calendar, BookOpen, MapPin, Clock,
  Video, FileText, ListChecks, Link2, FileQuestion,
  CheckCircle2, AlertCircle, ChevronRight, Lightbulb,
} from "lucide-react";
import type { LessonPrepItem } from "../../../utils/schoolApi";

const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"];

function fmtWhen(slot: LessonPrepItem["slot"]): string {
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;
  const dayLabel = slot.dayOfWeek === todayDow
    ? i18n.t("upNext.today")
    : i18n.t(`upNext.${DAY_KEYS[slot.dayOfWeek - 1]}`);
  return `${dayLabel} · ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`;
}

function fmtMinutesUntil(
  slot: LessonPrepItem["slot"],
): { label: string; active: boolean } | null {
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;
  if (slot.dayOfWeek !== todayDow) return null;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const [h, m] = slot.startTime.split(":").map((n) => parseInt(n, 10) || 0);
  const startM = h * 60 + m;
  const diff = startM - nowM;
  if (diff <= 0) return { label: i18n.t("upNext.inProgress"), active: true };
  if (diff < 60) return { label: i18n.t("upNext.inMin", { m: diff }), active: false };
  const hh = Math.floor(diff / 60);
  const mm = diff % 60;
  return {
    label: mm
      ? i18n.t("upNext.inHM", { h: hh, m: mm })
      : i18n.t("upNext.inH", { h: hh }),
    active: false,
  };
}

interface Props {
  /** Backend payload — see LessonPrepItem. */
  items: LessonPrepItem[];
  /** "teacher" → "You teach …" copy. "student" → "You have …" copy. */
  audience: "teacher" | "student";
  /** Used to build deep-links to the lesson editor / topic resources. */
  orgId?: string;
  /** Student id for portal deep-links. */
  studentId?: string;
}

export function UpNextCard({ items, audience, orgId, studentId }: Props) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
        <div className="text-sm text-emerald-900 inline-flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {audience === "teacher" ? t("upNext.allDoneTeacher") : t("upNext.allDoneStudent")}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
          <Calendar className="h-4 w-4 text-indigo-500" />
          {t("upNext.heading", { count: items.length })}
        </h2>
        {audience === "teacher" && orgId && (
          <Link to={`/school/orgs/${orgId}/my-schedule`}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline">
            {t("upNext.seeFullWeek")}
          </Link>
        )}
        {audience === "student" && studentId && (
          <Link to={`/school-portal/students/${studentId}/timetable`}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline">
            {t("upNext.seeFullWeek")}
          </Link>
        )}
      </div>

      <div className="space-y-2.5">
        {items.map((it) => (
          <UpNextItem key={it.entryId} item={it} audience={audience} orgId={orgId} studentId={studentId} />
        ))}
      </div>
    </section>
  );
}

function UpNextItem({ item, audience, orgId, studentId }: {
  item: LessonPrepItem;
  audience: "teacher" | "student";
  orgId?: string;
  studentId?: string;
}) {
  const { t } = useTranslation();
  const when = fmtWhen(item.slot);
  const inMin = fmtMinutesUntil(item.slot);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      {/* Row 1: subject + scope + when */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
            <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
            {item.subjectName ?? t("upNext.classFallback")}
          </span>
          <span className="text-slate-600">{item.scopeLabel}</span>
          {item.room && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3" /> {t("upNext.room", { room: item.room })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="h-3 w-3" /> {when}
          </span>
          {inMin && (
            <span className={
              "text-[11px] font-medium px-2 py-0.5 rounded-full " +
              (inMin.active
                ? "bg-emerald-100 text-emerald-800"
                : "bg-indigo-100 text-indigo-800")
            }>
              {inMin.label}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: prep state + topic + resources */}
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <PrepStateBadge item={item} audience={audience} />
        {item.resources.total > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            {item.resources.worksheets > 0 && (
              <Chip Icon={FileText} label={t("upNext.worksheets", { count: item.resources.worksheets })} />
            )}
            {item.resources.videos > 0 && (
              <Chip Icon={Video} label={t("upNext.videos", { count: item.resources.videos })} />
            )}
            {item.resources.quizzes > 0 && (
              <Chip Icon={FileQuestion} label={t("upNext.quizzes", { count: item.resources.quizzes })} />
            )}
            {item.resources.pdfs > 0 && (
              <Chip Icon={FileText} label={t("upNext.pdfs", { count: item.resources.pdfs })} />
            )}
            {item.resources.links > 0 && (
              <Chip Icon={Link2} label={t("upNext.links", { count: item.resources.links })} />
            )}
          </div>
        )}
      </div>

      {/* Row 3: CTA */}
      <div className="mt-2 flex items-center justify-end">
        <UpNextCta item={item} audience={audience} orgId={orgId} studentId={studentId} />
      </div>
    </div>
  );
}

function PrepStateBadge({ item, audience }: { item: LessonPrepItem; audience: "teacher" | "student" }) {
  const { t } = useTranslation();
  // "Planned" = the teacher chose this topic for this day (target_date);
  // otherwise it's the next topic in sequence. Teachers see the
  // distinction; students just see the topic.
  const planned = audience === "teacher" && item.topicSource === "planned";
  if (item.prepState === "lesson_ready") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" />
        {t("upNext.lessonReady")} · {item.lesson?.title ?? item.topic?.name ?? t("upNext.topicFallback")}{planned ? ` · ${t("upNext.plannedTag")}` : ""}
      </span>
    );
  }
  if (item.prepState === "topic_pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
        <Lightbulb className="h-3 w-3" />
        {audience === "teacher"
          ? (planned ? t("upNext.plannedPrefix") : t("upNext.preparePrefix"))
          : t("upNext.topicPrefix")}{" "}
        {item.topic?.name ?? t("upNext.nextTopic")}
      </span>
    );
  }
  if (item.prepState === "no_curriculum") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
        <ListChecks className="h-3 w-3" />
        {audience === "teacher" ? t("upNext.noTopicsLeft") : t("upNext.topicTBA")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
      <AlertCircle className="h-3 w-3" />
      {t("upNext.subjectNotAssigned")}
    </span>
  );
}

function UpNextCta({ item, audience, orgId, studentId }: {
  item: LessonPrepItem;
  audience: "teacher" | "student";
  orgId?: string;
  studentId?: string;
}) {
  const { t } = useTranslation();
  if (audience === "teacher" && orgId) {
    // NOTE: these previously pointed at /admin/lessons/* — routes that
    // never existed, so tapping them rendered a blank shell (pilot
    // report: "Prepare lesson blacks out"). Real routes: LessonForm at
    // sections/:sectionId/lessons/new, edit at lessons/:lessonId/edit.
    if (item.prepState === "lesson_ready" && item.lesson) {
      return (
        <Link to={`/school/orgs/${orgId}/lessons/${item.lesson.id}/edit`}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900">
          {t("upNext.reviewLesson")} <ChevronRight className="h-3 w-3" />
        </Link>
      );
    }
    if (item.prepState === "topic_pending" && item.topic && item.sectionId) {
      const q = new URLSearchParams();
      q.set("topicId", item.topic.id);
      if (item.classSubjectId) q.set("classSubjectId", item.classSubjectId);
      return (
        <Link to={`/school/orgs/${orgId}/sections/${item.sectionId}/lessons/new?${q}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-950">
          {t("upNext.prepareLesson")} <ChevronRight className="h-3 w-3" />
        </Link>
      );
    }
    return null;
  }
  // Student: open the topic resources page if a topic exists
  if (audience === "student" && studentId) {
    if (item.topic && item.resources.total > 0) {
      return (
        <Link to={`/school-portal/students/${studentId}/topics/${item.topic.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900">
          {t("upNext.openResources")} <ChevronRight className="h-3 w-3" />
        </Link>
      );
    }
    if (item.lesson) {
      return (
        <Link to={`/school-portal/students/${studentId}/lessons/${item.lesson.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900">
          {t("upNext.openLesson")} <ChevronRight className="h-3 w-3" />
        </Link>
      );
    }
  }
  return null;
}

function Chip({ Icon, label }: { Icon: typeof BookOpen; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-1.5 py-0.5">
      <Icon className="h-3 w-3 text-slate-500" />
      <span className="text-slate-700">{label}</span>
    </span>
  );
}

export default UpNextCard;
