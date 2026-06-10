// =============================================================================
// School module — "Smart upcoming" lesson prep nudge.
//
// What it does:
//   Given a user (teacher via JWT, student/parent via PIN) and a starting
//   point of "now", returns the next N timetable entries the user is
//   about to attend or teach, each decorated with:
//     - the NEXT incomplete curriculum topic for the entry's subject
//     - the most recent lesson tagged to that topic (if any)
//     - resource counts on that topic (worksheets / videos / quizzes / etc.)
//     - a `prepState` that tells the UI what to render:
//         "lesson_ready" — a published lesson exists; show "review"
//         "topic_pending" — topic identified, no lesson yet; show "prepare"
//         "no_curriculum" — subject has no curriculum / no incomplete topic
//         "no_subject"    — entry has no section_subject pointer
//
// Endpoints (both return same shape):
//   GET /school/orgs/:orgId/me/upcoming?limit=3            (teacher JWT)
//   GET /school/pin-me/students/:studentId/upcoming?limit=3 (PIN auth)
// =============================================================================

import type { Hono, Context } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { todayInOrgTz } from "./tz.ts";
import { verifyPinToken } from "./schoolPhaseA.tsx";

type EntryRow = {
  id: string;
  org_id: string;
  scope_section_id: string | null;
  section_subject_id: string | null;
  teacher_user_id: string | null;
  room: string | null;
  slot: {
    id: string; name: string; day_of_week: number;
    start_time: string; end_time: string; archived_at: string | null;
  } | null;
  section_subject: {
    id: string;
    class_subject: { id: string; name: string; class_id: string } | null;
  } | null;
  section: {
    name: string;
    class: { name: string } | null;
  } | null;
};

interface PrepItem {
  entryId: string;
  slot: { id: string; name: string; dayOfWeek: number; startTime: string; endTime: string };
  subjectName: string | null;
  scopeLabel: string;
  room: string | null;
  /** Status helps the UI render the right CTA. */
  prepState: "lesson_ready" | "topic_pending" | "no_curriculum" | "no_subject";
  topic: { id: string; name: string; sequenceNo: number } | null;
  lesson: { id: string; title: string; lessonDate: string; publishedAt: string | null } | null;
  resources: { total: number; worksheets: number; videos: number; quizzes: number; pdfs: number; links: number };
}

// Time helpers — "HH:MM" → minutes.
function toMin(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/** Core: given a set of timetable_entry rows already fetched, decorate
 *  each with topic / lesson / resources and return ordered by time. */
async function decorate(entries: EntryRow[], limit: number): Promise<PrepItem[]> {
  if (entries.length === 0) return [];

  // Compute the "is now or later today" window — we sort by upcoming
  // first, then fall through to the next school day's first entries.
  const nowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();
  const todayDow = ((new Date().getDay() + 6) % 7) + 1; // 1..7 Mon..Sun

  // Sort: today's not-yet-ended first (by start), then later days.
  const ranked = entries
    .filter((e) => e.slot && !e.slot.archived_at)
    .map((e) => {
      const slot = e.slot!;
      const isToday = slot.day_of_week === todayDow;
      const endedToday = isToday && toMin(slot.end_time) <= nowMinutes;
      const minutesUntil = isToday && !endedToday
        ? toMin(slot.start_time) - nowMinutes
        : null;
      // Distance score so we can sort: still-active today = 0..,
      // future today = small positive, other day = larger.
      const dayOffset = (slot.day_of_week - todayDow + 7) % 7;
      const score = dayOffset * 24 * 60 + (toMin(slot.start_time));
      return { entry: e, score, endedToday, minutesUntil };
    })
    .filter((r) => !r.endedToday)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  // Bulk-fetch curriculum + topic + lesson + resources for the
  // surfaced entries' class_subjects.
  const classSubjectIds = Array.from(
    new Set(
      ranked
        .map((r) => r.entry.section_subject?.class_subject?.id)
        .filter((x): x is string => !!x),
    ),
  );
  const sectionIds = Array.from(
    new Set(
      ranked
        .map((r) => r.entry.scope_section_id)
        .filter((x): x is string => !!x),
    ),
  );

  // Latest curriculum per class_subject (PR feat/curriculum-per-subject —
  // curriculum is keyed on (class_subject_id, academic_year)).
  type Curr = { id: string; classSubjectId: string; academicYear: string | null };
  const currByClassSubject = new Map<string, Curr>();
  if (classSubjectIds.length > 0) {
    const { data: curricula } = await serviceRoleClient
      .from("curriculum")
      .select("id, class_subject_id, academic_year")
      .in("class_subject_id", classSubjectIds)
      .order("academic_year", { ascending: false });
    for (const c of (curricula ?? []) as any[]) {
      if (!currByClassSubject.has(c.class_subject_id)) {
        currByClassSubject.set(c.class_subject_id, {
          id: c.id,
          classSubjectId: c.class_subject_id,
          academicYear: c.academic_year ?? null,
        });
      }
    }
  }

  // Next incomplete topic per curriculum.
  const curIds = Array.from(currByClassSubject.values()).map((c) => c.id);
  const nextTopicByCur = new Map<string, { id: string; name: string; order: number }>();
  if (curIds.length > 0) {
    const { data: topics } = await serviceRoleClient
      .from("curriculum_topic")
      .select("id, curriculum_id, name, display_order, completed")
      .in("curriculum_id", curIds)
      .eq("completed", false)
      .order("display_order", { ascending: true });
    for (const t of (topics ?? []) as any[]) {
      if (!nextTopicByCur.has(t.curriculum_id)) {
        nextTopicByCur.set(t.curriculum_id, {
          id: t.id, name: t.name, order: t.display_order,
        });
      }
    }
  }

  // Latest lesson tagged to each surfaced topic, scoped to the section
  // the entry belongs to (we want THIS section's lesson, not a sibling's).
  type LessonRow = { id: string; title: string; lesson_date: string; published_at: string | null;
                     curriculum_topic_id: string; class_section_id: string };
  const topicIds = Array.from(nextTopicByCur.values()).map((t) => t.id);
  const latestLessonByTopicSection = new Map<string, LessonRow>();
  if (topicIds.length > 0 && sectionIds.length > 0) {
    const { data: lessons } = await serviceRoleClient
      .from("lesson")
      .select("id, title, lesson_date, published_at, curriculum_topic_id, class_section_id")
      .in("curriculum_topic_id", topicIds)
      .in("class_section_id", sectionIds)
      .order("lesson_date", { ascending: false });
    for (const l of (lessons ?? []) as any[]) {
      const k = `${l.curriculum_topic_id}:${l.class_section_id}`;
      if (!latestLessonByTopicSection.has(k)) latestLessonByTopicSection.set(k, l);
    }
  }

  // Resource counts per topic.
  type ResCounts = { total: number; worksheets: number; videos: number; quizzes: number; pdfs: number; links: number };
  const resByTopic = new Map<string, ResCounts>();
  if (topicIds.length > 0) {
    const { data: res } = await serviceRoleClient
      .from("topic_resource")
      .select("curriculum_topic_id, kind")
      .in("curriculum_topic_id", topicIds);
    for (const r of (res ?? []) as any[]) {
      const cur = resByTopic.get(r.curriculum_topic_id) ?? { total: 0, worksheets: 0, videos: 0, quizzes: 0, pdfs: 0, links: 0 };
      cur.total++;
      if (r.kind === "worksheet") cur.worksheets++;
      else if (r.kind === "video") cur.videos++;
      else if (r.kind === "quiz") cur.quizzes++;
      else if (r.kind === "pdf") cur.pdfs++;
      else if (r.kind === "link") cur.links++;
      resByTopic.set(r.curriculum_topic_id, cur);
    }
  }

  // Stitch.
  const out: PrepItem[] = [];
  for (const r of ranked) {
    const e = r.entry;
    const subjectName = e.section_subject?.class_subject?.name ?? null;
    const classSubjectId = e.section_subject?.class_subject?.id ?? null;
    const sectionId = e.scope_section_id ?? null;
    const scopeLabel = e.section
      ? `${e.section.class?.name ?? ""} ${e.section.name ?? ""}`.trim()
      : "—";

    let prepState: PrepItem["prepState"] = "no_subject";
    let topic: PrepItem["topic"] = null;
    let lesson: PrepItem["lesson"] = null;
    let resources: PrepItem["resources"] = { total: 0, worksheets: 0, videos: 0, quizzes: 0, pdfs: 0, links: 0 };

    if (!classSubjectId) {
      prepState = "no_subject";
    } else {
      const cur = currByClassSubject.get(classSubjectId);
      if (!cur) {
        prepState = "no_curriculum";
      } else {
        const t = nextTopicByCur.get(cur.id);
        if (!t) {
          prepState = "no_curriculum"; // every topic done — show neutral state
        } else {
          topic = { id: t.id, name: t.name, sequenceNo: t.order };
          resources = resByTopic.get(t.id) ?? resources;
          const lkey = sectionId ? `${t.id}:${sectionId}` : null;
          const l = lkey ? latestLessonByTopicSection.get(lkey) ?? null : null;
          if (l) {
            lesson = { id: l.id, title: l.title, lessonDate: l.lesson_date, publishedAt: l.published_at };
            prepState = "lesson_ready";
          } else {
            prepState = "topic_pending";
          }
        }
      }
    }

    out.push({
      entryId: e.id,
      slot: {
        id: e.slot!.id,
        name: e.slot!.name,
        dayOfWeek: e.slot!.day_of_week,
        startTime: e.slot!.start_time,
        endTime: e.slot!.end_time,
      },
      subjectName,
      scopeLabel,
      room: e.room,
      prepState,
      topic,
      lesson,
      resources,
    });
  }
  return out;
}

const ENTRY_SELECT = `
  id, org_id, scope_section_id, section_subject_id, teacher_user_id, room,
  slot:slot_id(id, name, day_of_week, start_time, end_time, archived_at),
  section_subject:section_subject_id(
    id,
    class_subject:class_subject_id(id, name, class_id)
  ),
  section:scope_section_id(name, class:class_id(name))
`;

// ─── Mounting ────────────────────────────────────────────────────────
export function installLessonPrep(school: Hono): void {
  // Teacher (JWT) — entries where teacher_user_id = me.
  school.get("/orgs/:orgId/me/upcoming", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "3", 10) || 3, 10);
    const { data } = await serviceRoleClient
      .from("timetable_entry")
      .select(ENTRY_SELECT)
      .eq("org_id", orgId)
      .eq("teacher_user_id", userId);
    const items = await decorate((data ?? []) as EntryRow[], limit);
    return c.json({ upcoming: items });
  });

  // Student / parent (PIN) — entries for the student's section.
  school.get("/pin-me/students/:studentId/upcoming", async (c: Context) => {
    // Verify X-Pin-Token directly (schoolPortal.tsx has its own helper
    // but it isn't exported; verifyPinToken is the underlying primitive).
    const header = c.req.header("X-Pin-Token") || "";
    if (!header) return c.json({ error: "missing pin token" }, 401);
    const subj: any = await verifyPinToken(header);
    if (!subj) return c.json({ error: "invalid or expired pin token" }, 401);
    const studentId = c.req.param("studentId");

    // Permission re-check: the student themselves OR a parent linked
    // to this student via student_parent.
    if (subj.subjectType === "student" && subj.subjectId !== studentId) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (subj.subjectType === "parent") {
      const { data: link } = await serviceRoleClient
        .from("student_parent")
        .select("student_id")
        .eq("parent_id", subj.subjectId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (!link) return c.json({ error: "forbidden" }, 403);
    }

    // Resolve student → class_section_id.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, org_id, class_section_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    const sectionId = (stu as any).class_section_id;
    if (!sectionId) return c.json({ upcoming: [] });

    const limit = Math.min(parseInt(c.req.query("limit") ?? "3", 10) || 3, 10);
    const { data } = await serviceRoleClient
      .from("timetable_entry")
      .select(ENTRY_SELECT)
      .eq("org_id", (stu as any).org_id)
      .eq("scope_section_id", sectionId);
    const items = await decorate((data ?? []) as EntryRow[], limit);
    return c.json({ upcoming: items });
  });

  // Unused but kept exported for symmetry with other modules.
  void todayInOrgTz; // referenced for future "today only" filtering
}
