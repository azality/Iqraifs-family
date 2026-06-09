// StudentTeacherComments — one chronological feed of every teacher-
// authored remark about this child. Pulls from behavior notes, hifz
// progress prose fields, exam score notes, lesson bodies, and
// published report-card comments.
//
// Filter chips let the parent narrow the view (e.g. "Just Hifz" before
// a tutoring session, "Just report cards" for the end-of-term meeting).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  MessageSquare, Award, BookOpen, FileText, ClipboardList,
  CheckCircle2, AlertCircle, ChevronRight,
} from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import {
  getTeacherComments,
  type TeacherCommentItem,
  type TeacherCommentKind,
} from "../../../utils/schoolPortalApi";

const KIND_LABEL: Record<TeacherCommentKind, string> = {
  behavior: "Behavior",
  hifz: "Hifz",
  exam_note: "Exam",
  report_card_subject: "Report · subject",
  report_card_class_teacher: "Report · class teacher",
  report_card_principal: "Report · principal",
  lesson: "Lesson",
};

const KIND_ICON: Record<TeacherCommentKind, any> = {
  behavior: MessageSquare,
  hifz: Award,
  exam_note: ClipboardList,
  report_card_subject: FileText,
  report_card_class_teacher: FileText,
  report_card_principal: FileText,
  lesson: BookOpen,
};

function toneClasses(tone: TeacherCommentItem["tone"]): string {
  if (tone === "positive") return "border-emerald-200 bg-emerald-50";
  if (tone === "concern") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-white";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

const FILTER_GROUPS: Array<{ id: string; label: string; kinds: TeacherCommentKind[] }> = [
  { id: "all", label: "All", kinds: [] },
  { id: "behavior", label: "Behavior", kinds: ["behavior"] },
  { id: "hifz", label: "Hifz", kinds: ["hifz"] },
  { id: "lesson", label: "Lessons", kinds: ["lesson"] },
  { id: "exam_note", label: "Exam notes", kinds: ["exam_note"] },
  { id: "report", label: "Report cards", kinds: ["report_card_subject", "report_card_class_teacher", "report_card_principal"] },
];

export function StudentTeacherComments() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [items, setItems] = useState<TeacherCommentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterId, setFilterId] = useState("all");

  useEffect(() => {
    let cancelled = false;
    getTeacherComments(studentId)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [studentId]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const f = FILTER_GROUPS.find((g) => g.id === filterId);
    if (!f || f.kinds.length === 0) return items;
    const allow = new Set(f.kinds);
    return items.filter((it) => allow.has(it.kind));
  }, [items, filterId]);

  return (
    <div className="space-y-4">
      <HeroCard
        title="Teacher comments"
        subtitle="Everything teachers and the principal have written about your child"
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_GROUPS.map((g) => {
          const count = items
            ? (g.kinds.length === 0
                ? items.length
                : items.filter((it) => g.kinds.includes(it.kind)).length)
            : 0;
          const active = filterId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setFilterId(g.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1.5 border " +
                (active
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300")
              }
            >
              {g.label}
              <span className={
                "inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full text-[10px] font-semibold " +
                (active ? "bg-white/20" : "bg-slate-100 text-slate-600")
              }>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!items ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
          <MessageSquare className="h-6 w-6 mx-auto text-slate-300 mb-2" />
          {items.length === 0
            ? "No teacher comments in the last 120 days."
            : "No comments in this filter."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((it) => {
            const Icon = KIND_ICON[it.kind];
            const ToneIcon =
              it.tone === "positive" ? CheckCircle2 :
              it.tone === "concern" ? AlertCircle : null;
            return (
              <li
                key={it.id}
                className={"rounded-xl border p-3 shadow-sm " + toneClasses(it.tone)}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-0.5 text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        {KIND_LABEL[it.kind]}
                      </span>
                      <span className="text-[11px] text-slate-500">{fmtDate(it.at)}</span>
                      {it.authorName && (
                        <span className="text-[11px] text-slate-500">· {it.authorName}</span>
                      )}
                      {ToneIcon && (
                        <ToneIcon className={"h-3 w-3 " + (it.tone === "positive" ? "text-emerald-600" : "text-amber-600")} />
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-900 mt-0.5">{it.title}</div>
                    <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{it.body}</div>
                  </div>
                  {it.link && (
                    <Link
                      to={`/school-portal/students/${studentId}${it.link}`}
                      className="text-slate-300 hover:text-slate-600 shrink-0"
                      title="Open detail"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default StudentTeacherComments;
