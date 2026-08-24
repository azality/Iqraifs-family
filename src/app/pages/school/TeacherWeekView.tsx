// TeacherWeekView — full weekly timetable for the signed-in teacher,
// with the topic queued for each period and a per-period planner.
//
// The "Today" card on TeacherHome covers the next-action case
// (what am I teaching in the next hour). This page covers planning:
// "where am I on Thursday afternoon, what am I teaching Monday, let me
// put Fractions on Wednesday." Pilot ask: teachers want to see the
// coming week's topics so they can prepare, and choose which day a
// topic is taught.
//
// Data: /me/timetable for the grid (no `day` filter), /me/upcoming for
// the topic queued on each period — "planned" when the teacher set a
// target date on a topic for that day, "next" (next incomplete in
// sequence) otherwise. Planning writes curriculum_topic.target_date via
// the existing PATCH (define_curriculum — class teachers have it).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, BookOpen, MapPin, Calendar, CalendarCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  getMyTeacherTimetable,
  getMyUpcoming,
  getClassSubjectCurriculum,
  updateClassCurriculumTopic,
  postLesson,
  type MyTimetableCell,
  type LessonPrepItem,
  type ClassCurriculumTopic,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function todayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function TeacherWeekView() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [cells, setCells] = useState<MyTimetableCell[]>([]);
  const [prep, setPrep] = useState<Map<string, LessonPrepItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Planner state: which period is being planned, its topic list.
  const [planningEntryId, setPlanningEntryId] = useState<string | null>(null);
  const [planTopics, setPlanTopics] = useState<ClassCurriculumTopic[]>([]);
  const [planBusy, setPlanBusy] = useState(false);
  // Free-text plan ("worksheet practice", "revision") — saved as a draft
  // lesson for that subject + date, kept hidden from parents until the
  // teacher publishes it from the lesson editor.
  const [activityText, setActivityText] = useState("");

  const loadPrep = () =>
    getMyUpcoming(orgId, 60)
      .then((r) => setPrep(new Map(r.upcoming.map((p) => [p.entryId, p]))))
      .catch(() => {});

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getMyTeacherTimetable(orgId, { date: todayIso() }), loadPrep()])
      .then(([r]) => { if (!cancelled) { setCells(r.cells); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const byDay = useMemo(() => {
    const m = new Map<number, MyTimetableCell[]>();
    for (const c of cells) {
      const arr = m.get(c.slot.dayOfWeek) ?? [];
      arr.push(c);
      m.set(c.slot.dayOfWeek, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));
    }
    return m;
  }, [cells]);

  const today = todayDow();
  const totalSlots = cells.length;

  const openPlanner = async (p: LessonPrepItem) => {
    if (!p.classSubjectId) return;
    if (planningEntryId === p.entryId) { setPlanningEntryId(null); return; }
    setPlanningEntryId(p.entryId);
    setPlanTopics([]);
    setActivityText("");
    try {
      const r = await getClassSubjectCurriculum(p.classSubjectId);
      setPlanTopics(r.topics.filter((t) => !t.completed));
    } catch {
      toast.error("Couldn't load this subject's topics");
      setPlanningEntryId(null);
    }
  };

  const saveActivity = async (p: LessonPrepItem) => {
    const title = activityText.trim();
    if (!title || !p.sectionId) return;
    setPlanBusy(true);
    try {
      await postLesson(orgId, p.sectionId, {
        title,
        lessonDate: p.entryDate,
        sectionSubjectId: p.sectionSubjectId ?? undefined,
        visibility: "hidden",
      });
      toast.success(`Activity planned for ${DAY_FULL[p.slot.dayOfWeek - 1]} ${shortDate(p.entryDate)} — hidden from parents until you publish it`);
      await loadPrep();
      setPlanningEntryId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the activity");
    } finally {
      setPlanBusy(false);
    }
  };

  const planTopic = async (p: LessonPrepItem, topicId: string | null) => {
    setPlanBusy(true);
    try {
      if (topicId) {
        await updateClassCurriculumTopic(topicId, { targetDate: p.entryDate });
        toast.success(`Planned for ${DAY_FULL[p.slot.dayOfWeek - 1]} ${shortDate(p.entryDate)}`);
      } else if (p.topic && p.topicSource === "planned") {
        await updateClassCurriculumTopic(p.topic.id, { targetDate: null });
        toast.success("Plan cleared — back to the next topic in sequence");
      }
      await loadPrep();
      setPlanningEntryId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the plan");
    } finally {
      setPlanBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Dashboard
          </Button>
        </Link>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>My week</h1>
        <p className="mt-1 text-sm text-slate-600">
          {totalSlots} period{totalSlots === 1 ? "" : "s"} scheduled across the week.
          Each period shows the topic queued for it — tap <span className="font-medium">Plan</span> to
          choose which topic you'll teach that day. Substitutions only show for today.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : totalSlots === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Calendar className="mx-auto h-6 w-6 text-slate-300 mb-2" />
          You don't have any timetable entries yet. Your school admin assigns them.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {DAYS.map((_, i) => {
            const dow = i + 1;
            const dayCells = byDay.get(dow) ?? [];
            const isToday = dow === today;
            return (
              <div
                key={dow}
                className={
                  "rounded-2xl border bg-white shadow-sm overflow-hidden " +
                  (isToday ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200")
                }
              >
                <div className={
                  "px-3 py-2 border-b border-slate-100 flex items-center justify-between " +
                  (isToday ? "bg-indigo-50" : "bg-slate-50/60")
                }>
                  <div className="text-sm font-semibold text-slate-900">
                    {DAY_FULL[i]}
                    {isToday && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-indigo-600 text-white text-[10px] font-medium px-2 py-0.5">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {dayCells.length} slot{dayCells.length === 1 ? "" : "s"}
                  </span>
                </div>
                {dayCells.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400 italic">No classes.</div>
                ) : (
                  <div className="p-2 space-y-1.5">
                    {dayCells.map((c) => {
                      const sub = isToday ? c.substitution : null;
                      const covering = sub?.role === "covering";
                      const covered = sub?.role === "covered";
                      const p = prep.get(c.entry.id) ?? null;
                      const planning = planningEntryId === c.entry.id;
                      return (
                        <div
                          key={c.entry.id + (covering ? ":cov" : "")}
                          className={
                            "rounded-lg border px-2.5 py-1.5 text-xs " +
                            (covering
                              ? "border-amber-200 bg-amber-50"
                              : covered
                              ? "border-slate-200 bg-slate-50 opacity-70"
                              : "border-slate-200 bg-slate-50/40")
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-semibold text-slate-600">
                              {c.slot.startTime}–{c.slot.endTime}
                            </div>
                            <div className="text-[10px] text-slate-400">{c.slot.name}</div>
                          </div>
                          <div className="mt-0.5 inline-flex items-center gap-1 font-medium text-slate-800">
                            <BookOpen className="h-3 w-3 text-indigo-500" />
                            {c.entry.subjectName ?? "Class"}
                          </div>
                          <div className="text-[11px] text-slate-600">{c.scopeLabel}</div>

                          {/* Topic queued for this period + planner. Past
                              periods (today, already ended) have no prep
                              item — the planner only targets what's ahead. */}
                          {p && (
                            <div className="mt-1.5 rounded-md border border-slate-200/70 bg-white px-2 py-1.5">
                              {p.lesson && (
                                <div className="mb-1 flex items-start gap-1.5">
                                  <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wide text-emerald-700">Lesson planned</div>
                                    <div className="text-[11px] font-medium text-slate-800">{p.lesson.title}</div>
                                  </div>
                                </div>
                              )}
                              {p.topic ? (
                                <div className="flex items-start gap-1.5">
                                  <CalendarCheck
                                    className={
                                      "mt-0.5 h-3 w-3 shrink-0 " +
                                      (p.topicSource === "planned" ? "text-emerald-600" : "text-slate-400")
                                    }
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                                      {p.topicSource === "planned" ? "Planned for this day" : "Next in sequence"}
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-800">
                                      {p.topic.sequenceNo + 1}. {p.topic.name}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-500">
                                  {p.prepState === "no_curriculum"
                                    ? "All topics done — or no syllabus set up for this subject yet."
                                    : "No subject linked to this period."}
                                </div>
                              )}
                              {p.classSubjectId && (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openPlanner(p)}
                                    className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                                  >
                                    {planning ? "Close" : "Plan…"}
                                  </button>
                                  {p.topicSource === "planned" && (
                                    <button
                                      type="button"
                                      disabled={planBusy}
                                      onClick={() => planTopic(p, null)}
                                      className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      <X className="h-2.5 w-2.5" /> Clear plan
                                    </button>
                                  )}
                                </div>
                              )}
                              {planning && (
                                <div className="mt-1.5 border-t border-slate-100 pt-1.5">
                                  <div className="mb-1 text-[10px] text-slate-500">
                                    Teach on {DAY_FULL[p.slot.dayOfWeek - 1]} {shortDate(p.entryDate)}:
                                  </div>
                                  {planTopics.length === 0 ? (
                                    <div className="text-[11px] text-slate-400">Loading topics…</div>
                                  ) : (
                                    <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                                      {planTopics.map((t, idx) => (
                                        <li key={t.id}>
                                          <button
                                            type="button"
                                            disabled={planBusy}
                                            onClick={() => planTopic(p, t.id)}
                                            className={
                                              "w-full rounded px-1.5 py-1 text-left text-[11px] hover:bg-indigo-50 disabled:opacity-50 " +
                                              (t.id === p.topic?.id ? "bg-indigo-50 font-medium text-indigo-800" : "text-slate-700")
                                            }
                                          >
                                            {idx + 1}. {t.name}
                                            {t.targetDate && (
                                              <span className="ml-1 text-[10px] text-slate-400">· {shortDate(t.targetDate)}</span>
                                            )}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {p.sectionId && (
                                    <div className="mt-1.5 border-t border-slate-100 pt-1.5">
                                      <div className="mb-1 text-[10px] text-slate-500">
                                        …or write your own activity (worksheet, revision, dictation):
                                      </div>
                                      <div className="flex gap-1.5">
                                        <input
                                          value={activityText}
                                          onChange={(e) => setActivityText(e.target.value)}
                                          placeholder="e.g. Worksheet practice — addition"
                                          className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        />
                                        <button
                                          type="button"
                                          disabled={planBusy || !activityText.trim()}
                                          onClick={() => saveActivity(p)}
                                          className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                          Save activity
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-0.5 flex flex-wrap gap-1.5 items-center">
                            {c.entry.room && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                                <MapPin className="h-2.5 w-2.5" /> {c.entry.room}
                              </span>
                            )}
                            {covering && (
                              <span className="text-[10px] font-medium text-amber-800 bg-amber-100 px-1 py-0.5 rounded">
                                Covering{sub?.originalTeacherName ? ` for ${sub.originalTeacherName}` : ""}
                              </span>
                            )}
                            {covered && (
                              <span className="text-[10px] font-medium text-slate-600 bg-slate-200 px-1 py-0.5 rounded">
                                Covered{sub?.substituteTeacherName ? ` by ${sub.substituteTeacherName}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TeacherWeekView;
